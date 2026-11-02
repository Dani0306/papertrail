// npm run eval:threshold -- --run evals/runs/<file>.json [--model gpt-6-luna]
//
// Re-scores a stored eval run at each confidence threshold on the grid and
// applies the rule fixed in prompt 012. No model calls, no network.

import { readFile } from "node:fs/promises";
import { DEFAULT_CONFIDENCE_THRESHOLD } from "@/lib/design/confidence";
import type { EvalRun } from "../evals/report";
import { chooseThreshold, sweep } from "../evals/threshold";
import { swallowedFlagProblem } from "./lib/sample-file";

async function main(): Promise<number> {
  const swallowed = swallowedFlagProblem("eval:threshold", ["run", "model"]);
  if (swallowed) return fail(swallowed);
  const runPath = flag("--run");
  if (!runPath) return fail("Usage: npm run eval:threshold -- --run evals/runs/<file>.json [--model <id>]");
  const file = JSON.parse(await readFile(runPath, "utf8")) as { models: string[]; runs: EvalRun[] };
  const model = flag("--model") ?? file.models[0];
  const runs = file.runs.filter((run) => run.model === model);
  if (runs.length === 0) return fail(`No runs for ${model} in ${runPath}.`);

  const curve = sweep(runs);
  const chosen = chooseThreshold(curve, DEFAULT_CONFIDENCE_THRESHOLD);
  log(`${model} · ${runs.length} documents scored · ${runPath}\n`);
  log("threshold  silent/doc  caught/doc  review load/doc  needless/doc");
  for (const point of curve) {
    log(
      `${point.threshold.toFixed(2).padStart(9)}  ${String(point.silentErrorsPerDoc).padStart(10)}  ${String(point.caughtErrorsPerDoc).padStart(10)}  ${String(point.reviewLoadPerDoc).padStart(15)}  ${String(point.needlessReviewsPerDoc).padStart(12)}${point === chosen ? "  ← chosen" : ""}`,
    );
  }
  log(`\nRule: fewest silent errors, then the lowest review load; ${DEFAULT_CONFIDENCE_THRESHOLD} stays on a full tie.`);
  log(`Chosen: ${chosen.threshold}${chosen.threshold === DEFAULT_CONFIDENCE_THRESHOLD ? " (unchanged)" : ` (was ${DEFAULT_CONFIDENCE_THRESHOLD})`}`);
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
