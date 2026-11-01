import { describe, expect, it } from "vitest";
import { accessFailure, documentAccess } from "./access";

describe("documentAccess", () => {
  it("lets the uploader in, shows samples to everyone, and hides other people's uploads", () => {
    expect(documentAccess("user-1", "user-1")).toBe("owner");
    expect(documentAccess(null, null)).toBe("public");
    expect(documentAccess(null, "user-1")).toBe("public");
    expect(documentAccess("user-1", "user-2")).toBe("hidden");
    expect(documentAccess("user-1", null)).toBe("hidden");
  });

  it("answers a write on someone else's upload with missing, not forbidden, so it leaks nothing", () => {
    expect(accessFailure("hidden")).toBe("missing");
    expect(accessFailure("public")).toBe("forbidden");
    expect(accessFailure("owner")).toBeNull();
  });
});
