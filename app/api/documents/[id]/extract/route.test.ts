import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtractDocumentResult } from "@/lib/pipeline/extract-document";

// The HTTP mapping only: auth, the store and the pipeline are mocked, so no
// Supabase, no cookies and no model call.

const auth = vi.hoisted(() => ({ user: null as { id: string; email: string | null } | null }));
const pipeline = vi.hoisted(() => ({ result: null as ExtractDocumentResult | Error | null }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", async () => {
  class UnauthorizedError extends Error {
    constructor() {
      super("Sign in with Google to do this.");
    }
  }
  return {
    UnauthorizedError,
    requireUser: async () => {
      if (!auth.user) throw new UnauthorizedError();
      return auth.user;
    },
  };
});
vi.mock("@/lib/db/extractions", () => ({ extractionStore: async () => ({}) }));
vi.mock("@/lib/pipeline/extract-document", () => ({
  dailyExtractionCap: () => 50,
  extractDocument: vi.fn(async () => {
    if (pipeline.result instanceof Error) throw pipeline.result;
    return pipeline.result;
  }),
}));

const { POST } = await import("./route");
const { extractDocument } = await import("@/lib/pipeline/extract-document");

const ID = "34839a19-0500-40bd-b7ed-6836454fe733";

async function post(id = ID) {
  const response = await POST(new Request(`http://localhost/api/documents/${id}/extract`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

afterEach(() => {
  auth.user = null;
  pipeline.result = null;
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("POST /api/documents/[id]/extract", () => {
  it("is 401 when signed out, before anything else runs", async () => {
    const { status, body } = await post();
    expect(status).toBe(401);
    expect(body.error).toContain("Sign in");
    expect(extractDocument).not.toHaveBeenCalled();
  });

  it("is 400 for an id that isn't a uuid", async () => {
    auth.user = { id: "user-1", email: null };
    const { status } = await post("not-a-uuid");
    expect(status).toBe(400);
    expect(extractDocument).not.toHaveBeenCalled();
  });

  it("passes the signed-in user and the document id to the pipeline", async () => {
    auth.user = { id: "user-1", email: null };
    pipeline.result = { ok: true, status: "extracted", extractionId: "ext-1", fields: 20, flaggedFields: 0, costUsd: 0.0003 };
    const { status, body } = await post();

    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "extracted", extractionId: "ext-1", flaggedFields: 0 });
    expect(extractDocument).toHaveBeenCalledWith({ documentId: ID, userId: "user-1" }, expect.objectContaining({ cap: 50 }));
  });

  it.each([
    [{ ok: true, status: "needs_human", reason: "still invalid", costUsd: 0.001 }, 200],
    [{ ok: false, reason: "missing" }, 404],
    [{ ok: false, reason: "forbidden" }, 403],
    [{ ok: false, reason: "busy" }, 409],
    [{ ok: false, reason: "cap", cap: 50 }, 429],
    [{ ok: false, reason: "model_failed", message: "upstream unavailable", costUsd: 0 }, 502],
  ] as Array<[ExtractDocumentResult, number]>)("maps %o to %i", async (result, expected) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    auth.user = { id: "user-1", email: null };
    pipeline.result = result;
    const { status, body } = await post();
    expect(status).toBe(expected);
    if (expected >= 400) expect(typeof body.error).toBe("string");
  });

  it("is a generic 500 when our side throws, without leaking the error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    auth.user = { id: "user-1", email: null };
    pipeline.result = new Error("Could not save the extracted fields: secret detail");
    const { status, body } = await post();
    expect(status).toBe(500);
    expect(body.error).toBe("Something went wrong on our side. Try again.");
  });
});
