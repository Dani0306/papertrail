# 012 — Golden set to 30 documents, baseline, threshold tuning

**Status:** approved
**Branch:** `feat/golden-set-30`. Stacked on `feat/eval-report` (prompt 011, not merged yet), because the baseline regenerates the README table with `eval:report`.
**Week:** 3, items 2–6 (8–14 Nov)

## Goal

1. **Item 2:** decide the `$`-only currency rule (asked with this prompt), and plan 19 harder documents. The 1 Nov run showed the first 10 are near luna's ceiling (99.7%).
2. **Item 3:** render the 19 synthetic documents with the existing pipeline. Synthetic only.
3. **Item 4:** ground truth for the 19, copied from their sources, with the golden tests extended to cover them.
4. **Item 5:** the baseline. Run luna on all 30 documents × 3 reps and commit `evals/baseline.json`, the number the CI gate (item 11) will guard. The README table is regenerated from the new run.
5. **Item 6:** tune the confidence threshold with a sweep over the stored confidences of that run. No new model calls. A rule is fixed before looking, and the README explains the choice.

## Docs read

- **CLAUDE.md:**
  - → Schedule: week 3 has a golden set of 30 documents with hand-written ground truth.
  - → Technical decisions: the threshold "starts at 0.85, tuned against the golden set in week 3, and the tuned value is justified in the README".
  - → Evaluation: `evals/baseline.json` is committed; the CI gate fails at more than 2 points below it.
- **AGENTS.md §9:** update the baseline only on purpose, in its own commit, with the reason. §10: never real data.
- **`scripts/render-samples.sh`:** Chrome headless PDF and screenshot, plus ffmpeg degrade filters. Bradley Hand and Noteworthy are installed (`/System/Library/Fonts`) for the handwritten values.
- **`lib/normalize`:** already reads every date format the new documents use (`02.11.2026`, `3 de noviembre de 2026`, `Nov 4, 2026`, ISO). Spanish, French, Portuguese and German month names all start with the 3-letter keys in the table.
- **Prompt 010's run:** sol's errors were `currency: null` where only `$` is printed. Luna answers USD from the address.

## Code inspected

- `evals/golden.test.ts`:
  - **Arithmetic:** it requires lines = subtotal and subtotal + tax = total. That can't express a summary with shipping or a discount, so it needs an optional `otherCharges`.
  - **Printed amounts:** it checks en and es formats. It also needs French (`1 234,56`, with a space or a narrow no-break space) and amounts without decimals (`¥12,400`).
  - **Sources:** it reads one source per golden file. A PDF whose page 2 is a scanned image needs two.
- `evals/score.ts`: `GoldenFile.source` is a string, so it becomes `string | string[]`. Scoring itself doesn't change.
- `evals/report.ts` and `scripts/eval.ts`: these already produce everything the baseline and the sweep need. Each scored field keeps its `confidence` and `verdict`, so the sweep re-scores offline.
- `lib/design/confidence.ts` `DEFAULT_CONFIDENCE_THRESHOLD = 0.85`, and `.env.example` sets `PAPERTRAIL_CONFIDENCE_THRESHOLD=0.85`. **Your `.env.local` probably sets it too**, which overrides the default.

## Decisions and assumptions

**`$`-only currency (owner decision, 1 Nov):** accept `USD` **or** `null`.
- `null` is what the system prompt asks for ("never infer").
- `USD` from a `$` plus a US address is a defensible reading.
- Neither should count as an error. This applies to Kestrel, Brightwater and Quarry & Ash, and to any new document that prints only `$` with a US address.

**The 19 new documents.** Each targets something the first 10 didn't test:

