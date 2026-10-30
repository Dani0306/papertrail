# 003 — Google sign-in for paid actions

**Status:** done (code). Waiting on the owner's dashboard steps for a live Google round-trip.
**Branch:** `feat/google-auth` (stacked on `feat/landing-color` until PRs #1–#3 merge)
**Week:** 1, but this is week-2 plumbing. The week 1 CLI (due 31 Oct) still hasn't started, and this task pushes it back by roughly one evening.

## Goal

Visitors can sign in with Google through Supabase Auth, and the server can tell who is signed in. Every page stays public. Only actions that spend money (upload and extraction, added in week 2) will require a signed-in user, and this task adds the `requireUser()` helper those routes will call.

## Scope change (owner decision, 29 Oct)

CLAUDE.md listed "Auth and multi-tenancy (demo mode only, no login)" as out of scope, and AGENTS.md said "Do not use … an auth provider". Daniel chose **"Gate paid actions only"**:

- Browsing, the preloaded samples and the 30-second recruiter click-through stay public. There is no login wall.
- A Google login is required only to upload or extract.
- Still out of scope: multi-tenancy, per-user data separation, roles, and any provider other than Google.

Both docs get updated in this task so they stop contradicting the code.

## Docs read

- Supabase, *Creating a Supabase client for SSR* (read 29 Oct via the Supabase MCP):
  - Install `@supabase/supabase-js` + `@supabase/ssr`.
  - Use `createServerClient` with `cookies.getAll`/`setAll`. In Next.js 16, the Proxy refreshes the token by calling `supabase.auth.getClaims()` and must return the response that carries the refreshed cookies plus the cache headers passed to `setAll`.
  - Never trust `getSession()` on the server. `getClaims()` checks the JWT signature on every call.
- Supabase, *Sign in with Google* (`/docs/guides/auth/social-sign-in/auth-google`, read 29 Oct):
  - The Google Cloud OAuth client is a "Web application".
  - Its **Authorized redirect URI** is the Supabase callback, `https://<ref>.supabase.co/auth/v1/callback`, not the app.
  - For the server-side PKCE flow:
    1. `signInWithOAuth({ provider: 'google', options: { redirectTo } })` returns the Google URL and stores a code-verifier cookie.
    2. `app/auth/callback/route.ts` calls `exchangeCodeForSession(code)`.
    3. `redirectTo` must be on the project's redirect allow-list.
- Supabase API keys note (same page): the legacy `anon` and `service_role` keys **stop working at the end of 2026**. New code should use `sb_publishable_…` and `sb_secret_…`.
- `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` (Next 16.4.3): Middleware is now **Proxy**, in a root `proxy.ts` exporting `proxy`. It is for optimistic checks only, not full authorisation, so the real check happens in the route.
- npm, 29 Oct: `@supabase/ssr` 0.12.7, `@supabase/supabase-js` 2.118.0.

## Code inspected

- **`.env.local`.** I looked at variable names and key *types* only, never values:
  - `NEXT_PUBLIC_SUPABASE_URL` points at the MCP project `zatpmduchxvwjehixlbl`.
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` is a **legacy JWT** key.
  - `SUPABASE_SERVICE_ROLE_KEY` already holds a **new `sb_secret_` key**.
  - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are present, and the ID has a valid web-client format.
- **`.env.example`.** It uses server-only names (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`) and states "Nothing in this app needs a NEXT_PUBLIC_ key". That doesn't match `.env.local`.
- **Supabase MCP.** It has no tool that configures Auth providers, so Google gets turned on in the dashboard (see Owner steps).
- **`components/ui/nav.tsx`.** A server component with a "Demo mode" badge at the right. The sign-in control goes next to that badge.
- **`components/ui/button.tsx`.** `buttonClasses()` styles links and form buttons. No new primitive is needed.

## Decisions and assumptions

- **No browser Supabase client at all.**
  - Sign-in is a server route that calls `signInWithOAuth` and redirects to Google. Sign-out is a `POST` form handled by a server route.
  - The browser only ever follows redirects, so the "the browser never talks to Postgres" boundary holds.
  - The Supabase URL and keys stay **server-only** (no `NEXT_PUBLIC_`), which matches `.env.example`.
  - Rejected: `createBrowserClient` with a public publishable key. It's safe by design but unnecessary here, and it would open a second path to the database.
