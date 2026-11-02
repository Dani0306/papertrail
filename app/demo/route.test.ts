import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ sample: null as { id: string; status: string } | null, fail: false }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/samples", () => ({
  findPublicSample: vi.fn(async () => {
    if (db.fail) throw new Error("db down");
    return db.sample;
  }),
}));

const { GET, DEMO_SAMPLE } = await import("./route");
const { findPublicSample } = await import("@/lib/db/samples");

afterEach(() => {
  db.sample = null;
  db.fail = false;
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("GET /demo", () => {
  it("redirects to the demo sample's review screen, looked up by file name", async () => {
    db.sample = { id: "18e92179-f063-4bce-8e09-daafe3856dd6", status: "extracted" };
    const response = await GET(new Request("https://papertrail.example/demo"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://papertrail.example/documents/18e92179-f063-4bce-8e09-daafe3856dd6");
    expect(findPublicSample).toHaveBeenCalledWith(DEMO_SAMPLE);
  });

  it("falls back to the document list when the sample isn't there, or the database fails", async () => {
    expect((await GET(new Request("https://papertrail.example/demo"))).headers.get("location")).toBe("https://papertrail.example/documents");
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.fail = true;
    expect((await GET(new Request("https://papertrail.example/demo"))).headers.get("location")).toBe("https://papertrail.example/documents");
  });
});
