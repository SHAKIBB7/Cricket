# Phase 18 — Batch 3 (Radius, Touch Targets, Clearance) Report

Date: 2026-11-09 · Branch: `audit/fix-phase2-10` · Status: COMPLETE (local commit, not pushed/deployed)
**Phase 18 is complete with this batch.**

## 1. Radius normalization — smaller than the audit estimate, by design

Only 6 source files used arbitrary radii at all. Classification:

- **Normalized to scale (5 classes, 3 files)**: ToolsAndAccountsPanel
  `rounded-[22px]` → `rounded-3xl`; desktop nav card
  `rounded-[22px] lg:rounded-[24px]` → `rounded-3xl` (identical at
  lg), nav items `[16px]/[18px]` → `rounded-2xl`; UnifiedSheet top
  `rounded-t-[24px]` → `rounded-t-3xl` (same value, scale clothing).
- **Kept as deliberate identity radii (documented)**: the floating
  glass bottom nav (28px / t-26px — its signature pill form, also
  pinned by its test suite), the scoreboard hero cards (26/28px
  mobile, 30/32px desktop, and the score page's two hero trees) —
  large signature surfaces in the hero family that every phase has
  treated as identity styling, not scale violations.

One test assertion updated with justification
(cricket-bottom-navigation: `rounded-[22px]` → `rounded-3xl`).

## 2. Touch targets (36px → the app's own standards)

- **→ 44px** (primary controls): analytics action button, match
  center Resume/Share/Download actions (×3), history tabs,
  MatchesPanel tabs.
- **→ 40px** (dense rows): teams ⋯-menu items (×3 incl. the row),
  AdvancedAnalyticsPanel icon button (36×36 → 40×40).
- **Kept 36px with reasons**: SyncIndicator's `sm:` density size in
  the desktop top bar (mobile is already 40px; pointer contexts
  exceed the 24px WCAG AA minimum), CompactDropdown and BackButton
  `sm` size variants (deliberate size scales — the DLS suites pin
  the dropdown's), and the Batsman profile data-table row
  (information-dense by design, Phase 18 §5).

## 3. Score-page bottom clearance — fixed and measured

The mobile scoring column ended in `pb-safe` (≈ safe-area only), so
the Retire / Penalty / Info row could slide under the fixed floating
bottom nav (~76px overlay zone) — the wart first observed during
Overlay Phase 2D's browser tests. Mobile root now ends in `pb-24`:
the row's bounding box bottom measures 740px in the 844px viewport,
clear of the nav. Desktop tree untouched (no bottom nav there).

Two layout-pinning guards (Bug 14 tree test, mobile-scrolling
audit) updated for the one sanctioned class change, with in-line
justifications; all other root classes byte-identical.

## 4. Visual baselines

6 regenerated, all intentional and eyeballed: center-live ×4
(taller 44px action buttons) and score-live mobile ×2 (action row
lifted clear). Everything else passes against the old baselines.

## Gates

Unit 1228/1228 (105 files), typecheck/lint/build PASS, visual
38/38, offline 10/10, overlay 4/4.
