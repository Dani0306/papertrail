import { confidenceLevel } from "@/lib/design/confidence";
import { round } from "../scripts/lib/run-stats";
import type { EvalRun } from "./report";

// Re-scores a stored eval run at other confidence thresholds. No model calls:
// every scored field keeps its confidence and verdict, and only "flagged" moves.

export const THRESHOLD_GRID = [0.7, 0.75, 0.8, 0.85, 0.9, 0.95];

export type ThresholdPoint = {
  threshold: number;
  /** Wrong, missed or hallucinated, and not flagged: nobody would see it. */
  silentErrorsPerDoc: number;
  /** Wrong, missed or hallucinated, and flagged for a person. */
  caughtErrorsPerDoc: number;
  /** Every flagged field per document, right or wrong: the work a person is asked to do. */
  reviewLoadPerDoc: number;
  /** Flagged fields that were right: review effort that found nothing. */
  needlessReviewsPerDoc: number;
};

export function sweep(runs: EvalRun[], thresholds = THRESHOLD_GRID): ThresholdPoint[] {
  const n = runs.length || 1;
  const fields = runs.flatMap((run) => run.score.fields);
  return thresholds.map((threshold) => {
    // A field the model never returned has no confidence, so it can't be flagged at any threshold.
    const flagged = (field: (typeof fields)[number]) =>
      field.confidence !== null && confidenceLevel(field.got, field.confidence, threshold) === "review";
    const errors = fields.filter((field) => field.verdict !== "correct");
    const per = (count: number) => round(count / n, 3);
    return {
      threshold,
      silentErrorsPerDoc: per(errors.filter((field) => !flagged(field)).length),
      caughtErrorsPerDoc: per(errors.filter(flagged).length),
      reviewLoadPerDoc: per(fields.filter(flagged).length),
      needlessReviewsPerDoc: per(fields.filter((field) => field.verdict === "correct" && flagged(field)).length),
    };
  });
}

/**
 * The rule fixed before looking (prompt 012): fewest silent errors, then the
 * lowest review load. The current value stays on a full tie.
 */
export function chooseThreshold(curve: ThresholdPoint[], current: number): ThresholdPoint {
  const fewestSilent = Math.min(...curve.map((point) => point.silentErrorsPerDoc));
  const candidates = curve.filter((point) => point.silentErrorsPerDoc === fewestSilent);
  const lowestLoad = Math.min(...candidates.map((point) => point.reviewLoadPerDoc));
  const best = candidates.filter((point) => point.reviewLoadPerDoc === lowestLoad);
  return best.find((point) => point.threshold === current) ?? best.sort((a, b) => a.threshold - b.threshold)[0];
}
