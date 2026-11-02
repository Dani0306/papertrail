# 013 — Escalation to sol, export dates, CSV and XLSX

**Status:** done
**Branch:** `feat/escalation-export`. Stacked on `feat/golden-set-30` (PR #14), because both append to the CLAUDE.md log and the prompts.
**Week:** 3, items 7–10 (8–14 Nov)

## Goal

1. **Item 7, escalation.** The failure ladder becomes complete, as CLAUDE.md specifies: validate → one repair on `gpt-6-luna` → **still invalid, one call on `gpt-6.1-sol`** → still invalid, `needs_human`. A document rescued by sol gets the existing `escalated` status, and every call is logged as before.
2. **Item 8, export dates.** Dates are stored as printed, and `10/09/2026` can't become ISO without knowing the document's date order. The export works the order out from the document itself and, when it can't, says so instead of guessing.
3. **Item 9, CSV export.** One row per line item, with the invoice details repeated, using corrected values where a person corrected them.
4. **Item 10, XLSX export and the `/exports` page.** A SheetJS workbook with an Invoices sheet and a Line items sheet. `/exports` replaces the nav's 404 and offers both downloads. The review screen gets a per-document download.

## Docs read (2 Nov 2026)

- **SheetJS, *Node.js installation*:**
  - Install from the SheetJS CDN: `npm i --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`.
  - The npm registry copy is stuck at 0.18.5 ("a known registry bug"), so the registry version must **not** be used.
- **SheetJS, *Writing files*:** `XLSX.write(wb, { bookType: "xlsx", type: "buffer" })` returns a Node `Buffer`. Date cells are written as numbers with a date format.
- **CLAUDE.md:**
  - → Scope: escalate to the stronger model, then mark for human entry; never partial data.
  - → Scope: CSV and XLSX export.
  - → Technical decisions: SheetJS for XLSX.
  - → Money: integer cents, keep the printed currency.
- **AGENTS.md §7:** the ladder is at most one repair and one escalation, and each step is a logged call. The final state is `extracted`, `escalated` or `needs_human`, never partial.
- **AGENTS.md §11:** "Retries multiply cost." The sol call costs about 22× a luna call (prompt 010: $0.00924 vs $0.00042 per document).
- **`next/dist/docs` route handlers:** a `GET` handler returning a `Response` with a `Content-Disposition: attachment` header serves the download.

## Code inspected

- `lib/extract/extract.ts`:
  - `MAX_ATTEMPTS = 2`, then `needs_human`.
  - The comment already reserves "escalation slots in after this (week 3)".
  - `CallOutcome` already has `escalated`, and `model_calls.outcome` allows it.
- `lib/pipeline/extract-document.ts`: maps `extracted` to the document status `extracted`. It needs to map a sol rescue to `escalated`.
- `lib/db/reviews.ts`, `components/documents/document-grid.tsx`, `lib/review/queue.ts`: the statuses that may be corrected, linked and queued are `extracted` and `reviewed`. `escalated` must join them: an escalated document has fields and needs a person's eye at least as much.
- `lib/normalize/index.ts`: `normalizeDate(text, order)` exists. A function that works out the order is missing.
- `lib/review/fields.ts`: `effectiveValue()` (the correction if there is one, else the model's value) and `reviewCounts()`, so the export uses the same "corrected wins" rule as the review screen.
- `lib/db/documents.ts` `listDocuments()`: already fetches the latest extraction's fields with the visibility filter. The export needs the same filter with every field.

## Decisions and assumptions

**Escalation (item 7):**
- After the luna repair fails validation, **one fresh call on sol**: the same system prompt, file and mode, without luna's conversation.
  - Rejected: sol repairing luna's answer. It's cheaper in tokens, but it inherits luna's mistake as a starting point and mixes the two models' failures in the log.
  - **No repair on sol.** AGENTS.md allows one repair and one escalation in total.
- Logging:
  - Sol's call is logged with `attempt: 3`.
  - `outcome` is `escalated` when it validates, `validation_error` when it doesn't.
  - An API error on sol counts as a failed escalation, so the result is `needs_human` with the reason. It does **not** go back to `uploaded`, because a rerun would pay for luna twice more.
- `ExtractionResult` gains `escalated: boolean` on the `extracted` branch. The pipeline maps `escalated: true` to the document status `escalated`. The `extractions` row records sol as its model, as it already does via the last call.
- Escalation is on by default in the app, the CLI and `npm run eval`. `npm run eval` reports an escalation count and rate per model.
- `extractInvoice` takes `escalationModel` (default `escalationModel()` from `lib/models.ts`). Tests pass a second mock.
- **Measurement honesty:**
  - Luna never failed validation in 222 real runs so far, so a natural rescue can't be measured yet.
  - The live check forces the path: a mock "luna" that returns invalid output twice, then the **real** sol on a real sample. That costs one sol call, about $0.01.
  - The README will say escalation is wired and tested but has never been needed in the eval runs.

**Dates for export (item 8; owner decision, 2 Nov: infer, else flag):**
- `inferDateOrder(dates)` in `lib/normalize` looks at all of a document's numeric dates (issue and due):
  - a part above 12 settles the order (`14/10` → dmy, `10/30` → mdy);
  - a 4-digit year first means ymd;
  - month names are unambiguous anyway.
  - If the dates conflict, or every one is ambiguous (`10/09` and `11/08`), the result is **unknown**.
- When the order is known, the export writes ISO dates. When it's unknown, the export writes **the printed text** and lists the field in a `Check` column. It never guesses.
- Rejected: asking the model for ISO dates. That would change the schema the eval was measured on, and the model would be guessing the order just as invisibly.
- Rejected: guessing from the currency or the address, because a USD invoice from a UK supplier would come out wrong silently.

**What gets exported:**
- Documents the viewer can see (their uploads plus public samples), with status `extracted`, `escalated` or `reviewed`.
- `needs_human` documents have no fields, so they're counted on the page but not exported.
- Values are the **effective** ones: a person's correction wins.
- Amounts are written from integer cents as plain decimals (`1284.50`, a leading `-` for credits), never floats with noise.
- The currency is the printed code. Nothing is converted.
- The `Check` column lists the fields a person still needs to look at: still below the threshold and not corrected, plus any date the export couldn't normalise. This is the "flagged spreadsheet" from the definition of done.

**CSV (item 9):**
- Columns: `document_id, file, status, vendor, invoice_number, issue_date, due_date, currency, subtotal, tax, total, line, description, qty, unit_price, line_total, check`.
- Quoted per RFC 4180, with CRLF line endings and a UTF-8 BOM, so Excel opens `Ferretería` and `Grünwald` correctly.
- A document with no lines gets one row with empty line columns.
- Pure `toCsv(rows)`, tested.

**XLSX (item 10):**
- SheetJS **0.20.3 from the CDN tarball**, the one new dependency, approved in CLAUDE.md's stack. No cost, about 7 MB in `node_modules`, server-only. It's never sent to the browser, because the workbook is built in the route.
- Two sheets:
  - **Invoices:** one row per document.
  - **Line items:** the same rows as the CSV.
- Amounts are numeric cells formatted `#,##0.00`, so they sum in Excel. Known dates are real date cells; unknown ones are text. Each sheet has a header row and a frozen top row if CE supports it, otherwise nothing extra.
- Tested by writing a workbook and reading it back with SheetJS in Vitest.

**Route and page:**
- `GET /api/exports?format=csv|xlsx[&document=<id>]` returns an attachment named `papertrail-<YYYY-MM-DD>.csv|.xlsx` (or `papertrail-<file>.…` for one document).
- It needs no sign-in, because export spends no money and the visibility filter decides what's included. A hidden or missing document gives a 404.
- `/exports`:
  - counts what will be exported and how many fields still need checking;
  - the CSV and XLSX buttons;
  - a short column guide;
  - signed out, it notes that only samples are included.
- The review screen gets "Download CSV" and "Download XLSX" for that document.

## What this teaches

- **Retry and fallback as a measured ladder** (gap list #7). Each rung has a price: a luna repair is about $0.0004, a sol rescue about $0.009. The ladder stops after one escalation, because unbounded retries turn a bad document into a large bill. The alternative rejected was escalating on low confidence too. That would multiply sol calls on exactly the documents a human must check anyway, and the spec escalates only on validation failure.
- **Normalising at the boundary, honestly.** The model reports what is printed and the code normalises. Where the code can't know (an ambiguous date order), the export says "check" instead of picking one. A silently wrong date in a spreadsheet is worse than an obvious blank.

## Files to touch

- `lib/extract/extract.ts`, `lib/extract/types.ts` and `extract.test.ts`: edit (escalation).
- `lib/pipeline/extract-document.ts` and `.test.ts`: edit (status `escalated`).
- `lib/review/queue.ts`, `lib/db/reviews.ts`, `components/documents/document-grid.tsx`, `app/documents/[id]/page.tsx`: edit (`escalated` is reviewable).
- `evals/report.ts`, `scripts/eval.ts`, `evals/readme-report.ts` and tests: edit (escalations count).
- `lib/normalize/index.ts` and `.test.ts`: edit (`inferDateOrder`).
- `lib/export/rows.ts`, `lib/export/csv.ts`, `lib/export/xlsx.ts` and tests: create.
- `lib/db/exports.ts`: create, server-only.
- `app/api/exports/route.ts` and `.test.ts`, `app/exports/page.tsx`: create.
- `components/ui/nav.tsx`: edit (remove the "/exports 404s" comment).
- `package.json`: add `xlsx` from the CDN tarball.
- `CLAUDE.md`, `README.md` (the "Not built yet" line) and this file's Results section: edit.

## Security and data safety

- **No new key or secret.** SheetJS runs only on the server.
- **The export respects visibility:** the same `uploaded_by` filter, in the query. Signed out, it's samples only.
- **CSV injection.** A cell starting with `=`, `+`, `-` or `@` can run as a formula in Excel. Text cells that start with those characters get a leading `'`. Amounts are written as numbers and aren't affected.
- **The dependency comes from the vendor's CDN**, not the npm registry, as SheetJS documents. It is pinned to an exact tarball URL and version, and `package-lock.json` records the integrity hash.

## Cost impact

- Escalation in production: only when luna fails validation twice, which has happened 0 times in 222 runs. Each one costs about $0.01.
- **Live check: one forced sol call, about $0.01.**
- Export: $0.
- **Total about $0.01.** Project spend so far is about $0.41, plus the baseline in progress, at most $0.15.

## Acceptance criteria

- [x] **Escalation tests** (mock models):
  - luna ×2 invalid, then sol valid → `extracted` with `escalated: true`, 3 calls logged (`validation_error`, `validation_error`, `escalated`);
  - sol invalid → `needs_human`;
  - sol API error → `needs_human`;
  - a luna API error doesn't escalate;
  - a first-try success never calls sol.
- [x] **The pipeline maps a rescue to `escalated`.** Escalated documents are linked, correctable, queued and exportable.
- [x] **A live forced escalation** against the real sol on a real sample is valid and logged. Cost reported.
- [x] **`inferDateOrder` tests:**
  - every sample's dates;
  - an ambiguous pair → unknown;
  - conflicting dates → unknown;
  - month names and ISO.
- [x] **Export tests:**
  - rows from fields: corrections win, cents to decimals, credit notes, no lines, the Check column;
  - CSV quoting, BOM and CRLF, formula-prefix escaping;
  - XLSX written and read back: two sheets, numeric amounts, date cells.
- [x] **Route tests:** csv/xlsx, a bad format → 400, a hidden document → 404, the right headers. Signed out against `next start`, the CSV and XLSX contain only the public sample.
- [x] **`/exports` and the review-screen links** checked in Playwright at 1280 px and 375 px. The nav has no more 404 prefetch errors.
- [x] tsc, lint, test and build pass. The README's "Not built yet" line is updated. CLAUDE.md log written.

## Checks

- `npx tsc --noEmit`
- `npm run lint`
- `npm run test`
- `npm run build`
- One forced-escalation live run
- `curl` both formats against `next start`
- Playwright on `/exports`

## Manual test steps

1. `npm run dev` and open **Exports** in the nav. It shows how many documents will be exported and how many fields still need checking.
2. Download the XLSX and open it in Excel or Numbers. There are two sheets, the amounts sum, the dates are real dates, and the Check column names the flagged fields.
3. Download the CSV. `Ferretería` shows its accent in Excel.
4. Signed in, correct a flagged field on a document and download again. The corrected value is in the file, and that field leaves the Check column.
5. Open a review screen and use **Download XLSX** for just that document.

## Results

**Escalation (item 7):**
- **The ladder:** luna, then one repair, then **one fresh `gpt-6.1-sol` call** (attempt 3; no repair on sol), then `needs_human`. An API error on sol ends at `needs_human`, not `failed`.
- **Mock primaries:** a mock primary never escalates unless asked, so `npm test` can't reach a real model by accident. A test pins this.
- **6 new tests:**
  - rescue, with 3 calls logged and sol's call priced at sol's rate;
  - sol starts fresh, with no luna conversation;
  - sol invalid → `needs_human`, with no repair on sol;
  - sol API error → `needs_human`;
  - no sol call on a first-try success, a repair, or a luna API error;
  - the mock-primary guard.
- **Pipeline:** a rescue sets the document status to `escalated`, and the extraction records sol as its model (test added).
- **Status groups** (`lib/document-status.ts`):
  - `HAS_FIELDS` = extracted, escalated, reviewed;
  - `AWAITING_REVIEW` = extracted, escalated.

  Escalated documents are linked, correctable, can be marked reviewed and export. They **always queue**, after `needs_human` and before flagged fields, because the primary failed twice on them.
- **Live forced escalation**, using a mock luna that returns an invalid answer twice and the real sol on `synthetic-harbor-pine-inv-2041.pdf`:
  - `extracted`, `escalated: true`;
  - attempt 3: `gpt-6.1-sol`, outcome `escalated`, 2,531 in (0 cached), 467 out, 0 reasoning, **$0.009732**, 5.0 s;
  - values: HARBOR & PINE STATIONERS, INV-2041, 1,284.50, 3 lines, all matching the ground truth.
- **What can't be measured yet:** whether sol rescues **real** luna failures. Luna has never failed validation in 222 real runs. The README says so.
- **Reporting:** `npm run eval` and the README now report an Escalated count. The two runs from before escalation existed show "—", not a misleading 0.

**Export dates (item 8; owner decision: infer, else flag):**
- `inferDateOrder` and `normalizeDocumentDates` are in `lib/normalize`, with 8 tests on every sample's date pair, conflicting evidence, and same-both-ways dates.
- Orchard Labs (`10/09/2026`, `11/08/2026`) and Alder Forge (`11/02/2026`, `12/02/2026`) **can't be settled from their own dates**, so their dates export as printed and appear in Check.
- Every other sample settles: a part above 12, ISO, or month names.

**CSV and XLSX (items 9–10):**
- `lib/export/rows.ts`:
  - corrections win;
  - integer cents (0.1 + 0.2 → 30 cents);
  - ISO dates only where settled;
  - **Check** lists flagged, uncorrected fields plus unclear dates.
- `csv.ts`: BOM, CRLF, RFC 4180 quoting, and a leading `'` on text that starts with `= + - @`.
- `xlsx.ts`:
  - Invoices and Line items sheets;
  - amounts as numeric cells formatted `#,##0.00`;
  - known dates as real date cells (an Excel serial, no time zone);
  - text written as strings, never formulas.
- **18 tests**, including writing a workbook and reading it back with SheetJS.
- **SheetJS 0.20.3** is installed from `cdn.sheetjs.com`, as its docs require (the registry copy is stuck at 0.18.5). The lockfile pins the tarball with its sha512 hash, and `npm audit --omit=dev` finds 0 vulnerabilities.

**Route and page:**
- `GET /api/exports?format=csv|xlsx[&document=id]`:
  - uses the same visibility filter, now one shared helper `visibleTo()` that `listDocuments` uses too;
  - `Cache-Control: private, no-store`;
  - 400 / 404 / 409 / 500 (5 tests).
- **A bug the build caught:** the route's `try/catch` swallowed Next's prerender bail-out signal and logged it as an error. It's fixed with `unstable_rethrow`, the same as the pages, and the build log is clean.
- **Signed out, against `next start`:**
  - **CSV:** 200, `text/csv; charset=utf-8`, `attachment; filename="papertrail-2026-11-02.csv"`. It contains only the public Quarry sample: 4 line rows, Check = "Invoice number; Total".
  - **XLSX (one document):** `synthetic-quarry-ash-ambiguous.xlsx`, a real Excel 2007+ file. Read back: two sheets, dates as serials displaying `2026-10-24`, the total as the number 612.14, 4 line rows.
  - A private document's export gives **404**; a bad format gives **400**.
- **`/exports` in Playwright:**
  - 1280 px: the count (1 invoice · 4 line items), the "public samples only" note, the amber "2 fields … need checking" (below-threshold fields only, as the design system requires), both downloads, and the column guide.
  - 375 px: no horizontal scroll.
  - **No console errors: the last nav 404 (`/exports`) is gone.**
  - The review screen shows XLSX and CSV buttons for that one document.

**Tests:** 317 pass, up from 272. tsc, lint, build and `eval:report --check` pass.

**Spend:** $0.009732 (the forced escalation). Project total **$0.46101**.
