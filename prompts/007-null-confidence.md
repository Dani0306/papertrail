# 007 — Confidence on absent fields

**Status:** approved
**Branch:** `fix/null-confidence`
**Week:** 1 follow-up (found in prompt 006)

## Goal

A field that isn't on the document comes back as `null` with confidence meaning "how sure I am it's absent", so correctly empty fields stop showing up in the review queue. The fix is measured, not assumed.

## The problem (from prompt 006)

- In 32 of 33 function-call runs, absent fields came back as `null @ 1.0`.
- In one run (Kestrel receipt, rep 1), all four absent fields came back as `null @ 0`: the due date and three unit prices, none of which are printed.
- `confidenceLevel()` sends anything below 0.85 to `review`, so that run would have put four correctly empty fields in amber.
- **Cause:** the instructions never say what confidence means when the value is `null`.
  - The schema says "How sure you are that value is right".
  - One reading of `null @ 0` is "I'm 0% sure of a value", which is a reasonable reading of those words.

## Code inspected

- `lib/extract/prompt.ts`: the confidence rule talks only about readable values.
- `lib/schema/invoice.ts`: the `confidence` description ("How sure you are that value is right"). It goes into the strict JSON schema the model sees, in both modes.
- `lib/design/confidence.ts`: `review` below the threshold whatever the value; `missing` for a confident `null`. That's the right UI rule, and it stays.
- `scripts/compare-modes.ts`: always runs both modes, and always writes `evals/runs/<date>-modes.json`. That would overwrite the committed 1 Nov data on a same-day rerun.
- **Git:** PR #8 was merged before its last 3 commits were pushed. Those commits are the switch to the function-call default, the run data and the prompt 006 results. They aren't on `main`. This branch starts from `main` and cherry-picks them.

## Decisions and assumptions

- **Fix the definition in the schema and the prompt, not in code.** Both say the same thing:
  - For a `null` value, confidence is how sure the model is that the field is absent.
  - 1 means it looked and the field isn't printed.
  - Below 0.85 means it might be there but couldn't be read.
- **Rejected: rewriting `null @ low` to `null @ 1` in code.** That would throw away a real signal ("there may be a due date I couldn't read") and invent a number the model never gave.
- **Rejected: a Zod rule that rejects `null` with low confidence.** It would spend a repair call on a legitimate answer.
- **`confidenceLevel()` doesn't change.** A low-confidence `null` *should* be reviewed. The bug is the model's inconsistency, not the UI rule.
- **Measure on the default mode only** (function_call): `compare:modes` gets `--mode <m>`. A single-mode run writes `evals/runs/<date>-<mode>.json`. No run overwrites an existing file: a `-2`, `-3`… suffix is added.
- **New run metrics, computed by the script instead of ad hoc** (tested in Vitest):
  - Per mode: null fields total, and how many fall below the threshold. These are the bug's numbers.
  - Per mode: fields that differ across the reps of the same sample.
  - The stats move to `scripts/lib/run-stats.ts`, so they're testable.
- **Reps: 5** (55 calls). The bug showed up once in 33 runs, so even a clean run of 55 can't prove it's gone. The write-up will say exactly that.

## What this teaches

**A confidence number is only as good as its definition.** The model can't be calibrated against a question it was never asked. "Confidence of what?" has two answers for an absent field, and the model gave both, 1.0 and 0. The fix goes in the schema description, not only the prompt, because with strict schemas the description travels with the field in both modes, while the system prompt is one long text the model may weigh less. The alternative rejected was fixing it after the fact in code, which hides the model's real uncertainty.

## Files to touch

- `lib/schema/invoice.ts` (edit): the `confidence` description covers `null`.
- `lib/extract/prompt.ts` (edit): one rule line for confidence on `null`.
- `lib/schema/invoice.test.ts` (edit): the description reaches the strict JSON schema.
- `scripts/lib/run-stats.ts` (create) and `scripts/lib/run-stats.test.ts` (create): summary, percentile, null-confidence and stability stats.
- `scripts/compare-modes.ts` (edit): `--mode`, no-overwrite output, the new stats in the table and the JSON.
- `prompts/007-null-confidence.md`, `CLAUDE.md` (edit): results and the log line.
- Cherry-picked from `feat/extract-modes`: the function-call default, the run data and the prompt 006 results.

## Requirements

1. The schema's `confidence` description and the system prompt both define confidence for a `null` value as certainty that the field is absent.
2. `npm run compare:modes -- --mode function_call --reps 5 --limit 0.05` runs only that mode and writes a new file, never overwriting one.
3. The summary table and JSON report, per mode: nulls, nulls below the threshold, and fields unstable across reps.
4. No change to `confidenceLevel()`, the failure ladder or the extraction call itself.

## Security and data safety

- No new keys or routes. Only the 10 synthetic samples are used. The run file holds extracted values and quotes from synthetic documents only.

## Cost impact

- 55 function-call extractions at about $0.0005 each comes to **about $0.027**, capped by `--limit 0.05`.
- Spend so far is $0.04136 since the start of the project, well inside $2–4/month.

## Acceptance criteria

- [ ] Prompt 006's 3 missing commits are on this branch.
- [ ] The schema description and the system prompt define confidence on `null`, and a test checks the description reaches the strict JSON schema.
- [ ] `run-stats` is unit-tested: null-confidence count, stability across reps, percentile.
- [ ] `compare:modes --mode function_call` runs only that mode, and doesn't overwrite `2026-11-01-modes.json`.
- [ ] The measured run, against prompt 006's function-call numbers:
  - **Fixed:** 0 absent fields below 0.85 (was 4 of 15 nulls in 1 of 33 runs).
  - **No regression:** 100% first-try valid. Quarry & Ash `invoiceNumber` and `total` still below 0.85 in every run. All other trap values still correct.
  - Cost per document within ±15% of $0.00048.
- [ ] tsc, lint, test and build pass. Results and the CLAUDE.md log line are written.

## Checks

- `npx tsc --noEmit`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run compare:modes -- --mode function_call --reps 5 --limit 0.05` (once)

## Manual test steps

1. `npm test`: everything passes, with no model calls.
2. `npm run compare:modes -- --mode function_call --reps 5 --limit 0.05`. Watch the running cost, then read the "nulls below threshold" column.
3. `npm run extract -- samples/synthetic-kestrel-receipt-scan.png` should report 0 fields to review. Run it a few times if you like, at about $0.0003 each.

## Results

To be filled in after the work.
