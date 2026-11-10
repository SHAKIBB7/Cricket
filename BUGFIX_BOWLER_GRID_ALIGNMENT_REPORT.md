# Bugfix Report — Bowler Grid Column Alignment

**Date:** 2026-11-10 · **Reported by:** TAIMUR (field report on the live
build: "ভার্টিক্যাল অ্যালাইনমেন্টগুলা — economy, wicket, over, run —
ঠিক নাই") · **Status:** DONE LOCALLY, all gates green, verified by
measured geometry + screenshot — push pending TAIMUR's approval.

## Diagnosis (measured, not eyeballed)

Reproduced locally at phone width (390×844, seeded live match, bowled
the over out to open the selector) and measured every cell:

- **Column positions were actually correct** — header and every row
  shared identical right edges (142/176/214/252/301/374 px).
- **The real defect:** the STATUS track was 4.2rem with
  `whitespace-nowrap` pills. The longest ineligibility reason,
  "Max Limit (2/2 ov)" (~95px), cannot fit a 67px track, so the pill
  **overflowed left into the ECON cell**, covering the economy figure
  ("14.0" half-hidden behind the pill) and making the whole grid read
  as misaligned. The current bowler's reason line under the
  "Bowling now" pill overflowed the same way.
- **Adjacent nit in the live strip:** the composed over text
  ("OVER 5.0 / 10 Ov — 45%") truncated to "OVER 5.0 / 1…" next to a
  long score chip.

## Fix

- `BOWLER_GRID_COLS`: STATUS 4.2rem → **5.3rem**, funded by the figures
  tracks (OV 1.7→1.6, RUNS/WKTS 2.0→1.9, ECON 2.7→2.5rem).
- Status pills/reason now `max-w-full whitespace-normal break-words`
  with tight leading — a long reason wraps inside its own column
  ("Max Limit (2/2 / ov)") instead of spilling over ECON.
- Score page: the strip's `overText` no longer appends the percentage
  (the progress bar already carries it).
- Strip label "INNINGS PROGRESS" yields below 430px
  (`hidden min-[430px]:inline`) so the over text never truncates next
  to a long team-name chip.

## Verification

- Re-measured after the fix: header and all rows share right edges
  (133/164/201/237/283/374 px); **status left edge (289) > ECON right
  edge (283) on every row — zero overlap**; screenshot confirms the
  pill wraps inside STATUS and the strip reads "OVER 5.0 / 10 Ov" in
  full.
- Regression pin added to `feature-bowler-grid-page.test.ts` (status
  track width + wrap classes + strip text shape).
- **Gates ALL GREEN**: unit **1540/1540**, typecheck 0, lint clean,
  build PASS, visual 38/38, offline 10/10, overlay 4/4, stageb 4/4.

## Files

`src/components/modals/PlayerSelectionModal.tsx` (grid template,
status-cell wrapping, strip label), `src/app/matches/score/[matchId]/page.tsx`
(strip over text), `src/__tests__/feature-bowler-grid-page.test.ts` (+1 pin).
