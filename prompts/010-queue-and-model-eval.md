# 010 — Review queue, ground truth for 10 docs, luna vs sol

**Status:** done
**Branch:** `feat/queue-and-eval`
**Week:** 2, subtasks 7–9 (1–7 Nov). This also pulls the normaliser and scorer forward from week 3.

## Goal

1. **`/review`, the review queue.** The nav already links to it and it 404s today. It lists the documents that need a person, most urgent first.
2. **Ground truth for the 10 synthetic invoices (11 files).** It lives in `evals/golden/`, written from the sources, never from model output. A tested normaliser (`lib/normalize`) and scorer (`evals/score.ts`) go with it.
3. **`npm run eval`.** It runs the golden files through one or more models, scores every field, and writes `evals/runs/<date>-eval.json`. The first real run compares **`gpt-6-luna` vs `gpt-6.1-sol`** on accuracy, silent errors, cost and latency. That decides whether luna stays primary.

## Docs read (1 Nov 2026)

- **OpenAI *Models*:**
  - `gpt-6-luna` and `gpt-6.1-sol` are both listed with function tools and image input.
  - Reasoning effort: luna allows `none`–`max`, sol allows `low`–`max`, so `reasoningEffort: "low"` (our setting) is valid on both.
  - The PDF guide covers every vision-capable model.
- **Pricing (`lib/cost/pricing.ts`, read 1 Nov):**
  - sol is $2.00 / $0.10 / $10.00 per 1M tokens, 20× luna on input and output.
  - Estimate per document on sol: about 1.2k uncached + 2.5k cached input and about 750 output, so **≈ $0.010**. Brightwater (2 pages, 26 lines) is about $0.035.
  - **One rep of 11 files ≈ $0.14 on sol** and ≈ $0.006 on luna.
- **CLAUDE.md → Evaluation** sets the metrics and rules:
  - Metrics: field accuracy (headline), per-field breakdown, hallucinated-field rate, validation failures before and after repair, cost per document, p50/p95.
  - Normalisation: dates → ISO, amounts → integer cents, strings case-folded and whitespace-collapsed. "A mismatch caused by formatting is a scorer bug, not a model error."
- **`next/dist/docs` dynamic routes:** `/review` has no params, so its list streams inside Suspense like `/documents`.

## Code inspected

- `components/ui/nav.tsx`: links `/review` ("Review queue") and `/exports`, and both 404, which also shows up as prefetch errors in the console. This prompt fixes `/review`; `/exports` is subtask 10+.
- `lib/db/documents.ts` `listDocuments(viewer, threshold)`: already returns `status`, `toReview`, vendor, total and visibility. The queue is a filter and sort over it, with no new query.
- `scripts/compare-modes.ts` and `scripts/lib/run-stats.ts`: the interleaving, cost guard, `--flag` handling, `freshPath` and percentile code are reused.
- `samples/src/*.html` and the hand-built Harbor Pine PDF: every expected value is copied from these.

## Decisions and assumptions

**Review queue (subtask 7):**
- `/review` shows the viewer's documents plus the public samples:
  - `needs_human` first, because there's nothing usable without a person;
  - then `extracted` with `toReview > 0`, most fields to review first;
  - ties go **oldest first**, so the queue is fair.
- Anything with nothing to review is left off and counted ("12 documents need nothing").
- An empty queue says so, with a link to `/documents`.
- It reuses `DocumentCard` and `listDocuments` with **no new query**. The ordering is a pure tested function, `queueOrder()`.

**Ground truth (subtask 8):**
- One file per sample, `evals/golden/<sample>.json`, with:
  - `file`;
  - `dateOrder` (`"dmy" | "mdy" | "ymd"`), the document's own date convention, needed because `10/09/2026` can't be read without it;
  - expected values in the Invoice shape.
- A field may be a single value or `{ "accept": [...] }`, for where the rules allow more than one answer.
- **Golden-set rules (owner decision, 1 Nov: the recommended set):**
  1. **Description with a sub-line** (Cobalt): accept the main line **or** the main line plus the sub-line.
     - Measured: the default mode includes the sub-line in 5 of 5 runs.
     - Scoring only the main line would count a defensible formatting choice as 4 errors per run, which CLAUDE.md calls a scorer bug.
  2. **Vendor, legal or trading name:** accept either. Cobalt Ridge Print Co. or Co. S.L.; Orchard Labs Consulting LLC with or without LLC.
  3. **Ambiguous characters** (Quarry & Ash): expect the **intended** values `QA-2061` and 612.14.
     - The model reads the printed `QA-2O61`, so that counts as **wrong but flagged**.
     - That is exactly the case the product exists for, and the scorer reports it apart from silent errors.
  4. **Receipt number as invoice number** (Kestrel): accept `000482` and `#000482`.
- **Values come from the sources, never from a model run.** Checks:
  - Every file's line totals sum to the subtotal, and subtotal + tax = total, in integer cents. A test enforces this.
  - Every amount must appear in the source text.

