# 014 — CI regression gate, the confidence A/B, manual entry

**Status:** done
**Branch:** `feat/ci-ab-manual`. Stacked on `feat/golden-set-30` (PR #14, which now also carries #15), because all three append to CLAUDE.md and the prompts.
**Week:** 3, items 11–13

## Goal

1. **Item 11, CI.** Two GitHub Actions workflows:
   - **Checks**, on every PR and every push to `main`, free: tsc, lint, test, build and `eval:report --check`.
   - **Eval gate**, on PRs that touch extraction, scoring or samples, paid: runs the 30-document eval once on luna, and **fails if headline accuracy drops more than 2 points below `evals/baseline.json`**. CLAUDE.md asks for exactly this.
2. **Item 12, the open question.** "Does asking for per-field confidence in the same call degrade extraction accuracy?" One arm asks for confidence, the other doesn't, interleaved on the same 30 documents, with a rule fixed before the run. The answer goes into CLAUDE.md and the README.
3. **Item 13, manual entry.** A `needs_human` document gets an **Enter by hand** form for its uploader. What they type is stored through the same correction columns, so review, export and the queue all work unchanged.

## Docs read (2 Nov 2026)

- **CLAUDE.md:**
  - → Evaluation: "GitHub Action runs the suite on every PR and fails if headline accuracy drops more than 2 points below the committed baseline in `evals/baseline.json`."
  - → Open questions: "one run with confidence fields, one without, compare on the golden set."
  - → Definition of done #6: "The eval suite green in CI with a committed baseline."
- **AGENTS.md §11:** "The CI eval job needs `OPENAI_API_KEY` as a repo secret; ask before adding it." "Evals and CI cost money." **You add the secret yourself** (`gh secret set OPENAI_API_KEY`); I never read the key's value.
- **AGENTS.md §9:** "Every eval run prints its total cost. … do not run it in a loop."
- **GitHub Actions:**
  - Secrets aren't passed to workflows triggered from forks, so the gate skips with a notice when the secret is missing, rather than failing.
  - `concurrency` with `cancel-in-progress` stops a quick series of pushes from paying for every one.
  - Actions are pinned to full commit SHAs, looked up with `gh api` when the workflow is written.
- **Node 24:** `--env-file-if-exists` (checked locally). The paid scripts use it, so they run in CI from environment variables without `.env.local`.
- **Local check:** with `.env.local` moved aside, `npm run build` succeeds, so the Checks job needs no secrets.

## Code inspected

- **No `.github/workflows` exist yet.**
- `package.json`: `extract`, `compare:modes` and `eval` use `--env-file=.env.local`, which fails when the file is missing.
- `scripts/eval.ts`:
  - It writes `evals/runs/<date>-eval(-n).json` via `freshPath`. CI needs a fixed path (`--out`).
  - Models are the only axis, so the A/B needs a second axis: whether confidence is asked.
- `evals/baseline.json`: `accuracy: 0.9979`, 30 files, 3 reps.
- `lib/schema/invoice.ts`: `evidenceField()` builds `{ value, confidence, sourceQuote }`, so the no-confidence arm needs the same builder without `confidence`. The repo still keeps one definition: a factory, not a second schema.
- `lib/extract/prompt.ts`: two prompt lines are about confidence and would be dropped in that arm.
- `supabase/migrations/20261101120000_extractions.sql`: `extractions.mode` is checked to be `json_schema` or `function_call`. Manual entry needs `manual` added, which **widens a check constraint**: no data changes, no column changes.
- `lib/review/fields.ts` `validateCorrection()` is the per-field type check the manual form reuses. `lib/db/reviews.ts` and `HAS_FIELDS` already treat `reviewed` as having fields.

## Decisions and assumptions

**Item 11, the CI gate:**
- **`ci.yml`, Checks:** runs on `pull_request` and `push` to `main`. Node 24, `npm ci`, then tsc, lint, test, build and `eval:report --check`. $0, no secrets.
- **`eval-gate.yml`, Eval gate:**
  - Runs on `pull_request` **only when these paths change** (owner decision, 2 Nov): `lib/extract/**`, `lib/schema/**`, `lib/models.ts`, `lib/normalize/**`, `evals/**`, `samples/**`, `scripts/eval*.ts`. Also on `workflow_dispatch` to run it by hand.
  - Steps:
    1. `npm run eval -- --reps 1 --limit 0.05 --out evals/runs/ci-eval.json`, 30 files, about **$0.015–0.02 per run**.
    2. `npm run eval:gate -- --run evals/runs/ci-eval.json`.
    3. The run file is uploaded as an artifact, and a results table goes into the job summary.
  - It skips cleanly, with a notice, when `OPENAI_API_KEY` isn't available (a fork, or the secret not added yet).
  - `concurrency: eval-gate-${{ github.ref }}` with `cancel-in-progress: true`.
- **The gate rule** (`evals/gate.ts`, pure and tested):
  - **Fail** if `accuracy < baseline.accuracy − 0.02`.
  - **Fail** if the run stopped at the cost limit before scoring every file, because a partial run can't pass.
  - **Warn, don't fail,** if the golden-file count differs from the baseline's, because the set grew; or if silent errors per document rose.
  - The thresholds come from CLAUDE.md, not from me.
  - Rejected: failing on any drop. One extra misread on a 30-document, 1-rep run is about 0.1 points, which is noise.
- **Workflow-level `env`:** only `OPENAI_API_KEY` from secrets. Nothing else is needed. The eval never touches Supabase.

**Item 12, the confidence A/B:**
- **Schema factory:** `invoiceSchema({ confidence: boolean })` in `lib/schema/invoice.ts`. `Invoice` is `invoiceSchema({ confidence: true })`, unchanged, so the types and the strict-schema tests stay the same. The no-confidence arm drops only `confidence`; `value` and `sourceQuote` stay, so the evidence rule is identical.
- **Prompt:** `systemPrompt({ confidence })` drops the two confidence lines. Everything else is byte-for-byte the same.
- **Extraction:** `extractInvoice(file, { askConfidence: false })` is **eval-only**. The result is mapped back into the `Invoice` shape with `confidence: 1` on every field, which honestly means "nothing was flagged". The app never uses this path.
- **Eval:** `npm run eval -- --variants with,without`. Each arm is a model × variant label (`gpt-6-luna`, `gpt-6-luna · no confidence`). The arms are interleaved per document, as in the earlier comparisons, at 3 reps.
  - In the no-confidence arm **every error counts as silent**, because nothing can be flagged. That's the real cost of dropping confidence, and the report says so.
- **The rule, fixed before the run:**
  - "Asking for confidence costs accuracy" if the no-confidence arm's accuracy is higher by **more than the larger rep-to-rep spread of either arm, and by at least 0.5 points**.
  - Otherwise: "no measurable accuracy cost on this set", with output tokens and $/doc reported either way.
  - **Caveat:** at 99.8%, the set may be too easy to show a difference. If so, the answer says that, not "no".
- **Cost:** 2 arms × 30 files × 3 reps ≈ **$0.08**, capped at `--limit 0.15`.

**Item 13, manual entry (not a gap-list topic; kept short):**
- **Migration** `extractions_manual_mode`:
  - The `extractions.mode` check gains `'manual'`. The constraint is dropped and re-added in the same migration.
  - **Widening only:** no rows change, nothing is dropped from the data.
  - The types update by hand, as before.
- **`POST /api/documents/[id]/manual`:**
  - Uploader only, only from `needs_human`.
  - Body: the typed header fields and line items.
  - Every value is checked with `validateCorrection()`, so the person meets the same Zod field types as the model.
  - It creates an `extractions` row (`model: "manual"`, `mode: "manual"`, `invoice`: what was typed) and one `extraction_fields` row per field: `value: null`, `confidence: 0` (the model gave nothing), and **`corrected_value`** set to the typed value with `corrected_at`.
  - The document status becomes `reviewed`, because a person entered it.
  - Rejected: writing typed values into `value`. That would make a human's entry look like model output in every later metric. The original "the model returned nothing" is preserved, as AGENTS.md requires for corrections.
- **The form (client component):**
  - On the `needs_human` review screen, beside the preview, owner only.
  - Header fields, plus line rows with Add line and Remove.
  - `parseCorrection()` runs per field in the browser, with the same number hint as the editor.
  - One Save. Errors show next to the fields.
- **Afterwards:** the document behaves like any reviewed one. The fields show as corrected, it exports, it can be edited again, and it leaves the queue.

## What this teaches

- **A regression gate is a measurement contract.** The baseline is committed and the tolerance is written down. The gate turns "did this prompt change make things worse?" from an opinion into a red or green check. It runs only when extraction code changes, because every run costs money.
- **The confidence A/B answers a real design question with a controlled experiment.** One variable changes, the arms are interleaved on the same documents, and the rule is fixed before the run. Without confidence, every error is silent, which is a cost that accuracy alone doesn't show.

## Files to touch

- `.github/workflows/ci.yml`, `.github/workflows/eval-gate.yml`: create.
- `evals/gate.ts` and `.test.ts`, `scripts/eval-gate.ts`: create.
- `scripts/eval.ts`: edit (`--out`, `--variants`).
- `evals/report.ts`: edit (arm labels).
- `package.json`: edit (`--env-file-if-exists`, `eval:gate`).
- `lib/schema/invoice.ts` and `.test.ts`, `lib/extract/prompt.ts`, `lib/extract/extract.ts` and `.test.ts`: edit (A/B variant).
- `supabase/migrations/20261102120000_extractions_manual_mode.sql`, `lib/db/types.ts`: create / edit.
- `lib/db/manual.ts`, `app/api/documents/[id]/manual/route.ts` and `.test.ts`, `components/review/manual-entry.tsx`, `app/documents/[id]/page.tsx`: create / edit.
- `app/design-system/page.tsx`: the manual form preview.
- `README.md`, `CLAUDE.md`, this file's Results section, and `evals/runs/<date>-eval.json` (the A/B run).

## Security and data safety

- **The key:** `OPENAI_API_KEY` reaches CI only as a repo secret that you add. It's referenced in one workflow step's env and never echoed. Fork PRs don't get it, and the gate skips.
- **Workflow permissions:** read-only (`contents: read`), no write tokens. Actions are pinned by SHA.
- **Manual entry** uses the uploader-only routes and validation, so the browser never writes to Postgres.
- **The migration** only widens a check constraint.

## Cost impact

- **Eval gate:** about $0.015–0.02 per run, only on PRs that touch extraction or scoring, with stale runs cancelled. At around 20 runs a month, that's about $0.40.
- **A/B run:** about $0.08, capped at $0.15.
- **Checks and manual entry:** $0.
- Project spend so far is $0.461.

## Acceptance criteria

- [x] `ci.yml` and `eval-gate.yml` are committed with SHA-pinned actions. Checks passes on this PR's push. The gate runs if the secret is set; otherwise it skips with a notice.
- [x] Gate tests:
  - pass at the baseline;
  - pass at −1.9 points;
  - fail at −2.1 points;
  - fail on a partial run;
  - warn on a different file count, or on more silent errors.
- [x] Locally, `eval:gate` on the 2 Nov baseline run passes, and on a doctored copy (−3 points) it fails.
- [x] A/B:
  - the factory schema test shows both variants are strict-compatible, and the no-confidence one has no `confidence` anywhere;
  - extraction tests for the variant;
  - the interleaved run done, with the rule applied and the answer recorded in CLAUDE.md (open question) and the README.
- [x] Manual entry:
  - migration applied and checked;
  - route tests (401/400/403/404/409/422/200);
  - a live check that creates a manual entry on a test `needs_human` document, with rows checked by SQL (`value` null, `corrected_value` set, status `reviewed`), then cleaned up;
  - the form checked in Playwright via `/design-system`.
- [x] tsc, lint, test and build pass. CLAUDE.md log written.

## Checks

- `npx tsc --noEmit`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run eval:gate` (local, on the baseline and on a doctored run)
- `npm run eval -- --variants with,without --reps 3 --limit 0.15` (once)
- The Checks workflow on GitHub after push

## Manual test steps

1. **Add the secret:** `gh secret set OPENAI_API_KEY` and paste your key when prompted. It's never printed.
2. Open a PR that touches `lib/extract`. The **Eval gate** check runs, puts a results table in the job summary, and goes green at baseline accuracy.
3. Signed in, open a `needs_human` document (or ask me to make a test one). Click **Enter by hand**, fill the fields, add a line, and save. The document becomes Reviewed, and its fields show as corrected.
4. Export it from `/exports`. The typed values are in the file.

## Results

**CI (item 11):**
- Two workflows: `Checks` and `Eval gate`. Actions are pinned by SHA (checkout v7.0.1, setup-node v7.1.0, upload-artifact v7.0.2, each released at least 3 weeks ago), with read-only permissions.
- **The first `Checks` run on GitHub failed, and it was a real bug.** On a fresh checkout, Next's generated route types (`PageProps`, `RouteContext`, `LayoutProps`) don't exist, so `tsc` gave 7 errors. Locally they always existed from earlier builds; `app/layout.tsx` already relied on them, so any clean checkout would have failed.
  - Reproduced in a clean `git worktree`: 7 errors before `npx next typegen`, none after.
  - Fixed by running `next typegen` before `tsc` in `ci.yml`.
- **`Eval gate`:** the first run "passed" in 3 s by **skipping**, because the repo has no `OPENAI_API_KEY` yet. That's the intended behaviour. A real gated run needs the secret.
- **`eval:gate` locally:** the 2 Nov baseline passes (exit 0); a copy doctored to 3 points lower fails (exit 1, "96.79% is 3.00 points below the baseline 99.79%").
- The paid scripts use `--env-file-if-exists`. `npm run build` passes with `.env.local` moved away.

**The confidence A/B (item 12):** `npm run eval -- --variants with,without --reps 3 --limit 0.15`. 180 extractions, interleaved, **$0.08241**. Data: `evals/runs/2026-11-02-eval-2.json`.

| Arm | Field accuracy (reps) | Silent / doc | Caught / doc | $/doc | Mean in / out tokens | p50 |
|---|---|---|---|---|---|---|
| with confidence | **99.79%** (99.79, 99.79, 99.79) | **0.03** | 0.03 | $0.00050 | 3,788 / 799 | 4.7 s |
| without confidence | 99.65% (99.57, 99.68, 99.68) | 0.11 | 0 | $0.00042 | 2,507 / 623 | 4.2 s |

- **Answer, by the rule fixed before the run: asking for confidence does not cost accuracy.** The no-confidence arm isn't higher at all; it's 0.14 points lower, within its own 0.11-point spread.
- **What leaving confidence out changes:**
  - **Every error becomes silent:** 0.11 per document vs 0.03. Nothing can be flagged.
  - **The model's behaviour changes.** On Quarry & Ash's `$6l2.14`, the with arm reads 612.14 and flags it at about 0.76. The without arm returns `total: null` in all 3 runs: unable to express doubt, it declines.
- The errors were otherwise the same in both arms: Ridgeline's `FO-60218` ×3 and Quarry's `QA-2O61` ×3. The without arm also had one empty Pinecrest invoice number.
- **The cost of asking:** +18% per document (+$0.00008). That's +1,281 input tokens (the confidence field descriptions in the schema) and +176 output tokens.
- **Decision:** keep confidence. It's what turns errors into caught ones, at less than a hundredth of a cent per document.
- The production schema and prompt were **byte-identical** before and after the refactor (checked with `cmp`), so the baseline still holds.

**Manual entry (item 13):**
- **Migration** `extractions_manual_mode` applied: the check is now `json_schema | function_call | manual`, and both existing extraction rows are kept.
- **Live check:**
  - another user's save → `missing`;
  - **two simultaneous saves → one `saved`, one `busy`, and exactly 1 extraction left**;
  - a third save → `busy`;
  - SQL showed `value null`, `confidence 0`, `corrected_value` set (including `dueDate` corrected to `null`), mode `manual`, status `reviewed`.
- **Left over:** the cleanup `delete` of the test document was **declined by the owner**, so `test-manual-entry.pdf` (synthetic Kestrel values, no Storage file) remains under the owner's account until they decide.
- **Playwright on `/design-system`:**
  - 1280 px: the form, error states, and Add line → 2 lines.
  - 375 px: the form doesn't overflow.
  - The page itself scrolls sideways because of the **type-scale table that was already there**. Noted for week 4, item 4.

**Tests:** 336 pass, up from 317:
- 5 gate tests;
- 2 schema tests and 2 extraction tests for the no-confidence arm;
- 4 manual-entry tests;
- 6 manual-entry route tests.

tsc (after typegen), lint and build pass.

**Spend:** A/B $0.08241. Project total **$0.54342**.
