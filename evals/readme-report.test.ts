import { describe, expect, it } from "vitest";
import {
  type EvalRunFile,
  type ModelSummary,
  END,
  MissingMarkersError,
  MissingRunError,
  blockRunPaths,
  readRunPath,
  renderReport,
  replaceAllBlocks,
  replaceBlock,
} from "./readme-report";
import type { FieldScore } from "./score";

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
  runs: [entry("a.pdf", []), entry("b.pdf", []), entry("a.pdf", [])],
};

function entry(file: string, fields: FieldScore[], model = "gpt-6-luna"): EvalRunFile["runs"][number] {
  return {
    file,
    model,
    score: { file, status: "extracted", fields, correct: 0, total: fields.length, silentErrors: 0, caughtErrors: 0, hallucinated: 0 },
  };
}

const scored = (verdict: FieldScore["verdict"], confidence: number): FieldScore => ({
  name: "invoiceNumber",
  key: "invoiceNumber",
  verdict,
  expected: [],
  got: "x",
  confidence,
  flagged: false,
});

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

describe("threshold table", () => {
  const single: EvalRunFile = {
    ...run,
    models: ["gpt-6-luna"],
    byModel: { "gpt-6-luna": run.byModel["gpt-6-luna"] },
    // One error caught from 0.80 up, one confidently wrong at 0.99, one right field at 0.83.
    runs: [entry("a.pdf", [scored("wrong", 0.78), scored("correct", 0.83)]), entry("b.pdf", [scored("wrong", 0.99)])],
  };

  it("is added for a single-model run, re-scored from the stored confidences, with the chosen row marked", () => {
    const block = renderReport(single, PATH, 0.85);
    expect(block).toContain("**Confidence threshold sweep**");
    expect(block).toContain("| 0.70 | 1 | 0 | 0 | 0 |");
    expect(block).toContain("| **0.80** (chosen) | 0.5 | 0.5 | 0.5 | 0 |");
    expect(block).toContain("| 0.85 | 0.5 | 0.5 | 1 | 0.5 |");
  });

  it("is left out of a comparison between models", () => {
    expect(renderReport(run, PATH)).not.toContain("threshold sweep");
  });
});

describe("several blocks", () => {
  const OTHER = "evals/runs/2026-11-02-eval.json";
  const readme = `Top\n<!-- eval:report:start run=${PATH} -->\nold A\n${END}\nMiddle\n<!-- eval:report:start run=${OTHER} -->\nold B\n${END}\nBottom\n`;

  it("lists each block's run in order", () => {
    expect(blockRunPaths(readme)).toEqual([PATH, OTHER]);
  });

  it("re-renders every block from its own run and keeps the text between them", () => {
    const next = replaceAllBlocks(readme, (path) => `<!-- eval:report:start run=${path} -->\nnew ${path}\n${END}`);
    expect(next).toBe(
      `Top\n<!-- eval:report:start run=${PATH} -->\nnew ${PATH}\n${END}\nMiddle\n<!-- eval:report:start run=${OTHER} -->\nnew ${OTHER}\n${END}\nBottom\n`,
    );
  });

  it("fills a block that names no run from the fallback, and refuses without one", () => {
    const empty = `<!-- eval:report:start -->\n${END}`;
    expect(replaceAllBlocks(empty, (path) => `<!-- eval:report:start run=${path} -->\n${END}`, OTHER)).toContain(OTHER);
    expect(() => replaceAllBlocks(empty, () => "")).toThrow(MissingRunError);
    expect(() => replaceAllBlocks("no markers", () => "")).toThrow(MissingMarkersError);
  });
});
