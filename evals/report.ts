import { percentile, round } from "../scripts/lib/run-stats";
import type { DocumentScore } from "./score";

// Aggregates scored runs into the numbers the README reports. Pure and tested.

export type EvalRun = {
  model: string;
  rep: number;
  file: string;
  attempts: number;
  firstTryValid: boolean;
  costUsd: number;
  latencyMs: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  score: DocumentScore;
};

export function summarizeModel(runs: EvalRun[]) {
  const n = runs.length || 1;
  const fields = runs.flatMap((run) => run.score.fields);
  const correct = fields.filter((field) => field.verdict === "correct").length;
  const reps = [...new Set(runs.map((run) => run.rep))].sort((a, b) => a - b);
  const repAccuracy = reps.map((rep) => accuracy(runs.filter((run) => run.rep === rep)));
  const latencies = runs.map((run) => run.latencyMs).sort((a, b) => a - b);
  const mean = (pick: (run: EvalRun) => number) => runs.reduce((total, run) => total + pick(run), 0) / n;

  return {
    documents: runs.length,
    fields: fields.length,
    /** Headline: correct fields / scored fields, all reps pooled. */
    accuracy: round(fields.length ? correct / fields.length : 0, 4),
    accuracyByRep: repAccuracy.map((value) => round(value, 4)),
    silentErrorsPerDoc: round(mean((run) => run.score.silentErrors), 2),
    caughtErrorsPerDoc: round(mean((run) => run.score.caughtErrors), 2),
    hallucinatedRate: round(fields.length ? fields.filter((field) => field.verdict === "hallucinated").length / fields.length : 0, 4),
    firstTryValidRate: round(runs.filter((run) => run.firstTryValid).length / n, 3),
    repaired: runs.filter((run) => run.score.status === "extracted" && run.attempts > 1).length,
    needsHuman: runs.filter((run) => run.score.status === "needs_human").length,
    failed: runs.filter((run) => run.score.status === "failed").length,
    meanCostUsd: round(mean((run) => run.costUsd), 6),
    totalCostUsd: round(runs.reduce((total, run) => total + run.costUsd, 0), 6),
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
    meanInputTokens: Math.round(mean((run) => run.inputTokens)),
    meanCachedInputTokens: Math.round(mean((run) => run.cachedInputTokens)),
    meanOutputTokens: Math.round(mean((run) => run.outputTokens)),
    meanReasoningTokens: Math.round(mean((run) => run.reasoningTokens)),
    byKey: byKey(runs),
    byDocument: byDocument(runs),
  };
}

function accuracy(runs: EvalRun[]): number {
  const fields = runs.flatMap((run) => run.score.fields);
  return fields.length ? fields.filter((field) => field.verdict === "correct").length / fields.length : 0;
}

/** Accuracy per field key (vendor, issueDate, lineItems.qty…), worst first. */
function byKey(runs: EvalRun[]) {
  const groups = new Map<string, { correct: number; total: number; silent: number }>();
  for (const field of runs.flatMap((run) => run.score.fields)) {
    const group = groups.get(field.key) ?? { correct: 0, total: 0, silent: 0 };
    group.total++;
    if (field.verdict === "correct") group.correct++;
    else if (!field.flagged) group.silent++;
    groups.set(field.key, group);
  }
  return [...groups.entries()]
    .map(([key, group]) => ({ key, accuracy: round(group.correct / group.total, 4), ...group }))
    .sort((a, b) => a.accuracy - b.accuracy || a.key.localeCompare(b.key));
}

/** Mean accuracy per document and every field it got wrong (with how often), worst first. */
function byDocument(runs: EvalRun[]) {
  const files = [...new Set(runs.map((run) => run.file))];
  return files
    .map((file) => {
      const fileRuns = runs.filter((run) => run.file === file);
      const misses = new Map<string, number>();
      for (const field of fileRuns.flatMap((run) => run.score.fields)) {
        if (field.verdict !== "correct") {
          const label = `${field.name} ${field.verdict}${field.flagged ? " (flagged)" : ""}`;
          misses.set(label, (misses.get(label) ?? 0) + 1);
        }
      }
      return {
        file,
        accuracy: round(accuracy(fileRuns), 4),
        statuses: fileRuns.map((run) => run.score.status),
        errors: [...misses.entries()].map(([label, count]) => `${label} ×${count}`),
      };
    })
    .sort((a, b) => a.accuracy - b.accuracy || a.file.localeCompare(b.file));
}
