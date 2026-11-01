// npm run extract -- <file> [--model <id>] [--mode json_schema|function_call]
// (The -- matters: without it npm keeps --model and --mode for itself.)
//
// Reads a PDF or image, extracts the invoice, prints the result JSON to stdout
// and a one-line summary to stderr, and appends every model call to
// logs/model-calls.jsonl. Exit code: 0 extracted, 2 needs_human, 1 error.

import { resolve } from "node:path";
import { confidenceLevel, DEFAULT_CONFIDENCE_THRESHOLD } from "@/lib/design/confidence";
import { extractInvoice } from "@/lib/extract/extract";
import { appendJsonl } from "@/lib/extract/jsonl";
import type { ExtractionMode, ModelCallRecord } from "@/lib/extract/types";
import { primaryModel } from "@/lib/models";
import { flattenFields } from "@/lib/schema/invoice";
import { readInvoiceFile, swallowedFlagProblem } from "./lib/sample-file";

const LOG_PATH = resolve("logs/model-calls.jsonl");
const MODES: ExtractionMode[] = ["json_schema", "function_call"];

async function main(): Promise<number> {
  const swallowed = swallowedFlagProblem("extract", ["model", "mode"]);
  if (swallowed) return fail(swallowed);
  const { path, model, mode } = parseArgs(process.argv.slice(2));
  if (!path) return fail("Usage: npm run extract -- <file.pdf|png|jpg|webp> [--model <id>] [--mode json_schema|function_call]");
  if (mode && !MODES.includes(mode as ExtractionMode)) return fail(`--mode must be one of: ${MODES.join(", ")}`);
  if (!process.env.OPENAI_API_KEY) return fail("OPENAI_API_KEY is not set. Add it to .env.local.");

  const read = await readInvoiceFile(path);
  if ("problem" in read) return fail(read.problem);

  const result = await extractInvoice(read.file, {
    model: model ?? primaryModel(),
    mode: mode as ExtractionMode | undefined,
    onCall: (call) => appendJsonl(LOG_PATH, call),
  });

  process.stdout.write(`${JSON.stringify(result.status === "extracted" ? result.invoice : result, null, 2)}\n`);

  const threshold = Number(process.env.PAPERTRAIL_CONFIDENCE_THRESHOLD) || DEFAULT_CONFIDENCE_THRESHOLD;
  const flagged =
    result.status === "extracted"
      ? flattenFields(result.invoice).filter((field) => confidenceLevel(field.value, field.confidence, threshold) === "review").length
      : 0;
  process.stderr.write(`\n${summary(result.status, result.calls, flagged)}\n`);
  if (result.status !== "extracted") process.stderr.write(`${result.reason}\n`);

  return result.status === "extracted" ? 0 : result.status === "needs_human" ? 2 : 1;
}

function parseArgs(args: string[]): { path?: string; model?: string; mode?: string } {
  let path: string | undefined;
  let model: string | undefined;
  let mode: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--model") model = args[++i];
    else if (args[i] === "--mode") mode = args[++i];
    else path ??= args[i];
  }
  return { path, model, mode };
}

/** "extracted · gpt-6-luna · json_schema · 1 attempt · 3,104 in (0 cached) / 2,012 out (180 reasoning) · $0.00132 · 4.2 s · 1 field to review" */
function summary(status: string, calls: ModelCallRecord[], flagged: number): string {
  const sum = (key: keyof ModelCallRecord) => calls.reduce((total, call) => total + (call[key] as number), 0);
  const number = (n: number) => n.toLocaleString("en-US");
  return [
    status,
    calls[0]?.model ?? "no call",
    calls[0]?.mode ?? "",
    `${calls.length} ${calls.length === 1 ? "attempt" : "attempts"}`,
    `${number(sum("inputTokens"))} in (${number(sum("cachedInputTokens"))} cached) / ${number(sum("outputTokens"))} out (${number(sum("reasoningTokens"))} reasoning)`,
    `$${sum("costUsd").toFixed(5)}`,
    `${(sum("latencyMs") / 1000).toFixed(1)} s`,
    ...(status === "extracted" ? [`${flagged} ${flagged === 1 ? "field" : "fields"} to review`] : []),
    `log: ${LOG_PATH.replace(`${process.cwd()}/`, "")}`,
  ].join(" · ");
}

function fail(message: string): number {
  process.stderr.write(`${message}\n`);
  return 1;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exit(1);
  },
);
