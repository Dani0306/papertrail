import { describe, expect, it } from "vitest";
import type { EvalRun } from "./report";
import type { FieldScore } from "./score";
import { chooseThreshold, sweep } from "./threshold";

const field = (verdict: FieldScore["verdict"], confidence: number | null, got: FieldScore["got"] = "x"): FieldScore => ({
  name: "f",
  key: "f",
  verdict,
  expected: [],
  got,
  confidence,
  flagged: false,
});

const run = (fields: FieldScore[]) => ({ score: { fields } }) as unknown as EvalRun;

describe("sweep", () => {
  // Two documents: one wrong field at 0.80 (caught from 0.85 up), one wrong at 0.92 (caught only at 0.95),
  // one right field at 0.88 (a needless review from 0.90 up), and a field never returned.
  const runs = [
    run([field("wrong", 0.8), field("correct", 0.99), field("correct", 0.88)]),
    run([field("wrong", 0.92), field("missed", null, null), field("correct", 1, null)]),
  ];
  const curve = sweep(runs, [0.75, 0.85, 0.9, 0.95]);

  it("moves errors from silent to caught as the threshold rises", () => {
    expect(curve.map((point) => point.silentErrorsPerDoc)).toEqual([1.5, 1, 1, 0.5]);
    expect(curve.map((point) => point.caughtErrorsPerDoc)).toEqual([0, 0.5, 0.5, 1]);
  });

  it("counts every flagged field as review load, and the right ones as needless", () => {
    expect(curve.map((point) => point.reviewLoadPerDoc)).toEqual([0, 0.5, 1, 1.5]);
    expect(curve.map((point) => point.needlessReviewsPerDoc)).toEqual([0, 0, 0.5, 0.5]);
  });

  it("never flags a field the model didn't return", () => {
    expect(sweep([run([field("missed", null, null)])], [0.99])[0]).toMatchObject({ silentErrorsPerDoc: 1, reviewLoadPerDoc: 0 });
  });
});

describe("chooseThreshold", () => {
  const point = (threshold: number, silent: number, load: number) => ({
    threshold,
    silentErrorsPerDoc: silent,
    caughtErrorsPerDoc: 0,
    reviewLoadPerDoc: load,
    needlessReviewsPerDoc: 0,
  });

  it("takes the fewest silent errors first", () => {
    expect(chooseThreshold([point(0.85, 0.2, 0.5), point(0.9, 0.1, 1.2)], 0.85).threshold).toBe(0.9);
  });

  it("then the lowest review load", () => {
    expect(chooseThreshold([point(0.75, 0, 0.3), point(0.85, 0, 0.6), point(0.9, 0, 1)], 0.85).threshold).toBe(0.75);
  });

  it("keeps the current value on a full tie", () => {
    expect(chooseThreshold([point(0.75, 0, 0.6), point(0.85, 0, 0.6)], 0.85).threshold).toBe(0.85);
    expect(chooseThreshold([point(0.75, 0, 0.6), point(0.8, 0, 0.6)], 0.85).threshold).toBe(0.75);
  });
});
