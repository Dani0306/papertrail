import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManualResult } from "@/lib/db/manual";

const auth = vi.hoisted(() => ({ user: null as { id: string; email: string | null } | null }));
const db = vi.hoisted(() => ({ result: { ok: true, extractionId: "ext-1" } as ManualResult }));

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
vi.mock("@/lib/db/manual", () => ({ saveManualEntry: vi.fn(async () => db.result) }));

const { POST } = await import("./route");
const { saveManualEntry } = await import("@/lib/db/manual");

const ID = "34839a19-0500-40bd-b7ed-6836454fe733";
const header = { vendor: "Kestrel Coffee Roasters", invoiceNumber: "000482", issueDate: "10/30/2026", dueDate: null, currency: "USD", subtotal: 29.1, tax: 1.75, total: 30.85 };
const valid = { header, lineItems: [{ description: "Latte 12oz", qty: 2, unitPrice: null, lineTotal: 9.5 }] };

async function post(body: unknown, id = ID) {
  const response = await POST(new Request(`http://localhost/api/documents/${id}/manual`, { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

afterEach(() => {
  auth.user = null;
  db.result = { ok: true, extractionId: "ext-1" };
  vi.clearAllMocks();
});

describe("POST /api/documents/[id]/manual", () => {
  it("is 401 signed out, 400 for a bad id or a malformed body", async () => {
    expect((await post(valid)).status).toBe(401);
    auth.user = { id: "user-1", email: null };
    expect((await post(valid, "nope")).status).toBe(400);
    expect((await post({ header })).status).toBe(400);
    expect((await post({ ...valid, extra: 1 })).status).toBe(400);
    expect(saveManualEntry).not.toHaveBeenCalled();
  });

  it("is 422 with every field's problem, before touching the database", async () => {
    auth.user = { id: "user-1", email: null };
    const { status, body } = await post({ ...valid, header: { ...header, currency: "dollars", total: "30.85" } });
    expect(status).toBe(422);
    expect(body.fields).toMatchObject({ currency: expect.any(String), total: expect.any(String) });
    expect(saveManualEntry).not.toHaveBeenCalled();
  });

  it("saves a valid entry as the uploader", async () => {
    auth.user = { id: "user-1", email: null };
    const { status, body } = await post(valid);
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, extractionId: "ext-1" });
    expect(saveManualEntry).toHaveBeenCalledWith(ID, "user-1", valid, expect.arrayContaining([expect.objectContaining({ field_name: "vendor", value: null })]));
  });

  it.each([
    ["missing", 404],
    ["forbidden", 403],
    ["busy", 409],
  ] as const)("maps %s to %i", async (reason, status) => {
    auth.user = { id: "user-1", email: null };
    db.result = { ok: false, reason };
    expect((await post(valid)).status).toBe(status);
  });
});
