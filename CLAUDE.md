# PaperTrail — project context

Invoices and PDFs in, clean spreadsheet rows out, with every uncertain field flagged for a human instead of guessed.

This is **Project 1 of 6** in a learning-through-projects roadmap toward an AI engineer role. It is a real portfolio project _and_ a deliberate skill-building exercise. Both matter: shortcuts that ship faster but skip the learning defeat the purpose.

---

## Who I am

Daniel Colorado — full stack developer in Medellín, Colombia (UTC−5). Software Engineering student at IUE (2022–2027). Working full time as a Back Office Agent at Third Way Health, managing patient prescription workflows. Native Spanish, C1 English. Portfolio: danielcolorado.dev · GitHub: github.com/Dani0306

**Already fluent, don't explain these to me:** TypeScript, React, Next.js, Tailwind, Node, Express, MongoDB, Supabase (Postgres, auth, storage, RLS, Edge Functions, pg_cron), Vercel, Git, GitHub Actions, Vitest, Playwright, OpenAI API in production, hand-parsed JSON output, agentic development with Claude Code.

**What this project is teaching me (go slow and explain these):**

1. OpenAI Responses API directly, with no hand-parsing. My production OpenAI work parsed JSON by hand; `input_file` PDF parts and strict schemas are new
2. Native structured outputs (`text.format` with a strict JSON schema) vs strict function-call JSON, and when each fails
3. Zod-validated model output instead of hand-parsing JSON
4. Vercel AI SDK (`generateObject`) — new to me
5. PDF and image input to a model
6. Choosing a model by measured cost/latency/quality rather than vibes
7. Per-call token, cost and latency logging; retry and fallback strategy
8. My first labelled test set and scoring script

---

## Hard constraints

- **Time:** 24 h/week, around a full-time job and university. Two weekday evenings (3 h each) + 9 h Saturday + 9 h Sunday. Plan work in blocks that fit that shape.
- **Budget:** under $20/month across _all six_ roadmap projects. This one must stay at **$2–4/month**. Free tiers only for hosting. The cheapest capable model by default (`gpt-6-luna`).
- **Stack:** TypeScript, Next.js, Supabase, Vercel. Do not introduce a new language, framework or paid service without telling me why the skill genuinely requires it and what it costs.
- **Supabase free tier limits active projects** and I already have Classly, Yield and Forest Media. Use one shared "lab" project with a dedicated Postgres schema (`papertrail`) rather than a new Supabase project.
- **Never use real patient or client data.** Not from Third Way Health, not redacted, not "just locally". All test documents are public samples or synthetic ones we generate. This is non-negotiable.
- No secrets in the repo. `.env.local` only, `.env.example` committed.

---

## Scope

### Minimum version (this is what ships)

1. Upload a PDF or image → Supabase Storage.
2. Extract to a Zod-validated invoice schema: `vendor`, `invoiceNumber`, `issueDate`, `dueDate`, `currency`, `lineItems[]` (description, qty, unitPrice, lineTotal), `subtotal`, `tax`, `total`.
3. Model returns a per-field `confidence` (0–1) and a `sourceQuote` — the literal text it read the value from. Both stored.
4. Failure ladder: validation error → one repair retry with the error fed back → still failing → escalate to the stronger model → still failing → mark the document for human entry. Never silently return partial data.
5. Review queue UI: fields below the confidence threshold are highlighted; a human corrects them; the correction is stored alongside the original.
6. CSV and XLSX export.
7. Every model call logs model, input tokens, output tokens, cost, latency and outcome.
8. Google sign-in (Supabase Auth) is required only for actions that spend money: upload and extraction. Browsing and the preloaded samples stay public. _Added 29 Oct by owner decision._

### Stretch (only after the minimum is deployed)

Multiple schemas (receipt, bank statement, purchase order) · a schema builder so a client defines their own fields · page number + bounding box citations · batch upload with a progress queue · stored human corrections reused as few-shot examples · "match my Excel template" export.

### Explicitly out of scope

Multi-tenancy, per-user data, roles, and any sign-in provider other than Google (sign-in gates paid actions only, nothing else) · payments · OCR libraries (the model reads the PDF directly) · LangChain or LlamaIndex · a vector database · fine-tuning · any queue infrastructure beyond what Postgres can do.

