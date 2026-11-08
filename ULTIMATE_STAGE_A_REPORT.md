# Ultimate Master Prompt — Stage A Report (Confirmed Fixes)

Date: 2026-11-09 · Branch: `audit/fix-phase2-10` · Status: COMPLETE (local commit, not pushed/deployed)
Discovery: `~/workspace/Cricket-Ultimate-Discovery.md` (F1–F13).

## F1 — Retired Hurt is no longer recorded as a dismissal (MEDIUM)

Root cause: `EventSourcedMatchEngine.retirePlayer` set
`isDismissed = true` for both retire types, contradicting the Laws
and the app's own dismissal registry ('Retired Hurt (Not Out)').
A hurt batter therefore counted as OUT in averages inputs, on
cards, and in did-not-bat classification.

Fix (cross-module, single-source where possible):
- Engine: `isDismissed = isRetireOut` — hurt keeps the departure
  record (dismissalType/Text, FoW entry) without the dismissal flag.
  Event replay calls the same method, so replay inherits the fix.
- `battingCard`: new shared `isRetiredHurt()` predicate;
  `playerHasBatted` now treats any recorded dismissalType as having
  batted (a 0-ball hurt retiree is neither "out" nor "did not bat").
- Surfaces aligned: IntegratedScoreboard status (amber "retired
  hurt (not out)"), match center (predicate + label), Batsman
  profile modal status, both PDF generators (predicate + status
  'Retired Hurt (Not Out)').
- Score page selection: hurt batters are excluded from the bowler
  pool (off the field) and from batter re-selection with the
  truthful reason 'Retired Hurt' — resumption is NOT enabled,
  because the rename-based selection flow would split the player's
  record; that remains a deliberate product limitation, now
  honestly labelled instead of "Dismissed".
- Tests: new `retire-hurt-semantics.test.ts` (4: live hurt, 0-ball
  hurt classification, retire-out unchanged, replay fidelity).
  One Group A assertion corrected with in-line justification — it
  had pinned the bug itself (isDismissed=true for hurt).

## F3 — DLS applied target gains a single source of truth (MEDIUM-LOW)

Investigation softened the original finding: `applyDlsTarget`
already mirrors the applied target into `engine.targetScore`,
which drives chase math and completion — the catastrophic
divergence did not exist. What was real: no surface could SHOW the
applied target; the DlsModal presented only a fresh recalculation,
inviting confusion (and accidental re-apply of a different number).

Fix: new `domain/cricket/dls/appliedDls.ts` —
`getAppliedDlsTarget(settings)` reads the stored applied values.
DlsModal takes `appliedTarget`/`appliedOvers` props (passed from
the score page's stored advancedSettings) and its active banner
now reads "DLS is currently applied — Current target 121 (15
overs)" (EN + BN). Tests: `applied-dls-target.test.ts` (4) +
`dls-applied-banner.test.tsx` (3, jsdom).

## F7 — Empty catch audit (LOW)

11 production sites reviewed. Three service-worker warming
swallows now log per-item warnings (warmResources,
warmRouteAssets ×2) — those hid real offline-warming failures.
The remaining 8 are teardown/listener-isolation idioms where
swallowing is the correct behaviour (unsubscribe/cleanup paths,
per-listener isolation loops, a localStorage write guard);
documented here as reviewed-and-accepted.

## F6 — Google Maps type escapes (LOW, top cluster)

`@types/google.maps` was already a dependency; the casts were
pure habit. All 8 `(window as any).google` in grounds page +
GroundSelectorModal → typed `window.google`; typecheck clean.
The remaining ~56 scattered `as any` data-shape casts stay as
documented LOW debt for a later pass.

## Not in this stage

F5 (10 native `alert()` calls) — needs a shared toast surface;
the score page's ToastNotification is page-local. Proposed as a
small follow-up with Stage B. F2/F13 move to Stage B
(verification), F4/F8/F9/F10–F12/E1 remain Stage C decisions and
external inputs.

## Gates (all executed)

Unit 1239/1239 (108 files), typecheck 0 errors, lint PASS,
production build PASS, visual 38/38 (baselines unchanged),
offline 10/10, overlay 4/4.
