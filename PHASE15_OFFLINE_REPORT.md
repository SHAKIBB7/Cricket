# Phase 15 — Offline-First PWA & Reconnect Validation Report
Date: 2026-11-08 · Branch: `audit/fix-phase2-10` (local only — not pushed, not deployed)
Method: real-browser validation (Playwright/Chromium) against the production
build, plus source inspection. New durable suite: `e2e/offline.validation.ts`
(`npm run test:offline`) — 4 tests × mobile + desktop = 8 runs.

## Verified working (evidence from live browser runs)
1. **Service worker lifecycle** — registers, takes control, precaches the
   shell (`cric-scorer-shell-v2.2.2`, 28 entries incl. all Phase-13 slim
   assets). ✓ test 1
2. **Offline reload** — with the network off, reloading `/` renders the full
   dashboard from cache. ✓ test 2
3. **Offline data creation & persistence** — a team created while offline is
   written to IndexedDB (`CricScorerPro_v2`, syncStatus PENDING), appears in
   the UI, and survives an offline reload. ✓ journey test
4. **Reconnect integrity** — back online: offline status clears, the record
   is intact, exactly one copy (no duplicate-on-reconnect). ✓ journey test
5. **Offline state communication** — mobile: SyncIndicator dot + details
   dialog ("Working offline. Scoring and match events are saved immediately
   to IndexedDB…"); desktop: sidebar Cloud Sync row shows an "Offline"
   badge. Both verified in the browser. ✓ test 2

## Defect found by validation — FIXED in this step
**Cold offline navigation to a never-visited route rendered blank** —
including the `/offline` page itself. The SW served the precached document
(200, correct HTML), but the route's page chunk
(`_next/static/chunks/app/<route>/page-*.js`) existed in no cache, the
client boot failed, and the user got the app layout around an empty
content area. Routes linked from the nav were masked by Link prefetching;
`/offline` has no inbound links, so it was ALWAYS broken on a cold visit.
Root cause: `OfflineSetupService` "warming" fetched route documents only —
never their JS/CSS assets — while its verification counted documents and
reported "Offline Ready".

Fix (small, targeted):
- New `ServiceWorkerManager.warmRouteAssets(routes)`: parses each warmed
  route's HTML for `/_next/static/` script/link URLs and stores every
  asset in Cache Storage. Called from `OfflineSetupService` right after
  the existing document warming, for the same route list.
- Implementation note (second bug caught by the tests): the first version
  fetched assets and relied on the SW's cache-first handler to store them.
  Browser tests exposed a race — on a first-ever load the page is not yet
  SW-controlled when setup runs, so its fetches bypassed the SW and
  nothing was stored (desktop won the race, mobile lost it). Final version
  writes directly via `caches.open(...).put()` into the runtime/shell
  cache (both on the SW's keep-list; the SW's `caches.match` searches all
  caches), which is deterministic in both form factors.
- Guarded by tests 2 and 3 of the new suite (chunk presence + cold
  offline navigation to /offline renders "Offline Mode Active").

## Environment-bound limitation (not a code defect)
Cloud sync drain could not be verified end-to-end here: this build has no
Firebase env configured (`Firebase is not configured… NEXT_PUBLIC_FIREBASE_*`
in console), so SyncEngine sync attempts fail with "Backend server is
currently unreachable" and outbox ops correctly remain PENDING with
retries — no data loss, no false success in the data layer. Draining the
queue requires a configured backend + signed-in user (production config).
Related observation for a future decision: the desktop Cloud Sync badge
can read "Synced" (local/offline-ready state) while ops are still queued —
the indicator reflects local readiness, not queue emptiness.

## Not covered / follow-ups
- SPA (client-side) cold navigation to unvisited routes offline relies on
  nav prefetching during the online session; hard navigation is now
  covered. Seeded-match offline scoring flow (ball-by-ball offline, then
  reconnect) is the natural next validation step, alongside the visual
  suite's Dexie seeding work.
- Two-device sync conflicts remain untested by design (see audit report);
  no speculative SyncEngine changes were made.

## Validation
- `npm run test:offline`: **8/8 PASS**, twice (stability rerun).
- Visual suite: **26/26 PASS** (no baseline changes).
- Unit suite: **1149/1149 PASS** (97 files; e2e specs excluded by naming).
- typecheck / lint / production build: PASS.
