// npm run eval:report [-- --run evals/runs/<file>.json] [--check]
//
// Rewrites every results block in the README from the run file its marker
// names, so it's idempotent. --run fills a block whose marker names no run yet.
// With --check it changes nothing and exits 1 if any block doesn't match its run.
// No model calls, no network.

import { readFile, writeFile } from "node:fs/promises";
import { DEFAULT_CONFIDENCE_THRESHOLD } from "@/lib/design/confidence";
import { type EvalRunFile, MissingMarkersError, MissingRunError, blockRunPaths, renderReport, replaceAllBlocks } from "../evals/readme-report";
import { swallowedFlagProblem } from "./lib/sample-file";

const README = "README.md";

async function main(): Promise<number> {
  const swallowed = swallowedFlagProblem("eval:report", ["run", "check"]);
  if (swallowed) return fail(swallowed);
  const check = process.argv.includes("--check");
  const readme = await readFile(README, "utf8");

  const fallbackRun = flag("--run");
  const runs = new Map<string, EvalRunFile>();
  for (const path of [...blockRunPaths(readme), fallbackRun]) {
    if (path && !runs.has(path)) runs.set(path, JSON.parse(await readFile(path, "utf8")) as EvalRunFile);
  }
  const runPath = [...runs.keys()].join(", ");

  let next: string;
  try {
    next = replaceAllBlocks(readme, (path) => renderReport(runs.get(path)!, path, DEFAULT_CONFIDENCE_THRESHOLD), fallbackRun);
  } catch (error) {
    if (error instanceof MissingMarkersError || error instanceof MissingRunError) return fail(error.message, 2);
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
