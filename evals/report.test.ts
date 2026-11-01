import { describe, expect, it } from "vitest";
import type { EvalRun } from "./report";
import { summarizeModel } from "./report";
import type { FieldScore } from "./score";

const field = (name: string, verdict: FieldScore["verdict"], flagged = false): FieldScore => ({
  name,
  key: name.replace(/^lineItems\[\d+\]\./, "lineItems."),
  verdict,
  expected: [],
  got: null,
  confidence: 0.9,
  flagged,
});

function run(rep: number, file: string, fields: FieldScore[], overrides: Partial<EvalRun> = {}): EvalRun {
  const errors = fields.filter((f) => f.verdict !== "correct");
  return {
    model: "gpt-6-luna",
    rep,
    file,
    attempts: 1,
    firstTryValid: true,
    costUsd: 0.0005,
    latencyMs: 5000,
    inputTokens: 3000,
    cachedInputTokens: 2000,
    outputTokens: 700,
    reasoningTokens: 0,
    score: {
      file,
      status: "extracted",
      fields,
      correct: fields.length - errors.length,
      total: fields.length,
      silentErrors: errors.filter((f) => !f.flagged).length,
      caughtErrors: errors.filter((f) => f.flagged).length,
      hallucinated: fields.filter((f) => f.verdict === "hallucinated").length,
    },
    ...overrides,
  };
}

describe("summarizeModel", () => {
  const runs = [
    run(1, "a.pdf", [field("vendor", "correct"), field("total", "wrong", true), field("lineItems[0].qty", "correct"), field("dueDate", "hallucinated")]),
    run(1, "b.pdf", [field("vendor", "correct"), field("total", "correct"), field("lineItems[0].qty", "missed")], { costUsd: 0.0015, latencyMs: 9000 }),
    run(2, "a.pdf", [field("vendor", "correct"), field("total", "correct"), field("lineItems[0].qty", "correct"), field("dueDate", "correct")]),
  ];
  const summary = summarizeModel(runs);

  it("pools fields across reps for the headline and keeps each rep's accuracy for the spread", () => {
    expect(summary.accuracy).toBe(round4(8 / 11));
    expect(summary.accuracyByRep).toEqual([round4(4 / 7), 1]);
  });

  it("reports silent and caught errors per document, and the hallucination rate", () => {
    expect(summary.silentErrorsPerDoc).toBe(0.67); // 2 silent over 3 runs
    expect(summary.caughtErrorsPerDoc).toBe(0.33);
    expect(summary.hallucinatedRate).toBe(round4(1 / 11));
  });

  it("breaks accuracy down by field key, worst first, and per document with its errors", () => {
    expect(summary.byKey[0]).toMatchObject({ key: "dueDate", accuracy: 0.5, silent: 1 });
    expect(summary.byKey.find((group) => group.key === "lineItems.qty")).toMatchObject({ correct: 2, total: 3 });
    expect(summary.byDocument[0]).toMatchObject({ file: "b.pdf", errors: ["lineItems[0].qty missed ×1"] });
    expect(summary.byDocument[1].errors).toEqual(["total wrong (flagged) ×1", "dueDate hallucinated ×1"]);
  });

  it("averages cost and takes nearest-rank latency", () => {
    expect(summary.meanCostUsd).toBe(0.000833);
    expect(summary.p50LatencyMs).toBe(5000);
    expect(summary.p95LatencyMs).toBe(9000);
  });
});

function round4(value: number) {
  return Math.round(value * 1e4) / 1e4;
}
