import { afterEach, describe, expect, it, vi } from "vitest";
import type { UploadUrlResult } from "@/lib/db/documents";

const auth = vi.hoisted(() => ({ user: null as { id: string; email: string | null } | null }));
const db = vi.hoisted(() => ({ result: { ok: true, path: "uploads/u/x.pdf", signedUrl: "https://storage.example/x" } as UploadUrlResult }));

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
vi.mock("@/lib/db/documents", () => ({ createUploadUrl: vi.fn(async () => db.result) }));

const { POST } = await import("./route");

const file = { fileName: "invoice.pdf", mimeType: "application/pdf", sizeBytes: 1000 };
async function post(body: unknown) {
  const response = await POST(new Request("http://localhost/api/uploads", { method: "POST", body: JSON.stringify(body) }));
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

afterEach(() => {
  auth.user = null;
  db.result = { ok: true, path: "uploads/u/x.pdf", signedUrl: "https://storage.example/x" };
});

describe("POST /api/uploads", () => {
  it("is 401 signed out and 400 for a file the app doesn't accept", async () => {
    expect((await post(file)).status).toBe(401);
    auth.user = { id: "user-1", email: null };
    expect((await post({ ...file, mimeType: "text/plain" })).status).toBe(400);
  });

  it("returns a signed URL under the caps", async () => {
    auth.user = { id: "user-1", email: null };
    expect(await post(file)).toEqual({ status: 200, body: { path: "uploads/u/x.pdf", signedUrl: "https://storage.example/x" } });
  });

  it("explains which cap was hit: the user's own, or everyone's", async () => {
    auth.user = { id: "user-1", email: null };
    db.result = { ok: false, reason: "cap", scope: "user", cap: 20 };
    expect(await post(file)).toMatchObject({ status: 429, body: { error: expect.stringContaining("all 20 uploads") } });
    db.result = { ok: false, reason: "cap", scope: "everyone", cap: 50 };
    expect(await post(file)).toMatchObject({ status: 429, body: { error: expect.stringContaining("for everyone") } });
  });
});
