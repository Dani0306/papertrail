import { openai } from "@ai-sdk/openai";
import {
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  ToolChoiceViolationError,
  generateText,
  tool,
  type LanguageModel,
  type LanguageModelUsage,
  type ModelMessage,
} from "ai";
import { callCostUsd } from "@/lib/cost/pricing";
import { escalationModel, primaryModel } from "@/lib/models";
import { Invoice, InvoiceWithoutConfidence } from "@/lib/schema/invoice";
import { USER_INSTRUCTION, repairInstruction, systemPrompt } from "./prompt";
import type { CallOutcome, ExtractionMode, ExtractionResult, InvoiceFile, ModelCallRecord } from "./types";

// Pure server code: no Next.js, no Supabase. The CLI, the API route and the
// eval script all call this and decide where the call records go.

export type ExtractOptions = {
  /** Model ID, or a model object (tests pass a mock). Defaults to the primary model. */
  model?: string | Exclude<LanguageModel, string>;
  /** How the schema is sent. Defaults to function_call (measured on 1 Nov 2026, prompt 006). */
  mode?: ExtractionMode;
  /**
   * Called once, fresh, when the primary model's repair also fails validation.
   * Defaults to the escalation model; null turns escalation off. A mock primary
   * (tests) never escalates unless this is set, so npm test can't reach a real model.
   */
  escalationModel?: string | Exclude<LanguageModel, string> | null;
  /** Receives one record per model call as soon as the call ends. */
  onCall?: (record: ModelCallRecord) => void | Promise<void>;
  /**
   * Eval-only (prompt 014 A/B): false sends the schema and prompt without
   * confidence, and returns every field at confidence 1, meaning "nothing flagged".
   */
  askConfidence?: boolean;
};

/** What the model is asked for, and how its answer becomes an Invoice. */
type Spec = { system: string; schema: typeof Invoice | typeof InvoiceWithoutConfidence; toInvoice: (output: unknown) => Invoice };

const WITH_CONFIDENCE: Spec = { system: systemPrompt({ confidence: true }), schema: Invoice, toInvoice: (output) => output as Invoice };

const WITHOUT_CONFIDENCE: Spec = {
  system: systemPrompt({ confidence: false }),
  schema: InvoiceWithoutConfidence,
  toInvoice: (output) => {
    const answer = output as InvoiceWithoutConfidence;
    const full = <T extends { value: unknown; sourceQuote: string | null }>(field: T) => ({ ...field, confidence: 1 });
    const { lineItems, ...scalars } = answer;
    return {
      ...Object.fromEntries(Object.entries(scalars).map(([name, field]) => [name, full(field)])),
      lineItems: lineItems.map((item) => Object.fromEntries(Object.entries(item).map(([name, field]) => [name, full(field)]))),
    } as Invoice;
  },
};

const MAX_ATTEMPTS = 2; // the first try plus one repair, then at most one escalation (AGENTS.md §7)

export const RECORD_INVOICE_TOOL = "record_invoice";

// Identical for both modes, so only the transport differs. store: false keeps
// documents off OpenAI's servers; low reasoning is an assumption that is measured
// (reasoning tokens bill as output and are logged).
const PROVIDER_OPTIONS = { openai: { strictJsonSchema: true, reasoningEffort: "low", store: false } } as const;

/** One model call's verdict. API errors are thrown, not returned. */
type Attempt =
  | { ok: true; invoice: Invoice; usage: LanguageModelUsage }
  | { ok: false; issues: string[]; usage: LanguageModelUsage | undefined; followUp: ModelMessage[] };

type AttemptFn = (model: Exclude<LanguageModel, string>, messages: ModelMessage[], spec: Spec) => Promise<Attempt>;

/**
 * Reads an invoice from a PDF or image. The ladder: validate → one repair with
 * the issues fed back → one fresh call on the escalation model → needs_human.
 * Never returns partial data.
 */