---

## Schedule

Roadmap week 1 started 20 Oct; real start is 25 Oct, so everything sits about five days late. That eats this phase's buffer week — flag it if we slip further, don't quietly absorb it.

| Week | Dates     | Goal                                                                                                                                                                                                                               |
| ---- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 25–31 Oct | **CLI first, no UI.** `tsx extract.ts invoice.pdf` → validated JSON. Zod schema. Repair retry. JSONL log of tokens/cost/latency. 10 sample invoices collected.                                                                     |
| 2    | 1–7 Nov   | Next.js app: upload → Storage → extraction route → Postgres. Review queue UI with per-field confidence. Run the same 10 docs through `gpt-6-luna` and `gpt-6.1-sol`; write accuracy, latency and cost into the README. |
| 3    | 8–14 Nov  | Golden set: 30 documents with hand-written ground-truth JSON. Scoring script with normalised comparison (dates → ISO, amounts → integer cents, strings case-folded and whitespace-collapsed). Model fallback. CSV/XLSX export.     |
| 4    | 15–21 Nov | Deploy with demo mode. README (architecture, eval table, cost table). Case study for danielcolorado.dev. 90-second demo video. Write the Upwork offer.                                                                             |

**Week 1 rule: build the CLI before the UI.** The whole point is learning the model API; a Next.js route hides it behind too much plumbing.

---

## Evaluation — the part that makes this a portfolio piece

The eval suite is a table of `(document, field) → expected value`: 30 documents × ~12 fields ≈ 360 assertions, run with `npm run eval`.

**Metrics to track from week 3 on:**

- Field-level accuracy, normalised exact match — the headline number
- Per-field breakdown (expect `total`, dates and `lineItems` to be the worst; say so honestly in the README)
- Hallucinated-field rate: fields filled that do not appear in the document
- Schema validation failure rate, before and after the repair retry
- Escalation rate: share of documents needing the stronger model or a human
- Cost per document, p50/p95 latency

**Regression gate:** GitHub Action runs the suite on every PR and fails if headline accuracy drops more than 2 points below the committed baseline in `evals/baseline.json`.

Normalisation rules live in one place and are tested. A date comparison that fails because of `15/11/2026` vs `2026-11-15` is a bug in the scorer, not a model error — and conflating the two will make every number in the README wrong.

---

## Definition of done

Not done until all six exist:

1. Deployed URL with **demo mode** — sample documents preloaded, no login needed to browse, a recruiter can click through in 30 seconds
2. Public GitHub repo
3. README with architecture diagram, eval results table, and cost per document
4. Case study published on danielcolorado.dev
5. 90-second demo video: messy PDF in, flagged spreadsheet out
6. The eval suite green in CI with a committed baseline

Until it is deployed and live it stays in the "In the lab" section of my portfolio. Never describe it as finished before that.

---

## How I want you to work

- **Teach while building.** When you use something from my gap list (structured outputs, `generateObject`, PDF input, Zod schema design, retry strategy), explain the decision and the alternative you rejected. Two or three sentences, not a lecture.
- **Verify against the docs, don't guess.** API shapes, model IDs, pricing and SDK signatures change. Fetch the real page before writing code against it. Never invent a per-token price — read the pricing page.
- **Measure before claiming.** If you say a model is cheaper or more accurate, show the run. No "this should improve accuracy" without a number.
- Small commits, conventional commit messages, on a branch per task. Ask before pushing.
- Write the test alongside the code, not after. Vitest.
- If something in the plan is wrong or a week's scope will not fit in the hours, say so in one or two sentences and then keep building under a stated assumption. Don't stop and wait unless the answer changes what gets built.
- Don't add dependencies, services or abstraction layers I didn't ask for. If a Postgres table solves it, use a Postgres table.
- Ask me before: creating anything outside this repo, changing the Supabase schema in a destructive way, spending money, or publishing anything public.
- Spanish is fine in conversation; code, comments, commits and docs in English.

---

## Technical decisions already made

