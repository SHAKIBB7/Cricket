# PWA Programme P4 — Update Lifecycle Refinements R1–R3 (2026-11-09)

Implements Phase 2 design §10 (decision D4) from
`~/workspace/Cricket-PWA-Phase2-Design.md`. The audit found the
update flow already sound in its foundations — the service
worker never auto-activates, local data is never touched by an
update — so this phase is exactly the three designed
refinements, nothing more.

## R1 — the confirmation lives in the UI now

The scoring-route safeguard was the app's last native
`window.confirm()`, buried inside the non-React
`ServiceWorkerManager`. It moved to where the overlay programme
put every other confirmation:

- `ServiceWorkerManager.isScoringRouteActive()` — a pure
  predicate (pathname starts with `/matches/score/`).
- `SyncProvider.applyUpdate()` gates on it: on the scoring
  route it opens a `ConfirmationDialog` rendered by the
  provider itself ("Update during a live match?" — explains
  that match data is safely stored on-device and will not be
  lost; "Update now" / "After this match"). Off the scoring
  route it applies immediately, exactly as before. The context
  value's shape did not change, so no consumer or mock needed
  updating.

**Discovered while scoping (out of scope, flagged, untouched):**
one more native `window.confirm` survives in
`src/components/navigation/useSmartNavigation.ts` (leave-match
navigation guard — a different flow from the update path), and
the overlay guard test's regex only matches a bare `confirm(`,
not `window.confirm(`, which is how both call sites survived
it. Migrating the navigation guard and tightening the guard
regex is a separate small decision for TAIMUR.

## R2 — reload on controllerchange, not on hope

The old `applyUpdate()` posted SKIP_WAITING and reloaded
immediately — a race: if the reload landed before activation,
the old worker kept control and the update silently did not
take. Now:

- With a waiting worker: post SKIP_WAITING, reload exactly
  once when `controllerchange` fires (guarded against
  duplicates), with a 1.5 s timed fallback reload if
  activation stalls.
- With no waiting worker (spurious apply): immediate reload,
  the unchanged legacy behaviour.
- A private `reloadPage()` seam isolates the navigation so
  tests can observe reloads (jsdom's `location.reload` is
  non-configurable and cannot be stubbed directly — the first
  version of the suite proved that).

## R3 — the deferral is visible before the tap

On scoring routes the update affordance says what will happen
before the user commits: the sync panel's Update Ready button
gains the caption "Applies after this match — your data is
safe.", and the sync modal's button reads "Apply App Update
After This Match". Tapping either opens the R1 dialog, whose
cancel action IS the deferral. Off scoring routes the labels
are unchanged.

## Tests

- `src/__tests__/pwa-update-flow.test.tsx` (6 tests, new):
  R2 activation semantics (no worker → immediate reload;
  SKIP_WAITING posted and reload deferred until
  controllerchange, firing exactly once; 1.5 s fallback;
  route predicate truth table) and R1 gating end-to-end
  through the real `SyncProvider` (off-route applies directly
  with no dialog; on-route the dialog gates, "After this
  match" defers without applying, "Update now" applies). The
  suite never stubs `window.confirm` — a regression to the
  native prompt would throw.
- `src/__tests__/pwa-lifecycle.test.ts` test D UPDATED to the
  new contract (it pinned the old manager-side confirm): it
  now asserts the route predicate and that the manager never
  calls the native confirm. Recorded here deliberately — the
  behaviour change is the design, not a workaround.

## Gates (at P4 HEAD)

- Unit: **1331/1331** (125 files; 1325 + 6 new)
- Typecheck: 0 errors · Lint: clean · Build: PASS
- Playwright: visual **38/38**, offline **10/10**, overlay
  **4/4**, stageb **4/4**

## Files

- `src/infrastructure/pwa/ServiceWorkerManager.ts` —
  `isScoringRouteActive()`, controllerchange-based
  `applyUpdate()`, `reloadPage()` seam; native confirm removed.
- `src/context/SyncContext.tsx` — the gate + provider-rendered
  ConfirmationDialog.
- `src/components/common/SyncIndicator.tsx` — R3 labels
  (route via `usePathname`).
- `src/__tests__/pwa-update-flow.test.tsx` (new),
  `src/__tests__/pwa-lifecycle.test.ts` (test D updated).

## Limits

- The real activation race (slow Android devices, large
  caches) is verified by construction and unit tests; a true
  end-to-end update on a real device belongs to P8, where an
  installed build can be updated in place.
- The 1.5 s fallback is a heuristic: if a device legitimately
  needs longer to activate, the fallback reload lands on the
  old worker and the update simply remains available (the
  state machine re-derives from the registration) — annoying,
  never destructive.
