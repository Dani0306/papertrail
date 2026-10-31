import { describe, expect, it } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  RegisterRequest,
  UploadRequest,
  formatBytes,
  isOwnedPath,
  safeFileName,
  storagePathFor,
  uploadProblem,
} from "./uploads";

const USER = "6f1c2b9e-0000-4000-8000-000000000001";
const OTHER = "6f1c2b9e-0000-4000-8000-000000000002";

describe("UploadRequest", () => {
  it("accepts PDFs and the three image types up to the limit", () => {
    for (const mimeType of ["application/pdf", "image/png", "image/jpeg", "image/webp"]) {
      expect(
        UploadRequest.safeParse({ fileName: "inv.pdf", mimeType, sizeBytes: MAX_UPLOAD_BYTES }).success,
      ).toBe(true);
    }
  });

  it("rejects other types, empty files and files over the limit", () => {
    expect(UploadRequest.safeParse({ fileName: "a.txt", mimeType: "text/plain", sizeBytes: 10 }).success).toBe(false);
    expect(UploadRequest.safeParse({ fileName: "a.gif", mimeType: "image/gif", sizeBytes: 10 }).success).toBe(false);
    expect(UploadRequest.safeParse({ fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: 0 }).success).toBe(false);
    expect(
      UploadRequest.safeParse({ fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: MAX_UPLOAD_BYTES + 1 })
        .success,
    ).toBe(false);
  });

  it("rejects blank and overlong names", () => {
    expect(UploadRequest.safeParse({ fileName: "   ", mimeType: "application/pdf", sizeBytes: 10 }).success).toBe(false);
    expect(
      UploadRequest.safeParse({ fileName: "a".repeat(256), mimeType: "application/pdf", sizeBytes: 10 }).success,
    ).toBe(false);
  });

  it("requires a path on register", () => {
    expect(RegisterRequest.safeParse({ path: "", fileName: "a.pdf" }).success).toBe(false);
    expect(RegisterRequest.safeParse({ path: "uploads/x/y.pdf", fileName: "a.pdf" }).success).toBe(true);
  });
});

describe("uploadProblem", () => {
  it("returns null for a valid file and a readable message otherwise", () => {
    expect(uploadProblem({ name: "inv.pdf", type: "application/pdf", size: 2048 })).toBeNull();
    expect(uploadProblem({ name: "notes.txt", type: "text/plain", size: 2048 })).toBe(
      "Only PDF, PNG, JPEG or WebP files can be uploaded.",
    );
    expect(uploadProblem({ name: "big.pdf", type: "application/pdf", size: MAX_UPLOAD_BYTES + 1 })).toBe(
      "Files can be up to 10 MB.",
    );
    expect(uploadProblem({ name: "empty.pdf", type: "application/pdf", size: 0 })).toBe("The file is empty.");
  });
});

describe("safeFileName", () => {
  it("keeps ordinary names and extensions", () => {
    expect(safeFileName("invoice-2041.pdf")).toBe("invoice-2041.pdf");
    expect(safeFileName("Harbor & Pine INV 2041.pdf")).toBe("Harbor-Pine-INV-2041.pdf");
  });

  it("strips folders, traversal and leading dots", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:\\Users\\me\\scan.png")).toBe("scan.png");
    expect(safeFileName(".hidden.pdf")).toBe("hidden.pdf");
  });

  it("folds accents and drops characters Storage paths dislike", () => {
    expect(safeFileName("Factura Medellín nº 7.pdf")).toBe("Factura-Medellin-no-7.pdf");
    expect(safeFileName("发票.pdf")).toBe("document.pdf");
    expect(safeFileName("scan.final.v2.PDF")).toBe("scan-final-v2.PDF");
  });

  it("never returns an empty name and caps the length, keeping the extension", () => {
    expect(safeFileName("///")).toBe("document");
    const long = safeFileName(`${"a".repeat(300)}.pdf`);
    expect(long.length).toBe(100);
    expect(long.endsWith(".pdf")).toBe(true);
  });
});

describe("storage paths", () => {
  it("puts uploads under the user's prefix", () => {
    expect(storagePathFor(USER, "abc", "Inv 1.pdf")).toBe(`uploads/${USER}/abc-Inv-1.pdf`);
  });

  it("accepts only direct children of the caller's own prefix", () => {
    expect(isOwnedPath(`uploads/${USER}/abc-inv.pdf`, USER)).toBe(true);
    expect(isOwnedPath(`uploads/${OTHER}/abc-inv.pdf`, USER)).toBe(false);
    expect(isOwnedPath(`uploads/${USER}/`, USER)).toBe(false);
    expect(isOwnedPath(`uploads/${USER}/../${OTHER}/x.pdf`, USER)).toBe(false);
    expect(isOwnedPath(`uploads/${USER}/nested/x.pdf`, USER)).toBe(false);
    expect(isOwnedPath(`uploads/${USER}extra/x.pdf`, USER)).toBe(false);
  });
});

describe("formatBytes", () => {
  it("rounds to a readable unit", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(formatBytes(MAX_UPLOAD_BYTES)).toBe("10 MB");
  });
});
