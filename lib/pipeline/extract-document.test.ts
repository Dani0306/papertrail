import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractInvoice } from "@/lib/extract/extract";
import type { ModelCallRecord } from "@/lib/extract/types";
import {
  type ClaimedDocument,
  type ExtractionStore,
  type FieldRow,
  type ModelCallRow,
  STALE_CLAIM_MS,
  dailyExtractionCap,
  extractDocument,
  fieldRows,
  modelCallRow,
  startOfUtcDay,
} from "./extract-document";

// No network: an in-memory store stands in for Supabase and MockLanguageModelV4 for OpenAI.

const OWNER = "user-1";
const NOW = new Date("2026-11-01T15:00:00Z");

const q = <T>(value: T, sourceQuote: string | null, confidence = 0.95) => ({ value, confidence, sourceQuote });

const invoice = {
  vendor: q("Harbor & Pine Supply Co.", "Harbor & Pine Supply Co."),
  invoiceNumber: q("INV-2041", "INV-2041"),
  issueDate: q("14/10/2026", "14/10/2026"),
  dueDate: q(null, null, 1),
  currency: q("USD", "USD"),
  lineItems: [
    {
      description: q("Oak shelving", "Oak shelving"),
      qty: q(2, "2"),
      unitPrice: q(500, "500.00"),
      lineTotal: q(1000, "1,000.00"),
    },
  ],
  subtotal: q(1148.5, "1,148.50"),
  tax: q(136, "136.00"),
  total: q(1284.5, "$1,284.50", 0.6), // one field below the threshold
};

const usage = {
  inputTokens: { total: 3000, noCache: 3000, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 700, text: 700, reasoning: 0 },
};

function toolReply(input: unknown) {
  return {
    content: [{ type: "tool-call" as const, toolCallId: "call_1", toolName: "record_invoice", input: JSON.stringify(input) }],
    finishReason: { unified: "tool-calls" as const, raw: undefined },
    usage,
    warnings: [],
  };
}

type FakeDocument = ClaimedDocument & { uploadedBy: string | null; status: string; extractionStartedAt: Date | null };

/** The ExtractionStore contract, in memory, with switches to make each step fail. */
function fakeStore(options: { status?: string; runsToday?: number; failSave?: boolean; failLog?: boolean; extractionStartedAt?: Date | null } = {}) {
  const document: FakeDocument = {
    id: "doc-1",
    storagePath: `uploads/${OWNER}/a/harbor-pine.pdf`,
    fileName: "harbor-pine.pdf",
    mimeType: "application/pdf",
    uploadedBy: OWNER,
    status: options.status ?? "uploaded",
    extractionStartedAt: options.extractionStartedAt ?? null,
  };
  const calls: ModelCallRow[] = [];
  const extractions: Array<{ id: string; documentId: string; model: string; mode: string; fields: FieldRow[] }> = [];
  const statuses: string[] = [];
  let downloads = 0;

  const store: ExtractionStore = {
    async countRunsSince(since) {
      expect(since).toEqual(startOfUtcDay(NOW));
      return (options.runsToday ?? 0) + calls.filter((call) => call.attempt === 1).length;
    },
    async claim(documentId, userId, staleBefore) {
      if (documentId !== document.id) return { ok: false, reason: "missing" };
      if (document.uploadedBy !== userId) return { ok: false, reason: "forbidden" };
      const stale = document.status === "extracting" && document.extractionStartedAt !== null && document.extractionStartedAt < staleBefore;
      if (document.status !== "uploaded" && !stale) return { ok: false, reason: "busy" };
      document.status = "extracting";
      document.extractionStartedAt = NOW;
      statuses.push("extracting");
      return { ok: true, document };
    },
    async download() {
      downloads++;
      return new Uint8Array([37, 80, 68, 70]);
    },
    async logCall(row) {
      if (options.failLog) throw new Error("insert failed");
      calls.push(row);
    },
    async saveExtraction(documentId, run, fields) {
      if (options.failSave) throw new Error("Could not save the extracted fields");
      const id = `ext-${extractions.length + 1}`;
      extractions.push({ id, documentId, model: run.model, mode: run.mode, fields });
      return id;
    },
    async setStatus(_documentId, status) {
      document.status = status;
      statuses.push(status);
    },
  };
  return { store, document, calls, extractions, statuses, downloads: () => downloads };
}

