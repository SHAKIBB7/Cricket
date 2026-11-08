# Overlay Architecture — Phase 2D (Completion) Report

Date: 2026-11-08 · Branch: `audit/fix-phase2-10` · Status: COMPLETE (local commit, not pushed/deployed)
The unified overlay migration is now complete across the app.

## The deferred debt is paid: DOM test harness

The reason DlsModal and PlayerSelectionModal were deferred in 2B:
their regression suites rendered them with renderToStaticMarkup,
which cannot see portal content. Phase 2D built the harness instead
of weakening the tests:

- `jsdom` added as a devDependency; eight suites ported with a
  `// @vitest-environment jsdom` docblock (global environment stays
  `node` for the other ~96 files).
- New helper `src/__tests__/helpers/render-dom.tsx`: a drop-in
  `renderToHtml()` that renders with createRoot + act and snapshots
  document.body (container + portals). Two rendering-mode
  normalizations keep assertions about content, not renderer:
  MotionNumber digit-strips collapse to their aria-label text, and
  the helper's own container contributes only its innerHTML.
- Ported suites: conditional-dls-visibility, dls-activation,
  dls-button-removal, squad-player-selection-workflow, out-modal-ui,
  record-wicket-modal-scrolling-fix, wicket-scrolling-and-profile-
  swipe-fix, enterprise-account-profile-integration. All assertions
  preserved; three style-string assertions in wicket-scrolling were
  adjusted for CSSOM serialization spacing (same styles, DOM spelling)
  with in-line notes, and three shell assertions in
  mobile-scrolling-layout-audit + one in record-wicket now assert the
  guarantees on the primitive that owns them (justifications in-line).

## Migrations completed in 2D

- **DlsModal → UnifiedModal** (Escape still funnels through
  handleCancel — DLS cancel semantics untouched).
- **PlayerSelectionModal → UnifiedSheet** (detents 0.5/0.92; its rich
  header rides the sheet's new `header` slot; backdrop dismissal
  stays OFF — a required step mid-scoring, as before).
- **OutModal → UnifiedModal** (flex-column panel via the primitive's
  new tailwind-merge class merging; footer stays pinned;
  dismissOnBackdrop off, as before).
- **GroundSelectorModal → UnifiedModal** (its `if (!isOpen) return
  null` removed — exit animation now works; Google Places dropdown
  z-index still clears the modal tier).
- **EditProfileModal → UnifiedModal** (same early-return removal).
- **Batsman/Bowler profile modals**: bespoke fixed-dark shells kept
  BY DESIGN (identity styling, already portal + dialog + Escape +
  scroll lock); they gained the shared `useFocusTrap`, completing
  their accessibility set without visual change.
- **Primitive upgrades** (additive, covered by tests): UnifiedSheet
  gained `header` and `dismissOnBackdrop` props; UnifiedModal panel
  classes now merge via `cn()`/tailwind-merge so layout overrides
  (flex, overflow) resolve deterministically.

## Browser-proven

New `e2e/overlay.validation.ts` (`npm run test:overlay`), 4/4 ×2 runs:
Match Information modal on the seeded live score page — portal
render, initial focus inside the dialog, Escape closes; and match
history delete gated by ConfirmationDialog — Cancel preserves the
record, confirming deletes it.

## Validation

- Unit: 1216/1216 (104 files) · typecheck PASS · lint PASS · build PASS.
- Playwright: visual 38/38 · offline 10/10 · overlay 4/4 (×2).

## What remains outside this programme

- 10 native `alert()` calls (error surfacing) — a future toast system.
- OverlayProvider supersede is available but deliberately not wired
  on the score page (forced flows must never auto-close); per-page
  adoption can happen opportunistically.
- Teams/tournaments create-edit panels still use their page-level
  modalContent pattern; they were inventoried in Phase 1 and are
  functional — migrating them is optional polish, not debt.