| # | File | Format | The trap |
|---|---|---|---|
| 1 | `synthetic-alder-forge-three-page.pdf` | PDF, 3 pages | 42 lines, headers repeated on each page, totals only on page 3 |
| 2 | `synthetic-saltmarsh-split-row.pdf` | PDF, 2 pages | One line's description breaks across the page, with qty and amount on page 2 (GBP) |
| 3 | `synthetic-pinecrest-credit-note.pdf` | PDF | A credit note: every amount printed negative; the original invoice number as a distractor |
| 4 | `synthetic-lumbre-two-tax-rates.pdf` | PDF, Spanish | IVA 21% and 10% lines plus a printed "Total IVA"; date `3 de noviembre de 2026`; `1.234,56 €` |
| 5 | `synthetic-gruenwald-rechnung.pdf` | PDF, German | `Rechnungsdatum 02.11.2026`, `Fällig am`, MwSt 19%, `1.234,56 €` |
| 6 | `synthetic-atelier-moreau-facture.pdf` | PDF, French | Space as the thousands separator (`1 234,56 €`), TVA 20%, `Échéance` |
| 7 | `synthetic-casa-ipe-nota.pdf` | PDF, Portuguese | `R$ 1.234,56` (BRL), CNPJ as a distractor |
| 8 | `synthetic-koyo-yen.pdf` | PDF | JPY with no decimals (`¥12,400`), 10% consumption tax, ISO dates |
| 9 | `synthetic-bluefin-handwritten-total.png` | Scan | Quantities and the total handwritten (Bradley Hand) into blank boxes |
| 10 | `synthetic-ridgeline-rotated-scan.png` | Scan | The page rotated 90°, at low resolution (CAD) |
| 11 | `synthetic-harrow-mixed-scan.pdf` | PDF, 2 pages | Page 1 has a text layer; **page 2 (the totals) is only an image** |
| 12 | `synthetic-ostrander-fx-reference.pdf` | PDF | A USD total next to "≈ EUR 1,102.40 (reference only)" |
| 13 | `synthetic-meadowlark-paid-stamp.pdf` | PDF | A big rotated "PAID 03 NOV 2026" stamp over the totals, plus a payment date |
| 14 | `synthetic-tern-services-no-qty.pdf` | PDF | Lines with only a description and an amount; due date printed as "within 14 days" |
| 15 | `synthetic-copperline-decimal-qty.pdf` | PDF | Decimal quantities (2.5 h, 12.75 kg), AUD (`A$`) |
| 16 | `synthetic-hollowell-shipping-discount.pdf` | PDF | A summary with subtotal, discount, shipping, tax and total |
| 17 | `synthetic-vantage-customer-header.pdf` | PDF | The **customer's** name large at the top; the vendor only in small print (GBP) |
| 18 | `synthetic-cerro-azul-mxn-photo.jpg` | Phone photo | `$` meaning MXN, with "MXN" printed once; low light and crumpled |
| 19 | `synthetic-fjord-columns-swapped.pdf` | PDF | Columns in an unusual order (Amount, Qty, Description, Unit price), NOK `kr`, `dd.mm.yyyy` |

That gives 30 files covering 11 currencies and 5 languages, with 1–3 pages, text layers, image-only pages, scans and photos.

**New ground-truth rules.** The documents are designed so that each has one right answer:
- **5. Credit note:** amounts are negative, exactly as printed.
- **6. A line without a printed quantity or unit price:** `qty` and `unitPrice` are `null`, never inferred as 1.
- **7. A relative due date** ("within 14 days"): `dueDate` is `null`, never calculated.
- **8. Summary charges** (shipping, discount) **are not line items:** `subtotal`, `tax` and `total` are as printed. The golden file's `otherCharges` lets the arithmetic test reconcile.
- **9. Vendor:** the business that issued the invoice, never the customer.
- **Two tax rates:** each document prints the total tax, so `tax` is read, not summed.
- **Handwritten values:** the handwritten value counts.
- **FX reference:** the invoice's own currency and total; the reference amount is a distractor.

These go into `samples/README.md`.

**Rendering:**
- `render-samples.sh` gets cases for the rotated scan (`transpose`), the handwritten scan, the MXN photo, and the mixed PDF.
- The mixed PDF is made by rendering page 2 to a degraded PNG, then printing a page 1 + `<img>` wrapper to PDF, so page 2 has no text layer.
- For the split-row document, the page-1 footer is positioned absolutely but placed last in the DOM, so the two halves of the description read as one continuous text in the source.

**Golden tests, extended:**
- `source` can list several files.
- Printed amounts are also checked in French and no-decimal forms.
- The arithmetic includes `otherCharges`.
- Every new file has to pass the same checks: every amount and description printed in its source, the cents reconcile, and the names match the schema.

**Baseline (item 5):**
- `npm run eval -- --models gpt-6-luna --reps 3 --limit 0.15`. **Agreed spend asked: about $0.06**, capped at $0.15.
- `evals/baseline.json` records: model, run file, golden-set file count, threshold, headline accuracy, silent errors per doc, cost per doc, and the date.
- It is committed in **its own commit**, with the reason, as AGENTS.md asks.
- Sol isn't rerun. Escalation (item 7) measures sol where luna fails.

