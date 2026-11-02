// npm run seed:samples [-- --limit 0.05]
//
// Preloads the demo: the curated synthetic samples become public, read-only
// documents (uploaded_by null), each extracted once through the real pipeline,
// so the cost, latency and flags a visitor sees are measured, not made up.
// Idempotent: a sample that's already extracted is skipped. Costs money (about
// $0.0005 a sample); stops above --limit and respects the daily extraction cap.

import { join } from "node:path";
import { confidenceThreshold } from "@/lib/design/confidence";
import { HAS_FIELDS } from "@/lib/document-status";
import { claimSample, extractionStore } from "@/lib/db/extractions";
import { createPublicSample, findPublicSample } from "@/lib/db/samples";
import { dailyExtractionCap, extractDocument } from "@/lib/pipeline/extract-document";
import { readInvoiceFile, swallowedFlagProblem } from "./lib/sample-file";

/** The demo set (owner decision, 2 Nov): the most telling of the 30, Quarry & Ash first for /demo. */
export const DEMO_SAMPLES = [
  "synthetic-quarry-ash-ambiguous.pdf",
  "synthetic-ridgeline-rotated-scan.png",
  "synthetic-bluefin-handwritten-total.png",
  "synthetic-cerro-azul-mxn-photo.jpg",
  "synthetic-brightwater-two-page.pdf",
  "synthetic-lumbre-two-tax-rates.pdf",
  "synthetic-pinecrest-credit-note.pdf",
  "synthetic-harbor-pine-inv-2041.pdf",
];

async function main(): Promise<number> {
  const swallowed = swallowedFlagProblem("seed:samples", ["limit"]);
  if (swallowed) return fail(swallowed);
  const limitUsd = Number(flag("--limit") ?? 0.05);
  if (!(limitUsd > 0)) return fail("--limit must be above 0.");
  if (!process.env.OPENAI_API_KEY) return fail("OPENAI_API_KEY is not set. Add it to .env.local.");

  const store = await extractionStore();
  // Samples have no uploader, so they're claimed with claimSample; nothing else changes.
  const sampleStore = { ...store, claim: (documentId: string, _userId: string, staleBefore: Date) => claimSample(documentId, staleBefore) };
  let spent = 0;

  for (const fileName of DEMO_SAMPLES) {
    const existing = await findPublicSample(fileName);
    if (existing && HAS_FIELDS.includes(existing.status)) {
      log(`skip   ${fileName.padEnd(42)} already ${existing.status}`);
      continue;
    }
    const read = await readInvoiceFile(join("samples", fileName));
    if ("problem" in read) return fail(read.problem);
    const documentId = existing?.id ?? (await createPublicSample(read.file));

    const result = await extractDocument(
      { documentId, userId: "seed" },
      { store: sampleStore, cap: dailyExtractionCap(), threshold: confidenceThreshold() },
    );
    if (!result.ok && result.reason === "cap") return fail(`Stopped: today's ${result.cap}-extraction cap is reached. Run again tomorrow.`);
    spent += "costUsd" in result ? result.costUsd : 0;
    const outcome = result.ok
      ? `${result.status}${"flaggedFields" in result ? `, ${result.flaggedFields} flagged` : ""}`
      : result.reason;
    log(`${existing ? "retry " : "seeded"} ${fileName.padEnd(42)} ${outcome} · $${("costUsd" in result ? result.costUsd : 0).toFixed(5)} · total $${spent.toFixed(4)}`);
    if (spent > limitUsd) return fail(`Stopped: spent $${spent.toFixed(4)}, above the $${limitUsd} limit.`);
  }
  log(`\nDone. Spent $${spent.toFixed(5)}.`);
  return 0;
}

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function log(message: string) {
  process.stderr.write(`${message}\n`);
}

function fail(message: string): number {
  log(message);
  return 1;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    log(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exit(1);
  },
);
