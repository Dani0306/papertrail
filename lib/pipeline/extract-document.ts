import { confidenceLevel } from "@/lib/design/confidence";
import { type ExtractOptions, extractInvoice } from "@/lib/extract/extract";
import type { ExtractionResult, InvoiceFile, ModelCallRecord } from "@/lib/extract/types";
import { type Invoice, flattenFields } from "@/lib/schema/invoice";
import type { UploadType } from "@/lib/uploads";

// Runs one stored document through extraction and records everything. No
// Supabase or Next.js here: the route passes the real store (lib/db/extractions.ts),
// tests pass an in-memory one, so the whole flow is tested without a network call.

export const DEFAULT_DAILY_EXTRACTION_CAP = 50;

/**
 * A claim older than this is a run that died (function timeout, crash) and can be
 * taken over. Longer than the route's maxDuration (300 s), so a live run is never
 * reclaimed.
 */
export const STALE_CLAIM_MS = 6 * 60 * 1000;

export type ClaimedDocument = { id: string; storagePath: string; fileName: string; mimeType: UploadType };

export type ClaimResult =
  | { ok: true; document: ClaimedDocument }
  | { ok: false; reason: "missing" | "forbidden" | "busy" };

export type FieldRow = {
  position: number;
  field_name: string;
  value: string | number | null;
  confidence: number;
  source_quote: string | null;
};

export type ModelCallRow = {
  document_id: string | null;
  file_name: string;
  model: string;
  mode: string;
  attempt: number;
  outcome: string;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cost_usd: number;
  latency_ms: number;
  error: string | null;
  created_at: string;
};

export type ExtractionStore = {
  /** Extraction runs started since `since`: model_calls rows with attempt = 1. */
  countRunsSince(since: Date): Promise<number>;
  /** Sets status = extracting if this user uploaded it and it is uploaded, or its claim went stale. */
  claim(documentId: string, userId: string, staleBefore: Date): Promise<ClaimResult>;
  download(storagePath: string): Promise<Uint8Array>;
  logCall(row: ModelCallRow): Promise<void>;
  /** Writes the extraction and its fields; removes the extraction again if the fields fail. Returns its id. */
  saveExtraction(documentId: string, run: { model: string; mode: string; invoice: Invoice }, fields: FieldRow[]): Promise<string>;
  setStatus(documentId: string, status: "extracted" | "needs_human" | "uploaded"): Promise<void>;
};

export type ExtractDocumentDeps = {
  store: ExtractionStore;
  cap: number;
  threshold: number;
  /** Defaults to extractInvoice; tests wrap it to pass a mock model. */
  extract?: (file: InvoiceFile, options: ExtractOptions) => Promise<ExtractionResult>;
  now?: () => Date;
};

export type ExtractDocumentResult =
  | { ok: true; status: "extracted"; extractionId: string; fields: number; flaggedFields: number; costUsd: number }
  | { ok: true; status: "needs_human"; reason: string; costUsd: number }
  | { ok: false; reason: "cap"; cap: number }
  | { ok: false; reason: "missing" | "forbidden" | "busy" }
  | { ok: false; reason: "model_failed"; message: string; costUsd: number };

export async function extractDocument(
  input: { documentId: string; userId: string },
  { store, cap, threshold, extract = extractInvoice, now = () => new Date() }: ExtractDocumentDeps,
): Promise<ExtractDocumentResult> {
  // Before the claim, so a capped request leaves the document untouched.
  if ((await store.countRunsSince(startOfUtcDay(now()))) >= cap) return { ok: false, reason: "cap", cap };

  const claim = await store.claim(input.documentId, input.userId, new Date(now().getTime() - STALE_CLAIM_MS));
  if (!claim.ok) return claim;
  const { document } = claim;

  try {
    const bytes = await store.download(document.storagePath);
    const result = await extract(
      { bytes, mediaType: document.mimeType, fileName: document.fileName },
      // Written as each call ends, so a run that dies mid-repair still has its first call's cost on record.
      { onCall: (record) => logSafely(store, modelCallRow(record, document.id)) },
    );
    const costUsd = totalCost(result.calls);

    if (result.status === "failed") {
      // The model API failed, not the document: put it back so it can be tried again.
      await store.setStatus(document.id, "uploaded");
      return { ok: false, reason: "model_failed", message: result.reason, costUsd };
    }
    if (result.status === "needs_human") {
      await store.setStatus(document.id, "needs_human");
      return { ok: true, status: "needs_human", reason: result.reason, costUsd };
    }

    const last = result.calls.at(-1)!;
    const fields = fieldRows(result.invoice);
    const extractionId = await store.saveExtraction(document.id, { model: last.model, mode: last.mode, invoice: result.invoice }, fields);
    await store.setStatus(document.id, "extracted");
    const flaggedFields = fields.filter((field) => confidenceLevel(field.value, field.confidence, threshold) === "review").length;
    return { ok: true, status: "extracted", extractionId, fields: fields.length, flaggedFields, costUsd };
  } catch (error) {
    // Our side failed (download, save). Never leave the document stuck in extracting.
    await store.setStatus(document.id, "uploaded").catch((resetError: unknown) => console.error("Could not reset the document status", resetError));
    throw error;
  }
}

/** One row per field, in invoice order, named the way flattenFields() names them. */
export function fieldRows(invoice: Invoice): FieldRow[] {
  return flattenFields(invoice).map((field, position) => ({
    position,
    field_name: field.name,
    value: field.value,
    confidence: field.confidence,
    source_quote: field.sourceQuote,
  }));
}

/** The CLI's JSONL record, as a model_calls row. */
export function modelCallRow(record: ModelCallRecord, documentId: string | null): ModelCallRow {
  return {
    document_id: documentId,
    file_name: record.fileName,
    model: record.model,
    mode: record.mode,
    attempt: record.attempt,
    outcome: record.outcome,
    input_tokens: record.inputTokens,
    cached_input_tokens: record.cachedInputTokens,
    output_tokens: record.outputTokens,
    reasoning_tokens: record.reasoningTokens,
    cost_usd: record.costUsd,
    latency_ms: record.latencyMs,
    error: record.error ?? null,
    created_at: record.at,
  };
}

export function dailyExtractionCap(): number {
  const value = Number.parseInt(process.env.PAPERTRAIL_DAILY_EXTRACTION_CAP ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_DAILY_EXTRACTION_CAP;
}

export function startOfUtcDay(date: Date): Date {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

/** A lost log row is better than a lost paid result: report it and carry on. */
async function logSafely(store: ExtractionStore, row: ModelCallRow) {
  try {
    await store.logCall(row);
  } catch (error) {
    console.error("Could not write model_calls", error);
  }
}

function totalCost(calls: ModelCallRecord[]): number {
  return Math.round(calls.reduce((total, call) => total + call.costUsd, 0) * 1e8) / 1e8;
}
