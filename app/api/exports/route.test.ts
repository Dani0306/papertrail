import * as XLSX from "xlsx";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExportSelection } from "@/lib/db/exports";

// The HTTP side only: auth and the database are mocked.

const state = vi.hoisted(() => ({ viewer: null as { id: string; email: null } | null, selection: null as ExportSelection | null }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getUser: async () => state.viewer }));
vi.mock("@/lib/db/exports", () => ({ exportSelection: vi.fn(async () => state.selection) }));

const { GET } = await import("./route");
const { exportSelection } = await import("@/lib/db/exports");

const DOC = "18e92179-f063-4bce-8e09-daafe3856dd6";
const sample: ExportSelection = {
  needsHuman: 0,
  documents: [
    {
      id: DOC,
      fileName: "synthetic-quarry-ash-ambiguous.pdf",
      status: "extracted",
      fields: [
        { name: "vendor", value: "QUARRY & ASH HARDWARE", confidence: 0.99, sourceQuote: "QUARRY & ASH HARDWARE", correctedValue: null, correctedAt: null },
        { name: "total", value: 612.14, confidence: 0.76, sourceQuote: "$6l2.14", correctedValue: null, correctedAt: null },
      ],
    },
  ],
};

const get = (query: string) => GET(new Request(`http://localhost/api/exports?${query}`));

afterEach(() => {
  state.viewer = null;
  state.selection = null;
  vi.clearAllMocks();
});

describe("GET /api/exports", () => {
  it("is 400 for a missing or unknown format, or a bad document id", async () => {
    expect((await get("")).status).toBe(400);
    expect((await get("format=pdf")).status).toBe(400);
    expect((await get("format=csv&document=nope")).status).toBe(400);
    expect(exportSelection).not.toHaveBeenCalled();
  });

  it("serves a CSV attachment of what the viewer may see, never cached", async () => {
    state.viewer = { id: "user-1", email: null };
    state.selection = sample;
    const response = await get("format=csv");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="papertrail-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toContain("QUARRY & ASH HARDWARE");
    expect(exportSelection).toHaveBeenCalledWith("user-1", undefined);
  });

  it("serves an XLSX named after one document", async () => {
    state.selection = sample;
    const response = await get(`format=xlsx&document=${DOC}`);

    expect(response.headers.get("content-disposition")).toBe('attachment; filename="synthetic-quarry-ash-ambiguous.xlsx"');
    const book = XLSX.read(new Uint8Array(await response.arrayBuffer()), { type: "array" });
    expect(book.Sheets.Invoices.K2).toMatchObject({ t: "n", v: 612.14 });
    expect(exportSelection).toHaveBeenCalledWith(null, DOC);
  });

  it("is 404 for a document that's missing or not the viewer's, and 409 when it has nothing to export", async () => {
    state.selection = null;
    expect((await get(`format=csv&document=${DOC}`)).status).toBe(404);
    state.selection = { needsHuman: 1, documents: [] };
    expect((await get(`format=csv&document=${DOC}`)).status).toBe(409);
  });

  it("is a generic 500 when the database fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(exportSelection).mockRejectedValueOnce(new Error("db down: secret detail"));
    const response = await get("format=csv");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Something went wrong on our side. Try again." });
  });
});
