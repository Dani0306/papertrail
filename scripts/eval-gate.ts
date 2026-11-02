// npm run eval:gate -- --run evals/runs/<file>.json
//
// The CI regression gate: compares a run with evals/baseline.json and exits 1
// when headline accuracy drops more than 2 points below it (or the run is
// partial). On GitHub Actions it also writes the result to the job summary.
// No model calls.

import { appendFile, readFile, readdir } from "node:fs/promises";
import type { summarizeModel } from "../evals/report";
import { type Baseline, gate } from "../evals/gate";
import { swallowedFlagProblem } from "./lib/sample-file";

type RunFile = { stoppedAtLimit: boolean; totalCostUsd: number; byModel: Record<string, ReturnType<typeof summarizeModel>>; runs: Array<{ model: string; file: string }> };

async function main(): Promise<number> {
  const swallowed = swallowedFlagProblem("eval:gate", ["run"]);
  if (swallowed) return fail(swallowed);
  const runPath = flag("--run");
  if (!runPath) return fail("Usage: npm run eval:gate -- --run evals/runs/<file>.json");

  const baseline = JSON.parse(await readFile("evals/baseline.json", "utf8")) as Baseline;
  const run = JSON.parse(await readFile(runPath, "utf8")) as RunFile;
  const summary = run.byModel[baseline.model];
  if (!summary) return fail(`${runPath} has no runs for the baseline model ${baseline.model}.`);
  const expectedFiles = (await readdir("evals/golden")).filter((name) => name.endsWith(".json")).length;
  const files = new Set(run.runs.filter((entry) => entry.model === baseline.model).map((entry) => entry.file)).size;

  const result = gate(
    { accuracy: summary.accuracy, silentErrorsPerDoc: summary.silentErrorsPerDoc, files, expectedFiles, stoppedAtLimit: run.stoppedAtLimit },
    baseline,
  );

  const lines = [
    `## Eval gate: ${result.pass ? "passed" : "failed"}`,
    "",
    "| | This run | Baseline |",
    "|---|---:|---:|",
    `| Field accuracy (${baseline.model}) | ${(summary.accuracy * 100).toFixed(2)}% | ${(baseline.accuracy * 100).toFixed(2)}% |`,
    `| Silent errors / doc | ${summary.silentErrorsPerDoc} | ${baseline.silentErrorsPerDoc} |`,
    `| Golden files scored | ${files} of ${expectedFiles} | ${baseline.goldenFiles} |`,
    `| Run cost | $${run.totalCostUsd.toFixed(4)} | |`,
    "",
    ...result.failures.map((failure) => `- **Fail:** ${failure}`),
    ...result.warnings.map((warning) => `- Warning: ${warning}`),
    "",
    `The gate fails when accuracy drops more than 2 points below \`evals/baseline.json\` (${baseline.run}).`,
  ];
  log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
  return result.pass ? 0 : 1;
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
  return 2;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    log(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exit(2);
  },
);
