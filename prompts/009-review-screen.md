# 009 — Extract button, review screen, corrections

**Status:** done
**Branch:** `feat/review-screen`
**Week:** 2, subtasks 4–6 (1–7 Nov)

## Goal

From `/documents`, the uploader clicks **Extract** on a card and the card updates when the run ends. The card then links to `/documents/[id]`. That page shows:
- the document next to its fields;
- each field's value, confidence and source quote, with low-confidence fields in amber;
- the run's cost, latency and model.

The uploader corrects any field with one edit plus Save. The correction is stored next to the original, and **Mark reviewed** finishes the document.

## Docs read (1 Nov 2026)

- **Next.js 16, *Dynamic routes → With Cache Components*.** Without `generateStaticParams`, `params` is runtime data, so it has to be read inside `<Suspense>`: the page shell prerenders and the content streams. `PageProps<'/documents/[id]'>` types it.
- **Next.js 16, `route.md`.** `RouteContext<…>` for the two new handlers, as in prompt 008.
- **Supabase Storage `createSignedUrl(path, expiresIn)`.** A short-lived read URL for the private bucket, so the preview never makes the bucket public.
- **Already in the repo:**
  - `FieldList`/`FieldRow` (the design system already shows an "Edit" `tertiary sm` button in the action slot);
  - `DocumentCard` (optional `href`, `flaggedCount`);
  - `DocumentStatus`, `StatCard`, `Breadcrumbs`, `Button`, `Input`/`Field`;
  - `confidenceLevel()`, which is the only place the amber rule is decided.

## Code inspected

- `app/documents/page.tsx`: the grid passes `vendor={null}`, `total={null}` and `flaggedCount={0}` with no `href`, and the copy says extraction "isn't switched on yet". All of that changes.
- `lib/db/documents.ts` `listDocuments()`: returns every document with no extraction data. It needs the latest extraction's vendor, total and count of fields to review, plus `uploaded_by`, so the page knows whose card gets the button.
- `components/review/field-row.tsx`: already renders "corrected" (the new value, the original struck through, and a Corrected badge). The editor only has to swap the row for a form.
- `components/documents/upload-box.tsx`: the pattern for client-to-route calls (`postJson`, an inline error, `router.refresh()` on success).
- `lib/schema/invoice.ts`: `Invoice.shape.<field>.shape.value` and `LineItem.shape.<field>.shape.value` are the Zod value types, so corrections validate against the same schema the model's output does.
- `extraction_fields` (prompt 008): `corrected_value jsonb` and `corrected_at` already exist, so **no migration** is needed.

## Decisions and assumptions

- **Visibility (owner decision, 1 Nov: uploader only):**
  - Uploaded documents are visible **only to their uploader**: in the list, the review screen, the preview and the fields.
  - Preloaded demo samples (`uploaded_by` is null) stay public.
  - Today, everyone sees every upload's file name. Once the review screen shows the file and its amounts, a visitor who uploads a real invoice to a public demo would be showing it to the world.
  - This is not multi-tenancy: there are no roles and no sharing, only a filter on `uploaded_by`.
- **Extract button (subtask 4):**
  - A client component that shows only on the uploader's cards in `uploaded`.
  - It POSTs to the existing route and shows "Extracting…" with a spinner, disabled, for the 5–20 s a run takes.
  - Success calls `router.refresh()`, and errors appear inline under the card (429 shows the cap message).
  - Rejected: polling or a background job. The route answers when the run ends, and Postgres is the only queue we need.
- **Cards:**
  - They show the vendor, the total formatted in the printed currency, and "N to review".
  - They link to `/documents/[id]` once the status is `extracted`, `needs_human` or `reviewed`.
  - "To review" counts flagged fields **not yet corrected**, so it falls as you fix them.
- **Review screen (subtask 5), `/documents/[id]`:**
  - The page shell (breadcrumbs, title skeleton) prerenders. The content streams inside Suspense.
  - The header shows the vendor, file name, status and the uploader's actions.
  - Stat row: fields to review, corrected count, the run's cost, its latency, and its model. These come from `model_calls`, so the cost per document is visible on screen.
  - Two columns from `lg` up:
    - **Left:** the document preview from a 10-minute signed URL (`<iframe>` for PDF, `<img>` for images), with an "Open file" link.
    - **Right:** header fields, then a "Line items" group per line, then the totals.
    - On phones the preview stacks under the fields, collapsed behind a disclosure, so the fields come first.
  - `needs_human`: shows the reason, a note that manual entry comes later, and the preview. There's no entry form here; that belongs to the human-entry work.
  - Unknown or not visible → `notFound()`.
