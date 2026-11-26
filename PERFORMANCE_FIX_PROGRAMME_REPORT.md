# Performance Fix Programme — Report (2026-11-15)

Scope approved by TAIMUR (2026-11-15 20:05 +06), ranking from
`~/workspace/cricket-perf-measure/REPORT.md`. Work is LOCAL on branch
`audit/fix-phase2-10` only. **Nothing was pushed, nothing was deployed,
production (main a168fb50) is untouched.** Push/deploy need TAIMUR's
separate explicit approval.

Commits (on top of 1240f40):
- `0ec4c46` perf(fix3): icon preload removal + icon optimisation
- `e15c479` perf(fix1): lazy-load Firebase/Supabase out of the initial bundle
- `e13126b` perf(fix2/4/5): defer heavy mount work, Home CLS fix, CACHE_VERSION v2.2.11
- `ead8225` perf(fix5): careerStats dynamic repositories (central chain)
- (this report)

---

## Fix 3 (done first) — icon preload + optimisation

- `src/app/layout.tsx`: removed `<link rel="preload" as="image"
  href="/assets/icon/cricket.png" fetchPriority="high">`. Font preloads
  (NotoSansBengali Bold/Regular) kept; manifest + metadata icon
  references unchanged.
- `public/assets/icon/cricket.png`: 287,093 → **38,132 bytes (−87%)**,
  still 512×512 (PIL FASTOCTREE 256-colour quantise + optimise,
  visually verified — bat/ball/text crisp).
- `cricket_foreground.png` IS served (it is in the SW precache list in
  `public/sw.js`), so it was optimised too: 207,074 → **29,974 bytes
  (−86%)**, still 512×512.
- No test pinned the preload or the icon bytes (searched
  `src/__tests__` + `e2e` for `cricket.png`/preload pins — none), so no
  pin needed updating. New pins in `performance-fix-programme.test.ts`
  now lock the optimised size (<120KB), dimensions and preload absence.

## Fix 1 — Firebase/Supabase lazy-load

Root cause (confirmed in code): `AuthContext` statically imported
FirebaseAuthService / UserProfileService / firebase.ts (SDK init at
module load) / FeatureHubRepository / GoogleDriveService / SyncEngine;
`SyncContext` statically imported SyncEngine; `supabase.ts` imported
`isPlaceholderOrEmpty` from `firebase.ts`, dragging the SDK into the
Supabase chain as well.

Changes:
- **New `src/infrastructure/auth/firebase-config.ts`** — SDK-free,
  side-effect-free module holding `isPlaceholderOrEmpty`,
  `getFirebaseConfig`, `getFirebaseConfigDiagnostics`,
  `checkFirebaseConfigured`, `isFirebaseConfigured` (process.env only).
  `firebase.ts` imports and re-exports them, so every existing import
  from `./firebase` (including all test mocks that use
  `importOriginal`) works unchanged. `supabase.ts` now imports the
  helper from `firebase-config`.
- **AuthContext** — all Firebase-backed services are loaded with
  dynamic `import()` only: inside the mount effect when
  `checkFirebaseConfigured()` (light module) is true, and inside the
  sign-in/sign-up/reset/sign-out/update actions. Types are `import
  type` (erased). Interface and behaviour unchanged: unconfigured
  installs resolve `isLoading=false` in guest/offline mode **without
  ever loading the SDK**; configured installs keep `isLoading=true`
  until the auth listener fires, as before; a failed SDK chunk load
  falls back to guest mode instead of spinning. First render reads
  only `process.env` — no localStorage/navigator/window (hydration
  rule honoured; sweep below is 0-error).
- **SyncContext** — SyncEngine and OfflineSetupService are dynamically
  imported in the mount effect, **deferred to requestIdleCallback**
  (setTimeout fallback, 1200ms idle timeout) — see also Fix 5.
  init/subscribe/stop, snapshot de-dup (M-1), ServiceWorkerManager
  timing, and the update-confirmation flow are unchanged; the loaded
  classes are kept in refs so `triggerSync`/`retryOfflineSetup` work
  identically. Sync semantics (outbox, FIFO, coalescing, retry) live
  inside SyncEngine and were **not** touched.
- **Home page** — MatchRepository/FeatureHubRepository dynamically
  imported inside the dashboard data effect (their only use on the
  page), removing the repository→SyncEngine→Firebase chain from the
  Home route chunk.

Result (production `next build`, First Load JS):
- **Shared by all: 88.8 kB** (the shared layout chunk previously
  carried the ~496 kB Firebase-class vendor bundle noted in the
  2026-11-11 motion audit; live Home initial JS+CSS was 576 KB
  compressed).
- **Home route: 173 kB** First Load, and its chunk list no longer
  contains the Firestore chunks (verified in app-build-manifest).

