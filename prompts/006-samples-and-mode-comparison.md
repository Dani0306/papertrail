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

- [x] 10 samples render from source, and `samples/README.md` lists the traps and the key expected values.
- [x] `npm run extract <file> --mode function_call` works end to end on a sample.
- [x] `npm run compare:modes` finishes under $0.25 and writes `evals/runs/2026-11-01-modes.json`.
- [x] The Results section has a per-mode table (first-try valid, repaired, needs_human, cost per doc, p50/p95 latency), the agreement and the confidence picked up on the trap fields, and the chosen default with its reason.
- [x] CLAUDE.md open question #2 is answered with numbers.
- [x] tsc, lint, test and build pass.

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

Run on 1 Nov 2026 (UTC): `npm run compare:modes`, 11 files (10 invoices, Cobalt Ridge as both PDF and PNG) × 2 modes × 3 reps = 66 extractions on `gpt-6-luna`. Raw data: `evals/runs/2026-11-01-modes.json`.

**Cost:** $0.03795 for the comparison, plus $0.00074 for the planned function-call smoke run and **$0.00072 for one unplanned call**. `npm run extract <file> --mode bogus` without `--` let npm swallow the flag, so the script ran a json_schema call on the fax. The `swallowedFlagProblem` guard now stops that before any call. **Prompt total: $0.03941.**

| Mode | Runs | First-try valid | Repaired | needs_human | Failed | $/doc | p50 | p95 | Mean out tokens (reasoning) |
|---|---|---|---|---|---|---|---|---|---|
| `json_schema` | 33 | 100% | 0 | 0 | 0 | $0.00067 | 7.3 s | 26.5 s | 1,152 (67) |
| `function_call` | 33 | 100% | 0 | 0 | 0 | **$0.00048** | **4.8 s** | 18.7 s | **759 (0)** |

Mean input tokens were close: 3,769 vs 3,707. About 83% of input tokens were cached in both modes.

**Default: `function_call`.** Applying the rule fixed before the run:
- Rules 1 and 2 tie: no `needs_human` in either mode, and 100% first-try validity in both.
- Rule 3 decides. `function_call` costs 28% less per document, and is also 34% faster at p50.

`lib/extract/extract.ts` now defaults to it. `json_schema` stays available with `--mode json_schema`, and a test pins the default.

**Why it's cheaper (partly explained).**
- Output tokens: 759 vs 1,152. Reasoning tokens explain only 67 of the 393-token gap: 23 of 33 json_schema runs reasoned, and no function-call run did.
- Source quotes are the same length in both modes (11.5 vs 11.7 characters), so longer evidence isn't the cause.
- The raw reply text isn't logged, so the rest of the gap is not measured. Formatting of the JSON text is a guess, not a finding.

**What the test could not show.** The open question asked which mode *validates more reliably*. On these 10 invoices, neither mode ever failed validation, so the run can't separate them on reliability. The decision rests on cost and latency. Three reps of 10 documents can't rule out a rare-failure difference. The golden set (30 docs) is the next chance to see one.

**Agreement between modes** (first extracted run of each, whitespace-collapsed): 9 of 11 files agree on every field.
- **Kestrel receipt, `invoiceNumber`.** json_schema rep 1 returned `null` with confidence 0.99. The other reps returned `000482`. function_call returned `000482` once and `#000482` twice.
- **Quarry & Ash, `currency`.** json_schema rep 1 returned `null` with confidence 0.7, because only `$` is printed. All other runs returned `USD`, but one quote was `"$3.25"`, a line price, which is weak evidence.

**Stability across the 3 reps of the same mode** (of 324 fields per mode):
- json_schema: 7 unstable fields. 4 are the Cobalt Ridge sub-line descriptions, sometimes included and sometimes not. The other 3 are Kestrel `invoiceNumber`/`currency` and Quarry `currency`.
- function_call: 5 unstable fields. 4 are Cobalt descriptions, which always include the sub-line but sometimes with ` / `. The other is Kestrel `#000482` vs `000482`.
- Every instability is a golden-set rule question (open rules 1 and 4 in `samples/README.md`) or `null` vs a weakly evidenced value. None is a misread number.

**Confidence on the trap fields.** This is the first time confidence moved off 0.99.

| Sample | Field | json_schema | function_call |
|---|---|---|---|
| Quarry & Ash | `invoiceNumber` `QA-2O61` | 0.75–0.80 | 0.75–0.80 |
| Quarry & Ash | `total` `$6l2.14` → 612.14 | 0.65–0.80 | 0.75–0.78 |
| North Meadow | `dueDate` (none printed) | `null` @ 1.0 | `null` @ 1.0 |
| Kestrel | `dueDate`, unit prices (none printed) | `null` @ 1.0 | `null` @ 1.0, but **@ 0 in rep 1** |
| Orchard Labs | discount line −354, tax 0 | correct @ 0.99–1.0 | correct @ 0.99 |
| Ferretería Andina | total `$ 3.128.510,00` → 3128510, `COP` | correct @ 1.0 | correct @ 0.99 |
| Brightwater | 26 lines across 2 pages, total 1,348.58 | 26/26 lines every run | 26/26 lines every run |

- **Quarry & Ash** is the behaviour we want. Both modes kept the printed `QA-2O61` (letter O), read the total as the intended 612.14, and dropped both below the 0.85 threshold. So a human will see them.
- **Every other trap was read correctly** in all 66 runs, by eye against `samples/README.md`. That includes the photo and the fax.

**New problem: what confidence means on a `null` value.**
- Both modes mostly return absent fields as `null @ 1.0`, meaning sure it's absent. In one function-call run, Kestrel's four absent fields came back as `null @ 0`.
- `confidenceLevel()` flags those, so the review queue would light up amber on fields that are correctly empty.
- The prompt never says which reading is meant. It's a one-line prompt fix (confidence on `null` = how sure you are the field is absent). It wasn't changed here, because that would have changed the comparison mid-run. Next prompt.

**Multi-page (open question #3, first evidence):** Brightwater's 26 lines across the page break came back complete and in order in all 6 runs. That's 1 document, so it isn't an answer yet.

**Acceptance:** all criteria met. The Results table, agreement, trap confidences and the default with its reason are above. tsc, lint, 54 tests and the build pass.
