// npm run eval [-- --models gpt-6-luna,gpt-6.1-sol --reps 3 --limit 0.70]
//
// Runs every golden file's sample through each model, scores every field
// against evals/golden (normalised: dates → ISO, amounts → cents, text folded),
// prints the per-model report and writes evals/runs/<date>-eval.json.
// Costs money: stops as soon as the running total passes --limit (USD).
// Never run by npm test.

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PRICES } from "@/lib/cost/pricing";
import { confidenceThreshold } from "@/lib/design/confidence";
import { extractInvoice } from "@/lib/extract/extract";
import { appendJsonl } from "@/lib/extract/jsonl";
import { primaryModel } from "@/lib/models";
import { type EvalRun, summarizeModel } from "../evals/report";
import { type GoldenFile, scoreDocument } from "../evals/score";
import { freshPath } from "./lib/fresh-path";
import { round } from "./lib/run-stats";
import { readInvoiceFile, swallowedFlagProblem } from "./lib/sample-file";

const LOG_PATH = resolve("logs/model-calls.jsonl");

async function main(): Promise<number> {
  const swallowed = swallowedFlagProblem("eval", ["models", "reps", "limit"]);
  if (swallowed) return fail(swallowed);
  const models = (flag("--models") ?? primaryModel()).split(",").map((model) => model.trim()).filter(Boolean);
  const reps = Number(flag("--reps") ?? 1);
  const limitUsd = Number(flag("--limit") ?? 0.1);
  const unpriced = models.filter((model) => !PRICES[model]);
  if (unpriced.length) return fail(`No price for ${unpriced.join(", ")} in lib/cost/pricing.ts. Copy it from the pricing page first.`);
  if (!(reps >= 1) || !(limitUsd > 0)) return fail("--reps must be 1 or more and --limit above 0.");
  if (!process.env.OPENAI_API_KEY) return fail("OPENAI_API_KEY is not set. Add it to .env.local.");

  const goldens = await loadGoldens();
  const threshold = confidenceThreshold();
  log(`${goldens.length} documents × ${models.length} models × ${reps} reps, threshold ${threshold}, stop above $${limitUsd}`);

  const runs: Array<EvalRun> = [];
  let spent = 0;
  let stopped = false;

  outer: for (let rep = 1; rep <= reps; rep++) {
    for (const [index, golden] of goldens.entries()) {
      const read = await readInvoiceFile(join("samples", golden.file));
      if ("problem" in read) return fail(read.problem);
      // Alternate which model goes first so cache warm-up and quiet minutes even out.
      const order = (rep + index) % 2 === 0 ? models : [...models].reverse();
      for (const model of order) {
        const result = await extractInvoice(read.file, { model, onCall: (call) => appendJsonl(LOG_PATH, call) });
        const sum = (key: "costUsd" | "latencyMs" | "inputTokens" | "cachedInputTokens" | "outputTokens" | "reasoningTokens") =>
          result.calls.reduce((total, call) => total + call[key], 0);
        const score = scoreDocument(golden, result, threshold);
        runs.push({
          model,
          rep,
          file: golden.file,
          attempts: result.calls.length,
          firstTryValid: result.calls[0]?.outcome === "ok",
          costUsd: round(sum("costUsd"), 8),
          latencyMs: sum("latencyMs"),
          inputTokens: sum("inputTokens"),
          cachedInputTokens: sum("cachedInputTokens"),
          outputTokens: sum("outputTokens"),
          reasoningTokens: sum("reasoningTokens"),
          score,
        });
        spent += sum("costUsd");
        log(
          `rep ${rep} · ${model.padEnd(12)} · ${golden.file.padEnd(42)} ${score.status.padEnd(11)} ${String(score.correct).padStart(3)}/${String(score.total).padEnd(3)} silent ${score.silentErrors} · $${sum("costUsd").toFixed(5)} · ${(sum("latencyMs") / 1000).toFixed(1)} s · total $${spent.toFixed(4)}`,
        );
        if (spent > limitUsd) {
          log(`Stopped: spent $${spent.toFixed(4)}, above the $${limitUsd} limit.`);
          stopped = true;
          break outer;
        }
      }
    }
  }

  const byModel = Object.fromEntries(models.map((model) => [model, summarizeModel(runs.filter((run) => run.model === model))]));
  printReport(byModel);

  const date = new Date().toISOString().slice(0, 10);
  await mkdir(resolve("evals/runs"), { recursive: true });
  const out = await freshPath(`evals/runs/${date}-eval`);
  await writeFile(
    out,
    `${JSON.stringify({ date, models, reps, threshold, stoppedAtLimit: stopped, totalCostUsd: round(spent, 6), byModel, runs }, null, 2)}\n`,
  );
  log(`\nTotal cost $${spent.toFixed(5)} · report: ${out.replace(`${process.cwd()}/`, "")}`);
  return 0;
}

async function loadGoldens(): Promise<GoldenFile[]> {
  const names = (await readdir("evals/golden")).filter((name) => name.endsWith(".json")).sort();
  return Promise.all(names.map(async (name) => JSON.parse(await readFile(join("evals/golden", name), "utf8")) as GoldenFile));
}

function printReport(byModel: Record<string, ReturnType<typeof summarizeModel>>) {
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
  log("\nmodel         docs  accuracy (by rep)          silent/doc  caught/doc  halluc  1st-try  repaired  human  $/doc     p50 s  p95 s");
  for (const [model, s] of Object.entries(byModel)) {
    log(
      `${model.padEnd(12)} ${String(s.documents).padStart(5)}  ${pct(s.accuracy).padStart(6)} (${s.accuracyByRep.map(pct).join(", ")})`.padEnd(54) +
        `${String(s.silentErrorsPerDoc).padStart(10)}  ${String(s.caughtErrorsPerDoc).padStart(10)}  ${pct(s.hallucinatedRate).padStart(6)}  ${pct(s.firstTryValidRate).padStart(7)}  ${String(s.repaired).padStart(8)}  ${String(s.needsHuman).padStart(5)}  ${s.meanCostUsd.toFixed(5)}  ${(s.p50LatencyMs / 1000).toFixed(1).padStart(5)}  ${(s.p95LatencyMs / 1000).toFixed(1).padStart(5)}`,
    );
  }
  for (const [model, s] of Object.entries(byModel)) {
    log(`\n${model}: per field (worst first)`);
    for (const group of s.byKey) log(`  ${group.key.padEnd(22)} ${pct(group.accuracy).padStart(6)}  ${group.correct}/${group.total}  silent ${group.silent}`);
    log(`${model}: per document (worst first)`);
    for (const doc of s.byDocument) log(`  ${doc.file.padEnd(42)} ${pct(doc.accuracy).padStart(6)}  ${doc.errors.join("; ") || "—"}`);
  }
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
