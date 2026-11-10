# Bugfix Report — Bowler Grid Figures Centred

**Date:** 2026-11-10 · **Reported by:** TAIMUR (screenshot of the live
build: the OV/RUNS/WKTS/ECON figures' alignment "ঠিক হয় না" — the
numbers should sit "মোটামুটি মিডিলে", roughly in the middle of their
columns) · **Status:** DONE LOCALLY, all gates green, verified by
screenshot at his device's width — push pending approval.

## What he saw

Figures were right-aligned in narrow fixed tracks. Right alignment is
even for same-length values, but cricket figures vary in length
(overs "2.0", runs "31", wickets "1", econ "15.50"), so the columns
read as drifting — the wickets column especially, where a lone "1"
hugged the right edge far from its header's visual centre.

## Fix

Headers and values for the four numeric columns
(`OV / RUNS / WKTS / ECON`) are now `text-center`, so every value —
1 digit or 5 — shares its column's centre axis. `PLAYER` stays
left-aligned, `STATUS` stays right-aligned (pills and "Select ›" are
actions, not figures). No track widths changed; this composes with the
earlier status-overflow fix (`BUGFIX_BOWLER_GRID_ALIGNMENT_REPORT.md`).

## Verification

- Screenshot at 430×932 (his device class): 2.0 / 21 / 1 / 10.50 all
  centred under centred headers; status pills unchanged, no overlap.
- Regression pin added to `feature-bowler-grid-page.test.ts` (centred
  header/value classes + STATUS stays `text-right`).
- **Gates ALL GREEN**: unit **1541/1541**, typecheck 0, lint clean,
  build PASS, visual 38/38, offline 10/10, overlay 4/4, stageb 4/4.

## Files

`src/components/modals/PlayerSelectionModal.tsx` (header + figures
cells), `src/__tests__/feature-bowler-grid-page.test.ts` (+1 pin).