export async function extractInvoice(file: InvoiceFile, options: ExtractOptions = {}): Promise<ExtractionResult> {
  const model = typeof options.model === "object" ? options.model : openai(options.model ?? primaryModel());
  const fallback = resolveEscalation(options);
  const mode = options.mode ?? "function_call";
  const attemptOnce = mode === "function_call" ? viaFunctionCall : viaJsonSchema;
  const spec = options.askConfidence === false ? WITHOUT_CONFIDENCE : WITH_CONFIDENCE;
  const calls: ModelCallRecord[] = [];

  const firstMessages = (): ModelMessage[] => [
    {
      role: "user",
      content: [
        { type: "text", text: USER_INSTRUCTION },
        { type: "file", data: file.bytes, mediaType: file.mediaType, filename: file.fileName },
      ],
    },
  ];
  const messages = firstMessages();

  async function record(
    attempt: number,
    outcome: CallOutcome,
    usage: LanguageModelUsage | undefined,
    started: number,
    error?: string,
    by: Exclude<LanguageModel, string> = model,
  ) {
    const tokens = billedTokens(usage);
    const call: ModelCallRecord = {
      at: new Date().toISOString(),
      fileName: file.fileName,
      model: by.modelId,
      mode,
      attempt,
      outcome,
      ...tokens,
      costUsd: callCostUsd(by.modelId, tokens),
      latencyMs: Math.round(performance.now() - started),
      ...(error && { error }),
    };
    calls.push(call);
    await options.onCall?.(call);
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const started = performance.now();
    let result: Attempt;
    try {
      result = await attemptOnce(model, messages, spec);
    } catch (error) {
      await record(attempt, "api_error", undefined, started, errorMessage(error));
      return { status: "failed", reason: errorMessage(error), calls };
    }

    if (result.ok) {
      await record(attempt, attempt === 1 ? "ok" : "repaired", result.usage, started);
      return { status: "extracted", invoice: result.invoice, escalated: false, calls };
    }

    await record(attempt, "validation_error", result.usage, started, result.issues.join("; "));
    if (attempt === MAX_ATTEMPTS) {
      const repairIssues = result.issues.join("; ");
      if (!fallback) return { status: "needs_human", reason: `Still invalid after a repair attempt: ${repairIssues}`, calls };
      return escalate(repairIssues);
    }
    // Same conversation, plus what the model answered and exactly what was wrong with it.
    messages.push(...result.followUp);
  }

  // Unreachable: every attempt returns or continues to the next one.
  throw new Error("extractInvoice ran out of attempts without a result");

  /**
   * One fresh call on the stronger model: same prompt, file and mode, without the
   * primary's conversation, and no repair. Any failure ends at needs_human; going
   * back to "uploaded" would pay for the primary twice more on a rerun.
   */
  async function escalate(repairIssues: string): Promise<ExtractionResult> {
    const by = fallback!;
    const started = performance.now();
    let result: Attempt;
    try {
      result = await attemptOnce(by, firstMessages(), spec);
    } catch (error) {
      await record(MAX_ATTEMPTS + 1, "api_error", undefined, started, errorMessage(error), by);
      return { status: "needs_human", reason: `Still invalid after a repair; escalation to ${by.modelId} failed: ${errorMessage(error)}`, calls };
    }
    if (result.ok) {
      await record(MAX_ATTEMPTS + 1, "escalated", result.usage, started, undefined, by);
      return { status: "extracted", invoice: result.invoice, escalated: true, calls };
    }
    await record(MAX_ATTEMPTS + 1, "validation_error", result.usage, started, result.issues.join("; "), by);
    return {
      status: "needs_human",
      reason: `Still invalid after a repair (${repairIssues}) and an escalation to ${by.modelId} (${result.issues.join("; ")})`,
      calls,
    };
  }
}

function resolveEscalation(options: ExtractOptions): Exclude<LanguageModel, string> | null {
  if (options.escalationModel === null) return null;
  if (typeof options.escalationModel === "object") return options.escalationModel;
  if (typeof options.escalationModel === "string") return openai(options.escalationModel);
  // Not set: a real primary escalates to the configured model; a mock primary doesn't escalate at all.
  return typeof options.model === "object" ? null : openai(escalationModel());
}

/** The schema as the reply's format (`text.format` json_schema, strict). */
const viaJsonSchema: AttemptFn = async (model, messages, spec) => {
  try {
    const result = await generateText({
      model,
      system: spec.system,
      messages,
      output: Output.object({ schema: spec.schema, name: "invoice" }),
      providerOptions: PROVIDER_OPTIONS,
      maxRetries: 2, // the SDK's own retry for transient API errors only
    });
    return { ok: true, invoice: spec.toInvoice(result.output), usage: result.usage };
  } catch (error) {
    if (!NoObjectGeneratedError.isInstance(error) && !NoOutputGeneratedError.isInstance(error)) throw error;
    const issues = validationIssues(error);
    const previous = NoObjectGeneratedError.isInstance(error) ? error.text : undefined;
    return {
      ok: false,
      issues,
      usage: NoObjectGeneratedError.isInstance(error) ? error.usage : undefined,
      followUp: [
        ...(previous ? [{ role: "assistant" as const, content: previous }] : []),
        { role: "user" as const, content: repairInstruction(issues) },
      ],
    };
  }
};

