import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { extractInvoice, validationIssues } from "./extract";
import type { InvoiceFile, ModelCallRecord } from "./types";

// npm test never calls the model: every case runs against MockLanguageModelV4.

const file: InvoiceFile = {
  bytes: new Uint8Array([37, 80, 68, 70]), // "%PDF"
  mediaType: "application/pdf",
  fileName: "synthetic-cobalt-ridge-inv-0587.pdf",
};

const q = <T>(value: T, sourceQuote: string) => ({ value, confidence: 0.95, sourceQuote });

const validInvoice = {
  vendor: q("Cobalt Ridge Print Co.", "Cobalt Ridge Print Co."),
  invoiceNumber: q("CR-2026-0587", "No. CR-2026-0587"),
  issueDate: q("28 Oct 2026", "28 Oct 2026"),
  dueDate: q("27 Nov 2026", "27 Nov 2026"),
  currency: q("EUR", "EUR (€)"),
  lineItems: [],
  subtotal: q(1016.5, "€1,016.50"),
  tax: q(213.47, "€213.47"),
  total: q(1229.97, "€1,229.97"),
};

// Passes strict JSON Schema but breaks the evidence rule: a value with no quote.
const invoiceWithoutEvidence = { ...validInvoice, total: { value: 1229.97, confidence: 0.9, sourceQuote: null } };

function reply(json: unknown, usage = { input: 3000, cached: 0, output: 1500, reasoning: 200 }) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(json) }],
    finishReason: { unified: "stop" as const, raw: undefined },
    usage: {
      inputTokens: { total: usage.input, noCache: usage.input - usage.cached, cacheRead: usage.cached, cacheWrite: 0 },
      outputTokens: { total: usage.output, text: usage.output - usage.reasoning, reasoning: usage.reasoning },
    },
    warnings: [],
  };
}

function mockModel(replies: Array<ReturnType<typeof reply> | ReturnType<typeof toolReply>>) {
  return new MockLanguageModelV4({ modelId: "gpt-6-luna", doGenerate: replies });
}

async function run(model: MockLanguageModelV4) {
  const logged: ModelCallRecord[] = [];
  const result = await extractInvoice(file, { model, mode: "json_schema", onCall: (call) => void logged.push(call) });
  return { result, logged };
}

describe("extractInvoice", () => {
  it("returns the invoice on the first try and logs one ok call with its cost", async () => {
    const { result, logged } = await run(mockModel([reply(validInvoice)]));

    expect(result.status).toBe("extracted");
    if (result.status === "extracted") expect(result.invoice.total.value).toBe(1229.97);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({
      model: "gpt-6-luna",
      mode: "json_schema",
      attempt: 1,
      outcome: "ok",
      inputTokens: 3000,
      outputTokens: 1500,
      reasoningTokens: 200,
      costUsd: 0.00105, // 3,000 × $0.10/M + 1,500 × $0.50/M
    });
  });

  it("repairs once: feeds back the previous answer and the exact issue", async () => {
    const model = mockModel([reply(invoiceWithoutEvidence), reply(validInvoice, { input: 4200, cached: 2900, output: 1500, reasoning: 0 })]);
    const { result, logged } = await run(model);

    expect(result.status).toBe("extracted");
    expect(logged.map((call) => call.outcome)).toEqual(["validation_error", "repaired"]);
    expect(logged[0].error).toContain("total.sourceQuote");
    expect(logged[1].cachedInputTokens).toBe(2900);

    const repairPrompt = model.doGenerateCalls[1].prompt;
    expect(repairPrompt.map((message) => message.role)).toEqual(["system", "user", "assistant", "user"]);
    const lastMessage = JSON.stringify(repairPrompt.at(-1));
    expect(lastMessage).toContain("did not pass validation");
    expect(lastMessage).toContain("total.sourceQuote");
  });

  it("sends the document to the model as a file part", async () => {
    const model = mockModel([reply(validInvoice)]);
    await run(model);
    const userParts = JSON.stringify(model.doGenerateCalls[0].prompt[1]);
    expect(userParts).toContain('"type":"file"');
    expect(userParts).toContain("application/pdf");
  });

  it("marks the document for a human after the repair also fails, never returning partial data", async () => {
    const { result, logged } = await run(mockModel([reply(invoiceWithoutEvidence), reply(invoiceWithoutEvidence)]));

    expect(result.status).toBe("needs_human");
    expect(result).not.toHaveProperty("invoice");
    expect(logged.map((call) => call.outcome)).toEqual(["validation_error", "validation_error"]);
    expect(logged.every((call) => call.costUsd > 0)).toBe(true);
  });

  it("treats unparseable output as a validation failure", async () => {
    const broken = { ...reply(validInvoice), content: [{ type: "text" as const, text: '{"vendor": ' }] };
    const { result, logged } = await run(mockModel([broken, reply(validInvoice)]));
    expect(result.status).toBe("extracted");
    expect(logged[0].outcome).toBe("validation_error");
  });

  it("logs an API error and stops without retrying the ladder", async () => {
    const model = new MockLanguageModelV4({
      modelId: "gpt-6-luna",
      doGenerate: async () => {
        throw new Error("upstream unavailable");
      },
    });
    const { result, logged } = await run(model);

    expect(result.status).toBe("failed");
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ outcome: "api_error", costUsd: 0, error: "upstream unavailable" });
  });
});

