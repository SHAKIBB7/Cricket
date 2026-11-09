# PWA Programme P5 — Storage Surfacing + Persistence Requests (2026-11-09)

Implements Phase 2 design Cluster 4 (decision D5) from
`~/workspace/Cricket-PWA-Phase2-Design.md`. The audit's finding
was precise: `StorageManagerService` already computed
everything — usage, quota, persistence state, a low-space flag
— and almost none of it reached the user, and nothing ever
asked the browser to protect the database at the moments the
design specified. This phase is surfacing + two silent calls,
no new storage machinery.

## Surfacing

**Profile diagnostics** (new
`src/components/profile/StorageDiagnosticsSection.tsx`,
mounted inside the existing System & Developer Diagnostics
details block): live "Device Storage" usage line
(`12.5 MB of 500 MB used (2.5%)`), "Storage Protection" in
plain language — *Persistent — the browser will not clear this
data automatically* vs *Best-effort — the browser may clear
this data under storage pressure* — an amber low-space warning
when fewer than 20 MB of quota remain (pointing at the Drive
backup section), and, while storage is best-effort, a
**Protect storage** button that calls `requestPersistence()`
and refreshes the estimate. The section consumes the sync
context through a new non-throwing `useSyncStatusOptional()`
(mirroring P3's `usePlatformOptional`), so provider-less
renders degrade to a "Measuring…" state instead of crashing —
the P3 lesson applied prospectively this time.

**Sync modal**: the existing IndexedDB storage block (which
already showed Persisted/Best-Effort and the MB figures) gains
the low-space warning line — `isLowSpace` was computed on
every estimate and displayed nowhere in the app until now.

## Silent persistence requests (D5)

- **On sign-in**: `AuthContext`'s auth-state handler now calls
  `StorageManagerService.requestPersistence()` fire-and-forget
  when a user resolves, beside the existing guest-record claim
  and initial `syncNow()`. The service self-limits (it checks
  `persisted()` first), so session restores are harmless.
- **On first match save**: `MatchRepository.saveMatch` and
  `saveMatchWithEvents` end with
  `requestPersistenceAfterFirstSave()` — a count check that
  runs only until the device's first locally-saved match
  exists, then never again (in-memory flag; the service's own
  check covers new sessions). It swallows all failures: a
  denied request can never break a save, and a unit test pins
  exactly that.

## Tests

`src/__tests__/pwa-storage-surfacing.test.tsx` (6 tests):
first save fires the request exactly once across
saveMatch/saveMatchWithEvents and a rejected request never
fails the save (fake-indexeddb, real repository); the
diagnostics section's four states — measuring, best-effort
with a working Protect action (asserts both the service call
and the estimate refresh), persistent with no action offered,
and the low-space warning.

The AuthContext call is covered by inspection rather than a
render test: no AuthProvider render harness exists in the
suite, and the call is the same fire-and-forget shape as the
two adjacent calls in the same handler; all existing
auth-context suites remain green. `requestPersistence` itself
is exercised through the repository and component paths above.

## Gates (at P5 HEAD)

- Unit: **1337/1337** (126 files; 1331 + 6 new)
- Typecheck: 0 errors · Lint: clean · Build: PASS
- Playwright: visual **38/38**, offline **10/10**, overlay
  **4/4**, stageb **4/4**

## Files

- `src/components/profile/StorageDiagnosticsSection.tsx`
  (new) + `src/app/profile/page.tsx` (mount point).
- `src/context/SyncContext.tsx` — `useSyncStatusOptional()`.
- `src/context/AuthContext.tsx` — sign-in persistence request.
- `src/infrastructure/storage/MatchRepository.ts` —
  first-save persistence request.
- `src/components/common/SyncIndicator.tsx` — low-space line
  in the sync modal.
- `src/__tests__/pwa-storage-surfacing.test.tsx` — tests.

## Limits

- Whether a browser GRANTS persistence is its own heuristic
  (engagement, install state, disk pressure) — the app can ask
  at the right moments and report the answer honestly, which
  is what the surfacing does; it cannot promise the grant.
  Installed PWAs are far more likely to be granted, which is
  one more reason P3's install path matters.
- The first-save flag is per-session memory: a fresh session
  with existing matches re-checks the count once and asks
  again — one extra `persisted()` probe, by design.
