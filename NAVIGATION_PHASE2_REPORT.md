# Navigation Phase 2 — iOS-Style Transition Engine (2026-11-11)

Master prompt Phases 1–7. Phase 1 audit:
~/workspace/Cricket-Navigation-Audit.md (root causes RC-1..RC-4,
risks R-1..R-10). This phase implemented the audit's §H design.

## What changed

Direction system (new: src/lib/navigation-direction.ts)
- classifyNavigation: same-path none; any scoring route ->
  fade (two engine instances never coexist); both primary
  tabs -> tab with signed index delta; exact stack match ->
  pop; else push. A tab-signal channel lets bottom-nav taps
  and shell swipes declare their delta before the router
  moves. The stateful tracker MEMOISES its last
  classification: a discarded concurrent render re-running
  the observation returns the same answer instead of
  erasing the direction with a fresh 'none' (found in QA).

PageTransition v2 (src/components/layout/PageTransition.tsx)
- AnimatePresence (popLayout, initial={false}) around the
  pathname-keyed page: entering and exiting pages animate
  as a pair for the first time (previously enter-only).
- PAGE_DIRECTION_VARIANTS (src/lib/animations.ts): push
  enter x:64 / exit x:-24, pop mirrored, tab ±16 by delta,
  fade crossfade; 260ms cubic-bezier(0.32,0.72,0,1) for
  push/pop, 220ms tab, 150ms fade. EASINGS.ios token added.
- Permanent will-change removed (audit R-6: the wrapper no
  longer forms a fixed-position containing block at rest).
- Reduced-motion users keep the plain, unanimated shell.

Clock alignment
- Bottom-nav indicator: 380ms -> 260ms on the same iOS
  easing as the page pair.
- DURATIONS.modal 0.20 -> 0.25 (master's 250–350ms modal
  band; sheets/modals already met the other targets).

Data step (RC-1)
- Home: FadeInUp section wrappers removed; the ongoing-
  match slot reserves a same-shape placeholder while the
  dashboard loads and swaps content in with one 200ms
  fade — no more hero -> card-pop -> numbers triple step.
- History: skeletons now mirror one full day group (rail,
  node row, two 190px card slots) instead of three short
  cards; one fade on the swap.
- Teams/Tournaments lists verified step-free already;
  TournamentCardSkeleton min-height aligned 160 -> 166px.

Desktop scroll (RC-4)
- <main> is the desktop scroller and Next never restores
  it: the shell now saves scrollTop per pathname and
  restores it on back navigations. Two QA-found races are
  handled: the content swap's clamp-to-zero scroll events
  can no longer erase a saved position (render-phase
  navigation timestamp + capture guard), and the restore
  re-applies over ~900ms of frames until the target is
  reachable (the destination is at skeleton height when
  the effect first runs), cancelling on user gestures.

## Not changed (deliberate)
- Scoring page internals, overlay/modal system, swipe
  thresholds, BN cold-start flash (audit: separate fix),
  list-card stagger entrances on teams/tournaments grids,
  legacy PAGE_TRANSITION_VARIANTS export (a test imports
  it; retirement is a later cleanup).

## Verification
- Unit 1657/1657 (incl. 13 new navigation-direction
  tests), typecheck 0, lint 0, production build PASS.
- Phase 7 Playwright QA (~/workspace/rigs/navqa.cjs),
  16/16: tab chain S1–S5 all classified 'tab'; push to
  tournament details 'push'; back 'pop' (observed via
  MutationObserver on the transition wrapper); rapid
  7-hop navigation settles with zero page errors; live
  scoring state identical after a home round-trip
  (Sanaj 17 off 6, Roman 31 off 15); offline tab
  navigation renders from local data; desktop scroll
  restore 420 -> 420.
