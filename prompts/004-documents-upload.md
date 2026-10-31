# 004 — /documents: upload to Storage and list documents

**Status:** done. Verified live on 1 Nov with a signed-in upload.
**Branch:** `feat/documents-upload` (stacked on `feat/google-auth`)
**Week:** 2 work, done in week 1. The week 1 CLI was due 31 Oct and hasn't started, so it is overdue and this task delays it by about one more evening. The owner chose "Real upload + list" on 31 Oct.

## Goal

`/documents` lists real documents from `papertrail.documents`. A signed-in visitor can upload a PDF or an image. The file goes from the browser straight to a private Storage bucket and is then registered as a document with status `uploaded`. Visitors who aren't signed in see the list and a sign-in prompt instead of the upload box. No extraction happens yet: that plugs in once the CLI and `lib/extract` exist.

## Docs read

- **Supabase, *Using Custom Schemas*** (read 31 Oct via MCP). A custom schema must be added to **Settings → API → Exposed schemas** and granted to roles before `supabase-js` can reach it. The client then uses `db: { schema }`.
- **Supabase, *Securing your API*** (31 Oct).
  - A table can't be reached through the Data API without grants.
  - Grant the minimum, and enable RLS on every exposed table.
  - Supabase is moving to opt-in grants.
- **Supabase JS reference, `createSignedUploadUrl` / `uploadToSignedUrl`** (31 Oct).
  - Signed upload URLs need no further auth and are valid for 2 hours.
  - The installed `storage-js` source shows `uploadToSignedUrl` is a plain `PUT` to `/object/upload/sign/<bucket>/<path>?token=…` with `content-type` and `x-upsert` headers. So the browser can upload with `XMLHttpRequest`, with no Supabase client in the browser.
- **`storage-js` `info(path)`** returns the stored object's `size` and `content_type`. The server checks those instead of trusting the browser's claim.
- **Claude, *PDF support*** (31 Oct). Max request size is 128 MB, and max pages is 600 (100 below a 1M-token context). Our 10 MB cap is far below that. It's chosen to keep extraction tokens (each page costs text plus image tokens) and free-tier Storage (1 GB) small, not because of an API limit.
- **`supabase-postgres-best-practices` skill.**
  - Use `text` with a check constraint for the status.
  - Use `timestamptz`.
  - Index the foreign-key column.
  - Enable RLS and grant minimal privileges.
- **`node_modules/next/dist/docs` (16.4.3).** Cache Components is on, so the per-request list renders inside `<Suspense>`. `io()` is required before Supabase client construction (lesson from prompt 003).

## Code inspected

- **`components/review/document-card.tsx`.**
  - `href` is required, but there is no `/documents/[id]` page yet.
  - A null vendor reads "Unknown vendor", which is misleading for a document that hasn't been extracted yet.
- **`components/ui/progress-bar.tsx`.** Ready for upload progress.
- **`components/ui/sign-in-link.tsx`.** Reused for the signed-out prompt.
- **`lib/document-status.ts`.** It already lists the six statuses that the DB check constraint must match.
- **`lib/auth.ts`.** `requireUser()` from prompt 003.
- **`.env.example`.** It already has `SUPABASE_STORAGE_BUCKET=papertrail-documents`.
- **Supabase project.** It has no `papertrail` schema and no buckets yet (checked 29 Oct). One Google user exists.

## Decisions and assumptions

- **Two-step upload, so a document row only exists for a file that really arrived.**
  1. `POST /api/uploads` checks the user, the declared type and size, and the daily cap, then returns a signed upload URL.
  2. The browser `PUT`s the file straight to Storage. This also skips Vercel's request-body limit.
  3. `POST /api/documents` checks the object in Storage (real size and type via `info()`) and inserts the row.
  - Rejected: creating the row in step 1, which leaves orphan rows when an upload fails.
  - Rejected: proxying the file through a route, which hits Vercel's body limit.
- **Storage path `uploads/<user-id>/<uuid>-<safe-name>`.** The user-id prefix lets step 3 refuse paths the caller wasn't issued. It also lets the daily cap count real objects in Storage, so requesting URLs without registering them can't bypass the cap.
- **Daily cap per user:** `PAPERTRAIL_DAILY_UPLOAD_CAP`, default 20 per UTC day, counted from that user's Storage prefix. A 429 response carries a clear message. The extraction cap (`PAPERTRAIL_DAILY_EXTRACTION_CAP`) stays separate and arrives with extraction.
- **Accepted files:**
  - Types: `application/pdf`, `image/png`, `image/jpeg`, `image/webp`.
  - Size: up to 10 MB.
  - Enforced three times: client-side for fast feedback, by the route with Zod, and by the bucket (`file_size_limit`, `allowed_mime_types`), which is the backstop nobody can skip.
- **The bucket is private.** Viewing files later uses short-lived signed URLs, on the review screen.
- **DB access:**
  - `lib/db` is a server-only `supabase-js` client using `SUPABASE_SECRET_KEY` and `db: { schema: "papertrail" }`.
  - `papertrail` grants go to `service_role` only. `anon` and `authenticated` get nothing, so the publishable key can't read the table even though the schema is exposed.
  - RLS is on with no policies (the secret key bypasses RLS). This is defence in depth.
