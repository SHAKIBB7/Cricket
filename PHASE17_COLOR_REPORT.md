# Phase 17 — Strict Color Accuracy, Contrast & Visual Clarity: Report
Date: 2026-11-08 · Branch: `audit/fix-phase2-10` (local commit only — not pushed, not deployed)
Standard: WCAG 2.2 AA — normal text ≥ 4.5:1, large text ≥ 3:1.

## Files inspected
- `src/app/globals.css` (all 3 themes: `:root` light, `.dark`, `.sunlight`)
- `src/lib/theme/scoreboard-themes.ts` (6 user-selectable hero themes)
- `src/app/matches/score/[matchId]/page.tsx`, `src/components/scoring/IntegratedScoreboard.tsx`
- `src/components/scoring/MatchProgressBar.tsx`, `src/components/scoring/TargetProgressBar.tsx`
- `src/features/scoring/pdf/ScorecardPdfGenerator.ts` (print palette)
- Codebase-wide sweep for fractional-opacity text (`text-*/NN`) and token usage counts
  (`--muted-foreground` ×382, `--border` ×336, `--foreground` ×242, `--muted` ×225, `--card` ×136)

## Files modified
1. `src/app/globals.css` — token fixes + `--success`/`--info` tokens added (were referenced
   semantically but never defined as CSS variables)
2. `src/app/matches/score/[matchId]/page.tsx` — hero labels `text-emerald-200/70` → `/90` (×4)
3. `src/components/scoring/IntegratedScoreboard.tsx` — same (×2)
4. `src/components/scoring/MatchProgressBar.tsx` — "OVER" label `text-white/60` → `/90`
5. `src/components/scoring/TargetProgressBar.tsx` — "RRR:" label `text-white/70` → `/90`
6. `src/features/scoring/pdf/ScorecardPdfGenerator.ts` — print palette (below)
7. `src/__tests__/color-contrast-wcag.test.ts` — NEW automated guard (81 assertions)

## Token changes (before → after, worst-surface ratio before → after)
| Theme | Token | Before | After | Ratio |
|---|---|---|---|---|
| light | --danger | #ef4444 | #b91c1c | 3.60 (bg) / 4.41 (muted) → 6.18 / 5.91 |
| light | --warning | #f59e0b | #b45309 | 2.05 → 4.80 (bg) |
| light | --border | #e2e8f0 | #a8bccd | 1.18 → 1.87 (bg) — see exception E1 |
| dark | --accent | #059669 | #10b981 | 3.88 (muted) → 5.77 |
| dark | --border | #1f293d | #3d4f6a | 1.33 → 2.34 (bg) — see exception E1 |
| sunlight | --accent | #059669 | #047857 | 3.77 → 5.48 |
| sunlight | --danger | #dc2626 | #b91c1c | 4.39 (muted) → 5.89 |
| sunlight | --warning | #d97706 | #b45309 | 3.19 → 5.02 |
| all | --success / --info | (undefined) | defined per theme | ≥ 4.5 on bg/card/muted (test-guarded) |

Brand identity preserved: cricket-green primary/accent hues unchanged in family;
light accent, dark primary, all foreground/muted-foreground tokens already passed and
were not touched. Secondary text was NOT pushed to black/white.

## Opacity fixes (effective blended ratios, default Stadium Green hero #064e3b)
- emerald-200 labels /70 → /90: 4.64 → 6.51
- white "OVER" /60 → /90: 4.57 → 8.18 · white "RRR:" /70 → /90: 5.64 → 8.18
- Left unchanged, deliberately: `/`, `|`, `•` separators at /20–/50 — decorative
  punctuation; the adjacent numerals carry the information at full opacity.

## PDF print palette
- MoM impact-score amber #d6a640 (2.24:1 on white — failed even large-text) → #b45309 (5.02:1)
- Muted print text #64748b (4.38:1 on page background #f4f6f5, used by the 7pt footer)
  → #5f6f84 (4.73:1 on pageBg, 5.13:1 on white)
- Verified already passing: white on dark-green header 8.13, result bar 7.82,
  primary text 17.85, secondary text 7.58.

## Automated validation
`src/__tests__/color-contrast-wcag.test.ts` parses the real tokens from globals.css and
asserts: full semantic token set exists in all 3 themes; every text token ≥ 4.5:1 on
background/card/muted (72 pairs); primary button label ≥ 4.5:1; border separation ≥ 1.8:1.
Result: 81/81 PASS. Full suite: 1136/1136 PASS (95 files; was 1055 + 81 new).
Typecheck PASS · Lint PASS (0 warnings) · Build PASS (18/18 routes).

## Remaining exceptions & limitations (honest scope)
- E1 — Borders: light 1.87:1 / dark 2.34:1 separation. These are decorative card
  dividers redundantly carried by fill + shadow, not information-bearing boundaries,
  so they sit below the 3:1 non-text target by design (Apple's own separators are
  ~1.3:1). Forcing 3:1 would require near-gray-500 dividers on every card — a visual
  identity change, not a token correction. Interactive boundaries are stronger:
  sunlight theme borders are 14.89:1, focus ring uses --primary (≥ 4.7:1 surfaces).
  Decision needed from TAIMUR if strict 3:1 dividers are wanted despite the look change.
- E2 — Non-default scoreboard hero themes (Midnight/Ocean/Sunrise/Violet) have bright
  gradient ends (e.g. #10B981, #FF9800); white hero text is protected by dark overlay
  panels but was not exhaustively ratio-tested per theme. Default theme fully verified.
- E3 — Disabled buttons use opacity-40 (global .btn-* pattern). WCAG exempts inactive
  components from contrast minimums; labels remain legible as "unavailable" by design.
- Not done: glass-surface (liquid-glass) per-component screenshot QA and Playwright
  visual regression — no Playwright config exists in the repo yet (Phase 14 scope).
