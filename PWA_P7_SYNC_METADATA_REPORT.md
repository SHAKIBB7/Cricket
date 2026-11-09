# PWA Programme P7 — Sync Metadata S (2026-11-09)

Implements the pre-approved part of Phase 2 design Cluster 6
(decision D7) from `~/workspace/Cricket-PWA-Phase2-Design.md`:
sync ops gain provenance metadata. The conflict machinery
(sizes M/L in the design) is NOT built here — D7 gates it on
F12 scenario-2 evidence (concurrent same-match scoring on two
devices), which is still outstanding, and nothing in this
phase pretends otherwise.

## What changed

**Device identity** —
`StorageManagerService.getOrCreateDeviceId()`: a `dev_…` id
generated once, persisted in app_metadata (`device_id`),
cached per session, and stable for the life of the browser
profile's data. It names the device, never the user. The
profile diagnostics block now displays it
(`StorageDiagnosticsSection`), so a user reporting a sync
problem can quote the exact device an op came from.

**Op stamping** — `SyncQueueRecord` gains three OPTIONAL
fields (`schemaVersion`, `userId`, `deviceId`); optional
because ops queued by older builds legitimately lack them,
and execution never reads them. `SyncEngine.queueMutation`
stamps every new op via `opProvenance()`:

- `schemaVersion: 1` (constant `OP_SCHEMA_VERSION`),
- `userId`: read synchronously from the Firebase auth
  instance's `currentUser` at enqueue time — deliberately NOT
  a token fetch on the save path; `null` for guests,
- `deviceId`: the device identity above.

The coalescing path (an UPSERT for an entity that already has
a pending op) refreshes the provenance along with the payload:
an op queued while signed out picks up the uid once the user
signs in and the entity is edited again — pinned by test.

**Zero behaviour change** is the point: drain order, retry,
parking, sanitising and payload contents are untouched (the
F12-1 suite and every sync suite pass unmodified). The
metadata is there so that diagnostics can answer "which
device, which account, which op schema" — and so a future
conflict phase, IF the F12 evidence justifies it, has real
inputs to work with instead of inventing history after the
fact.

## Tests

`src/__tests__/pwa-sync-metadata.test.tsx` (5 tests):
device id generation/persistence/stability across cache
resets; guest op stamped (schemaVersion 1, userId null,
device id); signed-in op stamped with the uid (auth stubbed
through the same module-mock pattern as the F12-1 suite);
coalesce refreshing provenance while keeping one pending op;
diagnostics rendering the same id the ops carry.

## Gates (at P7 HEAD)

- Unit: **1350/1350** (128 files; 1345 + 5 new)
- Typecheck: 0 errors · Lint: clean · Build: PASS
- Playwright: visual **38/38**, offline **10/10**, overlay
  **4/4**, stageb **4/4**

## Files

- `src/infrastructure/database/dexie-db.ts` —
  `SyncQueueRecord` provenance fields.
- `src/infrastructure/sync/SyncEngine.ts` — `opProvenance()`
  + stamping on create and coalesce.
- `src/infrastructure/storage/StorageManagerService.ts` —
  `getOrCreateDeviceId()`.
- `src/components/profile/StorageDiagnosticsSection.tsx` —
  Device ID line.
- `src/__tests__/pwa-sync-metadata.test.tsx` — tests.

## Limits & the honest remainder of Cluster 6

- `userId` reflects the Firebase session only; a
  Supabase-only session stamps null (the engine's session
  resolution covers both at sync time, but the enqueue stamp
  intentionally stays synchronous and Firebase-shaped, since
  Firebase is the primary identity in this app).
- Clearing site data mints a new device id — correct
  behaviour for an identity defined as "this browser
  profile's data".
- Conflict sizes M (pull-time conflict detection + log +
  pick-a-version UI) and L (event-level merge) remain
  unbuilt, gated on F12 scenario 2 per D7. The F12 drain
  verification on TAIMUR's device is still the blocking
  input for that scenario.
