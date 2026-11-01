// npm run compare:modes [-- --reps 3 --limit 0.25 --mode function_call]
//
// Runs every sample in samples/ through both extraction modes (or only --mode),
// `reps` times each, interleaved so neither mode gets the warm cache or the
// quiet minute. Prints a summary table and writes evals/runs/<date>-modes.json
// (<date>-<mode>.json for one mode), never overwriting an earlier run.
// Costs money: stops as soon as the running total passes --limit (USD).

import { mkdir, readdir, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { confidenceLevel, confidenceThreshold } from "@/lib/design/confidence";
import { extractInvoice } from "@/lib/extract/extract";
import { appendJsonl } from "@/lib/extract/jsonl";
import type { ExtractionMode, ExtractionResult } from "@/lib/extract/types";
import { primaryModel } from "@/lib/models";
import { type FlatField, flattenFields } from "@/lib/schema/invoice";
import { normalized, round, type Run, summarize, unstableFields } from "./lib/run-stats";
import { freshPath } from "./lib/fresh-path";
import { SAMPLE_EXTENSIONS, readInvoiceFile, swallowedFlagProblem } from "./lib/sample-file";

const ALL_MODES: ExtractionMode[] = ["json_schema", "function_call"];
const LOG_PATH = resolve("logs/model-calls.jsonl");

async function main(): Promise<number> {
  const swallowed = swallowedFlagProblem("compare:modes", ["reps", "limit", "mode"]);
  if (swallowed) return fail(swallowed);
  const reps = Number(flag("--reps") ?? 3);
  const limitUsd = Number(flag("--limit") ?? 0.25);
  const only = flag("--mode");
  if (only !== undefined && !ALL_MODES.includes(only as ExtractionMode)) return fail(`--mode must be one of: ${ALL_MODES.join(", ")}`);
  const modes = only ? [only as ExtractionMode] : ALL_MODES;
  if (!process.env.OPENAI_API_KEY) return fail("OPENAI_API_KEY is not set. Add it to .env.local.");

  const samples = (await readdir("samples"))
    .filter((name) => SAMPLE_EXTENSIONS.includes(extname(name).toLowerCase()))
    .sort();
  const model = primaryModel();
  const threshold = confidenceThreshold();
  log(`${samples.length} samples × ${modes.length} modes × ${reps} reps on ${model}, stop above $${limitUsd}`);

  const runs: Run[] = [];
  let spent = 0;
  let stopped = false;

  outer: for (let rep = 1; rep <= reps; rep++) {
    for (const sample of samples) {
      const read = await readInvoiceFile(join("samples", sample));
      if ("problem" in read) return fail(read.problem);
      // Alternate which mode goes first so order effects even out.
      const order = (rep + samples.indexOf(sample)) % 2 === 0 ? modes : [...modes].reverse();
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

  const byMode = Object.fromEntries(modes.map((mode) => [mode, summarize(runs.filter((run) => run.mode === mode), threshold)]));
  const perSample = samples.map((sample) => compareSample(sample, runs, modes, threshold));

  printTable(byMode);
  for (const row of perSample) {
    const flagged = modes.map((mode) => `${mode} ${row.flagged[mode].join(", ") || "none"}`).join(" | ");
    const disagreements = row.disagreements ? ` disagreements: ${row.disagreements.join(", ") || "none"} ·` : "";
    log(`${row.sample.padEnd(42)}${disagreements} below ${threshold}: ${flagged}`);
  }
  const unstable = unstableFields(runs);
  log(`Unstable across reps: ${unstable.length ? `\n  ${unstable.join("\n  ")}` : "none"}`);

  const date = new Date().toISOString().slice(0, 10);
  await mkdir(resolve("evals/runs"), { recursive: true });
  const out = await freshPath(`evals/runs/${date}-${only ?? "modes"}`);
  await writeFile(
    out,
    `${JSON.stringify({ date, model, modes, reps, threshold, stoppedAtLimit: stopped, totalCostUsd: round(spent, 6), byMode, perSample, unstable, runs }, null, 2)}\n`,
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

/**
 * Low-confidence fields per mode on the first extracted run, and, with two modes,
 * field-by-field agreement between them. Not accuracy: that needs the golden set.
 */
function compareSample(sample: string, runs: Run[], modes: ExtractionMode[], threshold: number) {
  const first = (mode: ExtractionMode) => runs.find((run) => run.sample === sample && run.mode === mode && run.fields)?.fields ?? null;
  const flagged = (fields: FlatField[] | null) =>
    (fields ?? []).filter((field) => confidenceLevel(field.value, field.confidence, threshold) === "review").map((field) => `${field.name} ${field.confidence}`);
  const each = <T>(fn: (mode: ExtractionMode) => T) => Object.fromEntries(modes.map((mode) => [mode, fn(mode)])) as Record<ExtractionMode, T>;

  let disagreements: string[] | undefined;
  if (modes.length === 2) {
    const [a, b] = modes.map(first);
    disagreements = [];
    if (a && b) {
      for (const name of new Set([...a, ...b].map((field) => field.name))) {
        const valueIn = (fields: FlatField[]) => fields.find((field) => field.name === name)?.value;
        if (normalized(valueIn(a)) !== normalized(valueIn(b))) disagreements.push(name);
      }
    } else {
      disagreements.push("not comparable: a mode never extracted this sample");
    }
  }

  return {
    sample,
    statuses: each((mode) => runs.filter((run) => run.sample === sample && run.mode === mode).map((run) => run.status)),
    ...(disagreements && { disagreements }),
    flagged: each((mode) => flagged(first(mode))),
    values: each(first),
  };
}

function printTable(byMode: Record<string, ReturnType<typeof summarize>>) {
  log("\nmode           runs  1st-try  repaired  human  failed  $/doc     p50 s  p95 s  nulls (low)  unstable  in/out tokens (cached, reasoning)");
  for (const [mode, s] of Object.entries(byMode)) {
    log(
      `${mode.padEnd(14)} ${String(s.runs).padStart(4)}  ${(s.firstTryValidRate * 100).toFixed(0).padStart(6)}%  ${String(s.repaired).padStart(8)}  ${String(s.needsHuman).padStart(5)}  ${String(s.failed).padStart(6)}  ${s.meanCostUsd.toFixed(5)}  ${(s.p50LatencyMs / 1000).toFixed(1).padStart(5)}  ${(s.p95LatencyMs / 1000).toFixed(1).padStart(5)}  ${`${s.nullFields} (${s.nullFieldsBelowThreshold})`.padStart(11)}  ${String(s.unstableFields).padStart(8)}  ${s.meanInputTokens}/${s.meanOutputTokens} (${s.meanCachedInputTokens}, ${s.meanReasoningTokens})`,
    );
  }
  log("");
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
