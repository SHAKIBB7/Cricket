# Precache Diet + Touch Icon — Ranked List #2 + #7 (2026-11-20)

Implements items **#2 (service-worker precache diet)** and **#7
(apple-touch-icon recompression)** from `LIVE_MEASURE_2026-11-20.md`.
Local only — **nothing pushed, nothing deployed**; production is
untouched. Push approval is a separate step.

## Base

- Scratch worktree on branch `precache-diet-v2.2.12`, based on
  local `66306ad` (perf-only-main HEAD).
- Base verified against production before any edit: remote
  `main` = commit `df061df7`, tree `47773004a2d8acd561a9848e2bb68ac839d8c66f`
  (read via ghapi.py Git Data API) == local HEAD tree. Exact match.
- The Capacitor branch (`audit/fix-phase2-10`) was NOT used as a base.

## Item #2 — precache diet (`public/sw.js`)

The precache carried **38 array entries (29 unique) / ~1.63 MB**
(live-measured), re-downloaded in full on every release. It now
carries **19 entries, all unique**. Removed:

- **8 route HTML documents** (`/matches/new`, `/matches/history`,
  `/grounds`, `/tournaments`, `/teams`, `/matches/opening-players`,
  `/analytics`, `/profile` — 647,132 B of built HTML). Kept: `/`
  and `/offline`, the two documents the navigation handler uses
  as fallbacks.
- **Both Bengali font TTFs** (277,972 B).
- **9 duplicate illustration entries** (the old list precached
  the same 9 illustrations twice; ~190 KB of redundant fetches
  per install on the live-measure basis).

Why the removed entries still work (verified in code + probes):

- Route documents are served by the navigation handler
  stale-while-revalidate, runtime-cache first, and
  `OfflineSetupService.ensureApplicationCaches()` already warms
  every route document + its referenced JS/CSS chunks into the
  caches on first online visit (`warmResources` +
  `warmRouteAssets`). The precache copies were redundant with
  that designed path — the Phase 15 finding was that documents
  alone never rendered a route offline anyway; the warmed
  chunks are what make offline navigation work.
- `ServiceWorkerManager.verifyCachesReady()` reads the shell
  cache, which is exactly where `warmResources` writes the
  warmed documents — verification semantics unchanged.
- Fonts: the fetch handler's static branch now also matches
  `/fonts/*` → cache-first into the static cache (fonts are
  immutable). Probe against the built app confirmed both
  `NotoSansBengali-*.ttf` land in `cric-scorer-static-*` after
  first use, and a `/teams` document lands in cache after a
  visit despite no longer being precached.
- The version-skew shell-refresh block
  (`PRECACHE_RESOURCES.includes(...)`) is untouched; it now
  applies to `/` and `/offline`, whose shell copies still
  converge on every navigation.

## Item #7 — apple-touch-icon

- `public/apple-touch-icon.png` and
  `public/apple-touch-icon-precomposed.png` (byte-identical
  twins, referenced by `layout.tsx` metadata at 180×180):
  **49,525 → 8,687 B each (−82.5%)**, via 256-colour palette
  quantization (PIL FASTOCTREE + Floyd–Steinberg). Dimensions
  unchanged (180×180), filenames unchanged, twins still
  byte-identical. Pixel RMSE vs original 3.90 / 255 — no
  perceptible change at icon sizes. (Lossless RGB re-encode
  only reached 33,353 B, above the 15–25 KB target; the palette
  version beats the target on both size and fidelity grounds.)
- The separate `public/assets/icon/apple-touch-icon.png`
  (36,977 B, already optimised in perf Fix 3) is a different
  file and was left alone.

## CACHE_VERSION rule

`v2.2.11 → v2.2.12` in: `public/sw.js` (constant + header
comment), `ServiceWorkerManager.ts` (both fallback cache
names), `OfflineSetupService.ts` (setup metadata stamp), and
the pins in `performance-round.test.ts`,
`chunk-recovery.test.ts`, `performance-fix-programme.test.ts`,
`offline-setup-manager.test.ts`. One new regression pin added
in `performance-round.test.ts`: precache contains no route
documents/fonts, keeps the true shell, has no duplicates, and
`/fonts/` is routed cache-first.

## Before / after (local production build basis, exact bytes)

| Metric | Before | After | Delta |
|---|---|---|---|
| Precache entries | 38 (29 unique) | 19 (all unique) | −19 / −10 unique |
| Precache bytes | 1,476,731 B (1,442 KB) | 469,951 B (459 KB) | **−1,006,780 B (−68.2%)** |
| — of which route HTML removed | 8 docs, 647,132 B | — | |
| — of which fonts removed | 277,972 B | — | |
| — of which icon shrink | 99,050 B | 17,374 B | −81,676 B |
| apple-touch-icon.png | 49,525 B | 8,687 B | −82.5% |

(On the live measure's basis — which summed all 38 array
entries including duplicates — the same change reads as
~1,626 KB → ~620 KB per release download.)

## Gates (this exact tree)

- **Unit:** 1794/1794 (164 files) — baseline 1793 + 1 new pin.
- **Typecheck:** 0 errors.
- **Lint:** exit 0; 3 warnings, all pre-existing
  exhaustive-deps in untouched files.
- **Production build:** PASS. First Load JS identical to the
  perf-only baseline (shared 88.8 kB; `/` 173 kB;
  `/matches/new` 188 kB; `/teams` 194 kB; `/tournaments`
  196 kB; `/analytics` 180 kB; `/players` 174 kB) — the diet
  changes no bundles.
- **Hydration/CSP probe** (production build, 9 routes × EN+BN
  cold loads): 0 CSP violations, 0 hydration errors
  (#418/#423/#425), 0 page errors.
- **Visual suite:** 38/38, no baseline changes.
- **Offline suite:** 10/10 — shell renders offline, cold
  offline navigation to `/offline`, offline team creation +
  persistence, seeded offline scoring all pass on the diet
  precache.
- **Warmed-SW upgrade simulation** (`~/workspace/rigs/upgrade-sim-v2212.cjs`):
  client warmed on the v2.2.11 build, server swapped to this
  build — new SW reached `waiting`, Apply (SKIP_WAITING)
  purged all old caches (only `cric-scorer-shell-v2.2.12`
  remained), tap-through `/teams` → `/tournaments` →
  `/profile` rendered, 0 page errors. **SIM PASS.**

## Push scope (when approved)

Exactly these 10 files:

- `PRECACHE_DIET_REPORT.md` (new)
- `public/sw.js`
- `public/apple-touch-icon.png`
- `public/apple-touch-icon-precomposed.png`
- `src/infrastructure/pwa/ServiceWorkerManager.ts`
- `src/infrastructure/offline/OfflineSetupService.ts`
- `src/__tests__/performance-round.test.ts`
- `src/__tests__/chunk-recovery.test.ts`
- `src/__tests__/performance-fix-programme.test.ts`
- `src/__tests__/offline-setup-manager.test.ts`

No Capacitor code, no package.json/package-lock changes, no
other files. After a push, per standing convention: verify
tree/blob equality, the Vercel deployment state for the new
commit, and CI.
