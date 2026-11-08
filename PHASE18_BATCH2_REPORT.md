# Phase 18 — Batch 2 (Pages Token Sweep) Report

Date: 2026-11-09 · Branch: `audit/fix-phase2-10` · Status: COMPLETE (local commit, not pushed/deployed)

## Scope and method

The components token sweep (2026-11-08) never covered `src/app/**`.
The Phase 18 audit counted 63 raw slate/zinc classes in 7 page
files. Each instance was classified by context before touching it —
a blind sweep would have been wrong here, because most raw slate in
the pages is deliberate.

## Converted (15 replacements, same mapping as the components sweep)

- `matches/new` (2): form section labels
  `text-slate-600 dark:text-slate-400` → `text-[var(--muted-foreground)]`.
- `profile` (10): avatar placeholders `bg-slate-100 dark:bg-slate-800`
  → `bg-[var(--muted)]` (×4 incl. badge + status pill backgrounds),
  avatar icons `text-slate-700 dark:text-slate-300` /
  `text-slate-600 dark:text-slate-400` → foreground / muted-foreground,
  icon-button hover states → token hovers, card/badge borders
  `border-slate-200/300 dark:border-slate-700` → `border-[var(--border)]`.
- `score/[matchId]` Dot ball button (both trees, ×2 + 1 hover):
  full slate pair set → `bg-[var(--muted)] text-[var(--foreground)]
  border-[var(--border)] hover:border-[var(--muted-foreground)]`.
  Light-theme button text darkens slate-700 → foreground token
  (contrast improves; it is the token-correct color).

Most mappings are hex-identical in light/dark; the real behavioral
change is that these surfaces now follow the SUNLIGHT theme instead
of ignoring it.

## Deliberately kept raw (documented keep-set)

- Amber accent pairings `bg-amber-500 text-slate-950` (score page,
  tournaments, summary PDF chip) — dark text on amber is the
  contrast-correct pairing.
- Scrim `bg-slate-950/70` (matches/new modal backdrop).
- Fixed-dark hero wells/dropdowns: dashboard hero chip
  `bg-slate-900/80`, analytics icon wells, score-page hero dropdown
  `!bg-slate-900`.
- Google sign-in button: white bg / dark text kept in both themes
  (Google brand convention); its border WAS swept to the token.
- Neutral status dot `bg-slate-400` (profile).

## Guard

`token-adoption.test.ts` gained an app-pages block: the six swept
pair patterns must never return anywhere under `src/app`.

## Gates

Unit 1228/1228 (105 files), typecheck/lint/build PASS, visual
38/38 (baselines unchanged), offline 10/10, overlay 4/4.

## Remaining in Phase 18

- Batch 3: radius normalization (~44 arbitrary radii), 36px touch
  targets, score-page bottom clearance for the action row.