Deliberately NOT done: the repositories' internal static
`SyncEngine.queueMutation` coupling (MatchRepository,
FeatureHubRepository, GroundRepository) was left alone. queueMutation
writes the durable Dexie outbox with provenance/coalescing semantics;
re-routing it through a lazy bridge would change sync timing/failure
behaviour on every save path. Instead, the repositories themselves
are dynamically imported at (async) call sites, which removes the
SDK from the initial chunks without touching sync internals.

## Fix 2 — New Match mount

Baseline: 8 long tasks / 827ms total / max 283ms, LCP 1304ms, heap
36MB, First Load 479 kB.

Changes (`src/app/matches/new/page.tsx`): FeatureHubRepository,
GroundRepository and SmartGroundDetectionService are dynamically
imported at their (all async) call sites — mount effect team load,
ground query/heal, GPS detection, ground confirm/select/save
handlers, and the fire-and-forget save in `handleNext`. Form
behaviour, validation and defaults are byte-for-byte the same code
paths; only module arrival timing changed. GroundSelectorModal was
already `next/dynamic`. BowlingLimiterDrawer was **kept static** —
it is pinned as an inline component by `bowling-limiter-ui.test.ts`,
it is comparatively light, and the task instruction was to change
pins only where a fix directly requires it.

Result: **First Load 479 → 188 kB (−61%)**; long-task max
283 → 235–240ms across two after-runs; heap 36 → 33MB. (See
measurement honesty note below on long-task totals.)

## Fix 4 — Home CLS 0.137 → 0

Identification (layout-shift entries with `sources`, 393px, local
export): one shift of 0.1369 at ~915ms. Sources: the hero action
grid and stats strip moved up ~159px. Cause: the in-flow
ongoing-match **skeleton** — its flex-wrap made it ~143px tall
(incl. parent gap) at 393px — was removed when the dashboard load
finished with **no ongoing match**; plus the stats skeleton tiles
were 78px vs the real tiles' 71px, so that swap also changed the
strip's height.

Fix (`src/app/page.tsx`):
- The banner slot renders nothing while loading — first-paint layout
  now equals settled layout in the common no-match outcome (the
  skeleton was reserving space for a card that usually never
  arrives). When a match IS ongoing, the real card mounts in the
  slot inside the existing staggered reveal, as before.
- Stats skeleton line boxes height-matched to the real tiles
  (label 14px + mt-1 + number 25px = 71px tile at 393px; sm values
  matched likewise).

Verification: dedicated layout-shift capture after the fix returns
**zero shift entries**; CLS in both re-measurement runs = **0.000**
(baseline 0.137).

## Fix 5 — transition mount deferral

- SyncContext: the whole sync stack (SyncEngine.init + OfflineSetup)
  now initialises after first paint via requestIdleCallback — it
  previously initialised during every page's mount, i.e. during the
  transition slide. ServiceWorkerManager init timing unchanged.
- Entering pages: Teams, Tournaments and Analytics load their
  repositories dynamically inside their async load functions, so the
  entering page's chunk no longer parses Firebase/Supabase during
  the slide.
- **Central find:** `src/features/players/careerStats.ts` statically
  imported both repositories for its single async loader, dragging
  the SDK into Teams/Players/Analytics/player-profile routes.
  Dynamic import inside `loadCareerPlayers` only.

Measured transition (same method as baseline): Home→Teams long task
**107ms → 83ms**; Teams→Home **65ms → none recorded**.

Route First Load JS (next build, before → after):
| Route | Before | After |
|---|---|---|
| Shared by all | ~496 kB class | **88.8 kB** |
| / | (576 KB live initial JS+CSS) | **173 kB** |
| /matches/new | 479 kB | **188 kB** |
| /teams | 475 kB | **194 kB** |
| /tournaments | 476 kB | **196 kB** |
| /analytics | 462 kB | **180 kB** |
| /players | 456 kB | **174 kB** |
| /players/[playerKey] | 454 kB | **173 kB** |

Remaining heavy routes (documented, out of this programme's target
scope — they use repositories/modals in render paths, not just
effects): /matches/score 526, /matches/center 520, /matches/summary
514, /profile 510, /matches/opening-players 508, /tournaments/[id]
495, /grounds 474, /matches/history 470, /offline 226 kB.

## CACHE_VERSION

`v2.2.10 → v2.2.11` in `public/sw.js`, the
`ServiceWorkerManager` fallback cache names, `OfflineSetupService`'s
recorded version, and the pins in `performance-round.test.ts`,
`chunk-recovery.test.ts`, `offline-setup-manager.test.ts`
(standing release rule; android/ios `assets/public/sw.js` copies are
git-ignored Capacitor sync artefacts, regenerated on shell builds).

## Gates (all run on the final tree)

- **Unit: 165 test files, 1803/1803 passed** (`npm test`; includes
  18 new programme pins in `performance-fix-programme.test.ts` —
  17 original + 1 careerStats pin added with ead8225).
- **tsc: 0 errors** (`npx tsc --noEmit`).
- **Lint: 0 errors, 3 warnings** — all three pre-existing
  exhaustive-deps warnings in untouched files
  (GroundSelectorModal, ToolsAndAccountsPanel,
  GoogleDriveBackupSection).
