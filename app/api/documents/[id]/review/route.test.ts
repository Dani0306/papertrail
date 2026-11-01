import { afterEach, describe, expect, it, vi } from "vitest";
import type { WriteResult } from "@/lib/db/reviews";

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
vi.mock("@/lib/db/reviews", () => ({ markReviewed: vi.fn(async () => db.result) }));

const { POST } = await import("./route");
const { markReviewed } = await import("@/lib/db/reviews");

const ID = "34839a19-0500-40bd-b7ed-6836454fe733";

async function post(id = ID) {
  const response = await POST(new Request(`http://localhost/api/documents/${id}/review`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
  return response.status;
}

afterEach(() => {
  auth.user = null;
  db.result = { ok: true };
  vi.clearAllMocks();
});

describe("POST /api/documents/[id]/review", () => {
  it("is 401 signed out and 400 for a bad id", async () => {
    expect(await post()).toBe(401);
    auth.user = { id: "user-1", email: null };
    expect(await post("nope")).toBe(400);
    expect(markReviewed).not.toHaveBeenCalled();
  });

  it("marks the uploader's document reviewed", async () => {
    auth.user = { id: "user-1", email: null };
    expect(await post()).toBe(200);
    expect(markReviewed).toHaveBeenCalledWith(ID, "user-1");
  });

  it.each([
    ["missing", 404],
    ["forbidden", 403],
    ["busy", 409],
  ] as const)("maps %s to %i", async (reason, status) => {
    auth.user = { id: "user-1", email: null };
    db.result = { ok: false, reason };
    expect(await post()).toBe(status);
  });
});