function withModel(model: MockLanguageModelV4) {
  return (file: Parameters<typeof extractInvoice>[0], options: Parameters<typeof extractInvoice>[1]) => extractInvoice(file, { ...options, model });
}

const model = (replies: Array<ReturnType<typeof toolReply>>) => new MockLanguageModelV4({ modelId: "gpt-6-luna", doGenerate: replies });

function run(fake: ReturnType<typeof fakeStore>, mock: MockLanguageModelV4, userId = OWNER, documentId = "doc-1") {
  return extractDocument({ documentId, userId }, { store: fake.store, cap: 50, threshold: 0.85, extract: withModel(mock), now: () => NOW });
}

afterEach(() => vi.restoreAllMocks());

describe("extractDocument", () => {
  it("saves the extraction, one row per field and every model call, then marks the document extracted", async () => {
    const fake = fakeStore();
    const result = await run(fake, model([toolReply(invoice)]));

    expect(result).toMatchObject({ ok: true, status: "extracted", extractionId: "ext-1", fields: 12, flaggedFields: 1 });
    expect(fake.statuses).toEqual(["extracting", "extracted"]);
    expect(fake.extractions[0]).toMatchObject({ documentId: "doc-1", model: "gpt-6-luna", mode: "function_call" });
    expect(fake.extractions[0].fields.map((field) => field.field_name)).toContain("lineItems[0].unitPrice");
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]).toMatchObject({ document_id: "doc-1", attempt: 1, outcome: "ok", input_tokens: 3000, output_tokens: 700, cost_usd: 0.00065 });
  });

  it("marks needs_human after the repair also fails, saving no extraction but logging both calls", async () => {
    const broken = { ...invoice, total: { value: 1284.5, confidence: 0.9, sourceQuote: null } };
    const fake = fakeStore();
    const result = await run(fake, model([toolReply(broken), toolReply(broken)]));

    expect(result).toMatchObject({ ok: true, status: "needs_human", costUsd: 0.0013 });
    expect(fake.extractions).toHaveLength(0);
    expect(fake.calls.map((call) => call.outcome)).toEqual(["validation_error", "validation_error"]);
    expect(fake.statuses.at(-1)).toBe("needs_human");
  });

  it("puts the document back to uploaded when the model API fails, so it can be tried again", async () => {
    const fake = fakeStore();
    const failing = new MockLanguageModelV4({
      modelId: "gpt-6-luna",
      doGenerate: async () => {
        throw new Error("upstream unavailable");
      },
    });
    const result = await run(fake, failing);

    expect(result).toMatchObject({ ok: false, reason: "model_failed", message: "upstream unavailable" });
    expect(fake.document.status).toBe("uploaded");
    expect(fake.calls[0]).toMatchObject({ outcome: "api_error", cost_usd: 0, error: "upstream unavailable" });
  });

  it("runs the model once for two simultaneous requests", async () => {
    const fake = fakeStore();
    const mock = model([toolReply(invoice), toolReply(invoice)]);
    const results = await Promise.all([run(fake, mock), run(fake, mock)]);

    expect(results.map((result) => (result.ok ? result.status : result.reason)).sort()).toEqual(["busy", "extracted"]);
    expect(mock.doGenerateCalls).toHaveLength(1);
    expect(fake.extractions).toHaveLength(1);
  });

  it("stops at the daily cap before touching the document or the model", async () => {
    const fake = fakeStore({ runsToday: 50 });
    const mock = model([toolReply(invoice)]);
    const result = await run(fake, mock);

    expect(result).toEqual({ ok: false, reason: "cap", cap: 50 });
    expect(fake.statuses).toEqual([]);
    expect(mock.doGenerateCalls).toHaveLength(0);
  });

  it.each([
    ["missing", { documentId: "doc-404" }, {}],
    ["forbidden", { userId: "someone-else" }, {}],
    ["busy", {}, { status: "extracted" }],
    ["busy", {}, { status: "needs_human" }],
    ["busy", {}, { status: "extracting", extractionStartedAt: new Date(NOW.getTime() - 60_000) }],
  ] as const)("refuses with %s and never calls the model", async (reason, who, state) => {
    const fake = fakeStore(state);
    const mock = model([toolReply(invoice)]);
    const result = await run(fake, mock, "userId" in who ? who.userId : OWNER, "documentId" in who ? who.documentId : "doc-1");

    expect(result).toEqual({ ok: false, reason });
    expect(mock.doGenerateCalls).toHaveLength(0);
    expect(fake.downloads()).toBe(0);
  });

  it("takes over a claim older than the stale window (a run the timeout killed)", async () => {
    const fake = fakeStore({ status: "extracting", extractionStartedAt: new Date(NOW.getTime() - STALE_CLAIM_MS - 1000) });
    const result = await run(fake, model([toolReply(invoice)]));
    expect(result).toMatchObject({ ok: true, status: "extracted" });
  });

  it("rolls the document back to uploaded and rethrows when saving fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fake = fakeStore({ failSave: true });

    await expect(run(fake, model([toolReply(invoice)]))).rejects.toThrow("Could not save the extracted fields");
    expect(fake.document.status).toBe("uploaded");
    expect(fake.calls).toHaveLength(1); // the paid call is still on record
  });

  it("finishes the extraction even if a model_calls insert fails", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const fake = fakeStore({ failLog: true });
    const result = await run(fake, model([toolReply(invoice)]));

    expect(result).toMatchObject({ ok: true, status: "extracted" });
    expect(errors).toHaveBeenCalledWith("Could not write model_calls", expect.any(Error));
  });
});

