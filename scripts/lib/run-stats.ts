import { confidenceLevel } from "@/lib/design/confidence";
import type { ExtractionMode, ExtractionResult } from "@/lib/extract/types";
import type { FlatField } from "@/lib/schema/invoice";

// Pure statistics over comparison runs, kept out of scripts/compare-modes.ts so
// Vitest can check them without a model call.

export type Run = {
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

export function summarize(runs: Run[], threshold: number) {
  const n = runs.length || 1;
  const mean = (key: "inputTokens" | "cachedInputTokens" | "outputTokens" | "reasoningTokens") =>
    Math.round(runs.reduce((total, run) => total + run[key], 0) / n);
  const latencies = runs.map((run) => run.latencyMs).sort((a, b) => a - b);
  const nulls = runs.flatMap((run) => (run.fields ?? []).filter((field) => field.value === null));
  return {
    runs: runs.length,
    firstTryValidRate: round(runs.filter((run) => run.firstTryValid).length / n, 3),
    repaired: runs.filter((run) => run.status === "extracted" && run.attempts > 1).length,
    needsHuman: runs.filter((run) => run.status === "needs_human").length,
    failed: runs.filter((run) => run.status === "failed").length,
    meanCostUsd: round(runs.reduce((total, run) => total + run.costUsd, 0) / n, 6),
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
    meanInputTokens: mean("inputTokens"),
    meanCachedInputTokens: mean("cachedInputTokens"),
    meanOutputTokens: mean("outputTokens"),
    meanReasoningTokens: mean("reasoningTokens"),
    // A null below the threshold lands in the review queue (prompt 007).
    nullFields: nulls.length,
    nullFieldsBelowThreshold: nulls.filter((field) => confidenceLevel(field.value, field.confidence, threshold) === "review").length,
    unstableFields: unstableFields(runs).length,
  };
}

/** "sample · field" for every field whose normalised value differs across the reps of one sample and mode. */
export function unstableFields(runs: Run[]): string[] {
  const unstable: string[] = [];
  const groups = new Map<string, Run[]>();
  for (const run of runs) {
    if (!run.fields) continue;
    const key = `${run.sample}\u0000${run.mode}`;
    groups.set(key, [...(groups.get(key) ?? []), run]);
  }
  for (const group of groups.values()) {
    const names = new Set(group.flatMap((run) => run.fields!.map((field) => field.name)));
    for (const name of names) {
      const values = new Set(group.map((run) => normalized(run.fields!.find((field) => field.name === name)?.value)));
      if (values.size > 1) unstable.push(`${group[0].sample} · ${name}`);
    }
  }
  return unstable;
}

/** Trimmed, whitespace-collapsed, case-folded. Agreement only: the tested scorer normaliser comes in week 3. */
export function normalized(value: unknown): string {
  if (value === null || value === undefined) return "∅";
  if (typeof value === "number") return value.toFixed(2);
  return String(value).trim().replace(/\s+/g, " ").toLowerCase();
}

/** Nearest-rank percentile of an ascending array. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}

export function round(value: number, digits: number): number {
  return Math.round(value * 10 ** digits) / 10 ** digits;
}
