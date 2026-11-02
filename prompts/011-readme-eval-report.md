# 011 — README results table from the eval run (`npm run eval:report`)

**Status:** done
**Branch:** `feat/eval-report`
**Week:** 3, item 1 (carried over from week 2, subtask 10)

## Goal

The README shows the luna vs sol results, and those numbers are **generated from the committed run file**, never typed by hand. `npm run eval:report` rewrites one marked block of `README.md`. `npm run eval:report -- --check` exits 1 if the README no longer matches its run, which is ready for the CI gate (item 11).

The create-next-app boilerplate README is replaced with a short, honest project README. The full README (architecture diagram, cost table, demo link) is week 4 work.

## Docs read

- **CLAUDE.md:**
  - → Commands lists `npm run eval:report # regenerate the README results table`.
  - → Evaluation: report the per-field breakdown and "say so honestly in the README".
  - → Definition of done: until it's deployed, the project is "In the lab"; never describe it as finished.
- **AGENTS.md §9:** "`npm run eval:report` regenerates the README table." Update the baseline only on purpose.
- No external API is involved: this task makes no model calls and adds no dependencies.

## Code inspected

- `README.md`: the untouched create-next-app template. The repo is **public** (`gh repo view`), so this is the project's front page today.
- `evals/runs/2026-11-01-eval.json`: `{ date, models, reps, threshold, totalCostUsd, byModel: { [model]: summarizeModel(...) }, runs }`. `byModel` already holds every number the table needs: accuracy and accuracy by rep, silent and caught errors per document, hallucinated rate, first-try validity, needs_human, $/doc, p50/p95, `byKey` and `byDocument`.
- `evals/report.ts`: `summarizeModel()`, so the report reads its output and recomputes nothing.
- `lib/cost/pricing.ts`: `PRICING_READ_ON`, so the table can say which day's prices the costs use.
- `package.json`: the other scripts load `.env.local`. This one doesn't need it, because it makes no network calls.

## Decisions and assumptions

- **A marked, generated block:**
  - Everything between `<!-- eval:report:start run=<path> -->` and `<!-- eval:report:end -->` is owned by the script. Everything outside it is hand-written and never touched.
  - Rejected: generating the whole README, which would make the hand-written parts uneditable.
  - Rejected: a hand-copied table, which drifts from the data the first time anyone reruns the eval.
- **The run file is named in the marker:**
  - `npm run eval:report` re-renders from the run the README already names. That makes it idempotent, and `--check` compares against it.
  - `npm run eval:report -- --run evals/runs/<file>.json` switches to a new run and rewrites the marker.
  - Rejected: picking the newest file automatically. Run files sort awkwardly (`-eval-luna-smoke.json` vs `-eval.json`), and a smoke run must never become the README's headline by accident.
- **What the generated block contains:** only numbers read from the run file, formatted, with no claims:
  1. A line of facts: run date, documents × models × reps, threshold, total run cost, prices read on, and a link to the run file.
  2. A per-model table: field accuracy (and by rep), silent errors per doc, caught errors per doc, hallucinated rate, first-try valid, needs human, $/doc, p50, p95.
  3. A per-field table: each field key's accuracy per model, worst first by the first model. That is CLAUDE.md's "per-field breakdown".
- **The hand-written parts:**
  - what PaperTrail is;
  - status ("In the lab", not deployed);
  - how to run it, with the existing commands;
  - what the numbers mean (silent vs caught errors);
  - the decision and its caveats: luna stays primary, these 10 synthetic documents are near luna's ceiling, and sol's errors are mostly `currency: null` on `$`-only documents;
  - the data rule (synthetic documents only).

  Short, plain, and nothing beyond what's measured. The architecture diagram and the rest are week 4.
- **Pure renderer:** `evals/readme-report.ts` exports `renderReport(run, runPath)` and `replaceBlock(readme, block)`, both Vitest-tested. The script `scripts/eval-report.ts` only does file input and output.
- **`--check` exit codes:** 0 when the README matches, 1 with a one-line diff hint when it doesn't, 2 when the markers are missing.

## What this teaches

