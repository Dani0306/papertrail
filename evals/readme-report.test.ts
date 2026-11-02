import { describe, expect, it } from "vitest";
import { type EvalRunFile, type ModelSummary, END, MissingMarkersError, readRunPath, renderReport, replaceBlock } from "./readme-report";

function summary(overrides: Partial<ModelSummary>): ModelSummary {
  return {
    documents: 33,
    fields: 1077,
    accuracy: 0.9972,
    accuracyByRep: [0.9972, 0.9972, 0.9972],
    silentErrorsPerDoc: 0,
    caughtErrorsPerDoc: 0.09,
    hallucinatedRate: 0,
    firstTryValidRate: 1,
    repaired: 0,
    needsHuman: 0,
    failed: 0,
    meanCostUsd: 0.000421,
    totalCostUsd: 0.0139,
    p50LatencyMs: 5200,
    p95LatencyMs: 18800,
    meanInputTokens: 3700,
    meanCachedInputTokens: 3000,
    meanOutputTokens: 750,
    meanReasoningTokens: 0,
    byKey: [
      { key: "invoiceNumber", accuracy: 0.9091, correct: 30, total: 33, silent: 0 },
      { key: "currency", accuracy: 1, correct: 33, total: 33, silent: 0 },
    ],
    byDocument: [],
    ...overrides,
  };
}

const run: EvalRunFile = {
  date: "2026-11-01",
  models: ["gpt-6-luna", "gpt-6.1-sol"],
  reps: 3,
  threshold: 0.85,
  totalCostUsd: 0.318946,
  byModel: {
    "gpt-6-luna": summary({}),
    "gpt-6.1-sol": summary({
      accuracy: 0.9861,
      accuracyByRep: [0.9879, 0.985, 0.985],
      silentErrorsPerDoc: 0.12,
      caughtErrorsPerDoc: 0.3,
      meanCostUsd: 0.009242,
      p95LatencyMs: 16400,
      byKey: [
        { key: "currency", accuracy: 0.7576, correct: 25, total: 33, silent: 4 },
        { key: "invoiceNumber", accuracy: 0.9091, correct: 30, total: 33, silent: 0 },
      ],
    }),
  },
  runs: [{ file: "a.pdf" }, { file: "b.pdf" }, { file: "a.pdf" }],
};

const PATH = "evals/runs/2026-11-01-eval.json";

describe("renderReport", () => {
  const block = renderReport(run, PATH);

  it("names its run in the marker and links it", () => {
    expect(block.startsWith(`<!-- eval:report:start run=${PATH} -->`)).toBe(true);
    expect(block.endsWith(END)).toBe(true);
    expect(block).toContain(`[\`${PATH}\`](${PATH})`);
  });

  it("states the run's facts, counting distinct files, and leaves out a pricing date the file doesn't have", () => {
    expect(block).toContain("**Run 2026-11-01** · 2 files × 2 models × 3 reps · confidence threshold 0.85 · run cost $0.3189");
    expect(block).not.toContain("prices read");
    expect(renderReport({ ...run, pricesReadOn: "2026-11-01" }, PATH)).toContain("· prices read 2026-11-01");
  });

  it("writes one formatted row per model, straight from the summary", () => {
    expect(block).toContain(
      "| `gpt-6-luna` | 99.7% | 99.7 · 99.7 · 99.7 | 0 | 0.09 | 0.0% | 100% | 0 of 33 | $0.00042 | 5.2 s | 18.8 s |",
    );
    expect(block).toContain("| `gpt-6.1-sol` | 98.6% | 98.8 · 98.5 · 98.5 | 0.12 | 0.3 | 0.0% | 100% | 0 of 33 | $0.00924 | 5.2 s | 16.4 s |");
  });

  it("lists each field's accuracy per model, worst first by whichever model did worst", () => {
    const lines = block.split("\n");
    const currency = lines.findIndex((line) => line.startsWith("| `currency`"));
    const invoiceNumber = lines.findIndex((line) => line.startsWith("| `invoiceNumber`"));
    expect(lines[currency]).toBe("| `currency` | 100.0% (33/33) | 75.8% (25/33) |");
    expect(currency).toBeLessThan(invoiceNumber);
  });
});

describe("replaceBlock", () => {
  const readme = `# PaperTrail\n\nIntro text.\n\n<!-- eval:report:start run=old.json -->\nstale numbers\n${END}\n\n## After\n\nKept.\n`;

  it("swaps only the marked block and keeps every byte around it", () => {
    const next = replaceBlock(readme, renderReport(run, PATH));
    expect(next.startsWith("# PaperTrail\n\nIntro text.\n\n<!-- eval:report:start run=evals/runs/")).toBe(true);
    expect(next.endsWith(`${END}\n\n## After\n\nKept.\n`)).toBe(true);
    expect(next).not.toContain("stale numbers");
  });

  it("is idempotent: rendering the same run twice changes nothing", () => {
    const once = replaceBlock(readme, renderReport(run, PATH));
    expect(replaceBlock(once, renderReport(run, PATH))).toBe(once);
  });

  it("reads the run path back from the marker", () => {
    expect(readRunPath(replaceBlock(readme, renderReport(run, PATH)))).toBe(PATH);
    expect(readRunPath("<!-- eval:report:start -->\n" + END)).toBeNull();
  });

  it("refuses a README without both markers", () => {
    expect(() => replaceBlock("# No markers", "x")).toThrow(MissingMarkersError);
    expect(() => replaceBlock("<!-- eval:report:start -->\nno end", "x")).toThrow(MissingMarkersError);
  });
});
