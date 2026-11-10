# BUGFIX — Segmented Control Overflow (Ground Selector Tabs)

Date: 2026-11-10 · Reported by TAIMUR with a screenshot: in the
"Select Cricket Ground" modal on a phone, the "Custom Ground" tab label
ran past the modal's right edge and the fourth tab ("Saved") sat
off-screen.

## Root cause

`.segmented-item` / `.segmented-item-active` (globals.css) carried
`whitespace-nowrap` but no `min-w-0`. A flex item's automatic minimum
size is its min-content, so with nowrap labels the four tabs
(Search Places / Pick on Map / Custom Ground / Saved (n)) could not
shrink below their combined label width. The modal compensated with a
`min-w-[320px]` strip inside an `overflow-x-auto` wrapper — technically
scrollable, visually broken. The same latent defect existed anywhere
`.segmented-control` is used at narrow widths (also the grounds page).

## Fix (globals.css + one class in the modal)

- Both item classes gain `min-w-0` — tabs can now shrink.
- `.segmented-control > * > span` — labels ellipsise inside their own
  tab instead of pushing the strip wider (graceful in every language,
  including longer Bengali labels).
- `@media (max-width: 480px)` — items stack icon-over-label
  (bottom-nav style) with tightened horizontal padding, so each label
  gets the full tab width and all four tabs fit without scrolling.
- GroundSelectorModal: the forced `min-w-[320px]` is removed
  (`segmented-control w-full`).

## Regression tests

`src/__tests__/bugfix-segmented-overflow.test.ts` (5 tests): items carry
min-w-0 (matched against the @layer components definitions — an earlier
transition rule shadows a naive first match, which the test now
documents), label truncation rule present, the ≤480px stacking rule
present, the modal no longer forces 320px, all four tabs still render.

## Gates

Unit **1526/1526** (139 files) · typecheck 0 · lint clean · build PASS ·
Playwright visual 38/38 · offline 10/10 · overlay 4/4 · stageb 4/4.
No baseline re-records needed.
