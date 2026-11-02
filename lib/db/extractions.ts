import "server-only";
import type { ClaimResult, ExtractionStore } from "@/lib/pipeline/extract-document";
import type { Json } from "./types";
import { accessFailure, documentAccess } from "@/lib/review/access";
import { ALLOWED_UPLOAD_TYPES, type UploadType } from "@/lib/uploads";
import { db, documentsBucket } from "./client";
import { dbError } from "./documents";

/** The Supabase side of lib/pipeline/extract-document.ts. Secret key, papertrail schema only. */
export async function extractionStore(): Promise<ExtractionStore> {
  const client = await db();

  return {
    async countRunsSince(since) {
      const { count, error } = await client
        .from("model_calls")
        .select("id", { count: "exact", head: true })
        .eq("attempt", 1)
        .gte("created_at", since.toISOString());
      if (error) throw dbError("Could not count today's extractions", error);
      return count ?? 0;
    },

    async claim(documentId, userId, staleBefore) {
      const { data: row, error } = await client
        .from("documents")
        .select("id, uploaded_by")
        .eq("id", documentId)
        .maybeSingle();
      if (error) throw dbError("Could not load the document", error);
      if (!row) return { ok: false, reason: "missing" };
      const denied = accessFailure(documentAccess(row.uploaded_by, userId));
      if (denied) return { ok: false, reason: denied };

      // One conditional UPDATE: of two simultaneous requests, only one matches the row.
      const { data: claimed, error: claimError } = await client
        .from("documents")
        .update({ status: "extracting", extraction_started_at: new Date().toISOString() })
        .eq("id", documentId)
        .eq("uploaded_by", userId)
        // The timestamp is quoted: PostgREST treats "." and ":" in a bare or() value as syntax.
        .or(`status.eq.uploaded,and(status.eq.extracting,extraction_started_at.lt."${staleBefore.toISOString()}")`)
        .select("id, storage_path, original_filename, mime_type");
      if (claimError) throw dbError("Could not claim the document", claimError);
      return claimedDocument(claimed[0]);
    },

    async download(storagePath) {
      const { data, error } = await client.storage.from(documentsBucket()).download(storagePath);
      if (error) throw new Error(`Could not download ${storagePath}: ${error.message}`);
      return new Uint8Array(await data.arrayBuffer());
    },

    async logCall(row) {
      const { error } = await client.from("model_calls").insert(row);
      if (error) throw dbError("Could not log the model call", error);
    },

    async saveExtraction(documentId, run, fields) {
      const { data: extraction, error } = await client
        .from("extractions")
        .insert({ document_id: documentId, model: run.model, mode: run.mode, invoice: run.invoice as unknown as Json })
        .select("id")
        .single();
      if (error) throw dbError("Could not save the extraction", error);

      const { error: fieldsError } = await client
        .from("extraction_fields")
        .insert(fields.map((field) => ({ ...field, extraction_id: extraction.id })));
      if (fieldsError) {
        // An extraction without its fields would look complete to the review screen: remove it.
        await client.from("extractions").delete().eq("id", extraction.id);
        throw dbError("Could not save the extracted fields", fieldsError);
      }
      return extraction.id;
    },

    async setStatus(documentId, status) {
      const { error } = await client.from("documents").update({ status }).eq("id", documentId);
      if (error) throw dbError("Could not update the document status", error);
    },
  };
}

/**
 * Seeding only (scripts/seed-samples.ts): claims a public sample (uploaded_by
 * null) so the demo's preloaded documents go through the real pipeline. A
 * sample left at needs_human may be retried. No route uses this, so a visitor
 * can never run a sample.
 */
export async function claimSample(documentId: string, staleBefore: Date): Promise<ClaimResult> {
  const client = await db();
  const { data: claimed, error } = await client
    .from("documents")
    .update({ status: "extracting", extraction_started_at: new Date().toISOString() })
    .eq("id", documentId)
    .is("uploaded_by", null)
    .or(`status.eq.uploaded,status.eq.needs_human,and(status.eq.extracting,extraction_started_at.lt."${staleBefore.toISOString()}")`)
    .select("id, storage_path, original_filename, mime_type");
  if (error) throw dbError("Could not claim the sample", error);
  return claimedDocument(claimed[0]);
}

function claimedDocument(
  row: { id: string; storage_path: string; original_filename: string; mime_type: string } | undefined,
): ClaimResult {
  if (!row) return { ok: false, reason: "busy" };
  if (!(ALLOWED_UPLOAD_TYPES as readonly string[]).includes(row.mime_type)) {
    throw new Error(`Document ${row.id} has an unsupported type: ${row.mime_type}`);
  }
  return {
    ok: true,
    document: { id: row.id, storagePath: row.storage_path, fileName: row.original_filename, mimeType: row.mime_type as UploadType },
  };
}
