import "server-only";
import type { DocumentStatusValue } from "@/lib/document-status";
import { type DocumentAccess, accessFailure, documentAccess } from "@/lib/review/access";
import { type FieldValue, type ReviewField, reviewFieldFromRow } from "@/lib/review/fields";
import { db, documentsBucket } from "./client";
import { dbError, toStatus } from "./documents";
import type { Json } from "./types";

const PREVIEW_URL_SECONDS = 10 * 60;

/** Statuses whose extracted fields a person may correct. */
const CORRECTABLE: readonly DocumentStatusValue[] = ["extracted", "reviewed"];

export type DocumentReview = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatusValue;
  createdAt: string;
  access: Exclude<DocumentAccess, "hidden">;
  /** Short-lived signed URL to the private file, or null if Storage didn't issue one. */
  previewUrl: string | null;
  extraction: { id: string; model: string; mode: string; createdAt: string; fields: ReviewField[] } | null;
  /** Every model call made for this document, including failed runs. */
  calls: { count: number; costUsd: number; latencyMs: number; lastError: string | null };
};

/** The review screen's data, or null when the document doesn't exist or isn't the viewer's to see. */
export async function getDocumentReview(documentId: string, viewerId: string | null): Promise<DocumentReview | null> {
  const client = await db();
  const { data: document, error } = await client
    .from("documents")
    .select("id, original_filename, mime_type, size_bytes, status, created_at, uploaded_by, storage_path")
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw dbError("Could not load the document", error);
  if (!document) return null;
  const access = documentAccess(document.uploaded_by, viewerId);
  if (access === "hidden") return null;

  const [extraction, calls, preview] = await Promise.all([
    client
      .from("extractions")
      .select("id, model, mode, created_at, extraction_fields(field_name, value, confidence, source_quote, corrected_value, corrected_at, position)")
      .eq("document_id", documentId)
      .order("created_at", { ascending: false })
      .order("position", { referencedTable: "extraction_fields", ascending: true })
      .limit(1)
      .maybeSingle(),
    client.from("model_calls").select("cost_usd, latency_ms, error, created_at").eq("document_id", documentId).order("created_at", { ascending: true }),
    client.storage.from(documentsBucket()).createSignedUrl(document.storage_path, PREVIEW_URL_SECONDS),
  ]);
  if (extraction.error) throw dbError("Could not load the extraction", extraction.error);
  if (calls.error) throw dbError("Could not load the model calls", calls.error);

  return {
    id: document.id,
    fileName: document.original_filename,
    mimeType: document.mime_type,
    sizeBytes: document.size_bytes,
    status: toStatus(document.status),
    createdAt: document.created_at,
    access,
    previewUrl: preview.data?.signedUrl ?? null,
    extraction: extraction.data && {
      id: extraction.data.id,
      model: extraction.data.model,
      mode: extraction.data.mode,
      createdAt: extraction.data.created_at,
      fields: extraction.data.extraction_fields.map(reviewFieldFromRow),
    },
    calls: {
      count: calls.data.length,
      // numeric(12,8) comes back as a number; summed in integer 1e-8 units so floats don't drift.
      costUsd: calls.data.reduce((total, call) => total + Math.round(Number(call.cost_usd) * 1e8), 0) / 1e8,
      latencyMs: calls.data.reduce((total, call) => total + call.latency_ms, 0),
      lastError: calls.data.at(-1)?.error ?? null,
    },
  };
}

export type WriteResult = { ok: true } | { ok: false; reason: "missing" | "forbidden" | "busy" | "unknown_field" };

/** Stores a person's value next to the model's; `revert` clears it. The model's value is never written. */
export async function correctField(
  documentId: string,
  userId: string,
  fieldName: string,
  change: { value: FieldValue } | { revert: true },
): Promise<WriteResult> {
  const client = await db();
  const owned = await ownedDocument(documentId, userId);
  if (!owned.ok) return owned;
  if (!CORRECTABLE.includes(owned.status)) return { ok: false, reason: "busy" };

  const { data: extraction, error } = await client
    .from("extractions")
    .select("id")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError("Could not load the extraction", error);
  if (!extraction) return { ok: false, reason: "busy" };

  const correction =
    "revert" in change
      ? { corrected_value: null, corrected_at: null }
      : { corrected_value: change.value as Json, corrected_at: new Date().toISOString() };
  const { data: updated, error: updateError } = await client
    .from("extraction_fields")
    .update(correction)
    .eq("extraction_id", extraction.id)
    .eq("field_name", fieldName)
    .select("id");
  if (updateError) throw dbError("Could not save the correction", updateError);
  return updated.length === 1 ? { ok: true } : { ok: false, reason: "unknown_field" };
}

/** extracted → reviewed, uploader only. Idempotent for a document already reviewed. */
export async function markReviewed(documentId: string, userId: string): Promise<WriteResult> {
  const owned = await ownedDocument(documentId, userId);
  if (!owned.ok) return owned;
  if (owned.status === "reviewed") return { ok: true };
  if (owned.status !== "extracted") return { ok: false, reason: "busy" };

  const client = await db();
  const { data, error } = await client
    .from("documents")
    .update({ status: "reviewed" })
    .eq("id", documentId)
    .eq("uploaded_by", userId)
    .eq("status", "extracted")
    .select("id");
  if (error) throw dbError("Could not mark the document reviewed", error);
  return data.length === 1 ? { ok: true } : { ok: false, reason: "busy" };
}

async function ownedDocument(
  documentId: string,
  userId: string,
): Promise<{ ok: true; status: DocumentStatusValue } | { ok: false; reason: "missing" | "forbidden" }> {
  const client = await db();
  const { data, error } = await client.from("documents").select("uploaded_by, status").eq("id", documentId).maybeSingle();
  if (error) throw dbError("Could not load the document", error);
  if (!data) return { ok: false, reason: "missing" };
  const denied = accessFailure(documentAccess(data.uploaded_by, userId));
  if (denied) return { ok: false, reason: denied };
  return { ok: true, status: toStatus(data.status) };
}