- **Row types** come from the Supabase type generator (MCP `generate_typescript_types`) into `lib/db/types.ts`, not hand-written. Request bodies are Zod schemas.
- **Assumption:** `/documents` lists every document, not just the viewer's. That matches demo mode, and per-user data is out of scope. The list shows file name, status, size and upload date. Uploader emails are never shown.
- **`DocumentCard` changes (backwards compatible):**
  - `href` becomes optional. Without it, the card isn't a link, because `/documents/[id]` doesn't exist yet.
  - A null vendor on an `uploaded` or `extracting` document reads "Awaiting extraction" instead of "Unknown vendor".
- **`page_count`** stays null for now. The PDF isn't parsed at upload, and the extractor can fill it in later.

## What this teaches

Not on the gap list, so there's no lecture. One idea carries forward to extraction: the server never trusts the client's description of a file. Size and type are re-read from Storage, the same way the model's JSON will be re-validated with Zod rather than trusted.

## Files to touch

- `supabase/migrations/20261031120000_documents.sql`: create. Holds:
  - the `papertrail` schema
  - the `documents` table (id `uuid`, storage_path unique, original_filename, mime_type, size_bytes, page_count, status check with the six statuses, uploaded_by → `auth.users` with `on delete set null`, created_at `timestamptz`)
  - indexes `(created_at desc)` and `(uploaded_by, created_at)`
  - RLS, and grants to `service_role` only
  - the private bucket `papertrail-documents` (10 MB, the four MIME types)
  - Applied to the project with MCP `apply_migration`. It only adds things.
- `lib/db/types.ts`: create. Generated database types.
- `lib/db/client.ts`: create. `import "server-only"`. Calls `await io()`, then builds the secret-key client (no session, no auto refresh).
- `lib/db/documents.ts`: create. `listDocuments()`, `countUploadsToday(userId)`, `createUploadUrl(userId, file)`, `registerDocument(userId, path, filename)`.
- `lib/uploads.ts`: create. A pure module, safe for client and server:
  - `ALLOWED_UPLOAD_TYPES` and `MAX_UPLOAD_BYTES`
  - `UploadRequest` and `RegisterRequest` Zod schemas
  - `storagePathFor()`, `isOwnedPath()`, `safeFileName()`, `formatBytes()`
- `lib/uploads.test.ts`: create. Vitest coverage for those helpers.
- `app/api/uploads/route.ts`: create. `POST`. Returns 401, 400, 429 or 200 `{ path, signedUrl }`.
- `app/api/documents/route.ts`: create. `POST`. Returns 401, 400, 403 (path not owned), 409 (already registered), 422 (object missing, or wrong size or type) or 201 `{ id }`.
- `app/documents/page.tsx`: create. Contains:
  - the page title
  - the upload panel (signed in) or sign-in prompt (signed out), plus "N of 20 uploads left today"
  - the document grid in `<Suspense>` with a skeleton
  - the empty state
- `components/documents/upload-box.tsx`: create. `"use client"`. Handles:
  - a file input plus drag-and-drop, one file at a time
  - client-side checks
  - XHR `PUT` with a `ProgressBar`
  - success, which calls `router.refresh()` and announces the result via `aria-live`
  - errors, each naming the problem and the fix
  - a disabled state while uploading
- `components/review/document-card.tsx`: edit. Optional `href`, and the "Awaiting extraction" fallback.
- `components/ui/nav.tsx`: no change. `current="/documents"` is passed by the page.
- `app/design-system/page.tsx`: edit. Show the upload box states (idle, uploading, error) and an "Awaiting extraction" card.
- `lib/document-status.ts`: edit. The comment points to the migration's check constraint.
- `package.json`: edit. Add `zod@4.6.7`, which is in the planned stack.
- `.env.example`: edit. Add `PAPERTRAIL_DAILY_UPLOAD_CAP=20`.
- `CLAUDE.md`: edit. Log line.

## Requirements

1. Upload and register both call `requireUser()`. Without a session they return 401 JSON and never touch Storage or the DB.
2. Every request body is parsed with Zod, and a bad body gets a 400 with a readable message.
3. The browser never receives the secret key, and there is no browser Supabase client. Its only contact with Supabase is the `PUT` to a signed URL.
4. `registerDocument` refuses paths outside `uploads/<caller-id>/`. It also refuses objects whose stored size or type is off-limits, and in that case deletes the object.
5. The list renders inside `<Suspense>`, with no Cache Components prerender errors in dev for either signed-in or signed-out visitors.
6. UI:
   - tokens only
   - `font-display` for the page title
   - file names in `font-mono`
   - focus rings on the drop zone, the button and links
   - disabled state while uploading
   - status never shown by colour alone
   - works at 375px
   - no amber anywhere (nothing here is low-confidence)
7. The migration is additive only and touches only `papertrail.*` and the `papertrail-documents` bucket.

## Owner steps

