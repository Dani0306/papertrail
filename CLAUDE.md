# PaperTrail — project context

Invoices and PDFs in, clean spreadsheet rows out, with every uncertain field flagged for a human instead of guessed.

This is **Project 1 of 6** in a learning-through-projects roadmap toward an AI engineer role. It is a real portfolio project _and_ a deliberate skill-building exercise. Both matter: shortcuts that ship faster but skip the learning defeat the purpose.

---

## Who I am

Daniel Colorado — full stack developer in Medellín, Colombia (UTC−5). Software Engineering student at IUE (2022–2027). Working full time as a Back Office Agent at Third Way Health, managing patient prescription workflows. Native Spanish, C1 English. Portfolio: danielcolorado.dev · GitHub: github.com/Dani0306

**Already fluent, don't explain these to me:** TypeScript, React, Next.js, Tailwind, Node, Express, MongoDB, Supabase (Postgres, auth, storage, RLS, Edge Functions, pg_cron), Vercel, Git, GitHub Actions, Vitest, Playwright, OpenAI API in production, hand-parsed JSON output, agentic development with Claude Code.

**What this project is teaching me (go slow and explain these):**

1. Anthropic Messages API directly — I have only used the OpenAI API before
2. Native structured outputs vs tool-call-based JSON, and when each fails
3. Zod-validated model output instead of hand-parsing JSON
4. Vercel AI SDK (`generateObject`) — new to me
5. PDF and image input to a model
6. Choosing a model by measured cost/latency/quality rather than vibes
7. Per-call token, cost and latency logging; retry and fallback strategy
8. My first labelled test set and scoring script

---

## Hard constraints

- **Time:** 24 h/week, around a full-time job and university. Two weekday evenings (3 h each) + 9 h Saturday + 9 h Sunday. Plan work in blocks that fit that shape.
- **Budget:** under $20/month across _all six_ roadmap projects. This one must stay at **$2–4/month**. Free tiers only for hosting. Haiku-class model by default.
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
| 2    | 1–7 Nov   | Next.js app: upload → Storage → extraction route → Postgres. Review queue UI with per-field confidence. Run the same 10 docs through `claude-haiku-5-5` and `claude-sonnet-5-5`; write accuracy, latency and cost into the README. |
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
- **Vercel AI SDK** with `@ai-sdk/anthropic`. Primary model `claude-haiku-5-5`; escalation model `claude-sonnet-5-5`. Check current model IDs and the SDK's current API against the docs before coding — these move.
- **Zod** for every schema. The Zod schema is the single source of truth: it generates the model's output schema _and_ validates the response. Never two definitions that can drift.
- **Supabase** Postgres (schema `papertrail`) + Storage. Tables: `documents`, `extractions`, `extraction_fields` (field name, value, confidence, source_quote, corrected_value, corrected_at), `model_calls` (model, tokens in/out, cost, latency_ms, outcome).
- **SheetJS** for XLSX export.
- **Vitest** for unit tests; the eval script is a separate `npm run eval`, not a test — evals cost money and must not run on every save.
- Confidence threshold starts at **0.85**, tuned against the golden set in week 3, and the tuned value is justified in the README.

### Open questions to resolve as we go

- Does asking for per-field confidence in the same call degrade extraction accuracy? Measure it: one run with confidence fields, one without, compare on the golden set.
- Native structured outputs vs a tool-call schema — try both in week 1, keep the one that validates more reliably, document why.
- How to handle multi-page invoices and line items that span pages.

---

## Reference docs

- Messages API — https://platform.claude.com/docs/en/api/messages
- Structured outputs — https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- Tool use overview — https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
- PDF support — https://platform.claude.com/docs/en/build-with-claude/pdf-support
- Models overview — https://platform.claude.com/docs/en/models/overview
- Pricing — https://platform.claude.com/docs/en/about-claude/pricing
- Count tokens — https://platform.claude.com/docs/en/api/messages/count_tokens
- Prompt engineering — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview
- AI SDK structured data — https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data
- AI SDK Anthropic provider — https://ai-sdk.dev/providers/ai-sdk-providers/anthropic
- AI SDK generateObject in Next.js — https://ai-sdk.dev/cookbook/next/generate-object
- Zod — https://zod.dev
- Anthropic cookbook — https://github.com/anthropics/anthropic-cookbook

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
