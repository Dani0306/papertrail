import "server-only";
import { HAS_FIELDS, type DocumentStatusValue } from "@/lib/document-status";
import type { ExportDocument } from "@/lib/export/rows";
import { reviewFieldFromRow } from "@/lib/review/fields";
import { db } from "./client";
import { dbError, toStatus, visibleTo } from "./documents";

const EXPORT_LIMIT = 500;

export type ExportSelection = {
  /** Visible documents with fields, newest first, each with its latest extraction. */
  documents: ExportDocument[];
  /** Visible documents a person must enter by hand: no fields to export. */
  needsHuman: number;
};

/**
 * What the viewer may export: their uploads plus public samples, filtered in
 * the query like every list. With `documentId`, just that one, or null when it
 * doesn't exist or isn't the viewer's to see.
 */
export async function exportSelection(viewerId: string | null, documentId?: string): Promise<ExportSelection | null> {
  const client = await db();
  let query = client
    .from("documents")
    .select(
      "id, original_filename, status, created_at, " +
        "extractions(created_at, extraction_fields(field_name, value, confidence, source_quote, corrected_value, corrected_at, position))",
    )
    .or(visibleTo(viewerId))
    .order("created_at", { ascending: false })
    .order("created_at", { referencedTable: "extractions", ascending: false })
    .order("position", { referencedTable: "extractions.extraction_fields", ascending: true })
    .limit(1, { referencedTable: "extractions" })
    .limit(EXPORT_LIMIT);
  if (documentId) query = query.eq("id", documentId);

  const { data, error } = await query.overrideTypes<Row[], { merge: false }>();
  if (error) throw dbError("Could not load documents to export", error);
  if (documentId && data.length === 0) return null;

  const withFields = data.filter((row) => HAS_FIELDS.includes(toStatus(row.status)) && row.extractions[0]);
  return {
    documents: withFields.map((row) => ({
      id: row.id,
      fileName: row.original_filename,
      status: toStatus(row.status) as DocumentStatusValue,
      fields: row.extractions[0].extraction_fields.map(reviewFieldFromRow),
    })),
    needsHuman: data.filter((row) => row.status === "needs_human").length,
  };
}

type Row = {
  id: string;
  original_filename: string;
  status: string;
  created_at: string;
  extractions: Array<{ created_at: string; extraction_fields: Parameters<typeof reviewFieldFromRow>[0][] }>;
};