1. **Supabase → Settings → API (Data API) → Exposed schemas:** add `papertrail` and save. Without this, `supabase-js` gets a "schema not exposed" error, and I'll tell you if I see it.
2. **`.env.local`:** add `PAPERTRAIL_DAILY_UPLOAD_CAP=20` (optional, since 20 is the default) and `SUPABASE_STORAGE_BUCKET=papertrail-documents`.

## Security and data safety

- Only synthetic or public sample invoices get uploaded, never Third Way Health documents. The upload box says so in one line of helper text.
- The bucket is private, so files aren't publicly readable. The secret key is server-only (`server-only` import).
- An exposed schema with no grants to `anon` or `authenticated`, plus RLS on, means the publishable key can't read anything in `papertrail`.
- Abuse limits: Google sign-in, 10 MB per file, and 20 uploads per user per UTC day.

## Cost impact

$0. There are no model calls. Storage and DB stay inside the free tier: 20 × 10 MB is at most 200 MB a day per user, worst case, and the cap keeps it small in practice.

## Acceptance criteria

- [ ] Signed out: `/documents` shows the list (or the empty state) and a "Sign in with Google to upload" prompt.
- [ ] Signed in: uploading a sample PDF shows progress, then the card appears with status "Uploaded", "Awaiting extraction", file name and size.
- [ ] A `.txt` or a file over 10 MB is refused in the browser with a clear message. The same request sent with curl is refused by the route and by the bucket.
- [ ] `POST /api/uploads` without a session returns 401. Registering another user's path returns 403.
- [ ] After 20 uploads in a UTC day, a 429 response with a readable message is shown.
- [ ] The Supabase security advisor shows no new warnings for `papertrail`.
- [ ] tsc, lint, test and build pass. There are no prerender errors in dev.

## Checks

- `npx tsc --noEmit`
- `npm run lint`
- `npm run test`
- `npm run build`
- MCP `get_advisors` (security) after the migration.
- `curl` the routes (401, 400 and 403 paths).
- Dev click-through at 1440 and 375 px.

## Manual test steps

1. Do the owner steps, then reload `npm run dev`.
2. Signed out, open http://localhost:3000/documents. You should see the empty state and the sign-in prompt.
3. Sign in and drop a synthetic invoice PDF (I'll generate one into `samples/` if none exists). Watch the progress bar, then the "Uploaded" card.
4. Try a `.txt` file and a file over 10 MB. Both should be refused with a message.
5. Reload the page. The document is still listed, read back from Postgres.

## Results

- **Shipped as planned.**
  - Migration applied with MCP `apply_migration`: the `papertrail` schema, `documents` and the private bucket.
  - The owner exposed `papertrail` in the dashboard.
  - A signed-in upload of `synthetic-cobalt-ridge-inv-0587.pdf` produced a row with status `uploaded` and a card reading "Awaiting extraction · Uploaded · 97 KB · Oct 31".
- **Access check:** the secret key reads `papertrail.documents`. The publishable key gets `42501 permission denied for schema papertrail`.
- **Storage check** (Node, secret key):
  - The signed-URL `PUT` with no apikey returns 200, which is exactly the browser path.
  - `info()` returns the real `size` and `contentType`.
  - `list()` returns `created_at` for the cap.
  - The bucket refuses `text/plain` with `415 invalid_mime_type` even when given a valid signed URL.
- **Route checks:** both routes return 401 without a session. A signed-out `/documents` shows the list plus the "Sign in to upload" card.
- **Security advisor:** one INFO, "RLS enabled, no policy" on `documents`, which is intended (service_role only). One WARN about leaked-password protection, unrelated (no password sign-in).
- **Deviations and bugs found:**
  - **Types:** the MCP type generator only emits `public`, so `lib/db/types.ts` is hand-kept in the generator's format and checked against `information_schema.columns` (exact match). Recorded in the file header.
  - **Swallowed prerender signal:** a `try/catch` around `listDocuments()` caught Next's prerender-end signal ("`io()` rejects when the prerender is complete") and rendered the error card. Fixed with `unstable_rethrow(error)`, as the Next docs say.
  - **Opaque error:** "Invalid schema: papertrail" (PGRST106) before the schema was exposed. The error now names the dashboard setting to change.
  - **Orphaned files:** when saving the row failed, the uploaded file stayed in Storage with no row and still counted toward the cap. A failed insert now deletes the object. Two orphans from before the fix remain; the owner decides whether to delete them.
  - **Stale dev server:** the owner's long-running dev server kept serving the old `DocumentCard` (unconditional `<Link href>`), which raised a prop-type error. A fresh build showed no error, and a restart fixed it.
  - **Layout gap:** the empty status line reserved height under the drop zone. The live region is now the last child, below "N of 20 uploads left today".
- **Samples added:**
  - `synthetic-harbor-pine-inv-2041.pdf`: plain, USD, totals reconcile.
  - `synthetic-cobalt-ridge-inv-0587.pdf`, `.png` and `.html` source: EUR, 21% VAT, a PO number and a "RECEIVED" stamp date as distractors, totals reconcile.
- **Checks:** tsc, lint, Vitest (30 tests, 12 new in `lib/uploads.test.ts`) and build all pass.
