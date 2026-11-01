import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { correctField } from "@/lib/db/reviews";
import { validateCorrection } from "@/lib/review/fields";

const DocumentId = z.uuid("That isn't a document id.");

const Body = z.union([
  z.object({ fieldName: z.string().min(1).max(100), revert: z.literal(true) }).strict(),
  z.object({ fieldName: z.string().min(1).max(100), value: z.union([z.string(), z.number(), z.null()]) }).strict(),
]);

const FAILURES = {
  missing: { status: 404, error: "That document doesn't exist." },
  forbidden: { status: 403, error: "Sample documents can't be corrected." },
  busy: { status: 409, error: "Only an extracted document can be corrected." },
  unknown_field: { status: 404, error: "That field isn't in this extraction." },
} as const;

/** Stores a correction next to the model's value (never over it), or reverts one. Uploader only. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/documents/[id]/fields">) {
  try {
    const user = await requireUser();
    const id = DocumentId.safeParse((await ctx.params).id);
    if (!id.success) return NextResponse.json({ error: id.error.issues[0].message }, { status: 400 });
    const body = Body.safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: "Send { fieldName, value } or { fieldName, revert: true }." }, { status: 400 });

    let change: { value: string | number | null } | { revert: true };
    if ("revert" in body.data) {
      change = { revert: true };
    } else {
      // The same check the editor runs in the browser: the field's own type from the Invoice schema.
      const checked = validateCorrection(body.data.fieldName, body.data.value);
      if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 422 });
      change = { value: checked.value };
    }

    const result = await correctField(id.data, user.id, body.data.fieldName, change);
    if (!result.ok) {
      const { status, error } = FAILURES[result.reason];
      return NextResponse.json({ error }, { status });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    console.error(error);
    return NextResponse.json({ error: "Something went wrong on our side. Try again." }, { status: 500 });
  }
}
