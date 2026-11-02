import "server-only";
import type { ManualEntry, ManualFieldRow } from "@/lib/review/manual";
import { db } from "./client";
import { dbError } from "./documents";
import { ownedDocument } from "./reviews";
import type { Json } from "./types";

export type ManualResult = { ok: true; extractionId: string } | { ok: false; reason: "missing" | "forbidden" | "busy" };

/**
 * Saves a person's hand entry of a needs_human document: one extraction
 * (model and mode "manual") with its fields, then needs_human → reviewed.
 * If another save got there first, this one is removed again.
 */
export async function saveManualEntry(documentId: string, userId: string, entry: ManualEntry, rows: ManualFieldRow[]): Promise<ManualResult> {
  const owned = await ownedDocument(documentId, userId);
  if (!owned.ok) return owned;
  if (owned.status !== "needs_human") return { ok: false, reason: "busy" };

  const client = await db();
  const { data: extraction, error } = await client
    .from("extractions")
    .insert({ document_id: documentId, model: "manual", mode: "manual", invoice: entry as unknown as Json })
    .select("id")
    .single();
  if (error) throw dbError("Could not save the hand entry", error);

  const removeExtraction = () => client.from("extractions").delete().eq("id", extraction.id);
  const { error: fieldsError } = await client.from("extraction_fields").insert(rows.map((row) => ({ ...row, extraction_id: extraction.id })));
  if (fieldsError) {
    await removeExtraction();
    throw dbError("Could not save the entered fields", fieldsError);
  }

  // Conditional, so of two simultaneous saves only one moves the document on.
  const { data: moved, error: statusError } = await client
    .from("documents")
    .update({ status: "reviewed" })
    .eq("id", documentId)
    .eq("uploaded_by", userId)
    .eq("status", "needs_human")
    .select("id");
  if (statusError || moved.length === 0) {
    await removeExtraction();
    if (statusError) throw dbError("Could not mark the document reviewed", statusError);
    return { ok: false, reason: "busy" };
  }
  return { ok: true, extractionId: extraction.id };
}
