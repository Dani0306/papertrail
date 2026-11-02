// The CI regression gate (CLAUDE.md → Evaluation): fail when headline accuracy
// drops more than 2 points below the committed baseline. Pure; the script reads
// the files and sets the exit code.

export const MAX_DROP = 0.02;

export type Baseline = { model: string; run: string; goldenFiles: number; accuracy: number; silentErrorsPerDoc: number };

export type GateInput = {
  accuracy: number;
  silentErrorsPerDoc: number;
  /** Distinct golden files scored in this run. */
  files: number;
  /** Golden files that exist; a run that scored fewer stopped early. */
  expectedFiles: number;
  stoppedAtLimit: boolean;
};

export type GateResult = { pass: boolean; failures: string[]; warnings: string[]; drop: number };

export function gate(run: GateInput, baseline: Baseline): GateResult {
  const failures: string[] = [];
  const warnings: string[] = [];
  const drop = Math.round((baseline.accuracy - run.accuracy) * 1e4) / 1e4;

  if (run.stoppedAtLimit || run.files < run.expectedFiles) {
    failures.push(`The run scored ${run.files} of ${run.expectedFiles} golden files (stopped at the cost limit): a partial run can't pass.`);
  }
  // Compared in hundredths of a point so 0.02 isn't lost to float noise.
  if (Math.round(drop * 1e4) > Math.round(MAX_DROP * 1e4)) {
    failures.push(`Accuracy ${percent(run.accuracy)} is ${points(drop)} below the baseline ${percent(baseline.accuracy)} (allowed: ${points(MAX_DROP)}).`);
  }
  if (run.expectedFiles !== baseline.goldenFiles) {
    warnings.push(`The golden set has ${run.expectedFiles} files; the baseline was set on ${baseline.goldenFiles}. Compare with care, and set a new baseline on purpose.`);
  }
  if (run.silentErrorsPerDoc > baseline.silentErrorsPerDoc) {
    warnings.push(`Silent errors per document rose from ${baseline.silentErrorsPerDoc} to ${run.silentErrorsPerDoc}.`);
  }
  return { pass: failures.length === 0, failures, warnings, drop };
}

/** 0.9979 → "99.79%". */
function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

/** 0.021 → "2.10 points". */
function points(value: number): string {
  return `${(value * 100).toFixed(2)} points`;
}
