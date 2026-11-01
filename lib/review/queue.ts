import type { DocumentStatusValue } from "@/lib/document-status";

// Which documents need a person, and in what order. Pure, so the order is tested
// rather than eyeballed.

export type QueueCandidate = { status: DocumentStatusValue; toReview: number; createdAt: string };

/** True when a person has something to do: enter it by hand, or check flagged fields. */
export function needsAttention(document: QueueCandidate): boolean {
  return document.status === "needs_human" || (document.status === "extracted" && document.toReview > 0);
}

/**
 * needs_human first (nothing usable without a person), then the most fields to
 * review, then oldest first so nothing waits forever behind newer uploads.
 */
export function queueOrder<T extends QueueCandidate>(documents: T[]): { queue: T[]; clear: number } {
  const queue = documents.filter(needsAttention).sort((a, b) => {
    const humanFirst = Number(b.status === "needs_human") - Number(a.status === "needs_human");
    if (humanFirst !== 0) return humanFirst;
    if (a.toReview !== b.toReview) return b.toReview - a.toReview;
    return a.createdAt.localeCompare(b.createdAt);
  });
  return { queue, clear: documents.length - queue.length };
}
