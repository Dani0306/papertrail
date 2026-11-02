# 015 — Demo mode, pre-launch check, production verification

**Status:** done (item 6 finishes after the merges deploy)
**Branch:** `feat/demo-mode`, from `feat/golden-set-30` (which holds #16; see "Merge gap")
**Week:** 4, items 3–6 (deployment itself is skipped: the owner already deployed to Vercel)

## Goal

A recruiter opens the live URL, clicks **Try the demo**, and within 30 seconds sees:
- a real messy invoice beside its fields, with amber flags and source quotes;
- what it cost and how long it took;
- a spreadsheet download with a Check column.

No login. Production is verified to do exactly that, and the routes are audited before anyone outside sees them.

## Findings before planning (2 Nov, read-only)

- **Merge gap.** PR #16 (the CI workflows, the confidence A/B, manual entry) was merged into `feat/golden-set-30` **18 minutes after** #14 merged that branch into `main`. `git merge-base` confirms its commits (`f306485`, `307e3a8`, `eeabd25`) **aren't on `main`, so they aren't in production.** Only the database is ahead: the `manual` mode migration is already applied.
- **Vercel** (MCP, read-only):
  - Project `papertrail`; production is the `main` merge of #14 (`3a19569`).
  - Production alias **`https://papertrail-chi-one.vercel.app`** answers 200 signed out. The team alias redirects to Vercel SSO (Vercel Authentication covers "all except custom domains"), so only `-chi-one` is shareable.
  - Environment variable names (values not read): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `OPENAI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
  - No `PAPERTRAIL_*`, so the code defaults apply: luna/sol, threshold 0.85, 50 extractions/day, 20 uploads/user/day.
  - `GOOGLE_*` aren't read by the app; Google OAuth is configured in Supabase.
- **Landing page:**
  - still says "In the lab · week 1" and "The extraction CLI comes first. Upload, review and export land in week 2";
  - both calls to action go to `/design-system`.
- **Public samples:** one (Quarry & Ash, made by hand in prompt 009). Production lists only that and whatever the visitor uploaded.
- **`/design-system`** scrolls sideways at 375 px because of the type-scale table (`min-w-xl` with no scroll container), found in prompt 014.
- **README** says "Not deployed yet".

## Decisions and assumptions

**Merge gap (owner decision, 2 Nov):** PR #17 opened, `feat/golden-set-30 → main`, carrying #16's commits. This branch starts from `feat/golden-set-30`, so its own PR follows #17.

**Item 3, preloaded demo samples:**
- `npm run seed:samples [-- --limit 0.05]`, a rerunnable script.
- For each of **a curated 8** (owner decision, 2 Nov): Quarry & Ash, Ridgeline, Bluefin, Cerro Azul, Brightwater, Lumbre, Pinecrest and Harbor Pine. They're the most telling ones.
  1. upload it to Storage at `samples/<file>`. That's outside `uploads/<user>/`, so no one's upload cap is touched.
  2. insert a `documents` row with `uploaded_by: null` (public, read-only);
  3. extract it through the **real pipeline** (`extractDocument` with the real store and the real model), so the cost, latency and model shown are genuine.
- **Claiming a public sample.** The pipeline's claim matches the uploader, which a sample doesn't have. A new store function, `claimSample(id, staleBefore)`, claims only `uploaded_by is null` rows. The script wraps the store with it; the extract route never sees it, so a visitor still can't run a sample.
- **Idempotent:**
  - a sample already extracted (by filename, public) is skipped;
  - one stuck at `uploaded` or `needs_human` is retried once;
  - the existing public Quarry & Ash counts as done.
- **Cost guard.**
  - The cost stops above `--limit` (default **$0.05**). That's 8 × about $0.0005 ≈ **$0.004** expected; Brightwater has 2 pages and 26 lines.
  - The global 50/day extraction cap is respected; seeding uses at most 7 of a day's 50.
  - Rejected: bypassing the cap, which exists to protect the budget.
- **What the visitor sees afterwards.** The queue and list then show the hard cases: Ridgeline's confident misread will be **visible as a silent error only to someone who checks the scan**. That's honest, and the README already calls it out.

**Item 4, demo polish:**
- **`GET /demo`** is a stable, shareable link for the README, video and case study. It redirects to the public Quarry & Ash sample (2 amber flags, the clearest 30-second story), falls back to `/documents`, and is found by filename, so it works in any environment.
- **Landing page:**
  - the badge becomes "In the lab · live demo";
  - the primary call to action is **Try the demo** → `/demo`, with Browse documents second;
  - the closing band is rewritten from stale week-1 copy to what exists now, with numbers **only from committed runs** (99.79% field accuracy, $0.00045 per document, 30 documents);
  - the design-system link moves to the footer of the band.
- **Sample review screen:** next to "Sample document · read only", a short line: "Sign in to upload your own invoice."
- **`/design-system`:** the type-scale table goes in an `overflow-x-auto` container.
- **README:** the status line becomes "In the lab · live demo: https://papertrail-chi-one.vercel.app/demo". That isn't "finished": "In the lab" stays until the definition of done is met. The architecture and cost tables are item 7.

**Item 5, pre-launch check:**
- **Route audit**, written up in Results. Every route in `app/api/**` and `app/auth/**` is checked for:
  - auth where it spends money;
  - visibility filtering;
  - Zod-validated input;
  - error bodies that leak nothing;
  - caps;
  - `Cache-Control` on private downloads.

  Plus the Supabase security advisors. Anything found is fixed here, with a test.
- **Signed-in walkthrough:** a checklist (in Manual test steps) **you** run on production: upload, extract, correct, revert, mark reviewed, export, sign out → 404 on your own upload. I can't sign in as you.

**Item 6, production verification (no deploy):**
- After the merges reach `main`, confirm with Vercel MCP (read-only) that production builds the new commit and is READY.
- Then check signed out, with curl and Playwright against `https://papertrail-chi-one.vercel.app`:
  - `/`, `/demo` redirects to the sample, the sample's review screen with flags, `/review`, `/exports`;
  - the CSV and XLSX downloads;
  - a hidden document → 404;
  - `get_runtime_errors` is clean.
- **Google sign-in on production** needs `https://papertrail-chi-one.vercel.app/auth/callback` in Supabase → Auth → URL configuration. I can't read that setting, so it's in your checklist.
- Rejected: turning off Vercel Authentication project-wide. The production alias is already public, and the team alias staying private is fine.

## What this teaches

Not a gap-list task. Two short engineering notes:
- **The demo data goes through the real pipeline,** so every number a recruiter sees (cost, latency, flags) is a measured one, not fixture text.
- **A stacked PR merged into its base after the base was merged never reaches `main`.** Check `git merge-base --is-ancestor` before calling work shipped. It happened twice here: #8 and #16.

## Files to touch

- `lib/db/extractions.ts`: edit (`claimSample`).
- `scripts/seed-samples.ts`: create. `package.json`: add `seed:samples`.
- `app/demo/route.ts` and `.test.ts`, `lib/db/samples.ts` (find a sample by filename): create.
- `app/page.tsx`, `app/documents/[id]/page.tsx`, `app/design-system/page.tsx`, `README.md`: edit.
- `CLAUDE.md` and this file's Results section: edit.

## Security and data safety

- **Synthetic samples only.** They become public on production, which is the point of demo mode. They're all invented and marked synthetic on the page.
- **`claimSample` is used only by the local seed script** (secret key, server-side). No route exposes it.
- **No environment values are read**; only names were listed.

## Cost impact

- Seeding: about **$0.004** (7 new luna extractions; Quarry & Ash exists already), capped at $0.05.
- Everything else: $0.
- Project spend so far is $0.543.

## Acceptance criteria

- [ ] **Seeding:** 8 public samples, extracted. A rerun extracts nothing (idempotent). Cost reported. Rows checked by SQL: 8 documents with `uploaded_by is null` and an extraction each.
- [ ] **`/demo`:** unit-tested (found → redirect, missing → `/documents`); in production it lands on Quarry & Ash.
- [ ] **Polish:**
  - the landing page shows the demo call to action and current numbers, with no stale week-1 copy;
  - the sample hint;
  - the design system has no horizontal scroll at 375 px;
  - the README status line.
- [ ] **Route audit** written. Findings fixed with tests, or explained. Advisors clean.
- [ ] **Production** READY on the new `main` and checked signed out (pages, downloads, 404s), with no runtime errors.
- [ ] tsc, lint, test, build and `eval:report --check` pass. CLAUDE.md log written.

## Checks

- `npx tsc --noEmit`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run seed:samples` (once, then again to prove idempotence)
- Playwright at 1280 px and 375 px, locally and on production
- Vercel MCP: deployment state and runtime errors

## Manual test steps (yours, on production)

1. Supabase → Authentication → URL configuration: add `https://papertrail-chi-one.vercel.app/auth/callback` to the redirect URLs.
2. Open `https://papertrail-chi-one.vercel.app/demo` in a private window. You land on Quarry & Ash with 2 amber fields, no login.
3. Sign in with Google, upload `samples/synthetic-kestrel-receipt-scan.png` and click Extract. Then:
   - correct a field and revert it;
   - mark the document reviewed;
   - download the XLSX.
4. Sign out and open your document's URL. You get the 404 page.

## Results

**Merge gap.** PR #17 is open: `feat/golden-set-30 → main`, carrying #16's 8 commits (CI, the A/B, manual entry). This branch builds on it.

**Item 3, demo samples (owner decision: a curated 8):**
- `npm run seed:samples` ran through the real pipeline using `claimSample`, a public-only claim that no route uses:
  - 7 new samples were seeded, and Quarry & Ash, which already existed, was skipped;
  - **$0.00336** in total;
  - a rerun skipped all 8 and spent **$0**.
- SQL: 8 documents with `uploaded_by is null`, each with exactly 1 `gpt-6-luna` extraction. Files are under `samples/` in the bucket, outside any user's upload prefix.
- **The demo is honest about the known limit.** The public Ridgeline sample shows the invoice number `FO-06218` at 0.99, the same confident misread the baseline found, so it isn't flagged. The README already explains this, and week 4's optional item 12 is the safeguard.
- **New dependency: `server-only` 0.0.1**, the package the Next.js docs recommend: one file, no dependencies, stable since 2022. The seed script runs `lib/db` under Node's `react-server` condition, where it resolves to its empty module. Without it, `lib/db` can't load outside Next. Before, scratch checks used a stub.

**Item 4, demo polish:**
- **`GET /demo`** redirects (307) to the public Quarry & Ash sample, looked up by filename, and falls back to `/documents`. 2 tests. Checked locally: it lands on QUARRY & ASH HARDWARE, and the PDF iframe loads its signed URL (200).
- **Landing page:**
  - the badge reads "In the lab · live demo";
  - **Try the demo** / Browse documents / How it works;
  - the closing band is now "Measured, not claimed": 99.8% field accuracy on 30 synthetic invoices at about $0.0005 each (from `evals/baseline.json`), with links to the eval results and the design system;
  - the "one row per invoice" copy is corrected.
- **The hero preview was a mock that contradicted the live demo.** It showed `harbor-pine-inv-2041.pdf` with its total flagged at 62% "printed with a letter O", but the real Harbor Pine sample has no flags. It's replaced with **the real Quarry & Ash extraction**: `QA-2O61` @ 0.78, `$6l2.14` → $612.14 @ 0.76, the vendor and due date @ 0.99.
- **Sample hint:** "Sample document · read only. Sign in to upload your own invoice."
- **Horizontal scroll at 375 px.** Fixed the two design-system overflows (the type-scale table and the button grid, both now in `overflow-x-auto`). **Found the real culprit in `DocumentCard`:** a card with a vendor, a total, pages and "N to review" couldn't shrink (no `min-w-0`) or wrap its metadata. That also affects `/documents` and `/review`. Measured in the 375 px tab, all at 360/360 (scrollbar): `/`, `/documents`, `/review`, `/exports`, `/design-system`.
  - One measurement was thrown away. A same-origin iframe check reported 375/375 everywhere, but the new `X-Frame-Options: DENY` blocks same-origin framing too, so it was measuring blank pages.
- **README:** the status reads "In the lab, with a live demo" plus a link to `/demo`. A Demo mode line replaces "Not built yet: deployment".

**Item 5, pre-launch check (route audit):**

| Route | Auth | Input | Visibility / caps | Errors |
|---|---|---|---|---|
| `POST /api/uploads` | `requireUser` | Zod (type, 10 MB) | 20/user/day **+ new global 50/day** | generic 500 |
| `POST /api/documents` | `requireUser` | Zod | owned path, size and type re-read from Storage | generic 500 |
| `POST /api/documents/[id]/extract` | `requireUser` | uuid | uploader only, global 50/day, one claim | generic 500 |
| `PATCH …/fields`, `POST …/review`, `POST …/manual` | `requireUser` | uuid + Zod (field types) | uploader only; others' uploads 404 | generic 500 |
| `GET /api/exports` | optional | Zod | `visibleTo` filter, `private, no-store` | generic 500 |
| `GET /demo` | none | none | public sample only | falls back to `/documents` |
| `/auth/sign-in`, `/auth/callback`, `/auth/sign-out` | n/a | `safeNextPath` | Supabase allow-lists `redirectTo`; sign-out is POST | `/auth/error` |

**Fixed:**
1. **There was no global upload cap.** The per-user cap of 20 doesn't bound a public demo where anyone can open Google accounts, and files land in the **shared** lab project's free-tier storage. Added `PAPERTRAIL_GLOBAL_DAILY_UPLOAD_CAP` (default 50, matching the extraction cap). It counts registered documents across users (checked live: 1 today). The 429 message says whose cap was hit. Covered by 3 uploads-route tests (the route had none before) and a `capFromEnv` test.
   - **Residual gap:** files uploaded through a signed URL but never registered are bounded only by the per-user cap. Closing that would need the upload counted at URL issue time. It's noted, not built.
2. **There were no security headers.** All responses now send `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'` (against clickjacking on the review screen's edit buttons) and a restrictive `Permissions-Policy`. Checked with `curl -I`. The PDF preview iframe still loads, because `frame-ancestors` governs who frames us.
   - **No script CSP:** under Partial Prerendering it would need nonces. Out of scope for now.

**Noted, not changed:**
- **CSRF:** the JSON writes rely on the Supabase session cookie, which is `SameSite=Lax`, so it isn't sent on cross-site POSTs.
- **The origin for auth redirects** comes from `x-forwarded-host`, which Vercel sets; the OAuth `redirectTo` is still checked by Supabase's allow-list.

**Supabase advisors:**
- security: only the by-design "RLS enabled, no policy" (secret key only) and the project-wide password-protection warning, which doesn't apply because there's no password sign-in;
- performance: none.

**Item 6, production (no deploy):**
- Vercel project `papertrail`. Production is `main` at #14 (`3a19569`), READY. **`https://papertrail-chi-one.vercel.app` is public** (200 signed out); the team alias is SSO-protected.
- **Already live**, because production reads the same database: all 8 seeded samples on `/documents`, and the CSV export (200). `/demo` gives 404 until this branch deploys.
- **To finish once #17 and this PR merge:**
  - confirm the production deployment of the new `main` is READY;
  - check `/demo`, the headers, the sample review screen and the downloads signed out;
  - check `get_runtime_errors`.
- **Yours:** add `https://papertrail-chi-one.vercel.app/auth/callback` in Supabase Auth URL configuration, then do the signed-in walkthrough.

**Tests:** 342 pass, up from 336. tsc, lint, build and `eval:report --check` pass.

**Spend:** $0.00336 (seed). Project total **$0.54678**.
