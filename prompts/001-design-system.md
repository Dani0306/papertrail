# 001 — Design system

**Status:** done — ink blue primary
**Branch:** `feat/design-system` (from `chore/agents-md`, which is not merged yet)
**Week:** 2 prep — the review UI lands in week 2. This takes one evening block and does not touch the week 1 CLI.

## Goal

PaperTrail has one design system, built from the Vertex reference (`~/Downloads/designsystem.png`) and adapted for an invoice-review tool. It has Tailwind tokens, fonts, a small set of UI components, and a `/design-system` page that shows all of them. The week 2 screens are then assembled from these parts instead of designed on the fly.

## Docs read

- `node_modules/next/dist/docs/01-app/01-getting-started/13-fonts.md`: `next/font/google` self-hosts the fonts, and variable fonts need no weight list.
- `node_modules/tailwindcss/theme.css` (v4.3.3): the default spacing is `0.25rem`, which already matches the reference's 4px base. The defaults for radius and shadow differ from the reference, so they will be overridden.
- Tailwind v4 `--text-*` tokens accept `--line-height`, `--letter-spacing` and `--font-weight` sub-keys. One class sets the whole type-scale step.

## Code inspected

- `app/globals.css`: create-next-app defaults (Geist, a dark-mode media query, Arial body).
- `app/layout.tsx`: loads Geist and Geist Mono and keeps the template metadata.
- `app/page.tsx`: the create-next-app splash page.

## What I keep from the reference

- **Structure:** a 5-step primary scale, slate neutrals, a warm off-white page with white cards, and the same spacing, radius and shadow scales.
- **Type:** Playfair Display for page titles only (Display 1/2), and Inter for everything else. The type scale is the same: 48/56, 36/44, 28/36, 22/30, 18/26, 16/24, 14/20, 12/16.
- **Components:** 44px buttons and inputs with a 12px radius, four button variants (primary, secondary, tertiary, text), uppercase tinted badges, icon-plus-label status indicators, and a progress bar.
- **Icons:** outline, 24px grid, 2px stroke, round caps.

## What I adapt for PaperTrail, and why

1. **The primary changes from orange to ink blue** (recommended, your choice). In this app the most important visual signal is "this field needs review", and amber/orange is the standard colour for that warning. With an orange brand, primary buttons and flagged fields would look alike, and the user could not tell "click me" from "check me". Ink blue suits the "paper and ink" name, reads as trustworthy for financial data, and leaves amber free to mean one thing. If you keep orange, buttons must use the 600/700 shades: white text on `#F97316` has about 2.8:1 contrast and fails WCAG AA.
2. **Semantic colours the reference lacks.** `review` (amber) for low confidence, `success` (green) for extracted/reviewed, `danger` (red) for `needs_human` and errors, and `escalated` (violet) for documents that went to Sonnet. Each one has a bg, border and text token.
3. **A mono font for evidence.** `sourceQuote` is literal text copied from the document, so it is set in Geist Mono (already installed) to look like a quote rather than a value. Money uses Inter with `tabular-nums` so the decimal points line up in a column.
4. **Denser components.** A review table needs compact rows, so buttons and inputs get an `sm` size (36px) next to the reference's 44px default.
5. **Domain components the reference doesn't have:**
   - `ConfidenceBadge` and `FieldRow`: a value, its confidence, and the `sourceQuote`. Below the threshold the row gets an amber background, a left border and a "Review" tag. A `null` value shows as a muted "Not found".
   - `DocumentStatus`: shows each document status (`uploaded`, `extracting`, `extracted`, `escalated`, `needs_human`, `reviewed`) with its own icon and colour.
   - `StatCard`: for the cost, latency and accuracy numbers.
6. **Light theme only.** The reference is light-only and the demo is a 30-second click-through. Dark mode would double the token work for no portfolio gain, so I remove the create-next-app dark media query.
7. **A closed palette.** `--color-*: initial` turns off Tailwind's default colours, so only PaperTrail tokens exist. A stray `bg-rose-300` fails to compile instead of drifting into the UI.

## What this teaches

The design system is not on the gap list. It does connect to one gap-list item, per-field confidence: the confidence-to-display rule (`ok` / `review` / `missing`) is a pure function in `lib/design/confidence.ts` with a Vitest test. When the threshold is tuned in week 3, the UI and the scorer will share one definition of "flagged".

