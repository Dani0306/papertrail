import { describe, expect, it } from "vitest";
import type { FlatField } from "@/lib/schema/invoice";
import { normalized, percentile, type Run, summarize, unstableFields } from "./run-stats";

const field = (name: string, value: FlatField["value"], confidence: number): FlatField => ({
  name,
  value,
  confidence,
  sourceQuote: value === null ? null : String(value),
});

function run(overrides: Partial<Run>): Run {
  return {
    sample: "a.pdf",
    mode: "function_call",
    rep: 1,
    status: "extracted",
    attempts: 1,
    firstTryValid: true,
    costUsd: 0.0005,
    latencyMs: 5000,
    inputTokens: 3000,
    cachedInputTokens: 2000,
    outputTokens: 700,
    reasoningTokens: 0,
    fields: [],
    ...overrides,
  };
}

describe("summarize", () => {
  it("counts null fields that would land in the review queue", () => {
    const runs = [
      run({ fields: [field("dueDate", null, 1), field("total", 30.85, 0.99)] }),
      run({ rep: 2, fields: [field("dueDate", null, 0), field("lineItems[0].unitPrice", null, 0.4), field("total", 30.85, 0.5)] }),
    ];
    const summary = summarize(runs, 0.85);
    expect(summary.nullFields).toBe(3);
    expect(summary.nullFieldsBelowThreshold).toBe(2); // the low-confidence total isn't a null
  });

  it("reports outcomes, mean cost and nearest-rank latency", () => {
    const runs = [
      run({ latencyMs: 4000, costUsd: 0.0004 }),
      run({ latencyMs: 6000, costUsd: 0.0006, attempts: 2, firstTryValid: false }),
      run({ latencyMs: 9000, status: "needs_human", fields: null, firstTryValid: false }),
    ];
    expect(summarize(runs, 0.85)).toMatchObject({
      runs: 3,
      firstTryValidRate: 0.333,
      repaired: 1,
      needsHuman: 1,
      meanCostUsd: 0.0005,
      p50LatencyMs: 6000,
      p95LatencyMs: 9000,
    });
  });
});

describe("unstableFields", () => {
  it("lists fields whose value changes across reps of the same sample and mode", () => {
    const runs = [
      run({ fields: [field("invoiceNumber", "000482", 0.97), field("vendor", "Kestrel  Coffee", 0.99)] }),
      run({ rep: 2, fields: [field("invoiceNumber", "#000482", 0.99), field("vendor", "kestrel coffee", 0.99)] }),
      // Another mode's value doesn't count against this one.
      run({ mode: "json_schema", fields: [field("invoiceNumber", null, 0.99), field("vendor", "Kestrel Coffee", 1)] }),
    ];
    expect(unstableFields(runs)).toEqual(["a.pdf · invoiceNumber"]);
  });

  it("ignores runs that never extracted", () => {
    expect(unstableFields([run({ fields: null }), run({ rep: 2, fields: [field("total", 1, 1)] })])).toEqual([]);
  });
});

describe("helpers", () => {
  it("normalises for agreement only: whitespace, case, two-decimal numbers, null", () => {
    expect(normalized("  A2  Posters ")).toBe("a2 posters");
    expect(normalized(612.1)).toBe("612.10");
    expect(normalized(null)).toBe("∅");
  });

  it("returns 0 for an empty percentile", () => {
    expect(percentile([], 0.5)).toBe(0);
  });
});