- **Corrections (subtask 6):**
  - `PATCH /api/documents/[id]/fields` with `{ fieldName, value }`, uploader only, while the document is `extracted` or `reviewed`.
  - `value` is validated against **the field's own Zod type from `Invoice`**:
    - `currency` keeps its `^[A-Z]{3}$`;
    - amounts must be numbers;
    - `null` means "not on the document".
  - It writes `corrected_value` and `corrected_at = now()` on the latest extraction's row and never touches `value`.
  - The browser parses what's typed before sending, with the same rule tested in Vitest:
    - Amounts and quantities accept `1284.50` and `1,284.50`, and a leading minus.
    - Anything ambiguous (`1.284,50`, letters) is refused with a hint: "Use digits with a dot for decimals: 1284.50".
    - Rejected: guessing the locale. The printed format is already in the source quote next to the input.
  - Editing is one Edit, one input (prefilled with the current value), and Save, which is also the Enter key. Esc cancels. There's a "Not on the document" checkbox for `null`.
  - **Revert to the original** sets both correction columns back to null, so a mistaken correction can be undone without losing the original.
- **Mark reviewed:** `POST /api/documents/[id]/review` moves `extracted` → `reviewed`, uploader only. It's an explicit button, not automatic, so a human always confirms the whole document. Corrections stay possible after it.
- **Structure:**
  - Pure helpers in `lib/review/fields.ts`, Vitest-tested: labels, grouping, the per-field value schema, input parsing, display formatting, money formatting, and the to-review/corrected counts.
  - Server-only queries in `lib/db/reviews.ts`.
  - Thin routes.
  - UI in `components/review/`.
  - The editor and the new card state are added to `/design-system`.

## What this teaches

**Human corrections as data, not edits.** The model's value and its confidence stay exactly as returned, and the human's value sits next to them. The week 3 eval can then score the model on what it really said, and later reuse corrections as few-shot examples. The alternative rejected was overwriting `value`, which is simpler but silently turns a model error into a model success in every later metric.

Validating the correction with the **same Zod field type** the model's output passed keeps one definition: a human can't save a currency of "euros" any more than the model can.

## Files to touch

- `lib/review/fields.ts` and `.test.ts`: create.
- `lib/db/reviews.ts`: create, server-only (the review query, signed URL, correction, mark reviewed).
- `lib/db/documents.ts`: edit (`listDocuments` takes the viewer and embeds the latest extraction summary).
- `app/documents/page.tsx`: edit (the viewer filter, real card data, `href`, Extract button, updated copy).
- `app/documents/[id]/page.tsx`: create.
- `app/api/documents/[id]/fields/route.ts`, `app/api/documents/[id]/review/route.ts`, plus `.test.ts`: create.
- `components/documents/extract-button.tsx`: create.
- `components/review/field-editor.tsx`, `components/review/document-preview.tsx`: create.
- `components/review/document-card.tsx`: edit (an `action` slot).
- `app/design-system/page.tsx`: edit (editor and card-action examples).
- `CLAUDE.md` and this file's Results section: edit.

## Requirements

1. Signed out: `/documents` and `/documents/[id]` show only public samples, and an uploaded document's URL is 404.
2. The uploader sees their documents. Extract works from the card, and the card shows the vendor, total and to-review count, then links to the review screen.
3. The review screen shows every field from `extraction_fields` in invoice order, with the source quote next to the value and amber exactly where `confidenceLevel()` says.
4. A correction is one edit plus Save. It is stored in `corrected_*` with the original untouched, shown as corrected, and revertible.
5. Mark reviewed sets `reviewed`.
6. Every write goes through a route that checks the session and the uploader.
7. `npm test` makes no network or model calls.

## Security and data safety

- **Server-side boundaries:**
  - The signed preview URL is created on the server and expires in 10 minutes. The bucket stays private.
  - No browser Supabase client.
  - Writes go only through the three uploader-checked routes.
- **Visibility:** the `uploaded_by` filter is applied in the server queries, not only hidden in the UI.
- **Test data:** the synthetic samples only.

## Cost impact

- No new model code.
- Live check: one extraction through the button at most, about $0.0003.
- UI checks reuse the already-extracted Harbor Pine document.

## Acceptance criteria

- [x] Vitest:
  - field helpers (labels, grouping, value schema, parsing, formatting, counts);
  - `PATCH fields` and `POST review` routes (401/400/403/404/409/422/200), with auth and the store mocked.
- [x] `listDocuments`, the review query, correct, revert and mark reviewed are checked live against the lab database, with rows confirmed by SQL and the original `value` unchanged.
- [x] `/documents` and `/documents/[id]`:
  - checked in a browser (Playwright) at 1280 px and 375 px;
  - signed out, a public sample renders and an upload is 404;
  - amber rows and source quotes are visible, there's no horizontal scroll, and focus rings work.
- [x] `/design-system` shows the field editor and the card's Extract action.
- [x] tsc, lint, test and build pass. Results and the CLAUDE.md log line are written.

## Checks

