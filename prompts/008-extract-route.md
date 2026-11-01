# 008 — Extraction in the app: tables, persistence, extract route

**Status:** done
**Branch:** `feat/extract-route`
**Week:** 2, subtasks 1–3 (1–7 Nov)

## Goal

A signed-in user can `POST /api/documents/<id>/extract` on a document they uploaded. The server reads the file from Storage, runs the same `extractInvoice` the CLI uses, and writes everything to Postgres:
- one `extractions` row with the validated JSON;
- one `extraction_fields` row per field;
- one `model_calls` row per model call.

The document's status ends as `extracted` or `needs_human`, or goes back to `uploaded` if the model API failed. There's no UI yet; the Extract button is subtask 4.

## Docs read (1 Nov 2026)

- **Next.js 16, `route.md`.** `context.params` is a promise. `RouteContext<'/api/documents/[id]/extract'>` types it. A POST handler is always dynamic.
- **Next.js 16, route segment config.** `export const maxDuration = <number>` is still supported with Cache Components. `dynamic`, `revalidate` and `fetchCache` are gone under Cache Components, and we use none of them.
- **Vercel, *Configuring maximum duration*** (page updated 24 Aug 2026). With fluid compute, which is the default, Hobby is **300 s default and 300 s maximum**. The App Router sets it with a named `maxDuration` export. Time spent waiting on I/O doesn't bill active CPU.
- **Supabase Postgres best practices (skill).**
  - Index every foreign key.
  - Use `timestamptz`, `text`, and `numeric` for money.
  - Use `bigint generated always as identity` for high-volume keys.
  - Use a partial index for a hot filtered count.
- **Already verified in prompts 004–007, not re-fetched:** Storage `download()`, service-role grants, and the AI SDK file part.

## Code inspected

- `supabase/migrations/20261031120000_documents.sql`:
  - `documents` has six statuses and grants to `service_role` only, with RLS on and no policies.
  - There is no `extraction_started_at`, so a run killed by a timeout would leave a document stuck in `extracting`.
- `lib/db/documents.ts`:
  - `registerDocument` shows the house pattern: a typed result union, and compensating cleanup when a later step fails.
  - `dailyUploadCap()` reads an env cap.
- `lib/db/types.ts`: kept by hand in the generator's format, because the MCP generator only emits `public`.
- `lib/extract/extract.ts`: `extractInvoice(file, { onCall })` is already pure, and the route only needs to give it an `onCall` that writes `model_calls`. The result is `extracted`, `needs_human` or `failed`.
- `lib/extract/types.ts`: `ModelCallRecord` is the shape `model_calls` must match ("same record shape for both").
- `lib/schema/invoice.ts`: `flattenFields()` already produces `lineItems[2].qty` names.
- `app/api/documents/route.ts`: the route style, with `requireUser`, Zod parsing, a failure → HTTP map, and a generic 500.
- `lib/db/client.ts` imports `server-only` and `next/cache`, so nothing that imports it can run under Vitest.

## Decisions and assumptions

**Tables** (one additive migration; nothing existing is altered except one new nullable column):
- **`extractions`.** One row per **successful** run.
  - Columns: `id uuid`, `document_id` (references `documents`, on delete cascade), `model`, `mode`, `invoice jsonb` (the validated JSON as returned) and `created_at`.
- **`extraction_fields`.** One row per field of an extraction.
  - Key: `bigint identity`.
  - Columns: `extraction_id` (cascade), `position` (the order on the invoice), `field_name`, `value jsonb`, `confidence double precision` (checked 0–1), `source_quote`, `corrected_value jsonb`, `corrected_at timestamptz`.
  - `unique (extraction_id, field_name)`.
  - **`value` is `jsonb`, not `text`**, so `1229.97` stays a number and `"000482"` stays a string. The correction route (subtask 6) validates against the field's Zod type. SQL `NULL` means absent.
  - The correction columns arrive now, so subtask 6 needs no migration.
- **`model_calls`.** One row per model call, whatever the outcome.
  - Key: `bigint identity`.
  - The columns mirror `ModelCallRecord`: `document_id` (nullable, on delete set null, because CLI runs have no document), `file_name`, `model`, `mode`, `attempt`, `outcome` (the 5 values from AGENTS.md), the 4 token counts, `cost_usd numeric(12,8)`, `latency_ms`, `error` and `created_at` (taken from `record.at`).
- **`documents.extraction_started_at timestamptz` (new, nullable).** Lets a run killed mid-way be retried later.
- Indexes:
  - every foreign key;
  - `model_calls (created_at) where attempt = 1` for the daily cap count.
- RLS is on, there are no policies, and only `service_role` gets grants, the same as `documents`.

**Who can extract what:**
- **Only the uploader, and only from `uploaded`.** Anything else is rejected without a model call:
  - another user's document → 403;
  - a missing document → 404;
  - `extracting`, `extracted`, `needs_human` or `reviewed` → 409.
- Preloaded demo samples (`uploaded_by` is null) can't be triggered from the web; they'll be seeded by a script.
- `needs_human` is the human's turn, not a retry. Re-running it would be the escalation ladder, which is week 3.

