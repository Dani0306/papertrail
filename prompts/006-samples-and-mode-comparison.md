# 006 — Eight more samples, and structured outputs vs strict function call

**Status:** draft
**Branch:** `feat/extract-modes` (stacked on `feat/extract-cli`, which isn't pushed yet)
**Week:** 1 items 5–6, overdue. This finishes week 1.

## Goal

1. `samples/` holds 10 synthetic invoices. The 8 new ones are deliberately hard: a phone photo, a fax, a receipt, two pages, Spanish with Colombian number formats, ambiguous characters, a missing field, and a discount line. `samples/README.md` lists each one's traps and its key expected values.
2. `extractInvoice` gets a second mode: a **strict function call** (`record_invoice`), alongside the existing **`text.format` json_schema**.
3. `npm run compare:modes` runs all 10 samples through both modes, 3 times each. It reports first-try validity, repairs, needs_human, agreement between the modes, the confidence picked up on the trap fields, tokens, cost and latency. Results go into this file, CLAUDE.md answers open question #2, and the better mode becomes the default.

## Docs read (1 Nov 2026)

- **AI SDK v7, OpenAI provider.** This is the deciding source detail. In the Responses API path, `prepareFunctionTool` sends `strict: tool.strict ?? false`, so **function tools are not strict by default**, while `text.format` json_schema uses `strictJsonSchema ?? true`. `tool()` accepts `strict?: boolean`. Without `strict: true` the comparison would quietly pit strict against loose.
- **AI SDK v7 `generateText` source.** A tool call whose input fails the schema is **returned**, not thrown. It comes back as a call with `invalid: true` and `error: InvalidToolInputError` (the cause holds the Zod issues). Without an `execute`, the call ends after one step. So the tool mode has to inspect `result.toolCalls` itself: no call, an invalid call and a valid call are three different outcomes.
- **AI SDK, forcing a tool:** `toolChoice: { type: "tool", toolName }`.
- **OpenAI, *Function calling* / *Structured outputs*.**
  - With `strict: true`, the function arguments follow the same supported JSON-Schema subset as `text.format`.
  - Use function calling when the model needs to call your tools, and `text.format` when the reply itself must follow a schema. That is OpenAI's guidance, and this test measures it rather than taking it on trust.
- **ffmpeg** (installed): `rotate`, `perspective`, `gblur`, `noise`, `vignette`, `eq` and `colorchannelmixer` are enough to degrade rendered pages into a believable photo or fax. PIL isn't installed and isn't needed.

## Code inspected

- **`lib/extract/extract.ts`.** The json_schema path, the repair loop and `record()` are all reused. Only the call and the result reading differ by mode.
- **`lib/extract/types.ts`.** `ModelCallRecord` needs a `mode` field so the JSONL shows which mode produced each call.
- **`samples/`** holds 2 clean invoices. Prompt 005's results noted that confidence was 0.99 on every field, which is the reason for the hard samples.

## Decisions and assumptions

- **Tool mode:**
  - `record_invoice = tool({ description, inputSchema: Invoice, strict: true })`, forced with `toolChoice`, with no `execute`.
  - The same Zod schema is used, so this is still one definition.
  - **Repair uses the tool protocol:** the assistant's tool call, then a `tool` message whose result is the Zod issues as `error-text`, then one more call. Rejected: pasting the arguments into a plain user message, because OpenAI expects every function call to get an answer, and that is the natural shape for the model.
- **Same everything else:** system prompt, file part, `reasoningEffort: low`, `store: false`, 2 attempts then `needs_human`. Only the transport differs.
- **Repetitions:** each sample × mode runs 3 times, so 60 first attempts. With 10 documents this is a small sample, and the write-up will say so. It shows reliability differences, not tight percentages.
- **Interleaved order** (sample A in both modes, then sample B…), so slow periods or cache warm-up don't favour one mode. The two modes send different schemas (tool vs format), so their cache prefixes differ. Cached tokens are reported per mode, not hidden.
- **Agreement instead of accuracy for now.** For each sample the script compares the modes' values field by field, after trimming and collapsing whitespace, and lists the differences. Real accuracy needs the golden set and the tested normaliser (week 3). The new samples' key expected values are written in `samples/README.md` so a person can check the trap fields by eye.
- **Decision rule, fixed before running:**
  1. Fewer `needs_human` outcomes.
  2. Then a higher first-try validity rate.
  3. Then lower cost per document.
  4. Then lower p50 latency.
  - A tie keeps `json_schema` (the default, with less code).
- **Cost guard:** the script prints the running cost and stops if the total passes **$0.25**.
- **Run results** are saved to `evals/runs/2026-11-01-modes.json`: per-call metrics and per-sample agreement, with no document bytes. It is committed as evidence for the README.

## What this teaches

**Two ways to get JSON out of the same model.**
- `text.format` json_schema constrains the reply itself.
- A forced strict function call constrains the arguments of a call the model must make.

Both use the same constrained decoding and the same schema subset, so the real differences are smaller. The differences are:
- how failures surface: a thrown `NoObjectGeneratedError` vs an `invalid` tool call you must check;
- how repair is phrased: a user message vs a tool result;
- latency and tokens: the tool definition and the call wrapper.

The measurement decides which one is the default.

## Files to touch

- **Samples:**
  - `samples/src/*.html`: create. The 8 sources, each with an invented vendor, `.example` emails and a "synthetic" footer. The existing Cobalt Ridge source moves here too.
  - `samples/*.pdf|png|jpg`: create. Rendered with Chrome, then degraded with ffmpeg for the photo, fax and receipt.
  - `scripts/render-samples.sh`: create. Regenerates every sample from `samples/src`, so the files are reproducible.
  - `samples/README.md`: create. One row per sample: format, traps, key expected values.
- **Extraction:**
  - `lib/extract/types.ts`: edit. Add `ExtractionMode = "json_schema" | "function_call"`, and add `mode` to `ModelCallRecord`.
  - `lib/extract/extract.ts`: edit. Add a `mode` option (default `json_schema`), the function-call path with strict, forced `record_invoice`, invalid-call handling, and tool-protocol repair.
  - `lib/extract/extract.test.ts`: edit. Mocked function-call cases: a valid call, an invalid call → repaired via a tool result, no call → validation error. Also assert the tool is sent as `strict: true` and forced.
- **Comparison:**
  - `scripts/compare-modes.ts`: create. The interleaved runs, the $0.25 guard, a summary table on stderr, and the JSON report. It reuses the CLI's file checks.
  - `scripts/lib/sample-file.ts`: create. File reading and the type/size check, shared by `extract.ts` and `compare-modes.ts`.
  - `scripts/extract.ts`: edit. Use the shared file reader, and add a `--mode` flag.
- **Config and docs:**
  - `package.json`: edit. Add the script `compare:modes`.
  - `evals/runs/2026-11-01-modes.json`: create. The run output.
  - `CLAUDE.md`: edit. Answer open question #2 with the numbers, and add a log line.

## Requirements

1. The function-call mode sends `strict: true` and a forced `toolChoice`. A unit test asserts both on the request the mock receives.
2. Both modes use the same Zod schema, prompt, file part and provider options. Only the transport differs.
3. An invalid or missing tool call takes the ladder exactly like a validation error: one repair, then `needs_human`. Partial data never counts as success.
4. Every call is logged with its `mode`. `npm test` stays mocked.
5. Every sample is synthetic: invented companies, `.example` addresses, fake IBANs and tax IDs, and a visible "synthetic" footer. Nothing comes from Third Way Health or any real document.
6. The comparison stops itself above $0.25 total.

## Security and data safety

- All 8 new documents are invented here and marked synthetic on the page. There are no real names, addresses, tax IDs or account numbers. Any IBAN or NIT shown is zero-filled.
- `store: false` in both modes. Logs and the run report hold metadata and extracted values from synthetic documents only.

## Cost impact

- **Unit tests:** $0.
- **Smoke runs while building:** about 4 calls, roughly $0.004.
- **Comparison:**
  - 60 first attempts, plus repairs. Roughly 1.5–5k input tokens per call (photos and two pages cost more) and about 1–2k output.
  - Expected **$0.04–0.10** in total, with a hard stop at $0.25.
  - The real figure comes from the log and is written into Results.

## Acceptance criteria

- [ ] 10 samples render from source, and `samples/README.md` lists the traps and the key expected values.
- [ ] `npm run extract <file> --mode function_call` works end to end on a sample.
- [ ] `npm run compare:modes` finishes under $0.25 and writes `evals/runs/2026-11-01-modes.json`.
- [ ] The Results section has a per-mode table (first-try valid, repaired, needs_human, cost per doc, p50/p95 latency), the agreement and the confidence picked up on the trap fields, and the chosen default with its reason.
- [ ] CLAUDE.md open question #2 is answered with numbers.
- [ ] tsc, lint, test and build pass.

## Checks

- `npx tsc --noEmit`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run extract` on one hard sample in each mode.
- `npm run compare:modes` (once).

## Manual test steps

1. `bash scripts/render-samples.sh`. Ten files appear in `samples/`. Open the photo and the fax to see that they look degraded but readable.
2. `npm run extract samples/synthetic-tallow-lane-photo.jpg --mode function_call`.
3. `npm run compare:modes`. Watch the running cost, then read the table at the end.
4. Open `evals/runs/2026-11-01-modes.json`.

## Results

To be filled in after the work.