- **Proxy only refreshes the session and never redirects.** All pages are public. The authorisation check is `requireUser()` (`getClaims()`), called inside each paid route handler. That's what the Next.js docs ask for: Proxy is an optimistic layer, not the security boundary.
- **Open-redirect guard.** The doc example accepts any `next` that starts with `/`, which still lets `//evil.com` through. `safeNextPath()` accepts only a single leading `/` followed by a non-`/`, non-`\` character and falls back to `/` otherwise. It's unit-tested.
- **Env names (assumption: you rename in `.env.local`):** `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (a new `sb_publishable_…` key from Settings → API Keys, replacing the legacy anon key) and `SUPABASE_SECRET_KEY` (the `sb_secret_` value you already have). I won't edit `.env.local` myself.
- **`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are not read by the app.** With hosted Supabase they belong in the Supabase dashboard. Once they're pasted there, you can delete them from `.env.local`.
- **Any Google account can sign in.** Cost protection comes from the daily extraction cap planned for week 2. Assumption: if you'd rather allow-list your own email, it's a one-line check in `requireUser()` later.
- **Rendering:** reading cookies in the nav makes pages render dynamically. That's fine for this app. The sign-in control is a small async server component inside `<Suspense>` so the rest of the nav renders first.

## What this teaches

Not on the gap list. One decision worth knowing anyway: the **server-side PKCE flow**. Supabase sends Google back to `/auth/callback?code=…` and the server swaps the code for a session cookie, so tokens never sit in `localStorage`. Rejected: the implicit flow, where tokens arrive in the URL fragment and only the browser can see them.

## Files to touch

- `package.json`: edit. Add `@supabase/supabase-js@2.118.0` and `@supabase/ssr@0.12.7` (free, already in the planned stack).
- `lib/supabase/env.ts`: create. Reads and checks `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, with a clear error naming the missing variable.
- `lib/supabase/server.ts`: create. `import "server-only"`, plus `createClient()` from the doc's cookie pattern.
- `lib/supabase/proxy.ts`: create. `updateSession(request)` refreshes via `getClaims()`, copies cookies and cache headers, and **never redirects**.
- `proxy.ts`: create. Root Proxy with the doc's static-asset matcher.
- `lib/auth.ts`: create.
  - `getUser()`: claims or null.
  - `requireUser()`: throws a typed `UnauthorizedError` that route handlers turn into a 401.
  - `safeNextPath()`.
- `lib/auth.test.ts`: create. Vitest cases for `safeNextPath()`.
- `app/auth/sign-in/route.ts`: create. `GET ?next=` calls `signInWithOAuth` with `redirectTo = <origin>/auth/callback?next=…` and redirects to Google.
- `app/auth/callback/route.ts`: create. Calls `exchangeCodeForSession`, then redirects to `next`, or to `/auth/error` on failure (using `x-forwarded-host` on Vercel, per the doc).
- `app/auth/sign-out/route.ts`: create. `POST` calls `signOut()` and redirects with 303 to `/`.
- `app/auth/error/page.tsx`: create. A plain message, a "Try again" link and a link home.
- `components/ui/auth-status.tsx`: create. An async server component:
  - Signed out: a "Sign in with Google" `buttonClasses({ variant: "tertiary", size: "sm" })` link.
  - Signed in: the email (truncated) and a "Sign out" form button.
- `components/ui/nav.tsx`: edit. Render `<AuthStatus />` in `<Suspense>` next to the Demo mode badge.
- `app/design-system/page.tsx`: edit. Show both AuthStatus states statically. The design rule is that every new piece appears there.
- `.env.example`: edit. Rename to the new key names, add `SUPABASE_PUBLISHABLE_KEY`, and add a comment that Google credentials live in the Supabase dashboard.
- `CLAUDE.md`, `AGENTS.md`: edit.
  - Scope: move "Google sign-in for paid actions" out of *Out of scope* and record the 29 Oct decision.
  - AGENTS §6: allow Supabase Auth (Google only).
  - Add a log line.

## Requirements

1. All pages stay reachable while signed out. The proxy never redirects.
2. `requireUser()` uses `getClaims()`, never `getSession()`.
3. No `NEXT_PUBLIC_` Supabase variables and no browser Supabase client. `lib/supabase/server.ts` imports `server-only`.
4. `next` is sanitised by `safeNextPath()` in both the sign-in and callback routes.
5. Sign-out is `POST` only, so a GET from a link or an image tag can't log anyone out.
6. The UI uses tokens only, and the auth controls have focus-visible rings. The signed-in email is never the only signal: there's always a "Sign out" label.
7. No changes to the database schema, Storage, or any Supabase setting from my side.

## Owner steps (dashboard, about 5 minutes; I can't do these through the MCP)

1. **Google Cloud → Auth Platform → Clients → your Web client.**
   - Authorized JavaScript origins: `http://localhost:3000`.
   - Authorized redirect URIs: `https://zatpmduchxvwjehixlbl.supabase.co/auth/v1/callback`.