## Files to touch

- `app/globals.css`: edit. `@theme` tokens for colours, fonts, type scale, radius and shadows; base styles.
- `app/layout.tsx`: edit. Load Inter, Playfair Display and Geist Mono; real metadata.
- `app/page.tsx`: edit. Replace the splash page with a minimal placeholder home that links to `/design-system`.
- `app/design-system/page.tsx`: create. A showcase built in the same order as the reference sheet.
- `components/ui/`: create. `button.tsx`, `input.tsx`, `select.tsx`, `badge.tsx`, `card.tsx`, `progress-bar.tsx`, `status-indicator.tsx`, `logo.tsx`, `nav.tsx`, `breadcrumbs.tsx`.
- `components/review/`: create. `confidence-badge.tsx`, `field-row.tsx`, `document-status.tsx`, `stat-card.tsx`.
- `lib/cn.ts`: create. A five-line class joiner, so no `clsx`/`tailwind-merge`.
- `lib/design/confidence.ts` and `lib/design/confidence.test.ts`: create.
- `vitest.config.ts` and `package.json`: install Vitest and add the `test` script.
- `AGENTS.md` §3: edit. Point UI work at the tokens and components, and ban raw hex values.

## New dependencies

- `lucide-react` (pinned `1.58.0`, about 2 weeks old). The reference's icon spec (24px grid, 2px stroke, round caps) is Lucide's default style. It is free and tree-shaken, so only the icons we import ship. The alternative, hand-copied inline SVGs, gets inconsistent as soon as we need a 15th icon.
- `vitest` (dev, `5.0.4`). It is already in the decided stack; this task brings forward the install that week 1 needs anyway.

## Requirements

1. No raw hex or arbitrary colour values in components. Only tokens.
2. Body text on the page background and button labels meet WCAG AA (4.5:1).
3. Every interactive component has a visible `focus-visible` ring and a disabled state.
4. `FieldRow` takes the threshold as a prop, defaulting to the config value 0.85. It does not hard-code it.
5. Components are server-component-safe unless they need state. No `"use client"` on pure presentational ones.
6. The showcase page renders with no network, Supabase or model calls.

## Security and data safety

- The showcase uses synthetic invoice values (e.g. "Northwind Office Supply", INV-2041). No real vendors or client data.
- No keys or env vars are involved.

## Cost impact

None. No model calls.

## Acceptance criteria

- [ ] `/design-system` shows colours, typography, type scale, spacing, radius and shadows, icons, buttons, inputs, badges, statuses, progress, cards, nav and breadcrumbs, plus the PaperTrail-specific field rows and document statuses.
- [ ] A low-confidence `FieldRow` stands out at a glance from a confident one; a `null` field reads as "Not found".
- [ ] Using a default Tailwind colour such as `bg-red-500` produces no CSS.
- [ ] tsc, lint, test and build all pass.

## Checks

- `npx tsc --noEmit`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run dev`, then a headless screenshot of `/design-system` compared against the reference.

## Manual test steps

1. `npm run dev`
2. Open http://localhost:3000/design-system.
3. Tab through the buttons and inputs: each one shows a blue focus ring.
4. Check the "Field rows" section: the amber rows are the ones below 0.85.
5. Narrow the window to 375px: sections stack, with no horizontal scroll.

## Results

- Shipped as planned, with ink blue as the primary.
- `@types/node` went from ^20 to ^24: Vitest 5 requires @types/node 22 or newer as a peer, and local Node is v24.22.0. Not forced with --legacy-peer-deps.
- Swatches on `/design-system` are parsed from `app/globals.css` at build time, so the showcase cannot drift from the tokens.
- The built CSS contains only the PaperTrail colour families (primary, neutral, review, success, danger, escalated). No default Tailwind palette.
- Mobile bug found by screenshot: the page grid had no explicit column template on small screens, so the `min-w-xl` tables made it wider than the viewport. Fixed with `grid-cols-1` (`minmax(0, 1fr)`).
- Headless Chrome cannot render narrower than 500px. The 375px check was done inside a 375px iframe.
- Not built: pagination (from the reference) and dark mode. Add them when a screen needs them.
- 10 Vitest tests for `confidenceLevel` / `formatConfidence`. tsc, lint and build are clean.
