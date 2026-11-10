# Feature Report — Select Bowler: Full-Page Enterprise Grid

**Date:** 2026-11-10 · **Requested by:** TAIMUR (picked the Enterprise Grid
mockup from 5 redesign variants, then its full-page polished variant;
implementation approved 2026-11-10 11:33 +06) · **Status:** DONE LOCALLY,
all gates green — push pending TAIMUR's approval.

## What changed

### Bowler selection is now a full page with an enterprise data grid
`PlayerSelectionModal` (bowler branch only) renders through the new
`presentation="page"` variant of `UnifiedSheet`:

- **App bar**: back chevron + squad subtitle + per-bowler limit as a chip
  ("Limit: Max N overs per bowler") + close button. No drag handle, no
  backdrop, no half-sheet — the page takes the full visual viewport.
- **Live strip** (dynamic): dark emerald band with a pulsing dot,
  "INNINGS PROGRESS", the caller's composed over text
  ("OVER 3.0 / 10 Ov — 30%"), an innings progress bar, and a score chip
  ("PALASH 86/3"). The score page composes these from live innings state
  (`inn.totalBalls/totalRuns/totalWickets`, `engine.totalOvers`) via the
  new optional `liveStrip` prop; the strip renders only when provided.
- **Enterprise grid**: PLAYER / OV / RUNS / WKTS / ECON / STATUS columns
  on one shared grid template, tabular numerals, hairline row dividers.
  Each row: initial avatar (deterministic colour), name, and an
  overs-remaining line (segment dots when the limit ≤ 6 + "N ov left").
  Economy is computed from the existing figures map
  (`bowlerEconomy`: runs per 6 balls from cricket-notation overs).
  Status cell: current bowler → "Bowling now" pill (his ineligibility
  reason, e.g. Prev Over, stays visible beneath it); ineligible → amber
  reason pill; eligible → "Select ›". The current row is tinted with a
  green left accent bar. All selection semantics are unchanged
  (ineligible rows disabled, manual-entry validation, error banner,
  search for squads > 5, `squad-player-option-*` testids preserved).
- **Sticky bottom bar**: manual name entry + Assign + Cancel, pinned via
  a `min-h-full` flex column with `mt-auto` + `sticky bottom-0` inside
  the sheet's scroll region — and the keyboard fix from the same morning
  still applies (the page layer tracks the visual viewport; the input
  centres itself on focus).

### UnifiedSheet gains a `page` presentation
`presentation?: 'sheet' | 'page'` (default 'sheet', fully opt-in): a page
is one full-viewport detent on the SAME plumbing — portal, focus trap,
scroll lock, Escape funnel, OverlayProvider supersede, visual-viewport
tracking. No backdrop, no drag handle/gestures, panel edge-to-edge.
Every other sheet consumer is untouched.

### Scope kept deliberately
- **Batter selection unchanged** (sheet + list) — the approved design
  covered the bowler page; the batter sheet can adopt the same page
  treatment later if TAIMUR wants it.
- i18n: 8 new keys (`psm_bowling_now`, `psm_col_econ/ov/player/runs/wkts`,
  `psm_ov_left`, `psm_yet_to_bowl`) in both dictionaries (parity kept).

## Tests & gates

- New `feature-bowler-grid-page.test.ts` (9 tests): economy/balls/
  overs-remaining maths (a part-bowled over consumes its slot), page
  wiring source pins, rendered-grid assertions (headers, 15.50/9.00
  economy, overs-left, live strip, yet-to-bowl dash row).
- Updated expectations, each with an in-test comment: the workflow
  suite's combined figures string ("3.0 ov (2-18)") → grid cells +
  economy; the sheet-keyboard suite's detent pin → the page-aware
  detent expression (same metrics derivation).
- A Phase-18 guard caught two `[var(--x)]/NN` classes in the new code;
  both replaced with solid tokens.
- **Gates ALL GREEN**: unit **1539/1539** (141 files), typecheck 0,
  lint clean, build PASS, visual 38/38, offline 10/10, overlay 4/4,
  stageb 4/4.

## Files

`src/components/overlay/UnifiedSheet.tsx` (page presentation),
`src/components/modals/PlayerSelectionModal.tsx` (bowler page + grid,
shared form/search/error blocks extracted; batter branch as before),
`src/app/matches/score/[matchId]/page.tsx` (`liveStrip` prop),
`src/context/LanguageContext.tsx` (+8 keys ×2),
`src/__tests__/feature-bowler-grid-page.test.ts` (new),
`squad-player-selection-workflow.test.ts` + `bugfix-sheet-keyboard.test.ts`
(expectation updates).