**Normaliser (`lib/normalize`, Vitest):**
- Dates → ISO, using the document's `dateOrder` for numeric dates. It handles `2026-10-24`, `14/10/2026`, `10/30/2026`, `28 Oct 2026`, `Oct 22, 2026`, `October 27, 2026` and `21-OCT-2026`. Anything it can't parse is `null`, so the field scores as wrong, not as a crash.
- Amounts → integer cents (`Math.round(x * 100)`).
- Text → NFKC, case-folded, whitespace collapsed and trimmed. Nothing else, such as no punctuation stripping, so `#000482` stays distinct unless a rule accepts it.

**Scorer (`evals/score.ts`, Vitest):**
- Each `(document, field)` is one of:
  - `correct`;
  - `wrong` (both non-null and different);
  - `missed` (expected a value, got null);
  - `hallucinated` (expected null, got a value).
- Line items are compared by index. Extra predicted lines count as hallucinated fields, missing lines as missed.
- Every scored field also records **flagged** (confidence below 0.85):
  - **Silent error:** wrong, missed or hallucinated, and *not* flagged. This is the number that matters most for this product.
  - **Caught:** wrong and flagged.
- A run that ends `needs_human` or `failed` scores every field as `missed`, and its status is reported. A partial invoice is never scored.

**`npm run eval` (subtask 9):**
- `npm run eval -- --models gpt-6-luna,gpt-6.1-sol --reps 3 --limit 0.70`. The default is the primary model, 1 rep, $0.10.
- Samples are interleaved by model, as in `compare:modes`, with the same cost guard that stops above `--limit`.
- It uses the default extraction mode (function call), which is what production uses.
- Calls are appended to the JSONL log as usual.
- Report per model:
  - headline field accuracy;
  - per-field-key accuracy (vendor, invoiceNumber, issueDate, …, lineItems.qty);
  - hallucinated rate, silent errors and caught errors;
  - first-try validity and repaired / needs_human;
  - $/doc, p50/p95 latency, tokens.
  - Per document: accuracy and the wrong fields.
- `--reps` defaults to 1. With 3 reps, accuracy is the mean and the spread is shown.
- Results go into this file. The README table is subtask 10.
- **Decision rule, fixed before the run:**
  1. Fewer silent errors.
  2. Then higher accuracy.
  3. Then lower $/doc.
  - luna stays primary **unless** sol wins on rule 1 or 2 by more than one field per run on average, **and** sol's cost still fits $2–4/month at the demo cap (50/day).
  - Otherwise sol's numbers decide whether it's worth keeping as the **escalation** model (week 3).
- Not run by `npm test`. It isn't in CI either; the CI gate is week 3.

## What this teaches

