import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { extractionStore } from "@/lib/db/extractions";
import { confidenceThreshold } from "@/lib/design/confidence";
import { dailyExtractionCap, extractDocument } from "@/lib/pipeline/extract-document";

// The Hobby maximum (Vercel, fluid compute). Worst case is 2 attempts × up to 3
// tries each at ~27 s; waiting on the model doesn't bill CPU. STALE_CLAIM_MS
// (6 min) must stay longer than this.
export const maxDuration = 300;

const DocumentId = z.uuid("That isn't a document id.");

const FAILURES = {
  missing: { status: 404, error: "That document doesn't exist." },
  forbidden: { status: 403, error: "Sample documents are already extracted and can't be run again." },
  busy: { status: 409, error: "This document is already extracted or being extracted." },
} as const;

/** Runs the extraction for one uploaded document. Spends money, so sign-in and a daily cap gate it. */
export async function POST(_request: Request, ctx: RouteContext<"/api/documents/[id]/extract">) {
  try {
    const user = await requireUser();
    const id = DocumentId.safeParse((await ctx.params).id);
    if (!id.success) return NextResponse.json({ error: id.error.issues[0].message }, { status: 400 });

    const result = await extractDocument(
      { documentId: id.data, userId: user.id },
      { store: await extractionStore(), cap: dailyExtractionCap(), threshold: confidenceThreshold() },
    );

    if (result.ok) return NextResponse.json(result);
    if (result.reason === "cap") {
      return NextResponse.json({ error: `The daily limit of ${result.cap} extractions is reached. Try again tomorrow.` }, { status: 429 });
    }
    if (result.reason === "model_failed") {
      console.error("Extraction model call failed", result.message);
      return NextResponse.json({ error: "The model couldn't be reached. The document is ready to try again." }, { status: 502 });
    }
    const { status, error } = FAILURES[result.reason];
    return NextResponse.json({ error }, { status });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error(error);
    return NextResponse.json({ error: "Something went wrong on our side. Try again." }, { status: 500 });
  }
}
