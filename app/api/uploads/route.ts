import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { createUploadUrl } from "@/lib/db/documents";
import { UploadRequest } from "@/lib/uploads";

/** Step 1 of an upload: checks the user, the file and today's cap, then returns a signed Storage URL. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = UploadRequest.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const result = await createUploadUrl(user.id, parsed.data);
    if (!result.ok) {
      return NextResponse.json(
        { error: `You've used all ${result.cap} uploads for today. The limit resets at 00:00 UTC.` },
        { status: 429 },
      );
    }
    return NextResponse.json({ path: result.path, signedUrl: result.signedUrl });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error(error);
    return NextResponse.json({ error: "Something went wrong on our side. Try again." }, { status: 500 });
  }
}
