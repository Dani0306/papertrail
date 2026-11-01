/** Starting threshold from CLAUDE.md; tuned against the golden set in week 3. */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.85;

/** PAPERTRAIL_CONFIDENCE_THRESHOLD if it is a number in (0, 1], else the default. */
export function confidenceThreshold(): number {
  const value = Number(process.env.PAPERTRAIL_CONFIDENCE_THRESHOLD);
  return value > 0 && value <= 1 ? value : DEFAULT_CONFIDENCE_THRESHOLD;
}

/**
 * How an extracted field is shown in the review UI.
 * - `ok`: a value the model is confident about.
 * - `review`: below the threshold, whether or not a value was found. A human checks it.
 * - `missing`: the model is confident the field is absent from the document.
 */
export type ConfidenceLevel = "ok" | "review" | "missing";

export function confidenceLevel(
  value: unknown,
  confidence: number,
  threshold: number = DEFAULT_CONFIDENCE_THRESHOLD,
): ConfidenceLevel {
  // NaN fails the comparison, so an unreadable confidence is always flagged.
  if (!(confidence >= threshold)) return "review";
  const isEmpty =
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "");
  return isEmpty ? "missing" : "ok";
}

export function formatConfidence(confidence: number): string {
  if (!Number.isFinite(confidence)) return "—";
  const clamped = Math.min(1, Math.max(0, confidence));
  return `${Math.round(clamped * 100)}%`;
}