/**
 * The schema as the arguments of a forced strict function call. Unlike the
 * json_schema path, the SDK doesn't throw on bad arguments: it returns the call
 * marked `invalid`, so all three cases (no call, invalid call, valid call) are
 * checked here.
 */
const viaFunctionCall: AttemptFn = async (model, messages, spec) => {
  const noCall = (usage: LanguageModelUsage | undefined, text?: string): Attempt => {
    const issues = [`No ${RECORD_INVOICE_TOOL} call was made. Call it with the invoice.`];
    return {
      ok: false,
      issues,
      usage,
      followUp: [
        ...(text ? [{ role: "assistant" as const, content: text }] : []),
        { role: "user" as const, content: repairInstruction(issues) },
      ],
    };
  };

  let result;
  try {
    result = await generateText({
      model,
      system: spec.system,
      messages,
      tools: {
        [RECORD_INVOICE_TOOL]: tool({
          description: "Record the invoice extracted from the attached document.",
          inputSchema: spec.schema,
          strict: true, // the Responses provider sends tools as non-strict unless asked
        }),
      },
      toolChoice: { type: "tool", toolName: RECORD_INVOICE_TOOL },
      providerOptions: PROVIDER_OPTIONS,
      maxRetries: 2,
    });
  } catch (error) {
    // The SDK enforces the forced tool itself and throws when it wasn't called.
    // The error carries no usage, so this call's tokens can't be logged.
    if (ToolChoiceViolationError.isInstance(error)) return noCall(undefined);
    throw error;
  }

  const call = result.toolCalls.find((toolCall) => toolCall.toolName === RECORD_INVOICE_TOOL);
  if (!call) return noCall(result.usage, result.text);

  if ("invalid" in call && call.invalid) {
    const issues = validationIssues(call.error);
    // Answer the call with the problems, as a tool result: the shape a function call expects.
    return {
      ok: false,
      issues,
      usage: result.usage,
      followUp: [
        {
          role: "assistant",
          content: [{ type: "tool-call", toolCallId: call.toolCallId, toolName: RECORD_INVOICE_TOOL, input: call.input }],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: call.toolCallId,
              toolName: RECORD_INVOICE_TOOL,
              output: { type: "error-text", value: repairInstruction(issues) },
            },
          ],
        },
      ],
    };
  }

  return { ok: true, invoice: spec.toInvoice(call.input), usage: result.usage };
};

function billedTokens(usage: LanguageModelUsage | undefined) {
  return {
    inputTokens: usage?.inputTokens ?? 0,
    cachedInputTokens: usage?.inputTokenDetails?.cacheReadTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    reasoningTokens: usage?.outputTokenDetails?.reasoningTokens ?? 0,
  };
}

/** Readable issues for the repair prompt: "total.sourceQuote: A value needs the exact text…". */
export function validationIssues(error: unknown): string[] {
  if (NoOutputGeneratedError.isInstance(error)) {
    return ["No answer was produced (the response was empty, refused or cut off)."];
  }
  const issues = findIssues(error);
  if (issues.length > 0) {
    return issues.map((issue) => (issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message));
  }
  return ["The answer was not valid JSON for the invoice schema."];
}

type Issue = { path: (string | number)[]; message: string };

/** Walks the error's cause chain to the Zod issues. */
function findIssues(error: unknown, depth = 0): Issue[] {
  if (!error || typeof error !== "object" || depth > 5) return [];
  const candidate = (error as { issues?: unknown }).issues;
  if (Array.isArray(candidate)) {
    return candidate
      .filter((issue): issue is { path?: unknown; message: string } => typeof issue?.message === "string")
      .map((issue) => ({
        path: Array.isArray(issue.path) ? issue.path.map((part) => (typeof part === "object" ? String((part as { key?: unknown }).key) : part)) : [],
        message: issue.message,
      }));
  }
  return findIssues((error as { cause?: unknown }).cause, depth + 1);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
