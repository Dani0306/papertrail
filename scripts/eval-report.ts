// npm run eval:report [-- --run evals/runs/<file>.json] [--check]
//
// Rewrites the README's results block from an eval run file. Without --run it
// re-renders from the run the README already names, so it's idempotent. With
// --check it changes nothing and exits 1 if the README doesn't match its run.
// No model calls, no network.

import { readFile, writeFile } from "node:fs/promises";
import { type EvalRunFile, MissingMarkersError, readRunPath, renderReport, replaceBlock } from "../evals/readme-report";
import { swallowedFlagProblem } from "./lib/sample-file";

const README = "README.md";

async function main(): Promise<number> {
  const swallowed = swallowedFlagProblem("eval:report", ["run", "check"]);
  if (swallowed) return fail(swallowed);
  const check = process.argv.includes("--check");
  const readme = await readFile(README, "utf8");

  const runPath = flag("--run") ?? readRunPath(readme);
  if (!runPath) return fail("The README's results block names no run yet. Pass one: npm run eval:report -- --run evals/runs/<file>.json", 2);
  const run = JSON.parse(await readFile(runPath, "utf8")) as EvalRunFile;

  let next: string;
  try {
    next = replaceBlock(readme, renderReport(run, runPath));
  } catch (error) {
    if (error instanceof MissingMarkersError) return fail(error.message, 2);
    throw error;
  }

  if (check) {
    if (next === readme) {
      log(`README results match ${runPath}.`);
      return 0;
    }
    return fail(`README results don't match ${runPath}. Regenerate them: npm run eval:report`);
  }
  if (next === readme) {
    log(`README already matches ${runPath}; nothing to write.`);
    return 0;
  }
  await writeFile(README, next);
  log(`README results written from ${runPath}.`);
  return 0;
}

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function log(message: string) {
  process.stderr.write(`${message}\n`);
}

function fail(message: string, code = 1): number {
  log(message);
  return code;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    log(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exit(1);
  },
);