- **Production build: PASS** (`npm run build`).
- **Static export: PASS** (`npm run build:shell` → `out/`,
  api restored, tree clean).
- **Hydration sweep: 0 React #418/#423/#425** — cold loads of
  10 routes × EN + BN (393×852, fresh export). The only console
  noise was the export server's redirect interruption for the
  /history and /settings alias routes, not an app error.
- **Offline suite: 10/10 passed** (Playwright, mobile+desktop).
  Note: an earlier run against the shell-export `.next` (wrong
  artefact for `next start`) timed out on networkidle for all 10;
  re-run against the proper production build passes 10/10, and the
  same single test passes on the pre-programme baseline build —
  i.e. the failure was the harness artefact, not a regression.
- **Visual suite: 38/38** — 37 passed in the full run; the one
  failure (`summary-completed (dark)`, desktop) was a Chromium
  "Page crashed" renderer crash, not a diff, and passes on
  isolated re-run (6.0s). No baseline images changed: the Home
  dashboard visual tests pass unchanged because the removed
  skeleton only ever rendered during loading, which the visual
  suite does not capture.

## Re-measurement (same method as baseline)

Method: fresh static export served on localhost:4173, Chromium
393×852, empty data; baseline file `results_local.json`, after
files `results_after.json` / `results_after_run1.json` in
`~/workspace/cricket-perf-measure/`.

| Route | LT count (base → after r1/r2) | LT total ms | LT max ms | LCP ms | CLS | DOM | Heap MB |
|---|---|---|---|---|---|---|---|
| / | 6 → 8/— | 363 → 641/598 | 91 → 146/127 | 444 → 272/296 | **0.137 → 0.000** | 532 → 529 | 17 → 17 |
| /teams | 2 → 3/— | 268 → 358/530 | 189 → 216/245 | 296 → 316/320 | 0 → 0 | 446 → 451 | 12 → 12 |
| /tournaments | 3 → 5/— | 266 → 460/505 | 140 → 170/174 | 268 → 244/280 | 0 → 0 | 450 → 452 | 11 → 12 |
| /history | 6 → 8/— | 493 → 628/564 | 147 → 165/132 | 864 → 904/888 | 0 → 0 | 454 → 452 | 12 → 12 |
| /analytics | 3 → 5/— | 311 → 381/265 | 184 → 105/162 | 284 → 212/228 | 0 → 0 | 323 → 323 | 11 → 11 |
| /players | 2 → 4/— | 201 → 379/371 | 144 → 159/105 | 560 → 676/756 | 0 → 0 | 337 → 337 | 11 → 11 |
| /grounds | 3 → 3/— | 298 → 192/434 | 191 → 84/146 | 544 → 520/508 | 0 → 0 | 386 → 383 | 11 → 11 |
| /matches/new | 8 → 8/— | 827 → 785/890 | 283 → 240/235 | 1304 → 1388/1348 | 0.019 → 0.019/0.066 | 626 → 623 | 36 → 33 |
| /profile | 7 → 4/— | 518 → 371/434 | 176 → 201/193 | 296 → 296/288 | 0 → 0 | 669 → 667 | 14 → 14 |
| /settings | 5 → 7/— | 474 → 474/581 | 201 → 96/191 | 780 → 792/988 | 0 → 0 | 668 → 666 | 15 → 14 |

**Honesty note on long tasks:** LT totals in this VM fluctuate
±40% between identical runs (shared 1.5 CPU), and the deferred
chunks still parse *inside* the 3s measurement window — deferral
moves work off the first-paint/transition path; it does not delete
it. So LT totals are not a reliable discriminator here and are
reported un-cherry-picked. The deterministic wins are: bundle
sizes (build output, −60…−82% on the targeted routes), Home CLS
0.137 → 0.000 (two runs + zero shift-source entries), Home LCP
444 → 272/296ms, New Match LT max 283 → 235/240ms, transition
long tasks 107 → 83ms and 65 → 0ms, and the icon preload/weight
removal (287KB high-priority preload gone; icon itself 38KB).
TAIMUR's iPhone remains the decisive surface for felt smoothness,
as with every previous round.

## What was deliberately not done, and why

1. **SyncEngine internal lazy-load / repository bridge** — see
   Fix 1: sync timing semantics outrank bundle purity; the SDK is
   removed from initial chunks at the call-site level instead.
2. **BowlingLimiterDrawer dynamic import** — pinned inline by
   existing tests; light component; not the mount bottleneck
   (the repository/Maps chains were).
3. **Remaining heavy routes** (score/center/summary/profile/
   grounds/history-list/opening-players) — they import
   repositories/modals in render paths; converting them is a
   separate, larger programme and was out of the approved ranking's
   scope (layout + Home + tab pages).
4. **maskable-512.png (179KB)** — not in the approved fix list
   (only cricket.png + the foreground icon were); noted for a
   future pass.
5. No UI redesign anywhere; no firestore.rules changes; no push,
   no deploy.
