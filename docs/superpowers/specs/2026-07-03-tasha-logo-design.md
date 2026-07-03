# Tasha — Logo & Acronym

**Date:** 2026-07-03
**Status:** Approved design

## Acronym

**TASHA — Train. Attack. Sweat. Hold. Again.**
Five imperatives; the tagline renders in letterspaced caps under the wordmark.

## Mark: the tally five

Four bone-white vertical strokes with slightly irregular hand-tallied heights,
crossed by one heavy diagonal slash in the bell-red accent — the fifth count.
Round-counting made visual; five letters, five words. Hard butt caps, no
rounding on strokes (drill-hall print, not a sticker).

## Deliverables

1. `public/favicon.svg` — the mark on a warm-ink rounded-square tile (fixed
   hex colors; static file), linked via `<link rel="icon" type="image/svg+xml"
   href="/favicon.svg">` in `index.html`.
2. `src/components/Logo.tsx` — the mark as an inline SVG component
   (`{ size?: number }`, default 32): strokes in `currentColor`, slash in
   `var(--accent)`, `aria-hidden`.
3. **App header** in `App.tsx`, above the existing nav (Setup/Pool screens
   only): mark at 40px + stacked wordmark "Tasha" (Big Shoulders 800,
   uppercase via CSS) with the tagline beneath (small, letterspaced caps,
   muted). Workout screen untouched.
4. CSS: `.brand`, `.brand-name`, `.brand-tag` in `src/index.css`.

## Verification

Build + full unit suite + existing E2E suites (nav markup unchanged below the
new header; no locator churn expected). Screenshot pass of header and favicon.

## Out of scope

PNG/ICO fallbacks (SVG favicon suffices in Chrome), done-screen stamp, PWA
manifest icons.
