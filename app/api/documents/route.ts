import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { registerDocument } from "@/lib/db/documents";
import { RegisterRequest } from "@/lib/uploads";

const FAILURES = {
  forbidden: { status: 403, error: "That file wasn't uploaded by you." },
  missing: { status: 422, error: "The upload didn't reach storage. Try uploading the file again." },
  invalid: { status: 422, error: "Only PDF, PNG, JPEG or WebP files up to 10 MB can be uploaded." },
  duplicate: { status: 409, error: "This file is already in your documents." },
} as const;

/** Step 2 of an upload: records a file that is already in Storage as a document. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = RegisterRequest.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const result = await registerDocument(user.id, parsed.data);
    if (!result.ok) {
      const { status, error } = FAILURES[result.reason];
      return NextResponse.json({ error }, { status });
    }
    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error(error);
    return NextResponse.json({ error: "Something went wrong on our side. Try again." }, { status: 500 });
  }
}
