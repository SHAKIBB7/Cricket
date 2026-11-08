# Phase 18 — Batch 1 (Semantic Alpha Tints) Report

Date: 2026-11-09 · Branch: `audit/fix-phase2-10` · Status: COMPLETE (local commit, not pushed/deployed)

## The defect

169 classes of the form `bg-[var(--muted)]/50` intended translucent
semantic tints. In this Tailwind setup they emitted NO CSS (verified:
zero color-mix rules in the production bundle) — every one of those
surfaces was silently transparent. The design's subtle layering
(muted row tints, sticky card/95 headers, softened borders) did not
exist on screen.

## The fix (design-system level, not per-class patches)

1. **Channel tokens**: every theme token in globals.css (`:root`,
   `.dark`, `.sunlight` — 14 tokens × 3 themes) gained an
   `--<token>-rgb: R G B` companion, computed from the Phase 17 hex
   values (hex values themselves untouched — contrast preserved).
2. **Config**: tailwind.config.js now maps the semantic colors
   (background, foreground, card±foreground, primary±foreground,
   muted±foreground, border, accent, danger, warning, success, info)
   as `rgb(var(--x-rgb) / <alpha-value>)`, enabling real alpha
   utilities: `bg-muted/50`, `border-border/60`, `bg-card/95`, …
3. **Rewrite**: all 169 classes across 32 files converted from
   `[var(--x)]/NN` arbitrary form to the semantic utilities.
4. **Guards** (`phase18-alpha-tokens.test.ts`, 11 tests): zero
   var-alpha classes may return; every theme's channel tokens must
   equal their hex tokens; the config mappings must exist.

## Verification

- Built CSS now emits the real rules, e.g.
  `.bg-muted\/50{background-color:rgb(var(--muted-rgb)/.5)}`.
- Computed-style probe in a real browser: `bg-muted/50` →
  `rgba(241, 245, 249, 0.5)`, `bg-card/95` →
  `rgba(255, 255, 255, 0.95)`, border alphas resolve likewise.
- Visual baselines: 38/38 PASS *unchanged* — the tints are subtle
  by design (50% of a near-background tone), so no baseline needed
  regeneration and, importantly, nothing regressed.
- Full gates: unit 1227/1227 (105 files), typecheck/lint/build
  PASS, offline 10/10, overlay 4/4.

## Remaining in Phase 18

- Batch 2: pages token sweep (63 raw slate/zinc classes, 7 files).
- Batch 3: radius normalization (~44 arbitrary radii), 36px touch
  targets, score-page bottom clearance for the action row.
