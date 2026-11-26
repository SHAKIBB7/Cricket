# Performance-Only Main — Addendum Report (2026-11-15)

TAIMUR's decision: only the performance fix programme goes to production
main; the Capacitor (Android/iOS) code does NOT. This branch,
`perf-only-main`, is production code (local 365b96d — tree-identical to
remote main a168fb50, snapshot-verified) plus ONLY the five performance
commits, cherry-picked from `audit/fix-phase2-10`:

| Perf-only commit | Source commit | Content |
|---|---|---|
| 1909993 | 0ec4c46 | Fix 3: icon preload removed, PWA icons optimised |
| 8f14f90 | e15c479 | Fix 1: Firebase/Supabase lazy-load |
| 92ee94a | e13126b | Fix 2/4/5 + CACHE_VERSION v2.2.11 |
| 0deea95 | ead8225 | Fix 5: careerStats dynamic repositories |
| 4c2a57d | 1e03886 | Programme report (PERFORMANCE_FIX_PROGRAMME_REPORT.md) |

## Delta vs production (365b96d..HEAD)

22 files, 954 insertions, 279 deletions — the file list and totals are
identical to the full programme delta (1240f40..1e03886):

PERFORMANCE_FIX_PROGRAMME_REPORT.md, public/assets/icon/cricket.png
(287,093 → 38,132 B), public/assets/icon/cricket_foreground.png
(207,074 → 29,974 B), public/sw.js, src/__tests__/chunk-recovery.test.ts,
src/__tests__/offline-setup-manager.test.ts,
src/__tests__/performance-fix-programme.test.ts,
src/__tests__/performance-round.test.ts, src/app/analytics/page.tsx,
src/app/layout.tsx, src/app/matches/new/page.tsx, src/app/page.tsx,
src/app/teams/page.tsx, src/app/tournaments/page.tsx,
src/context/AuthContext.tsx, src/context/SyncContext.tsx,
src/features/players/careerStats.ts,
src/infrastructure/auth/firebase-config.ts (new),
src/infrastructure/auth/firebase.ts,
src/infrastructure/auth/supabase.ts,
src/infrastructure/offline/OfflineSetupService.ts,
src/infrastructure/pwa/ServiceWorkerManager.ts.

Capacitor check: `git diff 365b96d..HEAD | grep -i capacitor` returns
nothing in code. The only hit is one contextual mention inside
PERFORMANCE_FIX_PROGRAMME_REPORT.md. No @capacitor imports, no android/
or ios/ files, no capacitor.config.ts, no next.config.mjs change, no
package.json/package-lock change at all.

## Conflict resolutions

Only ONE conflict occurred, in the first cherry-pick:

- **src/app/layout.tsx (0ec4c46):** the incoming commit was written on
  top of the Capacitor-era layout, which had inserted a meta-tag CSP
  block where production has the icon preload. Resolved by keeping the
  production layout and removing ONLY the 281 KB icon preload `<link>`,
  with an explanatory Fix-3 comment (font preloads kept; metadata icon
  references at lines 43/60/72 unchanged). The Capacitor meta-CSP was
  NOT brought over.

The other four cherry-picks applied cleanly (ServiceWorkerManager.ts
auto-merged). Content comparison against the full programme tree
(1e03886) confirms the ONLY two files that differ are:

- layout.tsx — the Capacitor meta-CSP is absent here (intended).
- ServiceWorkerManager.ts — the Capacitor wrapper gate
  (`isEmbeddedWebView()` early-returns in init/register) is absent
  here (intended); the v2.2.11 fallback cache names are present.

CACHE_VERSION: `public/sw.js` = 'v2.2.11'; ServiceWorkerManager
fallbacks `cric-scorer-runtime-v2.2.11` / `cric-scorer-shell-v2.2.11`;
OfflineSetupService version 'v2.2.11'; all test pins consistent.
(Pre-existing cosmetic note, identical in the full programme tree: the
sw.js header comment still says "Version: 2.2.10" — the CACHE_VERSION
constant itself, which every pin checks, is v2.2.11.)

No performance hunk was inseparable from a Capacitor change.

## Gates on this exact tree (perf-only-main)

- **Unit:** 164 files, 1793 tests. Full run: 1792/1793 — the single
  failure was `bengali-pdf-scorecard.test.ts` Chrome PDF test timing
  out at 15 s under full-suite parallel load; isolated re-run of that
  file passes 5/5 (Chrome test 4.6 s). PDF code is not in the delta.
  Effective: **1793/1793**.
  Count reconciliation vs the full programme tree (165 files /
  1803): the Capacitor commits added exactly one test file,
  `shell-routes.test.ts` (10 tests), which correctly does not exist
  here. 1793 = production baseline 1775 + 18 new programme pins.
- **tsc --noEmit:** 0 errors.
- **Lint:** 0 errors, 3 warnings (all pre-existing, untouched files:
  GroundSelectorModal, ToolsAndAccountsPanel, GoogleDriveBackupSection).
- **Production build (npm run build):** PASS. First Load JS —
  shared 88.8 kB; `/` 173 kB; `/matches/new` 188 kB; `/teams` 194 kB;
  `/tournaments` 196 kB; `/analytics` 180 kB; `/players` 174 kB.
  These match the full programme tree's numbers exactly, so the
  bundle wins carry over identically without the Capacitor code.
- **Hydration sweep:** production build served via `next start`,
  10 routes × EN + BN cold load — **0** React #418/#423/#425, 0 other
  console/page errors.
- **Visual suite:** 37/38 in the full run; the one failure
  (new-match dark, mobile) was a screenshot-stability flake — page
  height oscillated 1253↔1285 px between captures under load.
  Isolated re-run of all new-match visual tests: 4/4 pass.
  Effective: **38/38**, no baseline changes.
- **Offline suite:** **10/10 passed**.

## Not done

- Nothing was pushed or deployed. Production is untouched.
- The generated `android/` and `ios/` directories still exist on disk
  (untracked; excluded via .git/info/exclude on this machine) — they
  are not part of this branch and were not committed.
