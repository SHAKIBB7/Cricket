# Overlay Architecture — Phase 2A (Foundations) Report

Date: 2026-11-08 · Branch: `audit/fix-phase2-10` · Status: COMPLETE (local commit, not pushed/deployed)
Scope rule honored: NO existing screen or component was modified. Foundations only.

## Audit correction (accuracy note)

Phase 1's per-modal matrix counted literal strings per file and missed
that five modals + EditProfileModal share `src/hooks/useModalOverlay.ts`
— an existing hook providing a refcounted body scroll lock, Escape
handling and reduced-motion access. Phase 2A therefore REUSES that hook
inside the new primitives rather than duplicating it. The Phase 1 audit
file carries the same correction (§3b).

## What was built

**Pure logic — `src/lib/overlay.ts`**
- `OVERLAY_Z_INDEX` tiers: sheet 60 < modal 70 < confirmation 80 < critical 90 (replaces ad-hoc 50/60/70).
- `SHEET_DETENTS`: peek 0.18 / half 0.50 / full 0.92 of usable viewport height.
- `detentHeights()` + `resolveSnapTarget()`: velocity-projected nearest-detent resolution, flick detection (700 px/s), decisive-drag dismissal below 55% of the lowest detent, non-dismissible clamping. Sheets only ever rest at configured detents.
- `shouldInterceptDismiss()` — the unsaved-changes predicate.
- `OverlayPhase` state type (closed/opening/open/dragging/snapping/dismissing).

**Hooks**
- `useFocusTrap` — Tab cycling inside the active modal, initial focus, focus restoration on close.
- `useViewportMetrics` — VisualViewport-driven size (keyboard/orientation aware) for detent math.
- `useDismissGuard` (in useUnsavedChanges.ts) — wraps a close function so backdrop/Escape/swipe all intercept in one place when dirty.

**Primitives — `src/components/overlay/`**
- `OverlayProvider` + `useOverlaySlot` — single-active-primary invariant: a new primary supersedes the previous one (it closes itself); confirmations layer above without claiming the slot.
- `UnifiedModal` — portal, shared MODAL/BACKDROP variants, role="dialog" + aria-modal, focus trap, tier z-index, lifecycle via useModalOverlay.
- `UnifiedSheet` — portal; panel laid out at FULL height and translated (full − current) px (iOS model); detents 1–3; drag ONLY from the header via drag controls (content can never drag the sheet — scroll arbitration is absolute, scoring controls unreachable by sheet gestures); snap via resolveSnapTarget; handle is a keyboard control (ArrowUp/Down); safe-area padding; every dismissal path animates out through one funnel.
- `ConfirmationDialog` — on UnifiedModal; destructive → critical tier + danger button + no backdrop dismissal; ≥44px targets.

## Validation

- New unit tests: 27/27 (`overlay-snap.test.ts` — snap math, z order, detents, guard; `overlay-foundations.test.tsx` — primitive contracts + closed-state SSR smoke).
- Full unit suite: 1182/1182 (100 files). Typecheck PASS · lint PASS · build PASS.
- Playwright regression (no screen changed, run for certainty): visual 38/38, offline 10/10.

## Deliberate v1 boundaries

- Sheet drag starts from the header region only; drag-from-content-at-scroll-top is intentionally NOT implemented (scoring safety > gesture flourish; revisit in 2D QA).
- Sheet children render as one scroll region at FULL layout height; a pinned footer belongs to migrations that need one.
- Primitives are not yet used by any screen — migrations are Phases 2B (Dls/HistoricalBallEdit/PlayerSelection + native confirm() replacements), 2C (score-page inline overlays), 2D (remaining surfaces), each separately approved.
