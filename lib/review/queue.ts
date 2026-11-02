import type { DocumentStatusValue } from "@/lib/document-status";

// Which documents need a person, and in what order. Pure, so the order is tested
// rather than eyeballed.

export type QueueCandidate = { status: DocumentStatusValue; toReview: number; createdAt: string };

/**
 * True when a person has something to do: enter it by hand, confirm an answer
 * the stronger model had to rescue, or check flagged fields.
 */
export function needsAttention(document: QueueCandidate): boolean {
  return (
    document.status === "needs_human" ||
    document.status === "escalated" ||
    (document.status === "extracted" && document.toReview > 0)
  );
}

const URGENCY: Partial<Record<DocumentStatusValue, number>> = { needs_human: 2, escalated: 1 };

/**
 * needs_human first (nothing usable without a person), then escalated (the
 * primary model failed twice), then the most fields to review, then oldest first
 * so nothing waits forever behind newer uploads.
 */
export function queueOrder<T extends QueueCandidate>(documents: T[]): { queue: T[]; clear: number } {
  const queue = documents.filter(needsAttention).sort((a, b) => {
    const urgency = (URGENCY[b.status] ?? 0) - (URGENCY[a.status] ?? 0);
    if (urgency !== 0) return urgency;
    if (a.toReview !== b.toReview) return b.toReview - a.toReview;
    return a.createdAt.localeCompare(b.createdAt);
  });
  return { queue, clear: documents.length - queue.length };
}
