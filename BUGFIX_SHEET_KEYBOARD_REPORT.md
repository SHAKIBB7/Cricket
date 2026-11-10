# BUGFIX — Bottom Sheet Content Hidden Behind the iOS Keyboard

Date: 2026-11-10 · Reported by TAIMUR with a screenshot: in the
"Select Bowler" sheet, tapping "Enter Player Name Manually" put the
name field behind the iOS keyboard — the typed name was invisible.

## Root cause

`UnifiedSheet`'s layer was `fixed inset-0`, i.e. anchored to the
LAYOUT viewport. iOS does not move fixed layers when the keyboard
opens — the VISUAL viewport pans up instead (its `offsetTop` grows),
so the sheet's bottom, where PlayerSelectionModal keeps the
manual-entry field, stayed glued to the layout bottom, under the
keyboard. Detent heights already shrank with the visual viewport via
`useViewportMetrics`; the layer itself was never repositioned into it.

## Fix (three layers)

1. **`useViewportMetrics`** now also returns `offsetTop`
   (`visualViewport.offsetTop`, 0 elsewhere). Backward compatible —
   UnifiedSheet is the only consumer.
2. **`UnifiedSheet`** sizes and positions its layer to the visual
   viewport: `fixed inset-x-0` with `top: viewportOffsetTop` and
   `height: viewportHeight`. The sheet (and any input inside it) now
   always rests inside the visible region; with no keyboard this is
   geometrically identical to `inset-0`. This fixes every bottom
   sheet, not just player selection.
3. **PlayerSelectionModal** — the manual-entry input scrolls itself to
   the centre of the sheet's scroll area on focus (after a 350 ms
   settle for the keyboard animation), so a long squad list cannot
   leave it below the fold either.
4. **Viewport meta** — `interactiveWidget: 'resizes-content'` in the
   root layout viewport, so browsers that honour the hint resize the
   layout viewport with the keyboard natively.

Considered and deferred: the same treatment for the centred
`UnifiedModal` (far less exposed — its content is centred in the
visual viewport; revisit only on a field report).

## Regression tests

`src/__tests__/bugfix-sheet-keyboard.test.ts` (5 tests): metrics expose
offsetTop; the sheet layer pins `top: viewportOffsetTop` /
`height: viewportHeight` and no longer uses `fixed inset-0`; detent
math still derives from the same metrics; the modal input carries the
scrollIntoView focus handler; the layout viewport opts into
resizes-content. All seven overlay unit suites pass unchanged (66/66).

## Gates

Unit **1531/1531** (140 files) · typecheck 0 · lint clean · build PASS ·
Playwright visual 38/38 · offline 10/10 · overlay 4/4 · stageb 4/4.
No baseline re-records needed. Final proof is on TAIMUR's iPhone
(standalone PWA keyboard behaviour cannot be exercised in this VM's
Chromium, which reports offsetTop 0 with no keyboard).
