# Overlay Architecture — Phase 2C (Score Page) Report

Date: 2026-11-08 · Branch: `audit/fix-phase2-10` · Status: COMPLETE (local commit, not pushed/deployed)

## Migrated — the score page's four hand-rolled inline overlays

`src/app/matches/score/[matchId]/page.tsx` carried four inline
AnimatePresence + motion shell blocks (backdrop z-50, no portal, no
focus management). All four now render on UnifiedModal — portal,
focus trap, dialog semantics, unified z tier — with their inner
content, state setters and handlers byte-for-byte unchanged:

| Overlay | Close funnel | Notes |
|---|---|---|
| Match Information | `setShowMatchInfoModal(false)` | backdrop dismiss, as before |
| Retire Batter | `setShowRetireModal(false)` | backdrop dismiss, as before |
| Award Penalty Runs | `setShowPenaltyModal(false)` | backdrop dismiss, as before |
| Innings Transition | `setShowInningsTransitionModal(false)` | `dismissOnBackdrop={false}` — forced flow; it never had a backdrop click handler |

The now-unused MODAL_VARIANTS/BACKDROP_VARIANTS import was removed
from the page.

## Deliberate boundary

The OverlayProvider supersede layer is NOT wired on this page yet.
Forced flows (innings transition) must never be auto-closed because
another overlay opened, and the page's own state orchestration already
guarantees one-at-a-time presentation. Provider adoption lands in 2D
once every surface is a primitive.

The page's remaining component modals stay as they are: OutModal
(current shell, 2D scope), DlsModal and PlayerSelectionModal
(deferred in 2B — renderToStaticMarkup conflict), HistoricalBallEditModal
(already on UnifiedModal since 2B).

## Validation

- New guard suite `overlay-migration-2c.test.ts`: 7/7.
- Full unit suite: 1199/1199 (102 files) · typecheck PASS · lint PASS · build PASS.
- Playwright: visual 38/38, offline 10/10 — including the seeded
  offline scoring journey against the migrated score page.

## Next

Phase 2D: remaining surfaces (OutModal, profile modals, teams/
tournaments create-edit panels, ground selector), the DOM test
harness that unblocks DlsModal + PlayerSelectionModal migration,
OverlayProvider adoption, and overlay-specific Playwright coverage.