**Model choice by measurement, and the first labelled set** (gap list #6 and #8):
- A number like "93% accurate" is only meaningful next to its normaliser. Without one, `2026-10-14` vs `14/10/2026` is "wrong" and the stronger model looks better just for formatting differently.
- The scorer also separates **caught** errors (flagged for a human) from **silent** ones. For a pipeline whose promise is "flag instead of guess", that is a more honest headline than accuracy alone.
- Rejected: an LLM-as-judge. It costs money on every run, it's non-deterministic, and it hides exactly the formatting bugs we want to see.

## Files to touch

- `app/review/page.tsx`: create.
- `lib/review/queue.ts` and `.test.ts`: create.
- `lib/normalize/index.ts` and `.test.ts`: create.
- `evals/golden/*.json`: create, 11 files.
- `evals/score.ts`, `evals/score.test.ts` and `evals/golden.test.ts` (checks the golden files' arithmetic and shape): create.
- `scripts/eval.ts`: create. `package.json`: add the `eval` script.
- `samples/README.md`: edit, recording the 4 rules as decided.
- `CLAUDE.md` and this file's Results section: edit.

## Security and data safety

- Synthetic samples only. Golden files contain only values from the synthetic sources.
- The eval runs locally with `.env.local`. No new secrets, and no CI secret yet.

## Cost impact

- **Agreed: 3 reps, `--limit 0.70`.** The eval run, 3 reps of 11 files on both models: about **$0.45** (sol about $0.42, luna about $0.02), stopped by `--limit 0.70`.
- **With 1 rep:** about $0.16.
- Project spend so far is $0.068, so even 3 reps keep the month well under $1.
- `npm test`: $0.

## Acceptance criteria

- [x] `/review` lists `needs_human` first, then most-to-review, oldest first on ties. It shows a count of documents with nothing to review and an empty state, and has no horizontal scroll at 375 px. The nav link no longer 404s.
- [x] 11 golden files. A test confirms every file's arithmetic reconciles in integer cents and every field name exists in the Invoice schema.
- [x] Normaliser and scorer unit-tested, including:
  - every date format in the samples;
  - `dateOrder`;
  - cents rounding (0.1 + 0.2);
  - `accept` lists;
  - extra and missing line items;
  - `needs_human` scoring as all missed;
  - the silent-vs-caught split.
- [x] `npm run eval` writes `evals/runs/<date>-eval.json` and prints the per-model table. The luna vs sol run is done within the agreed spend, and the Results section records the table, the decision and its reason.
- [x] tsc, lint, test and build pass. The CLAUDE.md log line is written.

## Checks

- `npx tsc --noEmit`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run eval -- --models gpt-6-luna,gpt-6.1-sol --reps <agreed> --limit <agreed>` (once)
- Playwright on `/review` at 1280 px and 375 px

## Manual test steps

1. `npm run dev`, sign in, and open **Review queue** in the nav. Your documents that need review are listed, the ones with the most fields to review first.
2. Correct the flagged fields on one of them and come back. It drops off the queue, and the "need nothing" count goes up.
3. `npm test`: the normaliser, scorer and golden-file tests pass.
4. `npm run eval -- --limit 0.02` runs luna once over the 11 files, for about $0.006, and prints the table.

## Results

**Queue (subtask 7).**
- `/review` lists the public Quarry & Ash sample ("2 to review") for a signed-out visitor, and the nav shows Review queue as current.
- Checked in Playwright: no horizontal scroll at 375 px.
- The `/review` prefetch 404 is gone. `/exports` still 404s until the export lands.
- The card grid moved to `components/documents/document-grid.tsx`, shared by both pages.

**Ground truth (subtask 8).**
- 11 golden files (Cobalt as both PDF and PNG). `evals/golden.test.ts` passes:
  - every amount and every main description is found in its source text, in en or es number format;
  - every file reconciles in integer cents;
  - the field names match the Invoice schema.
- The four rules are recorded in `samples/README.md`.
- **The scorer found its own bug before any paid run.** Line-item amounts were compared as text, because `lineItems.lineTotal` didn't match the bare `lineTotal` key. A unit test caught it; the scorer now normalises by the leaf key.

**luna vs sol (subtask 9).** `npm run eval -- --models gpt-6-luna,gpt-6.1-sol --reps 3 --limit 0.70`: 66 extractions (11 files × 2 models × 3 reps), **$0.31895**. Data: `evals/runs/2026-11-01-eval.json`. A luna-only smoke run before it ($0.00659, `2026-11-01-eval-luna-smoke.json`) checked the scorer on real output first.

| Model | Field accuracy (reps) | Silent errors / doc | Caught errors / doc | Hallucinated | First-try valid | needs_human | $/doc | p50 | p95 |
|---|---|---|---|---|---|---|---|---|---|
| `gpt-6-luna` | **99.7%** (99.7, 99.7, 99.7) | **0** | 0.09 | 0% | 100% | 0 | **$0.00042** | 5.2 s | 18.8 s |
| `gpt-6.1-sol` | 98.6% (98.8, 98.5, 98.5) | 0.12 | 0.30 | 0% | 100% | 0 | $0.00924 | 5.2 s | 16.4 s |

**Decision: `gpt-6-luna` stays primary.** On the rule fixed before the run, luna wins every step:
1. Fewer silent errors: 0 vs 4 in 33 runs.
2. Higher accuracy: 99.7% vs 98.6%.
3. Lower cost: 22× cheaper.

Budget check at the demo cap of 50 extractions a day: luna ≈ $0.63/month, sol ≈ **$13.86/month**. Sol as primary would break the $2–4 budget even if it were more accurate.

**Where each model went wrong:**
- **luna** (3 errors in 1,077 scored fields): only `QA-2O61` on Quarry & Ash, read as printed, scored wrong against the intended `QA-2061` (rule 3), and **flagged in all 3 runs** (0.75–0.8).
- **sol** (15 errors), in two patterns:
  - **`currency: null` where only `$` is printed** (Kestrel ×3, Brightwater ×3, Quarry ×2).
    - Luna answers `USD` there at 0.98–1.0, inferred from the `$` and a US address.
    - Sol declines, sometimes flagged (0.7–0.8) and sometimes **at confidence 1.0, which makes those 4 the silent errors**.
    - Our system prompt says "never infer", so sol is arguably the stricter reader. The golden set expects `USD` because `samples/README.md` listed it as the printed currency.
    - **This is a new golden-set rule question** (see below), not a clear sol mistake.
  - **Quarry & Ash total `null`** at 0.2–0.3 ×3, where luna reads 612.14 at 0.76. Missed but caught: sol refuses to resolve `$6l2.14` at all.
  - Plus the same `QA-2O61` as luna ×3, flagged.
- **What doesn't change the decision:** even if a `$`-only currency accepted `null`, sol would score about 99.4%, still below luna, and it costs 22× more.

**Sol as the escalation model.** Luna never failed validation in 66 runs here, so this run says nothing about whether sol rescues luna's failures, which is the escalation question. Sol stays configured as the escalation model on price tier, to be measured in week 3 on harder documents.

**What this set can't show.** Luna is at 99.7%: these 10 synthetic invoices are close to its ceiling. The week 3 golden set (30 documents) needs genuinely harder cases to separate models: handwritten totals, multi-currency, line items split across pages mid-row, low-resolution scans.

**Tests:** 196 pass, up from 132:
- 16 normaliser tests;
- 8 scorer tests;
- 41 golden-file checks;
- 4 report tests;
- 3 queue tests.

tsc, lint and the build pass.

**Spend:** this prompt $0.32554 (eval $0.31895 + smoke $0.00659). Project total **$0.39323**.