**No double spend:**
- The claim is **one conditional UPDATE**: `status = 'extracting'` where the id and uploader match and the status is `uploaded`, or the status is `extracting` but has been stale for more than 6 minutes.
- A double click or two tabs get exactly one claim; the other gets 409.
- Rejected: read-then-write in TypeScript, because two requests can both read `uploaded`.
- Rejected: a Postgres lock or SKIP LOCKED queue, because a single-row conditional update is all a request-driven click needs.

**Time limit:**
- `export const maxDuration = 300` (the Hobby maximum).
- The worst case is 2 attempts, each with up to 2 SDK transient retries. The slowest single call measured so far was 26.5 s, so 6 × 26.5 s ≈ 160 s. 300 s covers it with room to spare, and with fluid compute the waiting doesn't bill CPU.
- The stale-claim window is 6 minutes, longer than `maxDuration`, so a live run is never reclaimed.

**Daily cap:**
- `PAPERTRAIL_DAILY_EXTRACTION_CAP` (default 50), **global**, counted as `model_calls` rows with `attempt = 1` since 00:00 UTC. Every run, including an API error, writes exactly one such row.
- **Assumption: global, not per user.** It is the budget guard: 50 × $0.00048 ≈ $0.72/month at worst on luna. A per-user cap doesn't bound spend when anyone can sign in with Google. If you'd rather have per-user, it's one filter and a `requested_by` column.
- It's a soft cap: two requests at the same instant can both pass at 49. The cap is about budget, not exact counts.

**Status after the run:**

| Result | Document status | Saved | HTTP |
|---|---|---|---|
| `extracted` | `extracted` | `extractions` + `extraction_fields` + `model_calls` | 200 `{ status, extractionId, flaggedFields }` |
| `needs_human` | `needs_human` | `model_calls` | 200 `{ status, reason }` |
| `failed` (model API error) | back to `uploaded`, so it can be retried | `model_calls` (`api_error`) | 502 |
| our error (download or save failed) | back to `uploaded` | whatever was written | 500 |

**Saving:**
- Insert the extraction, then its fields. If the fields fail, delete the extraction (cascade) and rethrow, the same compensation pattern as `registerDocument`.
- Rejected: a plpgsql RPC for an atomic save. It's more SQL to maintain and isn't unit-testable here. A crash between the two inserts is already covered by the stale claim plus the compensation.

**`model_calls` writes:**
- Each row is written from `onCall`, **as each call ends**, not in a batch at the end. If the function dies during the repair attempt, the first call's cost is already recorded.
- A failed log insert is reported with `console.error` and doesn't fail the extraction. Losing a log row is better than losing a paid result.

**Structure:**
- `lib/extract` stays free of Supabase.
- `lib/db/extractions.ts` holds the server-only Supabase calls.
- `lib/pipeline/extract-document.ts` holds the orchestration as a pure function that takes a `store` (claim, download, logCall, save, setStatus, countRunsToday). Vitest runs it against an in-memory fake store and a mock model, so the whole flow is tested without a network call.
- The route stays thin: auth, a Zod uuid, a call to the pipeline, and the HTTP mapping.

**Types:** `lib/db/types.ts` gets the three tables and the new column by hand, then is checked against `information_schema.columns`.

## What this teaches

