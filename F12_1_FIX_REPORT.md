# F12-1 Fix Report — Sync Outbox Poisoned by `undefined` (2026-11-09)

## The defect (found by the F12 live verification run)

Cloud sync silently stopped working entirely. Evidence from the
production app and TAIMUR's desktop console:

```
SyncEngine: Operation op_1794203887897_n4r47t failed
FirebaseError: Function setDoc() called with invalid data.
Unsupported field value: undefined (found in field
scorecard_data.secondInnings in document matches/match_1794203887893_wqqx7)
```

Root cause, three compounding parts:

1. **Firestore was never told to tolerate `undefined`.** It is
   initialised with plain `getFirestore(app)`
   (`src/infrastructure/auth/firebase.ts`) — no
   `ignoreUndefinedProperties` — and `SyncEngine` wrote matches,
   teams, tournaments and grounds via raw `setDoc` with no
   sanitising. Any record carrying an `undefined` field — most
   ordinarily a match whose second innings has not started
   (`secondInnings: undefined`) — made the write throw, permanently.
2. **Head-of-line blocking.** `syncNow()` broke the FIFO loop on the
   first failing operation and retried that same operation forever.
   One poisoned op therefore blocked every operation queued behind
   it: a total, indefinite sync outage.
3. **Silence.** The failure was stored only on the queue record in
   IndexedDB and in console warnings. The UI showed an eternal
   "Syncing…" with no error, no failed state, and no retry control.

Impact observed live: on TAIMUR's device the poisoned match op had
blocked his queue (his data never reached the cloud); in the F12
test browser, three team creates queued and never drained.

## The fix (approved by TAIMUR: A + B)

### A — Sanitise at the write boundary (execution time)

New exported `stripUndefinedForFirestore()` in
`src/infrastructure/sync/SyncEngine.ts`, applied to the Firestore
document of all four UPSERT paths (matches, teams, tournaments,
grounds):

- Object keys whose value is `undefined` are dropped
  (undefined ≡ absent — the semantics the app already assumes).
- `undefined` array elements become `null` (Firestore arrays cannot
  hold `undefined`; `null` keeps indices stable).
- Non-plain values (`Date`, class instances) pass through untouched.

It is applied when the operation EXECUTES, not when it is queued —
so operations already sitting poisoned in users' outboxes become
valid on their next attempt and drain by themselves. No data
migration, no queue surgery, no data loss.

### B — Queue hardening: bounded retries, parked failures, visibility

- New `MAX_SYNC_OP_ATTEMPTS = 5`. An operation that fails its 5th
  attempt is parked with status `FAILED` (the `SyncQueueRecord`
  status union already had the value; it was never assigned). The
  record is KEPT with its `errorMessage` and `retryCount`; the FIFO
  loop CONTINUES with the next operation instead of breaking.
- Before the budget is exhausted, behaviour is unchanged: the loop
  still breaks on failure, preserving strict FIFO order for
  transient errors, and the 429 rate-limit path is untouched.
- New `SyncEngine.retryFailed()`: parked operations return to
  `PENDING` with a fresh attempt budget and a sync is kicked.
- Visibility: `SyncStatusSnapshot` gains `failedCount` and
  `failedError` (earliest parked failure's message); the snapshot
  state becomes `ERROR` while failures are parked, and
  `notifyListeners` computes both from the queue. The profile page
  shows a red "N Sync Failed" pill, a failure card with the error,
  and a **Retry** button wired to `retryFailed()`. A sync run that
  parks failures also leaves a summary in `lastErrorMessage` instead
  of clearing it. `SyncContext`'s default snapshot updated for the
  new fields.

DELETE paths needed no change (`deleteDoc` carries no payload).
The Supabase legs needed no change (PostgREST serialises to JSON,
where `undefined` object fields drop out by construction).

## Tests

New `src/__tests__/f12-sync-poison-queue.test.ts` (5 tests) against
a STRICT Firestore mock whose `setDoc` validates payloads the way
the real SDK does (deep undefined scan, exact error shape) plus a
"cursed document" permanent permission failure:

1. `stripUndefinedForFirestore` unit behaviour (nested drops, array
   null-ing, `Date` passthrough by reference, primitives).
2. A pre-fix queued match op with `secondInnings: undefined` drains;
   the stored document has no `secondInnings` key, innings 1 intact.
3. An op at its last attempt failing permanently is parked `FAILED`
   with its error kept, and the team op queued behind it executes.
   The snapshot reports `failedCount 1`, the error, state `ERROR`.
4. A first-attempt (transient) failure still blocks the queue —
   FIFO order preserved, nothing skipped.
5. `retryFailed()` revives a parked op and it drains once the
   failure clears.

Testing note: the suite uses `vi.clearAllMocks()` in `afterEach`,
not `restoreAllMocks` — restoring strips the implementations of
module-mock `vi.fn()`s (`checkFirebaseConfigured` would return
`undefined` and the Firestore leg would silently skip, masking the
very failure this suite exists to catch).

## Gates (at fix HEAD)

- Unit: **1318/1318** (123 files; 1313 baseline + 5 new)
- Typecheck: 0 errors · Lint: clean · Build: PASS
- Playwright: visual **38/38**, offline **10/10**, overlay **4/4**,
  stageb **4/4**

## Files

- `src/infrastructure/sync/SyncEngine.ts` — sanitize helper + cap,
  four wrapped `setDoc` payloads, FAILED parking + continue,
  `retryFailed()`, snapshot fields.
- `src/context/SyncContext.tsx` — default snapshot gains the fields.
- `src/app/profile/page.tsx` — failed pill + failure card + Retry.
- `src/__tests__/f12-sync-poison-queue.test.ts` — regression suite.

## Limits / follow-ups

- The fix ships to production only after TAIMUR's push approval;
  live re-verification (the F12 fixtures draining, TAIMUR's own
  queue recovering on his device) is the F12 run's remaining work.
- JINI's test-browser team ops never produced console evidence (no
  DevTools in that browser); if they still stall after this fix,
  part B's new UI surfacing will show their actual error there.
- Parked FAILED operations are never auto-deleted; they wait for
  the user's Retry (or a code fix + Retry). `pruneCompletedQueue`
  only removes `SYNCED` records, so parked records are safe.
