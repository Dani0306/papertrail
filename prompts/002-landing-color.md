# 002 — Landing page with colour

**Status:** done
**Branch:** `feat/landing-color` (from `feat/design-system`, not merged yet)
**Week:** 1 — but this is UI, and the week 1 CLI (due 31 Oct) has not started. Keep it to about one hour so it doesn't push the CLI further.

## Goal

Make the home page less plain. Right now it is a heading, a paragraph and one grey button on off-white. Add colour that also explains the product: an ink-blue hero, a product preview where the colours have real meanings, and the failure ladder drawn in its status colours.

## Docs read

- `node_modules/tailwindcss` v4.3.3: gradients are `bg-linear-to-*` with `from-*`/`to-*`, and they only take token colours because `--color-*: initial` is set.
- No Next.js API changes. The page stays a static server component.

## Code inspected

- `app/page.tsx`: placeholder hero. One `tertiary` link to `/design-system`.
- `app/globals.css`: closed palette. `primary` (ink blue) is the only brand colour. `review`, `success`, `danger` and `escalated` each have a semantic meaning.
- `components/review/field-row.tsx`, `document-status.tsx`, `components/ui/card.tsx`, `badge.tsx`, `button.tsx`: everything the preview needs already exists.
- `lib/design/confidence.ts`: `FieldRow` already uses `confidenceLevel()` to decide when a row turns amber.

## Decisions and assumptions

- **Colour comes from meaning, not decoration.** AGENTS.md §3 says amber means only "below the confidence threshold", so I can't add amber accents for style. Instead the page *shows* the product. The preview card has a real low-confidence `FieldRow`, so that amber is used correctly. The ladder strip uses green, violet and red because they are the statuses the documents actually end in.
- **Brand colour = primary.** The hero gets a `primary-50 → paper` gradient, a faint ruled-paper texture made from `primary-100` lines (it goes with the "paper and ink" name), a `primary` CTA button, and a solid `primary-700` closing band with white text.
- **The preview reuses `FieldList`/`FieldRow`/`DocumentStatus` unchanged.** No new components and no copies of their rules.
- **Synthetic data only:** "Harbor & Pine Stationers", `INV-2041`, invented amounts.
- **CTA target:** `/design-system`, because it is the only route that exists. The nav links still 404 until week 2. Assumption: the hero CTA moves to `/documents` when that route exists.

## What this teaches

Nothing from the gap list. It is UI only.

## Files to touch

- `app/page.tsx`: edit. Hero, preview card, a "how it works" row with four steps, the failure-ladder strip, and the closing band.

## Requirements

1. Tokens only. No hex values and no arbitrary colours (the texture uses `var(--color-primary-100)`).
2. Amber appears only through `FieldRow` on a field below the threshold.
3. Every status colour comes with a text label (`DocumentStatus` / `StatusIndicator`). Colour is never the only signal.
4. Text contrast is AA: white on `primary-700`, and `neutral-600` or darker on light surfaces.
5. Focus-visible rings on every link. It must be responsive down to 375px with no horizontal scroll.
6. It stays a server component. No `"use client"` and no new dependencies.

## Security and data safety

- No keys or env vars. The preview values are invented.

## Cost impact

None. No model calls.

## Acceptance criteria

- [ ] The home page has an ink-blue hero, a product preview with one amber (review) row, one confident row and one "Not found" row, and a coloured failure-ladder strip.
- [ ] The only amber on the page comes from the below-threshold `FieldRow`.
- [ ] The layout works at 375px and at desktop width.
- [ ] tsc, lint, test and build pass.

## Checks

- `npx tsc --noEmit`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run dev`, then screenshots of `/` at desktop and mobile widths.

## Manual test steps

1. `npm run dev`
2. Open http://localhost:3000.
3. Check the hero gradient, the preview card on the right (it stacks below on mobile), and that only the "Total" row is amber.
4. Tab through the links: each one shows a focus ring.
5. Narrow the window to 375px: no horizontal scroll.

## Results

- Shipped as planned in `app/page.tsx` only. No new components, no new dependencies.
- Sections: a ruled-paper hero (`primary-50 → paper` gradient plus `primary-100` lines), an extraction preview card, "How it works" (4 primary steps), "Never a silent guess" (failure ladder with success/primary/escalated/danger top rules, each one labelled), and a `primary-700` closing band.
- The amber appears only on the below-threshold `Total` row (0.62) and its "1 field to review" caption. The quote `1,284.5O` (a letter O) explains why the row is flagged.
- Found by screenshot: with a 30rem preview column the source quotes were truncated and the letter-O evidence was hidden. Widened the column to 34rem.
- The closing-band link is hand-styled rather than `buttonClasses()` because `cn` doesn't resolve Tailwind conflicts and that band needs a white focus ring on ink blue.
- tsc, lint, 10 Vitest tests and build all pass. Checked at 1440px and at 375px (inside an iframe, since headless Chrome can't go below 500px).
