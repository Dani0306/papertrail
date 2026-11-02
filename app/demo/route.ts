import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { findPublicSample } from "@/lib/db/samples";

/** The sample /demo opens: two amber flags beside the source text, the clearest 30-second story. */
export const DEMO_SAMPLE = "synthetic-quarry-ash-ambiguous.pdf";

/**
 * A stable, shareable link for the README, the video and the case study. Sample
 * ids differ per environment, so it's looked up by file name on each request.
 */
export async function GET(request: Request) {
  let path = "/documents";
  try {
    const sample = await findPublicSample(DEMO_SAMPLE);
    if (sample) path = `/documents/${sample.id}`;
  } catch (error) {
    // Lets Next's own signals through; a database hiccup still lands somewhere useful.
    unstable_rethrow(error);
    console.error(error);
  }
  return NextResponse.redirect(new URL(path, request.url), 307);
}
