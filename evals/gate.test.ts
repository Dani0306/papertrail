import { describe, expect, it } from "vitest";
import { type Baseline, type GateInput, gate } from "./gate";

const baseline: Baseline = { model: "gpt-6-luna", run: "evals/runs/2026-11-02-eval.json", goldenFiles: 30, accuracy: 0.9979, silentErrorsPerDoc: 0.03 };
const run = (overrides: Partial<GateInput> = {}): GateInput => ({
  accuracy: 0.9979,
  silentErrorsPerDoc: 0.03,
  files: 30,
  expectedFiles: 30,
  stoppedAtLimit: false,
  ...overrides,
});

describe("gate", () => {
  it("passes at the baseline and above it", () => {
    expect(gate(run(), baseline)).toMatchObject({ pass: true, failures: [], warnings: [] });
    expect(gate(run({ accuracy: 1 }), baseline).pass).toBe(true);
  });

  it("passes a drop of up to 2 points, including exactly 2", () => {
    expect(gate(run({ accuracy: 0.9789 }), baseline).pass).toBe(true); // 1.9 points
    expect(gate(run({ accuracy: 0.9779 }), baseline).pass).toBe(true); // exactly 2
  });

  it("fails a drop of more than 2 points, and says by how much", () => {
    const result = gate(run({ accuracy: 0.9769 }), baseline); // 2.1 points
    expect(result.pass).toBe(false);
    expect(result.failures[0]).toBe("Accuracy 97.69% is 2.10 points below the baseline 99.79% (allowed: 2.00 points).");
  });

  it("fails a run that stopped early, whatever its accuracy", () => {
    expect(gate(run({ files: 22, stoppedAtLimit: true }), baseline)).toMatchObject({ pass: false });
    expect(gate(run({ files: 29 }), baseline).failures[0]).toContain("29 of 30");
  });

  it("warns without failing when the golden set changed size or silent errors rose", () => {
    const result = gate(run({ files: 32, expectedFiles: 32, silentErrorsPerDoc: 0.06 }), baseline);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(2);
  });
});
