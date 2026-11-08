# Bug 14 — Full-Screen Blinking on Scoreboard Updates: Fix Report
Date: 2026-11-08 · Branch: `audit/fix-phase2-10` (local commit only — not pushed, not deployed)
Status: RESOLVED (was the largest deferred item in AUDIT_FIX_REPORT.md)

## Root cause (verified in Phase 1 / fix phase, re-verified before this change)
1. `src/app/matches/score/[matchId]/page.tsx` mounted BOTH scorer trees — the
   mobile cockpit (root line 1149, `md:hidden`) and the desktop workspace
   (root line 1548, `hidden md:block`) — and only hid one with CSS. Every ball
   therefore re-rendered ~1,450 lines of JSX twice and ran every MotionNumber
   odometer animation in both trees, including the invisible one.
2. Contributing: `ScoringViewProvider` (wraps the whole app in layout.tsx)
   created a new context value object on every render, re-rendering all
   consumers (Navigation, score page) even when nothing view-related changed.

## Approach chosen — and why not a full single-tree merge
The two trees have genuinely different layouts (strict single-viewport mobile
cockpit vs 3-panel desktop workspace), and every piece of match state, every
event handler, and ALL modals (Out, PlayerSelection, Penalty, Innings
Transition, Match Info, DLS, profile modals, toast) live OUTSIDE the trees —
in page scope and as siblings after them (parser-verified with the TypeScript
AST: mobile root spans lines 1149–1543, desktop root 1548–2106, modals follow
as siblings). So mounting only the viewport-appropriate tree removes the
double render/animation completely with zero markup redesign and zero state
risk. Merging the two markups into one responsive tree would be a large
visual rewrite for no additional correctness benefit.

## Changes
1. NEW `src/hooks/useIsDesktop.ts` — matchMedia `(min-width: 768px)`
   (Tailwind `md`), change listener with cleanup. SSR/first paint returns
   false (mobile-first; server HTML matches first client render, so no
   hydration mismatch). Desktop swaps in right after mount, before any
   scoring interaction.
2. `page.tsx` — mobile tree wrapped in `{!isDesktop && (...)}`, desktop tree
   in `{isDesktop && (...)}`; the now-redundant `md:hidden` / `hidden
   md:block` classes removed from the roots. Every other layout class is
   byte-identical — no visual redesign.
3. `src/context/ScoringViewContext.tsx` — provider value memoized
   (`useMemo`), `toggleView`/`closeView` stabilized (`useCallback`).
4. Tests — NEW `src/__tests__/bug14-single-scorer-tree.test.tsx` (7 tests:
   gate placement, dual-mount pattern gone, layout classes preserved, modals
   still siblings, hook contract incl. an SSR render check, provider
   memoization). ONE existing assertion corrected with written justification:
   `mobile-scrolling-layout-audit.test.ts` had asserted the exact old root
   class string including `md:hidden` — i.e. it asserted the bug itself;
   the layout portion of the string is unchanged and still asserted.

## Validation
- Full suite: 1143/1143 PASS (96 files; 1136 before + 7 new)
- Typecheck PASS · Lint PASS (0 warnings) · Build PASS (18/18 routes)

## Honest limitations
- Desktop first paint briefly renders the mobile tree until the mount effect
  runs (one swap, pre-interaction). Eliminating that would need a cookie/UA
  based server decision — not worth the complexity here.
- On a live breakpoint crossing (window resized across 768px mid-match) the
  visible tree swaps; match state is unaffected (page scope), but the tree's
  internal scroll position resets.
- Not browser-verified visually (no Playwright config exists yet — Phase 14
  scope); verification is via the automated suite + AST structure checks.
