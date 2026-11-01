import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { markReviewed } from "@/lib/db/reviews";

const DocumentId = z.uuid("That isn't a document id.");

const FAILURES = {
  missing: { status: 404, error: "That document doesn't exist." },
  forbidden: { status: 403, error: "Sample documents can't be marked reviewed." },
  busy: { status: 409, error: "Only an extracted document can be marked reviewed." },
  unknown_field: { status: 404, error: "That document doesn't exist." },
} as const;

/** A person confirms the whole document: extracted → reviewed. Uploader only. */
export async function POST(_request: Request, ctx: RouteContext<"/api/documents/[id]/review">) {
  try {
    const user = await requireUser();
    const id = DocumentId.safeParse((await ctx.params).id);
    if (!id.success) return NextResponse.json({ error: id.error.issues[0].message }, { status: 400 });

    const result = await markReviewed(id.data, user.id);
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
