# 005 — Invoice schema, extraction CLI, repair retry, JSONL call log

**Status:** done. Week 1 items 1–4, verified with 3 real runs on 1 Nov.
**Branch:** `feat/extract-cli` (from `main`, which has PRs #1–#6 merged)
**Week:** 1, now overdue (it was due 31 Oct). This covers week 1 items 1–4. Items 5 (eight more samples) and 6 (structured outputs vs function call) come next.

## Goal

`npm run extract samples/<file>` sends a PDF or image to `gpt-6-luna`. It prints a Zod-validated invoice in which every field carries `{ value, confidence, sourceQuote }`. If validation fails, it makes one repair attempt with the Zod errors fed back. If that also fails, the result is `needs_human`. Every model call appends one line to `logs/model-calls.jsonl` with model, tokens, cost, latency and outcome.

## Docs read (1 Nov 2026)

- **AI SDK, *Generating structured data*.** In v7, structured output is `generateText({ output: Output.object({ schema }) })`, and the Zod schema is passed directly. On a schema failure the SDK throws `NoObjectGeneratedError`, which carries `text`, `response`, `usage`, `cause` and `finishReason`. The types in `ai@7.0.159` confirm this.
- **AI SDK, OpenAI provider.**
  - `openai(id)` uses the **Responses API**.
  - PDFs go in as `{ type: "file", data, mediaType: "application/pdf", filename }`. Images go in as a `file` part with an image media type.
  - `providerOptions.openai`: `strictJsonSchema` defaults to `true`, and `reasoningEffort` defaults to `medium`. `store` defaults to `true`.
  - For GPT-6 models the provider drops `temperature`.
- **`ai@7.0.159` `LanguageModelUsage`.**
  - `inputTokens`, plus `inputTokenDetails.{noCacheTokens, cacheReadTokens, cacheWriteTokens}`.
  - `outputTokens`, plus `outputTokenDetails.{textTokens, reasoningTokens}`.
  - `ai/test` exports `MockLanguageModelV4`.
- **OpenAI, *Structured outputs*.**
  - The root must be an object.
  - Every property must be in `required`, with `additionalProperties: false`.
  - An optional value is a union with `null`.
  - Supported keywords include `minimum`/`maximum` and string `pattern`. `allOf`/`not`/`if` are not supported, so custom refinements can't be expressed and are checked only after the call.
  - Check for a `refusal` part.
- **OpenAI, *PDF files*.**
  - On vision models, each page is sent as extracted text plus a page image.
  - `detail: auto` means `high` for GPT-5.6 and later.
  - The limit is 50 MB per file and per request.
- **OpenAI, *Pricing*** (standard tier, per 1M tokens: input / cached input / output):
  - `gpt-6-luna`: $0.10 / $0.01 / $0.50
  - `gpt-6.1-sol`: $2.00 / $0.10 / $10.00
- **npm, 1 Nov:** `ai` 7.0.159, `@ai-sdk/openai` 4.0.106, `tsx` 4.23.15. Zod 4.6.7 is already installed and meets the SDK's peer range (`^3.25.76 || ^4.1.8`).

## Code inspected

- `lib/uploads.ts`: `ALLOWED_UPLOAD_TYPES` and `MAX_UPLOAD_BYTES` (10 MB). The CLI reuses them so it accepts exactly what the app accepts.
- `lib/document-status.ts`: the ladder ends in `extracted`, `escalated` or `needs_human`.
- `.env.local`: `OPENAI_API_KEY` is present. I checked the name and prefix only, not the value.
- `.gitignore`: `.env*` is ignored. Nothing ignores a `logs/` folder yet.
- `samples/`: two synthetic invoices, Harbor & Pine (USD, plain) and Cobalt Ridge (EUR, with distractors).

## Decisions and assumptions

- **One Zod schema, two jobs.** `lib/schema/invoice.ts` is the source the SDK turns into OpenAI's strict JSON schema, and the same schema validates the reply. Types come from `z.infer`, so there's no parallel JSON Schema or hand-written type.
- **Every field is `{ value, confidence, sourceQuote }`.**
  - `value` and `sourceQuote` are `.nullable()`, never `.optional()`, so the model must say "absent" explicitly.
  - `confidence` is `0..1`, sent as `minimum`/`maximum`, which strict mode supports.
- **Dates come back as printed** (strings). They become ISO in `lib/normalize` in week 3.
- **Amounts and quantities come back as numbers.** The model turns "€1.229,97" into `1229.97`. Reading number formats is the model's job, while the exact printed text stays in `sourceQuote` as evidence. Integer cents happen in code when comparing and exporting (week 3).
- **Currency** is an ISO 4217 code (`pattern: ^[A-Z]{3}$`). The quote keeps the printed symbol. This identifies the printed currency; it doesn't convert anything.
- **Refinements that only Zod enforces** (these are why repair exists, even under strict mode):
  - A non-null `value` needs a non-empty `sourceQuote`: no evidence, no value.
  - A null `value` must have a null `sourceQuote`.
- **Failure ladder, this task's part:**
  1. Attempt 1 on `gpt-6-luna`.
  2. If validation fails, attempt 2 resends the same conversation plus the model's previous output and the list of Zod issues.
  3. If that still fails, the result is `needs_human`.
  - Escalation to `gpt-6.1-sol` slots in between steps 2 and 3 in week 3 ("Model fallback"). The result type already has `escalated` reserved.
- **API errors are not a ladder step.** The SDK's own transient retries are kept (`maxRetries: 2`). A call that still fails is logged as `api_error` and the CLI exits non-zero. A broken API isn't a reason to send a document to a human.
- **`reasoningEffort: "low"`.** This is an assumption: extraction is reading, not reasoning, and reasoning tokens are billed as output. `reasoningTokens` is logged on every call so we can measure it instead of guessing. The week 2 model comparison revisits the setting.
- **`store: false`.** OpenAI doesn't keep the documents or responses. The samples are synthetic anyway, but there's no reason to retain them.
- **Logging.**
  - One record type, `ModelCallRecord`, lives in `lib/extract`. The CLI appends it to `logs/model-calls.jsonl` (gitignored), and the app will write the same shape to `model_calls` in week 2.
  - The record holds: model, attempt, outcome (`ok`, `validation_error`, `api_error`, `repaired`), input, cached-input, output and reasoning tokens, cost_usd, latency_ms, file name and timestamp.
- **Cost** is `noCache × input + cacheRead × cached + output × output` from `lib/cost` (a pricing table with source URL and read date). An unknown model throws instead of guessing a price.
- **No Next.js or Supabase imports in `lib/extract`.** It runs the same from the CLI, the future route and the eval script. The logger is passed in.

## What this teaches

- **`Output.object` (strict json_schema) as the first approach.** The SDK sends the Zod schema as OpenAI `text.format` json_schema with `strict: true`, so the model is constrained to the structure while it generates. Rejected for now: a strict function tool as the transport. It's the other half of open question #2 and gets built as a second mode in item 6, so the two can be measured on the same samples.
- **Why strict output still needs validation.** Strict mode guarantees shape, not truth. "A value needs evidence" can't be expressed in strict JSON Schema, so Zod checks it after the call. That is the failure the repair retry exists for.
- **Repair = the previous output plus the exact Zod issues, in the same conversation.** Rejected: re-running the identical prompt, which tends to repeat the same mistake, and dropping the document to save tokens, which leaves the model unable to fix a missing quote. OpenAI caches repeated prompt prefixes automatically, so the resent PDF should mostly bill at the cached rate. The log's `cachedInputTokens` will show whether it does.
- **Cost from real usage.** Tokens are read from the SDK result, and from the error on a failed attempt, never estimated. Reasoning tokens are part of output and billed at the output rate.

## Files to touch

- `package.json`: edit.
  - Add `ai@7.0.159` and `@ai-sdk/openai@4.0.106` (the planned stack), and `tsx@4.23.15` as a dev dependency.
  - Add the script `"extract": "node --env-file=.env.local --import tsx scripts/extract.ts"`.
- `.gitignore`: edit. Add `/logs`.
- `lib/schema/invoice.ts`: create. `evidenceField()`, `LineItem`, `Invoice`, `INVOICE_FIELDS`, and the refinements.
- `lib/schema/invoice.test.ts`: create.
- `lib/models.ts`: create. `primaryModel()` and `escalationModel()` from env, defaulting to `gpt-6-luna` / `gpt-6.1-sol`. This is the only place model IDs live.
- `lib/cost/pricing.ts`: create. The price table (source URL, read 1 Nov 2026) and `callCostUsd(model, usage)`.
- `lib/cost/pricing.test.ts`: create.
- `lib/extract/prompt.ts`: create. System instructions: evidence rules, null-when-absent, how to rate confidence, ignore stamps and PO numbers when reading the invoice number.
- `lib/extract/types.ts`: create. `ModelCallRecord`, `ExtractionResult`, `InvoiceFile`.
- `lib/extract/extract.ts`: create. `extractInvoice(file, { model, onCall })` runs attempt → repair → `needs_human`.
- `lib/extract/extract.test.ts`: create. The ladder against `MockLanguageModelV4`: ok on the first try, repaired, still invalid → `needs_human`, and an API error.
- `lib/extract/jsonl.ts`: create. `appendJsonl(path, record)`.
- `scripts/extract.ts`: create. The CLI:
  - Args: `<file> [--model <id>]`.
  - Checks the extension, type and size with the upload rules.
  - Prints the result JSON to stdout and a one-line summary to stderr (attempts, tokens, cost, latency, outcome).
  - Exit codes: `0` extracted, `2` needs_human, `1` error.
- `CLAUDE.md`: edit. Add a log line.

## Requirements

1. The Zod schema is the only definition: no hand-written JSON Schema and no duplicate TypeScript type.
2. Every field `value` and `sourceQuote` is `.nullable()`. Nothing is `.optional()`.
3. At most 2 model calls per document in this task, and each one writes exactly one log record, whatever the outcome.
4. `npm test` never calls the model. The ladder tests use `MockLanguageModelV4`.
5. `OPENAI_API_KEY` is read only from the environment and is never printed or logged.
6. Unknown model ID → `callCostUsd` throws instead of guessing.
7. The CLI refuses files the upload box would refuse (type, 10 MB) before any model call.
8. Partial data never comes back as success. The result is either a fully validated invoice or `needs_human` with the reason.

## Security and data safety

- Only the synthetic samples in `samples/` are run. They are invented and footed "synthetic".
- `store: false`, so OpenAI doesn't retain the requests.
- The key stays in `.env.local` and is loaded with `--env-file`. `logs/` is gitignored, and the log holds metadata only (no document content).

## Cost impact

- **Unit tests:** $0. Mocked.
- **Manual runs:** 3, one each for Harbor & Pine PDF, Cobalt Ridge PDF and Cobalt Ridge PNG. Each is roughly 2–4k input tokens (page text plus a high-detail page image) and 1.5–3k output tokens with low reasoning.
  - Per run: about **$0.001–0.002** (3k × $0.10/M + 2.5k × $0.50/M ≈ $0.0016).
  - All three: under **$0.01**. The exact figures come from the log and go into Results.

## Acceptance criteria

- [ ] `npm run extract samples/synthetic-cobalt-ridge-inv-0587.pdf` prints a validated invoice with vendor "Cobalt Ridge Print Co.", invoice number "CR-2026-0587", currency "EUR", 4 line items and total 1229.97. Every non-null value has a quote.
- [ ] Each call appends one JSONL line with tokens, cost, latency and outcome.
- [ ] The repair path is proven with the mock (invalid → repaired) and `needs_human` with the mock (invalid twice).
- [ ] A `.txt` file or a file over 10 MB is refused before any model call. A missing key gives a clear message.
- [ ] tsc, lint, test and build pass.

## Checks

- `npx tsc --noEmit`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run extract` on the 3 samples, reporting tokens and cost from the log.

## Manual test steps

1. `npm install`
2. `npm run extract samples/synthetic-cobalt-ridge-inv-0587.pdf`. JSON prints to stdout, followed by a summary line such as `extracted · 1 attempt · 3,1k in / 2,0k out · $0.0016 · 4.2 s`.
3. `npm run extract samples/synthetic-cobalt-ridge-inv-0587.png`. This exercises the image path.
4. `tail -n 3 logs/model-calls.jsonl` shows one record per call.
5. `npm run extract package.json` is refused: "Only PDF, PNG, JPEG or WebP files can be uploaded."

## Results

**Real runs.** `gpt-6-luna`, `reasoningEffort: low`, 1 Nov. Figures are from `logs/model-calls.jsonl`.

| Sample | Outcome | Attempts | Input (cached) | Output (reasoning) | Cost | Latency |
|---|---|---|---|---|---|---|
| Cobalt Ridge PDF | ok | 1 | 2,262 (0) | 1,102 (114) | $0.00078 | 12.5 s |
| Cobalt Ridge PNG | ok | 1 | 4,228 (1,796) | 936 (0) | $0.00073 | 9.2 s |
| Harbor & Pine PDF | ok | 1 | 2,034 (1,796) | 807 (0) | $0.00045 | 8.6 s |
| **Total** | 3/3 extracted | 3 calls | | | **$0.00195** | |

- **Accuracy (by eye, three easy synthetic docs, so not a measurement):** every value is correct on all three.
  - Cobalt Ridge: the invoice number is right, not PO-77341, and the issue date is right, not the "RECEIVED 30 OCT" stamp.
  - On both invoices the line totals sum to the subtotal, and subtotal plus tax equals the total.
- **Cost came in under the estimate** (estimated $0.0016 per run; actual $0.00045–0.00078).
  - From the second call on, 1,796 input tokens were billed at the cached rate. That is OpenAI's automatic prefix caching of the system prompt plus the schema, which repeat on every call.
  - The PNG costs more input tokens than the PDF (4,228 vs 2,262), because without a text layer the page is read as a high-detail image.
- **Reasoning:** at `low`, reasoning was 114 tokens on the first call and 0 on the next two, so it is not a cost driver. The setting stays as is until the week 2 comparison.
- **Repair path:** proven with the mock (invalid → repaired, invalid twice → `needs_human`, broken JSON → repair). It wasn't triggered by the real runs, because all three passed validation first time.
- **Findings for the golden set and week 3:**
  1. **Confidence is 0.99 on every field.** These are clean documents, so that may be honest, but it says nothing about calibration yet. The 8 remaining samples should include hard cases (a blurred phone photo, O/0 and l/1 confusions, a missing due date, a two-page invoice) so the threshold has something to separate.
  2. **The PDF and the PNG give different line descriptions.** The PDF run includes the grey sub-line ("…soft-touch\nBox of 500, double-sided"); the PNG run returns only the main line. The ground truth needs a rule, and I suggest the main line only, with whitespace collapsed by `lib/normalize`.
  3. **Vendor name.** The model chose the legal name "Cobalt Ridge Print Co. S.L." over the header "Cobalt Ridge Print Co.". This also needs a ground-truth rule, for example a list of accepted values per field.
  4. **Quotes include labels** ("Issue date: 14/10/2026", "Subtotal (USD)   1,148.50"). The value is still clean. Acceptable as evidence.
- **Deviations from the plan:**
  - `package.json` has no `"type": "module"`, so tsx loads scripts as CommonJS (no top-level `await`). The CLI wraps its work in `main()`.
  - The strict-mode check became a permanent unit test. It asserts that every object in the generated JSON schema has all its properties in `required` plus `additionalProperties: false`, and that no unsupported keywords appear.
- **Checks:** tsc, lint, 50 Vitest tests (20 new: schema 8, cost 5, extract 7) and build all pass. The refusals (wrong type, missing file, no argument, missing key) all exit before any model call.
