# Bug Hunt Fix Report — all 31 findings (2026-11-12)

Source audit: `BUG_HUNT_REPORT.md` (workspace) — 3 HIGH · 14 MED · 14 LOW.
TAIMUR approved FIX-ALL on 2026-11-12. Implemented in four parallel
batches (engine / app robustness / sync-data / platform) + coordinator
integration. One existing test pin was refined (not weakened — see C-5);
one was updated to a new correct value (P-10 stamp); one fixture set
gained the fields D-11 validation now correctly requires.

## HIGH

- **C-1** Score page now rebuilds the engine via
  `EventSourcedMatchEngine.fromScorecard(scorecard, existingEvents)`
  (the centre page's path): the event counter is seeded past every
  restored version and innings are deep-copied. Regression tests:
  post-resume event versions strictly increase; resume round-trip
  preserves innings/current/target/status.
- **D-1** Conflict branching now snapshots the local `match_events`
  onto the branch scorecard before the primary id is converged to
  remote. `resolveConflict` keep-local reinstalls the branch's own
  event log into `match_events` (replace + convergence) before the
  UPSERT is queued, so the cloud can no longer receive a local
  scorecard paired with the remote's balls. Pre-fix branches (no
  embedded events) resolve without touching the table.
- **P-1** Google sign-in: embedded-WebView detection
  (`isEmbeddedWebView` in `src/lib/platform.ts`) routes straight to
  `signInWithRedirect`; a popup attempt rejected as
  `auth/popup-blocked` also falls back to redirect; the redirect
  result is completed on app init via `getRedirectResult`.
  Drive (GIS token popup has no web redirect equivalent): inside a
  wrapper, `requestAccessToken` now fails immediately with a clear
  user-facing reason instead of a popup that can never complete.
  A native Capacitor build still needs a native auth plugin — that
  is wrapper work, not web work; TWA is unaffected.

## MED

- **C-2** Penalty runs against the batting side now count — for the
  opposing team, as the Laws require. Innings 1: credited to the
  second innings at its creation (via the persisted
  `penaltyRunsAgainst`, so save/resume/replay all reproduce it).
  Innings 2: credited retroactively to the first innings and the
  target is lifted by the same amount. Tests cover target, replay,
  and result-margin effects.
- **C-3** New `src/app/error.tsx` + `src/app/global-error.tsx`
  (provider-free, bilingual recovery UI: Reload / Try again /
  Go home). Summary page's unguarded innings-array dereferences
  (the concrete reachable throw) are guarded.
- **C-4** All listed write executors guarded with try/catch +
  error toast (AppToast), state mutating only on success, dialogs
  never hanging: tournament delete, ground delete, history
  delete (single + bulk) + history PDF fetch, centre venue save
  (editor stays open on failure) + player rename, summary
  super-over start. 7 new i18n keys EN+BN.
- **C-5** `scoreBall` returns `'bowler-limit'` at quota instead of
  silently swallowing the ball; the score page toasts
  `score_bowler_limit_reached` (EN+BN) and skips persist. Full
  DLS-reduction scenario is regression-tested.
- **D-2** Supabase UPSERT_MATCH now embeds the gathered event log
  in `scorecard_data`, identical to the Firestore payload.
- **D-3** Both restore paths store restored records as PENDING and
  enqueue UPSERTs for exactly the records written (lazy dynamic
  import avoids a module cycle; works signed-out — ops wait in
  the queue). Drive no longer backfills 'SYNCED'.
- **D-4** Clear Database stamps `csp_db_cleared_at` before wiping;
  pulls treat remote records at/before that stamp as deliberately
  deleted: restore suppressed + a deduplicated remote DELETE
  queued. Newer records still restore.
- **D-5** Drive merge restore gained file import's event-deletion
  convergence (ghost balls can no longer survive a Drive merge).
- **D-6** Supabase UPSERT_TEAM sends the record's own `updatedAt`.
- **P-2** New shared `src/lib/download.ts` `downloadBlob()`:
  anchor download in browsers; inside an embedded WebView, Web
  Share with files when available. Migrated: PDF generator, CSV
  export, backup JSON, both share cards. The wrapper's native
  bridge can now target one function.
