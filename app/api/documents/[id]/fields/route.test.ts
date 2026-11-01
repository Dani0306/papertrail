import { afterEach, describe, expect, it, vi } from "vitest";
import type { WriteResult } from "@/lib/db/reviews";

// HTTP mapping and validation only: auth and the database are mocked.

const auth = vi.hoisted(() => ({ user: null as { id: string; email: string | null } | null }));
const db = vi.hoisted(() => ({ result: { ok: true } as WriteResult }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => {
  class UnauthorizedError extends Error {}
  return {
    UnauthorizedError,
    requireUser: async () => {
      if (!auth.user) throw new UnauthorizedError("Sign in with Google to do this.");
      return auth.user;
    },
  };
});
vi.mock("@/lib/db/reviews", () => ({ correctField: vi.fn(async () => db.result) }));

const { PATCH } = await import("./route");
const { correctField } = await import("@/lib/db/reviews");

const ID = "34839a19-0500-40bd-b7ed-6836454fe733";

async function patch(body: unknown, id = ID) {
  const response = await PATCH(
    new Request(`http://localhost/api/documents/${id}/fields`, { method: "PATCH", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

afterEach(() => {
  auth.user = null;
  db.result = { ok: true };
  vi.clearAllMocks();
});

describe("PATCH /api/documents/[id]/fields", () => {
  it("is 401 signed out and 400 for a bad id or body", async () => {
    expect((await patch({ fieldName: "total", value: 1 })).status).toBe(401);
    auth.user = { id: "user-1", email: null };
    expect((await patch({ fieldName: "total", value: 1 }, "nope")).status).toBe(400);
    expect((await patch({ fieldName: "total" })).status).toBe(400);
    expect((await patch({ fieldName: "total", value: { a: 1 } })).status).toBe(400);
    expect((await patch({ fieldName: "total", value: 1, extra: true })).status).toBe(400);
    expect(correctField).not.toHaveBeenCalled();
  });

  it("is 422 when the value doesn't fit the field's schema type, before touching the database", async () => {
    auth.user = { id: "user-1", email: null };
    const wrongType = await patch({ fieldName: "total", value: "612.14" });
    expect(wrongType.status).toBe(422);
    expect((await patch({ fieldName: "currency", value: "euros" })).body.error).toContain("3-letter");
    expect((await patch({ fieldName: "poNumber", value: "x" })).status).toBe(422);
    expect(correctField).not.toHaveBeenCalled();
  });

  it("saves a valid correction, including null for “not on the document”", async () => {
    auth.user = { id: "user-1", email: null };
    expect((await patch({ fieldName: "invoiceNumber", value: "QA-2061" })).status).toBe(200);
    expect(correctField).toHaveBeenLastCalledWith(ID, "user-1", "invoiceNumber", { value: "QA-2061" });
    expect((await patch({ fieldName: "dueDate", value: null })).status).toBe(200);
    expect(correctField).toHaveBeenLastCalledWith(ID, "user-1", "dueDate", { value: null });
  });

  it("reverts a correction", async () => {
    auth.user = { id: "user-1", email: null };
    expect((await patch({ fieldName: "total", revert: true })).status).toBe(200);
    expect(correctField).toHaveBeenLastCalledWith(ID, "user-1", "total", { revert: true });
  });

  it.each([
    ["missing", 404],
    ["forbidden", 403],
    ["busy", 409],
    ["unknown_field", 404],
  ] as const)("maps %s to %i", async (reason, status) => {
    auth.user = { id: "user-1", email: null };
    db.result = { ok: false, reason };
    expect((await patch({ fieldName: "lineItems[9].qty", value: 2 })).status).toBe(status);
  });
});
