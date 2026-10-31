// Mirrors the status check constraint on papertrail.documents
// (supabase/migrations/20261031120000_documents.sql); change both together.
// Move into lib/schema as a Zod enum when the schema module exists.
export const DOCUMENT_STATUSES = [
  "uploaded",
  "extracting",
  "extracted",
  "escalated",
  "needs_human",
  "reviewed",
] as const;

export type DocumentStatusValue = (typeof DOCUMENT_STATUSES)[number];