- **Next.js App Router**, TypeScript strict mode, Tailwind.
- **Model provider: OpenAI** (switched from Anthropic on 1 Nov 2026 by owner decision, before any model code existed).
- **Vercel AI SDK** with `@ai-sdk/openai`, which uses the Responses API by default. Primary model `gpt-6-luna`; escalation model `gpt-6.1-sol`. **Primary confirmed by measurement on 1 Nov 2026 (prompt 010):** on 10 synthetic docs × 3 reps, luna scored 99.7% field accuracy with 0 silent errors at $0.00042/doc, vs sol 98.6% with 0.12 silent errors/doc at $0.00924/doc (22×). Sol stays the escalation model on price tier; whether it rescues luna's failures is unmeasured until week 3. Prices read from the pricing page on 1 Nov 2026, standard tier per 1M tokens (input / cached input / output): `gpt-6-luna` $0.10 / $0.01 / $0.50, `gpt-6.1-sol` $2.00 / $0.10 / $10.00. Check current model IDs, prices and the SDK's API against the docs before coding — these move.
- **PDF input.** On vision-capable models the Responses API sends each PDF page as extracted text plus a page image, and both cost tokens. The limit is 50 MB per file and per request. Images go as `input_image`.
- **Zod** for every schema. The Zod schema is the single source of truth: it generates the model's output schema _and_ validates the response. Never two definitions that can drift.
- **Supabase** Postgres (schema `papertrail`) + Storage. Tables: `documents`, `extractions`, `extraction_fields` (field name, value, confidence, source_quote, corrected_value, corrected_at), `model_calls` (model, tokens in/out, cost, latency_ms, outcome).
- **SheetJS** for XLSX export.
- **Vitest** for unit tests; the eval script is a separate `npm run eval`, not a test — evals cost money and must not run on every save.
- Confidence threshold starts at **0.85**, tuned against the golden set in week 3, and the tuned value is justified in the README.

### Open questions to resolve as we go

- Does asking for per-field confidence in the same call degrade extraction accuracy? Measure it: one run with confidence fields, one without, compare on the golden set.
- Native structured outputs (`text.format` json_schema) vs a strict function-call schema — try both, keep the one that validates more reliably, document why. The AI SDK's OpenAI provider uses json_schema with `strictJsonSchema: true` by default, so the function-call variant must be built deliberately for the comparison to be real.
  - **Answered 1 Nov 2026 (prompt 006): strict forced function call is the default.** 66 runs, 10 synthetic invoices × 3 reps per mode, on `gpt-6-luna`. Both modes were 100% valid first try, with no repairs and no `needs_human`, so the run can't separate them on reliability. Function call won on the next rules: $0.00048 vs $0.00067 per doc (−28%) and p50 4.8 s vs 7.3 s, with fewer output tokens (759 vs 1,152) and no reasoning tokens. A rare-failure difference is still possible; recheck on the golden set. Data: `evals/runs/2026-11-01-modes.json`.
- How to handle multi-page invoices and line items that span pages.

---

## Reference docs

- Responses API reference — https://developers.openai.com/api/reference/resources/responses
- Migrating to the Responses API — https://developers.openai.com/api/docs/guides/migrate-to-responses
- Structured outputs — https://developers.openai.com/api/docs/guides/structured-outputs
- Function calling — https://developers.openai.com/api/docs/guides/function-calling
- PDF files — https://developers.openai.com/api/docs/guides/pdf-files
- Images and vision — https://developers.openai.com/api/docs/guides/images-vision
- Models — https://developers.openai.com/api/docs/models
- Pricing — https://developers.openai.com/api/docs/pricing
- Prompt engineering — https://developers.openai.com/api/docs/guides/prompt-engineering
- AI SDK structured data — https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data
- AI SDK OpenAI provider — https://ai-sdk.dev/providers/ai-sdk-providers/openai
- AI SDK generateObject in Next.js — https://ai-sdk.dev/cookbook/next/generate-object
- Zod — https://zod.dev
- OpenAI cookbook — https://cookbook.openai.com

Next.js version-specific rules (generated by create-next-app, kept current by `next dev`):
@AGENTS.md

---

## Commands

```
npm run dev          # Next.js dev server
npm run extract      # CLI: tsx scripts/extract.ts <path-to-pdf>
npm run test         # Vitest
npm run eval         # golden-set scoring, costs money, run deliberately
npm run eval:report  # regenerate the README results table
```

---

## Project log

Keep this current. Append one line per working session: date, what shipped, what the numbers were, what is next. This is the raw material for the case study, and reconstructing it in week 4 from memory will produce a worse case study than writing it down as we go.

