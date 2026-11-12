# Deploy Version-Skew Fix — Report (2026-11-12)

Owner report (15:01 +06): after the enterprise deploy, taps on
other pages did nothing — the app stayed on the homepage.

## Reproduction (before any fix)

Simulated the owner's exact path locally: previous live build
(600c85e) with its service worker active and controlling, then
the server swapped to the new build on the same origin, BN
client. First reload served the stale shell; route transitions
then failed 31 times with:

  Failed to fetch RSC payload … TypeError: Cannot read
  properties of undefined (reading 'call')

The stale runtime's webpack module registry does not contain
the new build's chunk ids. Chromium recovers via Next's
full-navigation fallback; the owner's iOS standalone PWA did
not recover in-session — taps appeared dead. Fresh profiles
and desktop checks never see it (no stale shell), which is why
the pre-deploy live checks passed.

## Root cause

The SW serves documents stale-while-revalidate and _next/static
cache-first, and the design intent (sw.js header) is that app
freshness is governed by CACHE_VERSION changes driving the
Update Ready flow. But:

1. The enterprise deploy did not change sw.js at all, so no SW
   update ever triggered and no cache purge happened.
2. The navigation handler wrote revalidated documents only to
   the RUNTIME cache, while caches.match could keep returning
   the install-time SHELL precache copy for precached routes —
   the stale document could shadow the fresh one indefinitely.

## Fix (three layers)

1. **CACHE_VERSION v2.2.8 → v2.2.9** (public/sw.js +
   ServiceWorkerManager fallback names, kept in step as the
   manager's comment requires). This release therefore reaches
   every client through the designed flow: new SW installs,
   "Update Ready" appears, Apply activates it and purges all
   old caches.
2. **Navigation freshness (sw.js):** the handler now serves the
   runtime cache (last successful navigation fetch) BEFORE any
   other cache, and on each successful navigation fetch it also
   refreshes the precached shell copy of that route. A reload
   now always converges to the freshest document the client
   has seen.
3. **Chunk-recovery guard (client):** `src/lib/chunk-recovery.ts`
   + `ChunkRecoveryMount` in the root layout. When a chunk-skew
   error escapes to the window (ChunkLoadError / dynamic-import
   failures / the webpack module-miss TypeError gated on a
   /_next/static stack), the page reloads once into the fresh
   shell. Reloads are capped at 3 per session, spaced ≥8s, and
   the counter resets after 30s of stability — a genuine bug
   can never cause a reload loop. First-render safe: listeners
   install in a mount effect only.

## Verification

- Scenario H (the owner's rescue path): client warmed on the
  old build → fixed build served → a waiting v2.2.9 SW was
  detected, SKIP_WAITING (Apply) purged caches to v2.2.9-only,
  all nav targets then routed with zero pageerrors.
- Scenario F (the NEXT deploy): client warmed on this build →
  a further build with a changed chunk graph + v2.2.10 served →
  after opening the app, the first Teams tap landed on /teams;
  the client self-converged with no manual reopen ritual.
  (Transitional RSC errors still appear in the console during
  the stale window — they are the symptom being recovered
  from — but navigation succeeds.)
- Gates: unit 1714/1714 (159 files, +11 new pins in
  chunk-recovery.test.ts; performance-round pins moved to
  v2.2.9), typecheck 0, lint exit 0, build PASS, offline e2e
  10/10, navqa 16/16, production hydration check 0 errors in
  BN and EN across 9 routes.

## Standing rule from this defect

Every release push that changes app code bumps CACHE_VERSION
in public/sw.js AND the two fallback names in
ServiceWorkerManager.ts (and the matching test pins). The SW
update flow is the only designed freshness path; a deploy that
leaves sw.js byte-identical relies on the guard + revalidation
convergence alone.
