import { openai } from "@ai-sdk/openai";
import {
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  generateText,
  type LanguageModel,
  type LanguageModelUsage,
  type ModelMessage,
} from "ai";
import { callCostUsd } from "@/lib/cost/pricing";
import { primaryModel } from "@/lib/models";
import { Invoice } from "@/lib/schema/invoice";
import { SYSTEM_PROMPT, USER_INSTRUCTION, repairInstruction } from "./prompt";
import type { CallOutcome, ExtractionResult, InvoiceFile, ModelCallRecord } from "./types";

// Pure server code: no Next.js, no Supabase. The CLI, the API route and the
// eval script all call this and decide where the call records go.

export type ExtractOptions = {
  /** Model ID, or a model object (tests pass a mock). Defaults to the primary model. */
  model?: string | Exclude<LanguageModel, string>;
  /** Receives one record per model call as soon as the call ends. */
  onCall?: (record: ModelCallRecord) => void | Promise<void>;
};

const MAX_ATTEMPTS = 2; // the first try plus one repair; escalation slots in after this (week 3)

/**
 * Reads an invoice from a PDF or image. Returns a validated invoice, or
 * needs_human once the repair retry also fails. Never returns partial data.
 */
export async function extractInvoice(file: InvoiceFile, options: ExtractOptions = {}): Promise<ExtractionResult> {
  const model = typeof options.model === "object" ? options.model : openai(options.model ?? primaryModel());
  const modelId = model.modelId;
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
      model: modelId,
      attempt,
      outcome,
      ...tokens,
      costUsd: callCostUsd(modelId, tokens),
      latencyMs: Math.round(performance.now() - started),
      ...(error && { error }),
    };
    calls.push(call);
    await options.onCall?.(call);
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const started = performance.now();
    try {
      const result = await generateText({
        model,
        system: SYSTEM_PROMPT,
        messages,
        output: Output.object({ schema: Invoice, name: "invoice" }),
        providerOptions: {
          // store: false keeps documents off OpenAI's servers; low reasoning is an
          // assumption to measure (reasoning tokens bill as output and are logged).
          openai: { strictJsonSchema: true, reasoningEffort: "low", store: false },
        },
        maxRetries: 2, // the SDK's own retry for transient API errors only
      });
      const invoice = result.output;
      await record(attempt, attempt === 1 ? "ok" : "repaired", result.usage, started);
      return { status: "extracted", invoice, calls };
    } catch (error) {
      if (!NoObjectGeneratedError.isInstance(error) && !NoOutputGeneratedError.isInstance(error)) {
        await record(attempt, "api_error", undefined, started, errorMessage(error));
        return { status: "failed", reason: errorMessage(error), calls };
      }

      const issues = validationIssues(error);
      const usage = NoObjectGeneratedError.isInstance(error) ? error.usage : undefined;
      await record(attempt, "validation_error", usage, started, issues.join("; "));

      if (attempt === MAX_ATTEMPTS) {
        return { status: "needs_human", reason: `Still invalid after a repair attempt: ${issues.join("; ")}`, calls };
      }
      // Same conversation, plus what the model said and exactly what was wrong with it.
      const previous = NoObjectGeneratedError.isInstance(error) ? error.text : undefined;
      if (previous) messages.push({ role: "assistant", content: previous });
      messages.push({ role: "user", content: repairInstruction(issues) });
    }
  }

  // Unreachable: every attempt returns or continues to the next one.
  throw new Error("extractInvoice ran out of attempts without a result");
}

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
