import type { Invoice } from "@/lib/schema/invoice";
import type { UploadType } from "@/lib/uploads";

export type InvoiceFile = {
  bytes: Uint8Array;
  mediaType: UploadType;
  fileName: string;
};

/**
 * How the schema reaches the model: as the reply's format (`text.format`
 * json_schema) or as the arguments of a forced strict function call.
 */
export type ExtractionMode = "json_schema" | "function_call";

/** AGENTS.md §8 model_calls.outcome. `escalated`: the escalation model's call validated. */
export type CallOutcome = "ok" | "validation_error" | "api_error" | "repaired" | "escalated";

/**
 * One record per model call, whatever happened. The CLI appends it to
 * logs/model-calls.jsonl; the app will write the same shape to model_calls.
 */
export type ModelCallRecord = {
  at: string;
  fileName: string;
  model: string;
  mode: ExtractionMode;
  attempt: number;
  outcome: CallOutcome;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  costUsd: number;
  latencyMs: number;
  /** Why the call failed, for validation and API errors. */
  error?: string;
};

export type ExtractionResult =
  /** escalated: the primary failed validation twice and the escalation model's answer was used. */
  | { status: "extracted"; invoice: Invoice; escalated: boolean; calls: ModelCallRecord[] }
  | { status: "needs_human"; reason: string; calls: ModelCallRecord[] }
  | { status: "failed"; reason: string; calls: ModelCallRecord[] };
