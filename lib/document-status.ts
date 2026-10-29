// Mirrors papertrail.documents.status (AGENTS.md §8). Move into lib/schema as a
// Zod enum when the schema module exists, and import it from there.
export const DOCUMENT_STATUSES = [
  "uploaded",
  "extracting",
  "extracted",
  "escalated",
  "needs_human",
  "reviewed",
] as const;

export type DocumentStatusValue = (typeof DOCUMENT_STATUSES)[number];
