# Ultimate Master Prompt — Stage B Report (Verification + Resulting Fixes)

Date: 2026-11-09 · Branch: `audit/fix-phase2-10` · Status: COMPLETE (local commit, not pushed/deployed)

Stage B was verification-first: both open suspicions were settled
behaviourally in a real browser before any code changed.

## F13 — Double-submit: CONFIRMED (worst case), FIXED

Simulation (Playwright, Dexie counts as ground truth):
- Realistic double-click on Save: **1 team** — the state-based
  `isSaving` guard already covered human double-clicks.
- Same-tick double submit (`requestSubmit()` ×2 in one task, both
  handlers running before React re-renders): **2 teams**. The
  `isSaving` state check and the duplicate-name check both read
  stale snapshots in that window; records got distinct IDs, so no
  data layer caught it either.

Fix: a synchronous `savingRef` guard in both handlers (teams +
tournaments — identical pattern): the ref is set at handler entry,
cleared on every validation exit and in the existing `finally`.
Re-run after the fix: same-tick ×2 → **exactly 1 team**.

## F2 — Two-tab same-match scoring: CONFIRMED silent data loss, GUARDED

Simulation (two pages, one browser context = shared IndexedDB,
seeded live match at 64/1 in 4.3 overs): Tab A scores a single
(→65/1), Tab B — loaded before A's ball, still showing 64/1 —
scores a four and persists its whole state. Final stored record:
**68/1 in 28 balls with Tab B's over log — Tab A's ball silently
gone** (a merge would read 69/1 in 29 balls). Last-writer-wins on
the whole-scorecard snapshot, no warning anywhere.

Shipped guard (deliberately warn-only v1): the score page now
announces every successful persist on a per-match
BroadcastChannel; any other tab holding the same match raises a
persistent amber banner — "This match was updated in another tab.
Scoring here may overwrite those changes." [Reload] [✕] (EN/BN).
Verified behaviourally: A's ball makes B's banner appear.
A stronger variant (auto-reload of the stale tab, or a revision
check inside MatchRepository.saveMatchWithEvents) remains a
design option; warn-only converts silent loss into an informed
choice without touching the scoring data path.

Still unverified: the multi-DEVICE variant (separate Dexie stores
reconciled by cloud sync) — needs a Firebase-configured build
(F12); the same last-writer question applies at that layer.

## F5 — Native alert elimination: DONE

All 10 remaining `alert()` calls replaced. New shared surface:
`src/components/common/AppToast.tsx` — `showAppToast(message)`
imperative API (window CustomEvent transport, no provider) +
`<AppToastHost />` mounted once in the root layout, rendering via
the existing ToastNotification shell at the top of the screen
(z-100, above modals), auto-dismiss 4.5s, tap to dismiss, max 3
visible. Sites: grounds geolocation error, center rename error,
teams delete error, GroundSelectorModal ×6 (geolocation + save
validation). The score page's rename error uses its existing
page toast for consistency with its success messages.
Guard: `alert-elimination.test.ts` (3 tests) — a bare `alert(`
can never return to production code unnoticed.

## Durable verification suite

`e2e/stage-b.validation.ts` + `npm run test:stageb` (4/4):
F13 exact-one-team assertion and F2 banner-visibility assertion
now run as regression guards (mobile + desktop projects).

## Gates (all executed)

Unit 1242/1242 (109 files), typecheck 0 errors, lint PASS,
production build PASS, visual 38/38 (baselines unchanged),
offline 10/10, overlay 4/4, stageb 4/4.

## Remaining (Stage C — decisions / external inputs)

F4 public-by-default matches (intent?), F8 penalty over-log
format, F9 player-ID migration (own phase), F10 Firestore
indexes (needs production query inventory), F11 npm audit
(blocked in this environment), F12 cloud-drain verification
(needs Firebase env), E1 decorative-divider contrast decision,
F2-strong (auto-sync on cross-tab conflict — optional).
