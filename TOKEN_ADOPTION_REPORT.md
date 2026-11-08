# Token-Adoption Sweep — Shared Components (Phase 17 follow-up)
Date: 2026-11-08 · Branch: `audit/fix-phase2-10` (local only — not pushed, not deployed)
Scope: `src/components/**` (42 files). Pages (`src/app/**`) were NOT swept.

## What was mapped (literal pair -> token)
~75 replacements across 14 component files, semantic roles only:
- `text-slate-900 dark:text-slate-100/white` -> `text-[var(--foreground)]`
- `text-slate-600/500 dark:text-slate-400`, `text-slate-400 dark:text-slate-500`,
  `text-[#475569] dark:text-slate-400/300` -> `text-[var(--muted-foreground)]`
- `text-slate-700 dark:text-slate-300/200` -> `text-[var(--foreground)]`
- `border-slate-200[/80|/90] dark:border-slate-800`, `border-slate-100
  dark:border-slate-800/60`, `border-slate-300 dark:border-slate-700`
  -> `border-[var(--border)]`
- `bg-white dark:bg-slate-900` -> `bg-[var(--card)]`;
  `bg-slate-100/200 dark:bg-slate-800` -> `bg-[var(--muted)]`;
  `bg-slate-300 dark:bg-slate-700` (dots) -> `bg-[var(--border)]`
- Primary actions: `bg-emerald-600 [hover:bg-emerald-500] … text-white`
  -> `bg-[var(--primary)] text-[var(--primary-foreground)]`
  (hover:opacity-90). This also fixes a real AA failure: white on
  emerald-600 is 3.77:1 in BOTH light and dark today; the token pairs are
  5.4:1 (light), ~7.9:1 (dark), 5.2:1 (sunlight).
- Status dot `bg-emerald-600 dark:bg-emerald-400` -> `bg-[var(--success)]`.

Most light/dark mappings are hex-identical to the tokens (e.g. slate-600 =
--muted-foreground, slate-100 = --muted); the visible change is in the
SUNLIGHT theme, where literals previously ignored the theme entirely.

## Critical finding — Phase 17 border fix never reached the app (FIXED)
`src/app/layout.tsx` inlines a "critical-lcp-css" <style> block that
redefines a token subset for first paint and WINS over globals.css. It
still carried the pre-Phase-17 borders (light #e2e8f0, dark #1f293d), so
the Phase 17 border corrections existed only in globals.css and in the
guard test that parsed it — computed-style probing in a real browser
exposed it (`--border` computed to #e2e8f0/#1f293d, not #a8bccd/#3d4f6a).
Fixed the two stale values in layout.tsx (all other inline tokens already
matched) and extended `color-contrast-wcag.test.ts`: every token the
inline block defines must equal globals.css, per theme (3 new tests).
Verified live after the fix: `--border` computes to #a8bccd / #3d4f6a.

## Second finding — var-color alpha utilities generate no CSS (documented)
Tailwind here emits NO color-mix rules, so classes like
`bg-[var(--card)]/90` produce no background at all. 143 such usages exist
across src (pre-existing: sticky headers, back bars, glass panels — mostly
harmless because they sit on same-colored surfaces). This sweep initially
created 2 new instances from `bg-white dark:bg-slate-900/90`; caught by
computed-style probing and corrected to `bg-[var(--card)]`. A dedicated
pass (define rgb-channel tokens or replace with explicit rgba) is the
proper follow-up; it is NOT folded into this sweep.

## Deliberately NOT swept (with reasons)
- BatsmanProfileModal / BowlerProfileModal: fixed dark "broadcast" stat
  modals (slate-900 in every theme by design) — exempted in the guard.
- Backdrop scrims (bg-slate-950/70 etc.), glass bottom nav (bg-white/75),
  on-gradient white tints, alpha row tints (bg-slate-50/70 — cannot alpha
  a CSS var with this Tailwind setup), brand icon chips, status palette
  colors, scoreboard hero themes, PDF/print palette.
- Accent text (text-emerald-600 etc.) and decorative emerald-500 fills:
  brand palette usage, not surface roles; possible future micro-pass.

## Guard
New `src/__tests__/token-adoption.test.ts`: bans the swept literal pairs
in src/components outside the two exempt modals, and asserts tokens are
in use across >= 10 component files. It caught 3 primary CTAs the first
pass missed (different class order) — all mapped.

## Test corrections (assertions on swept implementation details)
3 existing assertions updated with in-code justifications:
`cricket-bottom-navigation.test.tsx` (text-[#475569] ->
text-[var(--muted-foreground)], identical hex), and
`enterprise-pdf-loading-experience.test.ts` (border-slate-800 ->
border-[var(--border)]; step label -> text-[var(--foreground)]).
Behavior assertions in both files untouched and passing.

## Validation
- Unit: **1155/1155** (98 files; +3 token-adoption, +3 inline-token sync)
- Visual: **26/26 PASS**, no baseline changes (sweep is sub-threshold on
  baselined routes; precise verification was via computed styles)
- Offline suite: **8/8 PASS** · typecheck / lint / build: PASS
- Live computed-style checks: panel bg = --card in light/dark; --border =
  #a8bccd (light) / #3d4f6a (dark) / #27272a (sunlight); labels follow
  --foreground / --muted-foreground per theme.