function toolReply(input: unknown, toolName = "record_invoice") {
  return {
    ...reply(validInvoice),
    content: [{ type: "tool-call" as const, toolCallId: "call_1", toolName, input: JSON.stringify(input) }],
    finishReason: { unified: "tool-calls" as const, raw: undefined },
  };
}

async function runFunctionCall(model: MockLanguageModelV4) {
  const logged: ModelCallRecord[] = [];
  const result = await extractInvoice(file, { model, mode: "function_call", onCall: (call) => void logged.push(call) });
  return { result, logged };
}

describe("extractInvoice, function_call mode", () => {
  it("sends one strict, forced record_invoice tool and returns its arguments", async () => {
    const model = mockModel([toolReply(validInvoice)]);
    const { result, logged } = await runFunctionCall(model);

    expect(result.status).toBe("extracted");
    if (result.status === "extracted") expect(result.invoice.invoiceNumber.value).toBe("CR-2026-0587");
    expect(logged[0]).toMatchObject({ mode: "function_call", outcome: "ok", attempt: 1 });

    const request = model.doGenerateCalls[0];
    expect(request.tools).toHaveLength(1);
    expect(request.tools?.[0]).toMatchObject({ type: "function", name: "record_invoice", strict: true });
    expect(request.toolChoice).toEqual({ type: "tool", toolName: "record_invoice" });
    expect(request.responseFormat?.type ?? "text").toBe("text"); // no json_schema in this mode
  });

  it("is the default mode (chosen by the 1 Nov 2026 comparison, prompt 006)", async () => {
    const model = mockModel([toolReply(validInvoice)]);
    const logged: ModelCallRecord[] = [];
    await extractInvoice(file, { model, onCall: (call) => void logged.push(call) });
    expect(logged[0].mode).toBe("function_call");
    expect(model.doGenerateCalls[0].toolChoice).toEqual({ type: "tool", toolName: "record_invoice" });
  });

  it("repairs an invalid call by answering it with a tool result that lists the issues", async () => {
    const model = mockModel([toolReply(invoiceWithoutEvidence), toolReply(validInvoice)]);
    const { result, logged } = await runFunctionCall(model);

    expect(result.status).toBe("extracted");
    expect(logged.map((call) => call.outcome)).toEqual(["validation_error", "repaired"]);
    expect(logged[0].error).toContain("total.sourceQuote");

    const repairPrompt = model.doGenerateCalls[1].prompt;
    expect(repairPrompt.map((message) => message.role)).toEqual(["system", "user", "assistant", "tool"]);
    const toolMessage = JSON.stringify(repairPrompt.at(-1));
    expect(toolMessage).toContain("call_1");
    expect(toolMessage).toContain("error-text");
    expect(toolMessage).toContain("total.sourceQuote");
  });

  it("treats a missing tool call as a validation failure and ends with needs_human", async () => {
    const textOnly = reply(validInvoice); // plain text, no tool call
    const { result, logged } = await runFunctionCall(mockModel([textOnly, textOnly]));

    expect(result.status).toBe("needs_human");
    expect(logged.map((call) => call.outcome)).toEqual(["validation_error", "validation_error"]);
    expect(logged[0].error).toContain("No record_invoice call");
  });
});

describe("validationIssues", () => {
  it("falls back to a generic message when there are no issues to show", () => {
    expect(validationIssues(new Error("x"))).toEqual(["The answer was not valid JSON for the invoice schema."]);
  });
});