- `npx tsc --noEmit`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run dev`, then a Playwright click-through.

## Manual test steps (signed in; needs your Google session)

1. `npm run dev` and sign in. Go to `/documents` and upload `samples/synthetic-quarry-ash-ambiguous.pdf`.
2. Click **Extract** on its card. About 5 s later the card shows the vendor, $612.14, and **2 to review**.
3. Open the card. `Invoice number` and `Total` are amber, each with its quote (`QA-2O61`, `$6l2.14`).
4. Edit Invoice number → `QA-2061` → Enter. The row shows `QA-2061`, with `QA-2O61` struck through and the Corrected badge, and "to review" drops to 1.
5. Edit Total, type `abc`. Save is refused with the hint. Type `612.14` and save.
6. Click Revert on Invoice number and the original comes back. Then **Mark reviewed**, and the status shows Reviewed.
7. Sign out and open the same URL. You get 404.

## Results

**Built as planned, with three deliberate changes:**
- **Phone layout.** On phones the preview stacks *after* the fields instead of sitting collapsed behind a disclosure. A `<details>` can't be open on desktop and closed on mobile without JS or rendering the iframe twice. Fields still come first, and nothing scrolls sideways at 375 px.
- **Access answers.** For the extract, correct and review routes, someone else's upload is now a 404 (`missing`), not a 403. Since uploads are private, a 403 would confirm the document exists. 403 is kept for public samples, which anyone can see but nobody can edit. The extract route was changed to match.
- **One generic button.** `RouteButton` (`components/ui/route-button.tsx`) serves both Extract and Mark reviewed, instead of a separate `extract-button.tsx`.
- **Not in the plan:** a corrected row drops the amber, and the model's confidence stays visible as a neutral "Model 75%" badge. A person has handled that field, so it no longer needs attention, and the to-review count already excludes it.

**Live, against the lab database** (outside Next, `server-only` stubbed via `NODE_PATH`):
- **`listDocuments`:**
  - The owner sees their 2 uploads, with the vendor, total, currency and to-review count from the latest extraction.
  - Signed out, another user, and a junk viewer id like `x,uploaded_by.not.is.null` all see 0. The uuid check stops filter injection.
- **`getDocumentReview`:**
  - For the owner: 20 fields in invoice order, 1 call, $0.00028519, 4,750 ms, and a signed URL.
  - Signed out or as another user: `null`.
  - The signed PDF comes back `200 application/pdf` with no `X-Frame-Options`, CSP or `Content-Disposition`, so it renders in an `<iframe>`.
- **`correctField`:**
  - A correction writes `corrected_value` and `corrected_at` and leaves `value` unchanged (`INV-2041` stays).
  - A correction to `null` is stored as corrected, with the value still `13/11/2026`.
  - Revert clears both columns.
  - An unknown line gives `unknown_field`; another user or a missing document gives `missing`.
- **`markReviewed`:** `ok`, then `ok` again (idempotent). Another user gets `missing`. Corrections still work after review.
- **Cleanup:** the Harbor Pine document was put back exactly as it was: `extracted`, 0 corrections.

**First public sample.** To check the review screen signed out, I extracted `synthetic-quarry-ash-ambiguous.pdf` through the real pipeline, then set `uploaded_by` to null. That makes it a public, read-only sample (`18e92179-…`).
- 24 fields, **2 flagged**: invoice number 0.78 (`QA-2O61`) and total 0.76 (`$6l2.14`, quoted with the lower-case l as printed). **$0.00036304**, 7.1 s.
- It stays in place as the first demo sample. Delete it if you'd rather seed samples later.

**Browser (Playwright, `next start`, signed out):**
- **`/documents/<sample>` at 1280 px:**
  - The preview is sticky on the left and the fields on the right.
  - Exactly the two flagged rows are amber, each with its quote.
  - The stat cards show 2 to review, 0 of 24 corrected, $0.00036, 7.1 s and gpt-6-luna.
- **At 375 px:** `scrollWidth` equals `clientWidth` (375), no element overflows, and the fields come before the preview.
- **`/documents/<private upload>` and `/documents/not-a-uuid`:** the 404 page, marked `noindex`. The HTML has no vendor, no file name and no signed URL. The HTTP status is 200 because the shell streams before `notFound()`, which is expected with Suspense streaming.
- **`/documents` signed out:** only the Quarry sample card, with $612.14, "2 to review", a link, and no Extract button. No uploads are listed.
- **`/design-system`:**
  - Edit opens the editor with the input focused and prefilled (`QA-2061`), and Esc closes it.
  - The error state shows the printed text and the number hint.
  - The corrected row shows Revert and "Model 75%".
  - The card's Extract button and its busy state render.
- The only console errors are prefetch 404s for the nav's `/review` and `/exports`. Those pages don't exist yet, and the errors were there before this change.

**Not tested here:** the signed-in clicks (Extract, Save, Revert, Mark reviewed in a browser). They need a Google session; see the manual steps. The routes behind them are unit-tested, and the store functions were checked live.

**Tests:** 132 pass, up from 90.
- 29 field helpers;
- 2 access tests;
- 13 corrections-route tests;
- 7 review-route tests.

tsc, lint and the build pass. `/documents/[id]` builds as a partial prerender.

**Spend:** $0.00036304. Project total $0.06769.
