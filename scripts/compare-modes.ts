// npm run compare:modes [-- --reps 3 --limit 0.25]
//
// Runs every sample in samples/ through both extraction modes, `reps` times
// each, interleaved so neither mode gets the warm cache or the quiet minute.
// Prints a summary table and writes evals/runs/<date>-modes.json.
// Costs money: stops as soon as the running total passes --limit (USD).

import { mkdir, readdir, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { confidenceLevel, DEFAULT_CONFIDENCE_THRESHOLD } from "@/lib/design/confidence";
import { extractInvoice } from "@/lib/extract/extract";
import { appendJsonl } from "@/lib/extract/jsonl";
import type { ExtractionMode, ExtractionResult } from "@/lib/extract/types";
import { primaryModel } from "@/lib/models";
import { type FlatField, flattenFields } from "@/lib/schema/invoice";
import { SAMPLE_EXTENSIONS, readInvoiceFile, swallowedFlagProblem } from "./lib/sample-file";

const MODES: ExtractionMode[] = ["json_schema", "function_call"];
const LOG_PATH = resolve("logs/model-calls.jsonl");

type Run = {
  sample: string;
  mode: ExtractionMode;
  rep: number;
  status: ExtractionResult["status"];
  attempts: number;
  firstTryValid: boolean;
  costUsd: number;
  latencyMs: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  fields: FlatField[] | null;
  reason?: string;
};

async function main(): Promise<number> {
  const swallowed = swallowedFlagProblem("compare:modes", ["reps", "limit"]);
  if (swallowed) return fail(swallowed);
  const reps = Number(flag("--reps") ?? 3);
  const limitUsd = Number(flag("--limit") ?? 0.25);
  if (!process.env.OPENAI_API_KEY) return fail("OPENAI_API_KEY is not set. Add it to .env.local.");

  const samples = (await readdir("samples"))
    .filter((name) => SAMPLE_EXTENSIONS.includes(extname(name).toLowerCase()))
    .sort();
  const model = primaryModel();
  const threshold = Number(process.env.PAPERTRAIL_CONFIDENCE_THRESHOLD) || DEFAULT_CONFIDENCE_THRESHOLD;
  log(`${samples.length} samples × ${MODES.length} modes × ${reps} reps on ${model}, stop above $${limitUsd}`);

  const runs: Run[] = [];
  let spent = 0;
  let stopped = false;

  outer: for (let rep = 1; rep <= reps; rep++) {
    for (const sample of samples) {
      const read = await readInvoiceFile(join("samples", sample));
      if ("problem" in read) return fail(read.problem);
      // Alternate which mode goes first so order effects even out.
      const order = (rep + samples.indexOf(sample)) % 2 === 0 ? MODES : [...MODES].reverse();
      for (const mode of order) {
        const result = await extractInvoice(read.file, { model, mode, onCall: (call) => appendJsonl(LOG_PATH, call) });
        const run = toRun(sample, mode, rep, result);
        runs.push(run);
        spent += run.costUsd;
        log(
          `rep ${rep} · ${mode.padEnd(13)} · ${sample.padEnd(42)} ${run.status.padEnd(11)} ${run.attempts} att · $${run.costUsd.toFixed(5)} · ${(run.latencyMs / 1000).toFixed(1)} s · total $${spent.toFixed(4)}`,
        );
        if (spent > limitUsd) {
          log(`Stopped: spent $${spent.toFixed(4)}, above the $${limitUsd} limit.`);
          stopped = true;
          break outer;
        }
      }
    }
  }

  const byMode = Object.fromEntries(MODES.map((mode) => [mode, summarize(runs.filter((run) => run.mode === mode))]));
  const perSample = samples.map((sample) => compareSample(sample, runs, threshold));

  printTable(byMode);
  for (const row of perSample) {
    log(
      `${row.sample.padEnd(42)} disagreements: ${row.disagreements.length ? row.disagreements.join(", ") : "none"} · below ${threshold}: json ${row.flagged.json_schema.join(", ") || "none"} | fn ${row.flagged.function_call.join(", ") || "none"}`,
    );
  }

  const date = new Date().toISOString().slice(0, 10);
  const out = resolve(`evals/runs/${date}-modes.json`);
  await mkdir(resolve("evals/runs"), { recursive: true });
  await writeFile(
    out,
    `${JSON.stringify({ date, model, reps, threshold, stoppedAtLimit: stopped, totalCostUsd: round(spent, 6), byMode, perSample, runs }, null, 2)}\n`,
  );
  log(`\nTotal cost $${spent.toFixed(5)} · report: ${out.replace(`${process.cwd()}/`, "")}`);
  return 0;
}

function toRun(sample: string, mode: ExtractionMode, rep: number, result: ExtractionResult): Run {
  const sum = (key: "costUsd" | "latencyMs" | "inputTokens" | "cachedInputTokens" | "outputTokens" | "reasoningTokens") =>
    result.calls.reduce((total, call) => total + call[key], 0);
  return {
    sample,
    mode,
    rep,
    status: result.status,
    attempts: result.calls.length,
    firstTryValid: result.calls[0]?.outcome === "ok",
    costUsd: round(sum("costUsd"), 8),
    latencyMs: sum("latencyMs"),
    inputTokens: sum("inputTokens"),
    cachedInputTokens: sum("cachedInputTokens"),
    outputTokens: sum("outputTokens"),
    reasoningTokens: sum("reasoningTokens"),
    fields: result.status === "extracted" ? flattenFields(result.invoice) : null,
    ...(result.status !== "extracted" && { reason: result.reason }),
  };
}

function summarize(runs: Run[]) {
  const n = runs.length || 1;
  const latencies = runs.map((run) => run.latencyMs).sort((a, b) => a - b);
  return {
    runs: runs.length,
    firstTryValidRate: round(runs.filter((run) => run.firstTryValid).length / n, 3),
    repaired: runs.filter((run) => run.status === "extracted" && run.attempts > 1).length,
    needsHuman: runs.filter((run) => run.status === "needs_human").length,
    failed: runs.filter((run) => run.status === "failed").length,
    meanCostUsd: round(runs.reduce((total, run) => total + run.costUsd, 0) / n, 6),
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
    meanInputTokens: Math.round(runs.reduce((total, run) => total + run.inputTokens, 0) / n),
    meanCachedInputTokens: Math.round(runs.reduce((total, run) => total + run.cachedInputTokens, 0) / n),
    meanOutputTokens: Math.round(runs.reduce((total, run) => total + run.outputTokens, 0) / n),
    meanReasoningTokens: Math.round(runs.reduce((total, run) => total + run.reasoningTokens, 0) / n),
  };
}

/**
 * Field-by-field agreement between the modes' first extracted run, after
 * trimming and collapsing whitespace. Not accuracy: that needs the golden set.
 */
function compareSample(sample: string, runs: Run[], threshold: number) {
  const first = (mode: ExtractionMode) => runs.find((run) => run.sample === sample && run.mode === mode && run.fields)?.fields ?? null;
  const json = first("json_schema");
  const fn = first("function_call");
  const flagged = (fields: FlatField[] | null) =>
    (fields ?? []).filter((field) => confidenceLevel(field.value, field.confidence, threshold) === "review").map((field) => `${field.name} ${field.confidence}`);

  const disagreements: string[] = [];
  if (json && fn) {
    const names = new Set([...json, ...fn].map((field) => field.name));
    for (const name of names) {
      const a = json.find((field) => field.name === name)?.value;
      const b = fn.find((field) => field.name === name)?.value;
      if (normalized(a) !== normalized(b)) disagreements.push(name);
    }
  } else {
    disagreements.push("not comparable: a mode never extracted this sample");
  }

  const statuses = (mode: ExtractionMode) => runs.filter((run) => run.sample === sample && run.mode === mode).map((run) => run.status);
  return {
    sample,
    statuses: { json_schema: statuses("json_schema"), function_call: statuses("function_call") },
    disagreements,
    flagged: { json_schema: flagged(json), function_call: flagged(fn) },
    values: { json_schema: json, function_call: fn },
  };
}

function normalized(value: unknown): string {
  if (value === null || value === undefined) return "∅";
  if (typeof value === "number") return value.toFixed(2);
  return String(value).trim().replace(/\s+/g, " ").toLowerCase();
}

function printTable(byMode: Record<string, ReturnType<typeof summarize>>) {
  log("\nmode           runs  1st-try  repaired  human  failed  $/doc     p50 s  p95 s  in/out tokens (cached, reasoning)");
  for (const [mode, s] of Object.entries(byMode)) {
    log(
      `${mode.padEnd(14)} ${String(s.runs).padStart(4)}  ${(s.firstTryValidRate * 100).toFixed(0).padStart(6)}%  ${String(s.repaired).padStart(8)}  ${String(s.needsHuman).padStart(5)}  ${String(s.failed).padStart(6)}  ${s.meanCostUsd.toFixed(5)}  ${(s.p50LatencyMs / 1000).toFixed(1).padStart(5)}  ${(s.p95LatencyMs / 1000).toFixed(1).padStart(5)}  ${s.meanInputTokens}/${s.meanOutputTokens} (${s.meanCachedInputTokens}, ${s.meanReasoningTokens})`,
    );
  }
  log("");
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}

function round(value: number, digits: number): number {
  return Math.round(value * 10 ** digits) / 10 ** digits;
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
    log(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  },
);