**Per-call cost logging in Postgres, and protecting a paid action** (gap list #7: logging, retry and budget):
- **The log row is written as each call ends,** so the money trail survives a crash. Writing once at the end of the run would lose the cost of a run that died during its repair.
- **The cap reads the same log.** One table answers both "what did this cost?" and "may I spend more today?". The alternative was a separate counter table that can drift from what was actually logged.
- **The conditional UPDATE claim** makes a double click cost one extraction, not two.

## Files to touch

- `supabase/migrations/20261101120000_extractions.sql`: create.
- `lib/db/types.ts`: edit.
- `lib/db/extractions.ts`: create (server-only store).
- `lib/pipeline/extract-document.ts` and `.test.ts`: create.
- `app/api/documents/[id]/extract/route.ts`: create.
- `lib/document-status.ts`: edit, to note which statuses allow extraction.
- `.env.example`: edit, to comment the cap's scope.
- `CLAUDE.md`, and this file's Results section: edit.

## Requirements

1. Apply the migration to the lab project's `papertrail` schema only. Check that the grants work: the publishable key is denied, the secret key works.
2. A POST to `/api/documents/<id>/extract` gives:
   - 401 when signed out;
   - 400 for a non-uuid id;
   - 404, 403 or 409 as above;
   - 429 at the cap;
   - 200, 502 or 500 as in the table.
3. A double POST makes exactly one model run.
4. Every model call lands in `model_calls` with the same values the CLI would write to JSONL.
5. A successful run writes 1 extraction and N fields, where N = `flattenFields(invoice).length`.
6. The status is never left at `extracting` by a handled path.
7. `npm test` never calls the model or the network.

## Security and data safety

- The OpenAI key and the Supabase secret key stay on the server. The route runs only on the server, and `lib/db` is `server-only`.
- The browser triggers the run but never writes to Postgres or calls the model itself.
- Only signed-in uploaders can spend money, and there's a global daily cap.
- The migration touches only the `papertrail` schema. `documents` only gains a nullable column, which is not destructive.
- The test data is the synthetic samples only.

## Cost impact

- `npm test`: $0.
- Live check: 1–2 real extractions through the route on a synthetic sample, about $0.0005 each. **About $0.001 total.**
- In production, each extraction costs about $0.00048, and the cap bounds the worst case at 50 a day.

## Acceptance criteria

- [x] The migration is applied. The tables, indexes, RLS and grants match the plan. `lib/db/types.ts` matches `information_schema`. Supabase advisors show no new security warnings.
- [x] Pipeline tests, using a fake store and the mock model, cover:
  - a successful save of the fields and every call;
  - `needs_human`;
  - an API error returning the document to `uploaded`;
  - a double claim making only one run;
  - a cap of 429 with no model call;
  - wrong owner, missing document and wrong status;
  - a failed save rolling the document back to `uploaded`;
  - a failed log insert not failing the run.
- [x] Route: signed out → 401, bad id → 400. Checked with real requests against `next start`.
- [x] Live: one real extraction of a synthetic sample, end to end through the route, writing the expected rows. The cost is reported.
- [x] tsc, lint, test and build pass. Results and the CLAUDE.md log line are written.

## Checks

- `npx tsc --noEmit`
- `npm run lint`
- `npm run test`
- `npm run build`
- One live extraction through the route, with the row counts checked by SQL.

## Manual test steps

1. `npm run dev` and sign in with Google at `/`.
2. Upload `samples/synthetic-harbor-pine-inv-2041.pdf` at `/documents`.
3. Copy its id. In the devtools console, run `fetch('/api/documents/<id>/extract', { method: 'POST' }).then(r => r.json()).then(console.log)`. Expect `{ status: "extracted", flaggedFields: 0, ... }` after about 5 s.
4. Run the same `fetch` again. Expect 409, because it's already extracted.
5. Reload `/documents`. The card shows Extracted.

## Results

**Migration** `extractions` was applied to the lab project on 1 Nov 2026 (version `20261101014204`) and checked:
- **Columns:** all of them, plus the new `documents.extraction_started_at`, match `information_schema`. `lib/db/types.ts` was updated to match, including the foreign-key names.
- **Indexes:** every foreign key is indexed, and there's the partial `model_calls (created_at) where attempt = 1` for the cap.
- **Access:** RLS is on with 0 policies, and `service_role` is the only role with grants on all 4 tables.
- **Advisors:** only the expected "RLS enabled, no policy" note, the same as `documents`, by design. The project-wide "leaked password protection" warning was already there and doesn't apply, because we don't use password sign-in.

**Live run** (real store, real model). The script ran outside Next with `server-only` stubbed through `NODE_PATH`; nothing was added to the repo:

| Check | Result |
|---|---|
| Claim a random id | `missing` |
| Claim as another user | `forbidden` |
| **Two simultaneous claims on the real database** | **one `claimed`, one `busy`** |
| Fresh claim while `extracting` | `busy` |
| Claim 7 min old (a run the timeout killed) | taken over |
| Extract `synthetic-harbor-pine-inv-2041.pdf` | `extracted`, 20 fields, 0 flagged, **$0.00028519**, 4.75 s, 2,399 of 2,531 input tokens cached |
| Second run on the same document | `busy` (no model call) |
| Cap set to today's count | `cap` (no model call) |

The rows were checked by SQL:
- 1 `extractions` row, and 20 `extraction_fields`: 8 scalars plus 3 line items × 4.
- `total` is stored as a JSON **number** (1284.5). The values match `samples/README.md`: INV-2041, due 13/11/2026, 1,284.50.
- 1 `model_calls` row (attempt 1, `ok`, `gpt-6-luna`, `function_call`, 2,531/2,399/496 tokens, $0.00028519, 4,750 ms), the same values the CLI writes to JSONL.
- The document's status is `extracted`.

**Route against `next start`:**
- signed-out POST with a real id → 401;
- signed-out POST with a bad id → 401, because auth comes first and an anonymous caller learns nothing;
- GET → 405.

The 400 and every result → HTTP mapping are covered by `route.test.ts`, with auth and the store mocked. A real signed-in request is in the manual steps; it needs your Google session.

**Tests:** 90 pass, up from 61.
- 17 pipeline tests: success, needs_human, API error, the double claim, the cap, wrong owner, missing document, wrong status, stale takeover, save failure and log failure.
- 10 route tests.
- 2 for the new `confidenceThreshold()`.

tsc, lint and the build pass.

**Left in place on purpose:**
- The live-check document (`34839a19-…`, Harbor Pine, `extracted`) belongs to your account and shows on `/documents`. It's real extracted data for building the review screen (subtask 5).
- It counts as 1 of today's 20 uploads, and its run counts as 1 of today's 50 extractions.

**Noticed:** there are now 2 users in `auth.users`. The only document uploads came from one account. Probably a second Google account of yours; it's worth a look.

**Spend:** this prompt $0.00028519. Project total $0.06733.