describe("row mapping", () => {
  it("keeps each field's JSON type, quote and invoice order", () => {
    const rows = fieldRows(invoice);
    expect(rows[0]).toEqual({ position: 0, field_name: "vendor", value: "Harbor & Pine Supply Co.", confidence: 0.95, source_quote: "Harbor & Pine Supply Co." });
    expect(rows.find((row) => row.field_name === "dueDate")).toMatchObject({ value: null, source_quote: null, confidence: 1 });
    expect(rows.find((row) => row.field_name === "lineItems[0].qty")?.value).toBe(2);
    expect(rows.map((row) => row.position)).toEqual(rows.map((_, index) => index));
  });

  it("maps the CLI's JSONL record field for field", () => {
    const record: ModelCallRecord = {
      at: "2026-11-01T15:00:00.000Z",
      fileName: "a.pdf",
      model: "gpt-6-luna",
      mode: "function_call",
      attempt: 2,
      outcome: "repaired",
      inputTokens: 4200,
      cachedInputTokens: 2900,
      outputTokens: 700,
      reasoningTokens: 0,
      costUsd: 0.0005,
      latencyMs: 4800,
    };
    expect(modelCallRow(record, null)).toEqual({
      document_id: null,
      file_name: "a.pdf",
      model: "gpt-6-luna",
      mode: "function_call",
      attempt: 2,
      outcome: "repaired",
      input_tokens: 4200,
      cached_input_tokens: 2900,
      output_tokens: 700,
      reasoning_tokens: 0,
      cost_usd: 0.0005,
      latency_ms: 4800,
      error: null,
      created_at: "2026-11-01T15:00:00.000Z",
    });
  });
});

describe("caps and days", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reads the daily cap from env, defaulting to 50", () => {
    vi.stubEnv("PAPERTRAIL_DAILY_EXTRACTION_CAP", "5");
    expect(dailyExtractionCap()).toBe(5);
    vi.stubEnv("PAPERTRAIL_DAILY_EXTRACTION_CAP", "nope");
    expect(dailyExtractionCap()).toBe(50);
  });

  it("starts the day at 00:00 UTC (19:00 the day before in Medellín)", () => {
    expect(startOfUtcDay(new Date("2026-11-01T03:30:00-05:00")).toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
});