2. **Supabase → Authentication → Sign In / Providers → Google.** Enable it, then paste the Client ID and Client Secret from `.env.local`.
3. **Supabase → Authentication → URL Configuration.**
   - Site URL: `http://localhost:3000`.
   - Redirect URLs: add `http://localhost:3000/auth/callback`. Add the Vercel URL in week 4.
4. **Supabase → Settings → API Keys.** Create or copy the publishable key.
5. **`.env.local`.** Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` (rename from the current names), then delete the old `NEXT_PUBLIC_*` and `GOOGLE_*` lines.

## Security and data safety

- **Secrets:** the Google secret lives only in the Supabase dashboard. The Supabase secret key isn't used by this task. The publishable key is server-only here.
- **Session cookies:** HttpOnly cookies set by `@supabase/ssr`. The Proxy forwards the cache-control headers so a CDN never caches a response that carries a session.
- **No patient or client data involved.** The only personal data stored is the Google account email in `auth.users`, which Supabase manages.

## Cost impact

None. There are no model calls, and Supabase Auth is within the free tier (50k monthly active users).

## Acceptance criteria

- [ ] Signed out: every page loads, and the nav shows "Sign in with Google".
- [ ] Clicking it goes to Google and comes back to the page you started from, signed in, with your email and "Sign out" in the nav.
- [ ] After "Sign out", the nav returns to the signed-out state.
- [ ] `/auth/sign-in?next=//evil.com` comes back to `/`, not to evil.com.
- [ ] A bad or reused `code` on `/auth/callback` lands on `/auth/error`.
- [ ] tsc, lint, test and build pass.

## Checks

- `npx tsc --noEmit`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run dev` and click through, after the owner steps are done.

## Manual test steps

1. Do the owner steps above, then run `npm run dev`.
2. Open http://localhost:3000/design-system and click "Sign in with Google" in the nav.
3. Pick your Google account. You should land back on `/design-system` with your email in the nav.
4. Reload the page: you should still be signed in, because the Proxy refreshed the cookie.
5. Click "Sign out". The nav should show "Sign in with Google" again.
6. Visit http://localhost:3000/auth/sign-in?next=//evil.com, sign in, and confirm you end up on `/`.

## Results

- **Shipped as planned, with these deviations:**
  - `safeNextPath()` lives in `lib/safe-next-path.ts`, not `lib/auth.ts`, so Vitest can import it without pulling in `server-only`.
  - Added `lib/request-origin.ts` (with tests) to share origin handling between the sign-in, callback and sign-out routes.
  - The nav control is split into three parts:
    - `AuthControls`: presentational, shown in `/design-system`.
    - `SignInLink`: a client component, only for `usePathname()` so sign-in returns to the current page. It doesn't touch Supabase.
    - `AuthStatus`: async, reads the session.
- **Bug found in the run, now fixed:**
  - Under `next start`, Next forwards `x-forwarded-host`, so the doc's pattern of `https://${forwardedHost}` produced `https://localhost:3100`.
  - `requestOrigin()` now uses `x-forwarded-proto` too, falling back to the request's own protocol, and takes the first value of comma-separated headers.
- **Bug found by screenshot, now fixed:** at 375px the badge and sign-in button wrapped under the logo. The nav gap is now `gap-x-4` on phones (`sm:gap-x-10` from 640px up), and the button reads "Sign in" on phones. At 320px it still wraps, right-aligned, which is acceptable.
- **Rendering:** this project has Cache Components on. `/`, `/design-system` and `/auth/error` build as Partial Prerender: the static shell is prerendered and only the `<Suspense>`-wrapped `AuthStatus` streams per request.
- **Design-token exception:** the Google "G" uses Google's four brand hex colours. Google's sign-in branding guidelines require them, so it's a brand asset, not UI colour.
- **Verified against a production build** with the current `.env.local` values mapped to the new names for that process only:
  - Signed-out nav renders on `/`, `/design-system` and `/auth/error`.
  - `/auth/sign-in?next=/design-system` returns a 307 to `zatpmduchxvwjehixlbl.supabase.co/auth/v1/authorize` with `provider=google`, a PKCE `code_challenge`, the code-verifier cookie set, and `redirect_to=http://localhost:3100/auth/callback?next=%2Fdesign-system`.
  - `next=//evil.com` is reduced to `next=%2F`.
  - `/auth/callback?code=bogus` returns a 307 to `/auth/error`.
  - `GET /auth/sign-out` returns 405. `POST` returns 303 to `/`.
  - Supabase's authorize endpoint currently answers `400 Unsupported provider: provider is not enabled`, which is expected until owner step 2.
- **Checks:** tsc, lint, Vitest (18 tests: 4 new for `safeNextPath`, 4 for `requestOrigin`) and build all pass.