- **2026-10-25** — Project context written. Nothing built yet. Next: Zod invoice schema and the extraction CLI.
- **2026-10-29** — AGENTS.md adapted to PaperTrail. Design system shipped: tokens (ink-blue primary, amber reserved for low confidence), Inter + Playfair Display + Geist Mono, UI primitives, FieldRow/DocumentStatus/DocumentCard, `/design-system` showcase, Vitest installed (10 tests). Week 1 CLI (due 31 Oct) not started with two days left — at risk; the buffer is already spent. Next: Zod invoice schema and the extraction CLI.
- **2026-10-29** — Landing page given colour (prompt 002): ink-blue ruled hero, a review preview with a real low-confidence row, the failure ladder in status colours, and a primary closing band. UI only, about an hour. Week 1 CLI is still not started, due 31 Oct. Next: Zod invoice schema and the extraction CLI.
- **2026-10-29** — Google sign-in added (prompt 003) after the owner moved it into scope, for paid actions only. Server-side PKCE via Supabase Auth: no browser Supabase client, a proxy that refreshes the session and never redirects, `requireUser()` ready for the week-2 upload and extract routes, and an open-redirect guard. 18 Vitest tests. Waiting on the dashboard steps (enable Google, redirect URLs, publishable key, env rename). Week 1 CLI is still not started, due 31 Oct, and is now at serious risk. Next: Zod invoice schema and the extraction CLI.
- **2026-10-31** — Google sign-in verified live: 1 Google user in `auth.users`, PKCE round-trip confirmed in the Supabase logs. Fixed a Cache Components `Date.now()` prerender error with `await io()` in `createClient()` before the Supabase client is created. The first attempt, before `getClaims()`, was too late and was caught by the owner. The owner should rotate the Supabase secret key and the Google client secret (both were pasted into chat). The week 1 CLI (due today, 31 Oct) is not started, so the week has slipped. Next: Zod invoice schema and the extraction CLI.
- **2026-11-01** — `/documents` shipped (prompt 004): papertrail schema + `documents` table + private bucket (additive migration), signed-URL upload straight to Storage for signed-in users (PDF/PNG/JPEG/WebP, 10 MB, 20/day counted from Storage), server re-checks size and type from Storage, list from Postgres. Publishable key verified locked out (42501). 30 Vitest tests. Two synthetic sample invoices added. Bugs found: swallowed prerender signal (`unstable_rethrow`), orphaned files on failed insert. Week 1 CLI is now a day overdue, and every week shifts unless week 2 absorbs it. Next: Zod invoice schema and the extraction CLI.
- **2026-11-01** — Model provider switched from Anthropic to OpenAI (owner decision), before any model code existed. Docs, env and models updated: `@ai-sdk/openai` on the Responses API, primary `gpt-6-luna` ($0.10/$0.50 per 1M), escalation `gpt-6.1-sol` ($2/$10), prices read 1 Nov. Learning goal #1 reframed: the OpenAI API itself was already familiar, so the new parts are the Responses API, PDF `input_file` and strict schemas. Next: Zod invoice schema and the extraction CLI (week 1 work, now overdue).
- **2026-11-01** — Week 1 items 1–4 shipped (prompt 005): Zod invoice schema with per-field `{value, confidence, sourceQuote}` (strict-mode compliance unit-tested), `extractInvoice` on `gpt-6-luna` via AI SDK v7 `Output.object` with one repair retry then `needs_human`, dated pricing table, `npm run extract` with a JSONL call log. 3 real runs on synthetic samples: 3/3 extracted first try, all values correct by eye, $0.00195 total ($0.00045–0.00078/doc, 8.6–12.5 s), prefix caching saved 1,796 tokens/call after the first. Confidence was 0.99 everywhere, so calibration is untested until harder samples exist. 50 Vitest tests. Next: 8 more synthetic samples including messy ones, then structured outputs vs strict function call (items 5–6).
- **2026-11-01** — Items 5–6 shipped (prompt 006): 8 hard synthetic samples (photo, fax, receipt scan, 2-page with 26 lines, Spanish/COP, negative discount, no due date, ambiguous O/0 and l/1), a strict forced `record_invoice` function-call mode, and `npm run compare:modes`. 66 runs for $0.03795: both modes 100% valid first try; function call is 28% cheaper ($0.00048/doc) and 34% faster at p50 (4.8 s), so it is now the default. Confidence finally moved: the ambiguous characters came back at 0.65–0.80, below 0.85. All other traps were read correctly by eye. Found: `null` fields sometimes come back at confidence 0 instead of 1, which would flag correctly empty fields. Prompt fix next. One unplanned $0.00072 call from npm swallowing a flag, now guarded. 54 Vitest tests. Week 1 is now complete, two days late. Next: confidence-on-null prompt fix, then week 2 (extraction route → Postgres, review queue, luna vs sol on 10 docs).
- **2026-11-01** — Confidence on absent fields fixed (prompt 007). The schema and prompt now define confidence on `null` as certainty of absence. 55 function-call runs for $0.02568: absent fields below 0.85 went from 4 to 0 (all 25 `null @ 1.0`). Still 100% valid first try. Quarry & Ash still flagged at 0.68–0.78. $0.00047/doc. Input tokens +15% from the longer field description, mostly cached. `compare:modes` gained `--mode` and null/stability stats. PR #9 also restores 3 prompt-006 commits that missed the PR #8 merge. 61 Vitest tests. Project spend so far $0.06704. Next: week 2: extraction route → Postgres, review queue, luna vs sol on the 10 docs.
- **2026-11-01** — Week 2 subtasks 1–3 shipped (prompt 008). An additive migration adds `extractions`, `extraction_fields` (`value` jsonb, correction columns ready), `model_calls` (the JSONL record shape) and `documents.extraction_started_at`, with service_role-only access. `POST /api/documents/[id]/extract`: uploader-only, a single conditional-UPDATE claim (checked live: two simultaneous claims → one run), a 6-min stale takeover, a global cap of 50/day counted from `model_calls`, and `maxDuration` 300 (the Hobby max). Pipeline is pure with an injected store. Live: Harbor Pine extracted through the real store, 20 fields, $0.00029, 4.8 s. 90 Vitest tests. Project spend $0.06733. Next: subtask 4 (Extract button), then the review screen.
- **2026-11-01** — Week 2 subtasks 4–6 shipped (prompt 009). An Extract button on cards. The `/documents/[id]` review screen: signed-URL preview beside the fields, amber rows with quotes, and cost/latency/model from `model_calls`. Corrections are one edit plus Save, stored in `corrected_*` with the original untouched, validated by the field's own Zod type, and revertible. Mark reviewed. Uploads are now private to their uploader (owner decision); samples are public and read-only. First public sample: Quarry & Ash, 2 of 24 fields flagged (0.78, 0.76), $0.00036. Checked in a browser at 1280 and 375 px; signed-in clicks still need the owner's session. 132 Vitest tests. Project spend $0.06769. Next: subtask 7 (queue order), then golden-set rules → luna vs sol.
- **2026-11-01** — Week 2 subtasks 7–9 shipped (prompt 010). `/review` queue: needs_human first, then the most to review, oldest first. Ground truth for the 10 synthetic docs (11 files), copied from the sources and checked against them in Vitest. `lib/normalize` (dates by the document's own order, cents, folded text). A scorer that splits caught from silent errors. `npm run eval` with a cost cap. **luna vs sol, 3 reps, $0.319:** luna 99.7% / 0 silent / $0.00042 per doc, sol 98.6% / 0.12 silent / $0.00924. Luna stays primary; sol at the demo cap would cost ≈$13.9/month. Sol's errors are mostly `currency: null` on `$`-only docs, arguably stricter than our golden set, so that's a new open rule. These 10 docs are near luna's ceiling, so week 3 needs harder ones. 196 Vitest tests. Project spend $0.39323. Next: subtask 10 (README results table), then week 3.
- **2026-11-01** — Week 3 item 1 shipped (prompt 011, week 2's subtask 10 carried over). The boilerplate README is replaced with a short project README marked "in the lab". The results tables come from `npm run eval:report`, which renders a marked block from the run file named in the marker; `--check` exits 1 when the README drifts from its run (ready for the CI gate). New run files record `pricesReadOn`. 204 Vitest tests. $0. Next: week 3 item 2 (the `$`-only currency rule and the plan for 19 harder documents).