- **P-3** SW caches bounded (runtime 120 / static 200 entries,
  oldest-first trim, fire-and-forget) and every `cache.put` is
  quota-safe (`safeCachePut`) — a quota rejection can no longer
  turn a good network response into a synthetic offline 503.
  CACHE_VERSION bumped to **v2.2.10** (sw.js + ServiceWorkerManager
  fallbacks + test pins + offline-setup stamp).
- **P-4** PDF route rate limiting no longer trusts the first
  `X-Forwarded-For` entry (prefers `x-vercel-forwarded-for`, else
  the last XFF entry, else `x-real-ip`); the per-IP log map is
  pruned of expired entries per request. The route stays
  unauthenticated by design (same-origin app client has no
  credential to present) — limiter integrity was the defect.
- **P-5** Content-Security-Policy added in `next.config.mjs`
  (self + Google/GIS/Firebase/Supabase/Maps/Fonts allowances,
  `object-src 'none'`, `frame-ancestors 'none'`). Browser-verified:
  **0 CSP violations** across 9 routes, EN+BN.

## LOW

- **C-6** DLS conclude success path snapshots before mutating;
  `MATCH_COMPLETED` emission is idempotent — conclude → complete
  now yields exactly one terminal event.
- **C-7** Leaderboards key by F9 `playerId` when present
  (`pid:`), name-key fallback; same-named players on different
  teams no longer merge.
- **C-8** BowlingLimiter under-10 branch clamps to the match
  length (`Math.max(1, Math.min(overs, 4))`).
- **C-9** Engine constructor normalises `tossWinner` (trim +
  case-insensitive snap to the canonical team name).
- **D-7** Pull restore branches skip records with a PENDING or
  FAILED DELETE op queued (same gate helper as D-4, all 7
  restore-missing branches, both backends).
- **D-8** Dexie v2 upgrade defaults a missing match `syncStatus`
  to 'PENDING' instead of 'SYNCED'. (Already-migrated users keep
  the old stamp — indistinguishable; accepted and commented.)
- **D-9** firestore.rules: tournament fixtures cap 500 → 5000;
  grounds coordinates no longer required (validated when
  present). ⚠️ Rules take effect only on a Firebase deploy
  (`firebase deploy --only firestore:rules`) — not part of the
  Vercel push. Client side: backup format version is now a named
  constant with a documented supported-versions set, pinned by a
  round-trip test.
- **D-10** `normalizeTeamPlayers` re-mints a fresh id for
  duplicate `pl_` ids within a roster (first entry keeps it).
- **D-11** File import validates records (id + per-type minimum
  fields), drops invalid ones and reports the count on the
  import result's new top-level `dropped` field.
- **P-7** Puppeteer's `--remote-allow-origins=*` removed;
  `puppeteer` moved to `dependencies` with the lockfile synced
  (`npm install --package-lock-only` succeeded — the registry
  403 is audit-endpoint-only, so F11's audit still needs the
  owner's network/CI).
- **P-8** PDF route body cap counts UTF-8 bytes, not UTF-16
  characters.
- **P-9** Grounds page Maps error copy no longer leaks the GCP
  project number or internal deployment instructions.
- **P-10** OfflineSetupService metadata stamp 'v2.2.0' →
  'v2.2.10'. (ESLint 8 EOL / Next 14 maintenance are noted
  toolchain facts, not code defects — a major-upgrade programme
  is the owner's separate call.)
- **P-11** PlatformContext exposes `isNativeWrapper` (applied
  post-mount, hydration-safe); the profile InstallAppCard renders
  nothing inside a native wrapper.
- **P-6** No code change — architecture risk for the Android
  decision (WebView storage eviction under Capacitor). The
  mitigations that exist web-side are P-1/P-2/P-11 plus the
  app's local + Drive backup paths.

## Gates (all green, this tree)

- Unit: **1775/1775** (163 files; +59 net new tests over 1716)
- Typecheck: 0 · Lint: exit 0 (only the 3 pre-existing warnings)
- Build: PASS
- Visual: 38/38 · Offline e2e: 10/10 · Nav QA: 16/16
- Production probe: 0 CSP violations, 0 hydration errors,
  0 pageerrors — EN + BN × 9 routes
- Warmed-SW upgrade simulation (v2.2.9 client → this build):
  waiting SW → Apply → caches converge to v2.2.10 only,
  navigation clean, 0 errors — **PASS**
