import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { saveManualEntry } from "@/lib/db/manual";
import { ManualEntry, manualFieldRows } from "@/lib/review/manual";

const DocumentId = z.uuid("That isn't a document id.");

const FAILURES = {
  missing: { status: 404, error: "That document doesn't exist." },
  forbidden: { status: 403, error: "Sample documents can't be entered by hand." },
  busy: { status: 409, error: "Only a document that needs human entry can be entered by hand." },
} as const;

/** A person types in a needs_human document. Uploader only; every value meets its field's schema type. */
export async function POST(request: Request, ctx: RouteContext<"/api/documents/[id]/manual">) {
  try {
    const user = await requireUser();
    const id = DocumentId.safeParse((await ctx.params).id);
    if (!id.success) return NextResponse.json({ error: id.error.issues[0].message }, { status: 400 });
    const body = ManualEntry.safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: "Send { header, lineItems } with one value per field." }, { status: 400 });

    const checked = manualFieldRows(body.data, new Date());
    if (!checked.ok) return NextResponse.json({ error: "Some fields need fixing.", fields: checked.errors }, { status: 422 });

    const result = await saveManualEntry(id.data, user.id, body.data, checked.rows);
    if (!result.ok) {
      const { status, error } = FAILURES[result.reason];
      return NextResponse.json({ error }, { status });
    }
    return NextResponse.json({ ok: true, extractionId: result.extractionId });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    console.error(error);
    return NextResponse.json({ error: "Something went wrong on our side. Try again." }, { status: 500 });
  }
}
