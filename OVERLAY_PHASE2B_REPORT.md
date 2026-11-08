# Overlay Architecture — Phase 2B (Worst-First Migration) Report

Date: 2026-11-08 · Branch: `audit/fix-phase2-10` · Status: COMPLETE (local commit, not pushed/deployed)

## Scope adjustment (engineering conflict, resolved conservatively)

The original 2B scope named DlsModal, HistoricalBallEditModal and
PlayerSelectionModal. Inspection before editing showed DlsModal and
PlayerSelectionModal are rendered BEHAVIORALLY via
`renderToStaticMarkup` by existing regression suites
(conditional-dls-visibility, dls-activation-and-scoreboard-navigation,
squad-player-selection-workflow). Portal-based primitives render
nothing under SSR markup, so migrating those two now would silently
gut the DLS and player-selection regression coverage — the riskiest
possible trade in this codebase. Per the master prompt's own conflict
rule ("explain the conflict and choose the safest maintainable
solution"), those two migrations are DEFERRED to Phase 2D, gated on
porting those suites to a DOM-capable harness. The deferral is pinned
by a guard test so it is explicit, not accidental. Both modals keep
their current shell + useModalOverlay lifecycle meanwhile.

## What was migrated

1. **HistoricalBallEditModal → UnifiedModal.** Hand-rolled
   AnimatePresence/backdrop/card shell and its own useModalOverlay call
   removed; content, save/replay logic and props unchanged. It gains
   portal rendering, focus trap, dialog semantics and the modal z tier.
2. **All 6 native `window.confirm()` calls → ConfirmationDialog**
   (destructive, critical tier, backdrop-dismiss disabled):
   - grounds: delete ground (message retains the matches-played nuance)
   - matches/history: delete single match, delete selected matches
   - teams: delete team
   - tournaments: delete tournament
   - profile/GoogleDriveBackupSection: permanently delete Drive backup
   Each keeps its exact destructive behaviour; only the gate changed
   from a browser popup to the designed dialog. A repo-wide guard test
   now fails if any native confirm() call returns.

## Validation

- New guard suite `overlay-migration-2b.test.ts`: 10/10.
- Full unit suite: 1192/1192 (101 files) · typecheck PASS · lint PASS · build PASS.
- Playwright: visual 38/38, offline 10/10 — no regressions.

## Remaining (known, tracked)

- DlsModal + PlayerSelectionModal portal migration — deferred to 2D (see above).
- 10 native `alert()` calls remain in pages/components (error surfacing, not confirmations) — candidate for the toast system in a later phase.
- Phase 2C: score page's 7 inline overlays onto the overlay manager.