**Threshold sweep (item 6, $0):**
- `npm run eval:threshold -- --run <file>` re-scores the stored fields at 0.70, 0.75 … 0.95.
- For each threshold it reports silent errors per document and **review load** (flagged fields per document, correct or not).
- **Rule fixed before looking:** the lowest threshold with the fewest silent errors. Because review load only grows with the threshold, that is also the cheapest for a person. 0.85 stays unless another value is strictly better on silent errors, or equal on silent errors with lower review load.
- **Overfitting caveat:** 30 documents leave no held-out set, and the README will say so.
- If the value changes:
  - `DEFAULT_CONFIDENCE_THRESHOLD` and `.env.example` change;
  - the baseline is recomputed from the same run at the new threshold, with no new calls;
  - you update `.env.local`.

## What this teaches

**A labelled set has to be hard enough to separate things** (gap list #8). At 99.7%, the first 10 documents couldn't tell luna from sol except by cost. A useful eval set contains the failures you expect in production, because an easy set produces a flattering number that means nothing.

**Threshold tuning is a trade-off you can measure:** silent errors against review load. The rule is fixed before the curve is seen so the data can't be read to fit a preference. The alternative rejected was keeping 0.85 because it "looks reasonable", which is exactly the vibes CLAUDE.md says not to use.

## Files to touch

- `samples/src/*.html`: create 19 sources (plus one page-2 source for the mixed PDF).
- `samples/*`: the 19 rendered files.
- `scripts/render-samples.sh`: edit, adding the new render cases.
- `evals/golden/*.json`: create 19, and edit 3 (`$`-only: accept `null`).
- `evals/golden.test.ts`, `evals/score.ts`: edit (multi-source, otherCharges, printed forms).
- `evals/threshold.ts` and `.test.ts`, `scripts/eval-threshold.ts`: create. `package.json`: add `eval:threshold`.
- `evals/baseline.json`: create, in its own commit.
- `evals/runs/<date>-eval.json`: the baseline run.
- `samples/README.md`: the trap table and rules 5–9, with the `$` rule decided.
- `README.md`: regenerate the block from the new run, update the text (30 documents, the threshold choice).
- `CLAUDE.md` and this file's Results section: edit. `lib/design/confidence.ts` and `.env.example` only if the threshold changes.

## Security and data safety

- **Synthetic only.** Every new company, address, number and tax ID is invented, and each page says "synthetic sample". No real invoice is used as a template.
- No keys or URLs in any sample. The eval runs locally with `.env.local`.

## Cost impact

- Rendering: $0.
- **Baseline:** 30 files × 3 reps on luna, about **$0.06**, stopped by `--limit 0.15`. A cheap 1-rep smoke run first (about $0.02) checks the new golden files on real output. **About $0.08 in total.**
- Threshold sweep: $0.
- Project spend so far is $0.393.

## Acceptance criteria

- [ ] 19 new rendered samples, each matching its row in the table: page counts, a text-layer-free page 2 on Harrow, rotation, the handwritten values. Checked by opening each one.
- [ ] 30 golden files. The golden tests pass for every file, including multi-source, otherCharges and the French and yen print forms.
- [ ] The baseline run is committed; `evals/baseline.json` is committed in its own commit with the reason.
- [ ] Threshold sweep:
  - unit-tested (re-scoring, the curve, the pre-fixed rule, ties);
  - the curve and the chosen value are in Results and the README;
  - the config is updated only if the rule says so.
- [ ] README block regenerated (`eval:report --check` gives 0); samples/README rules updated.
- [ ] tsc, lint, test and build pass. CLAUDE.md log line written.

## Checks

- `npx tsc --noEmit`
- `npm run lint`
- `npm run test`
- `npm run build`
- `bash scripts/render-samples.sh`
- `npm run eval -- --limit 0.03` (smoke)
- `npm run eval -- --reps 3 --limit 0.15`
- `npm run eval:threshold -- --run <baseline run>`
- `npm run eval:report -- --run <baseline run>` and `--check`

## Manual test steps

1. Open a few of the new samples: the 3-page Alder Forge, the rotated Ridgeline scan, and the Harrow PDF (try selecting text on page 2; you can't).
2. `npm test`: all golden checks pass for 30 files.
3. `npm run eval:threshold -- --run evals/runs/<baseline>.json`: prints the curve and the chosen threshold, at no cost.
4. Read the README's results section: 30 documents, with the threshold explained.

## Results

To be filled in after the work.
