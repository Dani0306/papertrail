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
import { primaryModel } from "@/lib/models";
import { Invoice } from "@/lib/schema/invoice";
import { SYSTEM_PROMPT, USER_INSTRUCTION, repairInstruction } from "./prompt";
import type { CallOutcome, ExtractionMode, ExtractionResult, InvoiceFile, ModelCallRecord } from "./types";

// Pure server code: no Next.js, no Supabase. The CLI, the API route and the
// eval script all call this and decide where the call records go.

export type ExtractOptions = {
  /** Model ID, or a model object (tests pass a mock). Defaults to the primary model. */
  model?: string | Exclude<LanguageModel, string>;
  /** How the schema is sent. Defaults to json_schema. */
  mode?: ExtractionMode;
  /** Receives one record per model call as soon as the call ends. */
  onCall?: (record: ModelCallRecord) => void | Promise<void>;
};

const MAX_ATTEMPTS = 2; // the first try plus one repair; escalation slots in after this (week 3)

export const RECORD_INVOICE_TOOL = "record_invoice";

// Identical for both modes, so only the transport differs. store: false keeps
// documents off OpenAI's servers; low reasoning is an assumption that is measured
// (reasoning tokens bill as output and are logged).
const PROVIDER_OPTIONS = { openai: { strictJsonSchema: true, reasoningEffort: "low", store: false } } as const;

/** One model call's verdict. API errors are thrown, not returned. */
type Attempt =
  | { ok: true; invoice: Invoice; usage: LanguageModelUsage }
  | { ok: false; issues: string[]; usage: LanguageModelUsage | undefined; followUp: ModelMessage[] };

type AttemptFn = (model: Exclude<LanguageModel, string>, messages: ModelMessage[]) => Promise<Attempt>;

/**
 * Reads an invoice from a PDF or image. Returns a validated invoice, or
 * needs_human once the repair retry also fails. Never returns partial data.
 */
export async function extractInvoice(file: InvoiceFile, options: ExtractOptions = {}): Promise<ExtractionResult> {
  const model = typeof options.model === "object" ? options.model : openai(options.model ?? primaryModel());
  const mode = options.mode ?? "json_schema";
  const attemptOnce = mode === "function_call" ? viaFunctionCall : viaJsonSchema;
  const calls: ModelCallRecord[] = [];

  const messages: ModelMessage[] = [
    {
      role: "user",
      content: [
        { type: "text", text: USER_INSTRUCTION },
        { type: "file", data: file.bytes, mediaType: file.mediaType, filename: file.fileName },
      ],
    },
  ];

  async function record(attempt: number, outcome: CallOutcome, usage: LanguageModelUsage | undefined, started: number, error?: string) {
    const tokens = billedTokens(usage);
    const call: ModelCallRecord = {
      at: new Date().toISOString(),
      fileName: file.fileName,
      model: model.modelId,
      mode,
      attempt,
      outcome,
      ...tokens,
      costUsd: callCostUsd(model.modelId, tokens),
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
      result = await attemptOnce(model, messages);
    } catch (error) {
      await record(attempt, "api_error", undefined, started, errorMessage(error));
      return { status: "failed", reason: errorMessage(error), calls };
    }

    if (result.ok) {
      await record(attempt, attempt === 1 ? "ok" : "repaired", result.usage, started);
      return { status: "extracted", invoice: result.invoice, calls };
    }

    await record(attempt, "validation_error", result.usage, started, result.issues.join("; "));
    if (attempt === MAX_ATTEMPTS) {
      return { status: "needs_human", reason: `Still invalid after a repair attempt: ${result.issues.join("; ")}`, calls };
    }
    // Same conversation, plus what the model answered and exactly what was wrong with it.
    messages.push(...result.followUp);
  }

  // Unreachable: every attempt returns or continues to the next one.
  throw new Error("extractInvoice ran out of attempts without a result");
}

/** The schema as the reply's format (`text.format` json_schema, strict). */
const viaJsonSchema: AttemptFn = async (model, messages) => {
  try {
    const result = await generateText({
      model,
      system: SYSTEM_PROMPT,
      messages,
      output: Output.object({ schema: Invoice, name: "invoice" }),
      providerOptions: PROVIDER_OPTIONS,
      maxRetries: 2, // the SDK's own retry for transient API errors only
    });
    return { ok: true, invoice: result.output, usage: result.usage };
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
const viaFunctionCall: AttemptFn = async (model, messages) => {
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
      system: SYSTEM_PROMPT,
      messages,
      tools: {
        [RECORD_INVOICE_TOOL]: tool({
          description: "Record the invoice extracted from the attached document.",
          inputSchema: Invoice,
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

  return { ok: true, invoice: call.input as Invoice, usage: result.usage };
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