**The eval result is data, and the README is a view of it** (gap list #8). Numbers copied by hand into a README are the most common way an eval story drifts from reality, and nobody notices until a reviewer reruns it. Generating the table from the committed run file, and failing a check when they disagree, makes the README as trustworthy as the run file. The alternative rejected was hand-editing the table after each run, which is simpler today and wrong the first time someone forgets.

## Files to touch

- `evals/readme-report.ts` and `evals/readme-report.test.ts`: create.
- `scripts/eval-report.ts`: create.
- `package.json`: edit, adding `"eval:report": "tsx scripts/eval-report.ts"`.
- `README.md`: rewrite (hand-written sections plus the generated block).
- `CLAUDE.md` and this file's Results section: edit.

## Requirements

1. `npm run eval:report -- --run evals/runs/2026-11-01-eval.json` writes the block. Running `npm run eval:report` again changes nothing.
2. `npm run eval:report -- --check` exits 0 on a fresh README and 1 after any hand edit inside the block.
3. Every number in the block matches `byModel` in the run file exactly (formatting only).
4. Nothing outside the markers changes when the script runs.
5. The README calls the project "in the lab", has no claim the run doesn't support, and no secrets.

## Security and data safety

- The README is public as soon as it's pushed. It contains no keys or URLs to private resources, only synthetic sample names.
- No model calls, no network, no new dependency.

## Cost impact

$0. The report reads an existing file.

## Acceptance criteria

- [x] Renderer tests cover:
  - number formatting;
  - the per-model and per-field tables;
  - replacing the block without touching the text around it;
  - the run path in the marker;
  - missing markers;
  - idempotence.
- [x] `--check` shows 0 after generation and 1 after a hand edit inside the block. Checked by running it.
- [x] The README renders on GitHub, with tables that look right in a Markdown preview.
- [x] tsc, lint, test and build pass. Results and the CLAUDE.md log line are written.

## Checks

- `npx tsc --noEmit`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run eval:report -- --run evals/runs/2026-11-01-eval.json`, then `npm run eval:report -- --check`

## Manual test steps

1. `npm run eval:report -- --check`: it prints that the README matches `evals/runs/2026-11-01-eval.json` and exits 0.
2. Change any number inside the generated block, then run `--check` again. It exits 1 and names the run file to regenerate from.
3. `npm run eval:report` puts the number back. `git diff README.md` is empty.
4. Open the README on the PR's GitHub page and read the results section.

## Results

**Built as planned, with two small changes:**
- **Field-table order.** It's sorted by whichever model did worst on each field, not by the first model, so sol's `currency` (75.8%) sits at the top instead of being buried under luna's 100%.
- **Pricing date.** `npm run eval` now writes `pricesReadOn` into new run files. The 1 Nov run file predates that and is committed data, so it wasn't edited. Its block simply shows no pricing date rather than a guessed one.

**Checked by running it:**

| Step | Exit | Output |
|---|---|---|
| `eval:report` with no run named yet | 2 | asks for `--run` |
| `eval:report -- --run evals/runs/2026-11-01-eval.json` | 0 | block written |
| `eval:report` again | 0 | "already matches; nothing to write" (idempotent) |
| `eval:report -- --check` | 0 | matches |
| `--check` after the renderer changed ("documents" → "files") | 1 | "don't match … Regenerate them" |
| `--check` after hand-editing 99.7% → 99.9% in the block | 1 | same |
| `eval:report` after the hand edit | 0 | restored; the README holds 99.7% again |

- **GitHub rendering:** the README was rendered by GitHub's Markdown API (`gh api markdown`, `gfm`) into 2 `<table>`s with 16 rows and right-aligned number columns.
- **The README:**
  - The create-next-app template is replaced with a short project README: what it does today, what's not built, the stack, how it's measured (silent vs caught errors), the generated block, the decision and caveats, how to run it locally, and the synthetic-only data rule.
  - The status says **in the lab, not deployed**.
  - Every number in it is either inside the generated block or matches it: "22× cheaper" = $0.00924 / $0.00042.
- **Tests:** 204 pass, up from 196: 8 renderer tests (formatting, both tables, field order, marker path, block replacement that keeps every byte around it, idempotence, missing markers). tsc, lint and the build pass.

**Spend:** $0.
