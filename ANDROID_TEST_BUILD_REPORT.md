# Capacitor Phase 1 + 2 — Shell Scaffolding & Wrapper Gating: Report

Date: 2026-11-13 · Branch: `audit/fix-phase2-10` · Base: `365b96d`
Commits: `cce2c11` (Android core) + the iOS-extras commit following it.
Status: **DONE locally. NOT pushed, NOT deployed** (per TAIMUR's
gate). CACHE_VERSION unchanged (v2.2.10) — this ships in the
native shell, not as a web release.

TAIMUR's context: he has only an iPhone (no Android device, no
Mac). The Android project is the future Play Store path; the iOS
project + cloud-build workflow were added as second-order extras.
Priority was Android first, iOS second — both completed.

## What was built

### 1. Dynamic route wrappers (5 routes)
`page.tsx` → `client.tsx` (git mv, content preserved) +
a thin server wrapper `page.tsx` exporting
`generateStaticParams()` returning ONE dummy param (`'_'`):
`matches/score/[matchId]`, `matches/center/[matchId]`,
`matches/summary/[matchId]`, `players/[playerKey]`,
`tournaments/[id]`. `dynamicParams` keeps its default (`true`),
so web behaviour is identical.

### 2. Shared param hook — `src/lib/useShellRouteParam.ts`
(+ pure helpers in `src/lib/shellRoutes.ts`, 10 new unit tests.)
All five client pages read their id through this hook instead of
raw `useParams`. Real param → returned untouched (web no-op).
Placeholder `'_'`/missing → recovered after mount from
(a) sessionStorage `csp:redirect-path` (stored by the 404
redirector; consumed on use; pattern-prefix-checked), else
(b) `window.location.pathname` at the route's segment index.
While unresolved it returns `undefined`, and every page's
existing `if (!id) return` guard holds its loading/skeleton
state — no not-found flash. The players page additionally needed
its load effect guarded at the top (its `finally` would have
ended loading on an empty key and latched a false not-found).
Hydration-safe: initial value derives only from `useParams`;
recovery lives in `useEffect`. next/navigation access follows
the defensive namespace pattern of `useSmartNavigation` so
partial test mocks cannot break it. One type fix fell out:
score page `currentMatchId={matchId ?? ''}`.

### 3. 404 redirector — `src/app/not-found.tsx`
Provider-free bilingual 404 in the `error.tsx` style. On mount,
a pathname matching a dynamic pattern with a real segment is
stored in sessionStorage and `location.replace()`d to the
pattern's placeholder (`/tournaments/_/` etc.), with a per-path
attempt flag as loop guard; placeholders never redirect. In the
export this page becomes `out/404.html` (66 KB, verified).

**Early redirector injection:** Chromium probing showed React
hydration errors (#418×3 + #423) on the *intermediate* 404
document when served at the score URL — the App Router
reconciles the URL against the not-found flight before the
component effect can redirect (the placeholder document itself
was always clean). `scripts/build-shell.mjs` therefore injects
a tiny synchronous inline script into `out/404.html` at build
time that performs the same mapping during document parse,
before any app JS runs. Export-artifact only; the web build is
untouched; the component effect remains as fallback. After the
injection the probe is fully clean (below).

### 4. SW gating (Phase 2 prerequisite)
`ServiceWorkerManager.init()` and the private register seam now
return early when `isEmbeddedWebView()` (src/lib/platform.ts —
Capacitor/Cordova globals, `; wv)` UA marker, bare WebView
token, iOS WKWebView heuristic) is true. Checked inside the
effect-driven init path only, never during render. Probe proof:
wrapper-marked Chromium context ('; wv)' UA + `window.Capacitor`)
→ **0 SW registrations**; plain browser context → 1 (unchanged).

### 5. Meta CSP
Root layout `<head>` now carries the header CSP from
`next.config.mjs` as a `<meta httpEquiv="Content-Security-Policy">`,
minus `frame-ancestors` (the only directive meta cannot express).
Web: additive to the identical header — probe-verified 0
violations. Shell: the policy survives the export.

### 6. Export config + build script
`next.config.mjs` is env-switched: `CAPACITOR_BUILD=1` →
`output: 'export'` + `trailingSlash: true`, `headers()` omitted;
otherwise the previous config, functionally byte-for-byte.
`npm run build:shell` (`scripts/build-shell.mjs`) parks
`src/app/api` at `.shell-aside/api` (**outside** src/app — a
first version parked it inside src/app, where Next treated it
as a route segment and the export failed on
`/api.__shell-aside__/pdf/export`; fixed), runs the export
build, restores the API dir even on failure, then injects the
early redirector. Tree verified clean after every run.

### 7. Capacitor scaffolding
Capacitor **6.2.3** pinned (`@capacitor/core`, `@capacitor/android`,
`@capacitor/ios` as deps; `@capacitor/cli` dev). JDK 17 / SDK 34
compatible line. `capacitor.config.ts`: appId
`com.shakibb7.cricscorerpro`, appName `Cricket Scorer Pro`,
webDir `out`, `server: { androidScheme: 'https', errorPath:
'404.html' }` — `errorPath` verified as a valid Capacitor 6
config key in the package's own types
(`@capacitor/cli/dist/declarations.d.ts`). `npx cap add android`
+ `npx cap sync android` ran clean; `android/app` exists with
the correct applicationId; the generated `android/.gitignore`
excludes the copied web bundle + generated config JSON (both
regenerated by `cap sync`). Icons: Capacitor defaults (the
generated template assets) — wiring the PWA icons/splash is
deferred polish, not needed for a compile/test build.
**Gradle/APK build intentionally NOT run here** (coordinator's
JDK/SDK lane).

### 8. Test pins
23 test files repointed from the five `page.tsx` paths to
`client.tsx` (plus one e2e seed comment). Full suite green.

## Gates (all captured in ~/workspace/gates-cap-*.log)

| Gate | Result |
|---|---|
| Unit (`npm test`) | **1785/1785**, 164 files (baseline 1775 + 10 new shell-routes tests) |
| Typecheck | **0 errors** |
| Lint | **exit 0**, 3 warnings (all pre-existing) |
| Web build (`npm run build`) | **PASS** |
| Shell export (`npm run build:shell`) | **PASS** — out/ 9.3 MB, all 5 placeholder shells + 404.html emitted, api restored |
| Export probe (`~/workspace/rigs/shell-probe.cjs`) | **14/14 PASS** |
| Web hydration + CSP probe (prod build, 9 routes) | **EN: 0 CSP / 0 hydration / 0 pageerrors · BN: 0 / 0 / 0** |

Export probe detail (exported `out/` served Capacitor-style —
unknown paths return 404.html with the URL unchanged, seeded
IndexedDB with the e2e live match + a test tournament):
home cold load renders; tournament / summary / score deep-links
each redirect to their placeholder, recover the real id, and
render the seeded record (score page shows the live scoreboard,
target 150); a truly unknown path stays put and renders the
bilingual 404; 0 pageerrors and 0 CSP violations in the browser
context; SW registers on web (1) and is fully gated in the
wrapper context (0).

## iOS

- `npx cap add ios` **succeeded on this Linux VM** and
  `npx cap sync ios` completed — with one expected skip:
  **pod install did not run (CocoaPods is unavailable on
  Linux)**; xcodebuild steps were likewise skipped by the CLI.
- Committed state of `ios/`: `ios/App/App.xcodeproj` and
  `App.xcworkspace` exist, `ios/App/Podfile` exists, and the web
  assets **were copied** to `ios/App/App/public` by the sync
  (that folder is covered by the generated `ios/.gitignore`,
  like `Pods/`, so both regenerate on a Mac/CI sync).
- **Honest build path:** this Linux VM cannot build iOS apps.
  Building needs Xcode on macOS — for TAIMUR (no Mac) that means
  the added **cloud workflow** `.github/workflows/ios-build.yml`:
  `workflow_dispatch` only (never push/PR), macos-14 runner,
  Node 22, `npm ci`, `node scripts/build-shell.mjs`,
  `npx cap sync ios`, `pod install`, then an **unsigned**
  `xcodebuild` Release compile proof
  (`CODE_SIGNING_ALLOWED=NO`) with the build log (and the
  unsigned .app, on success) uploaded as artifacts.
- Installing on TAIMUR's iPhone / TestFlight / App Store
  additionally requires his **Apple Developer enrolment
  ($99/yr)** and signing credentials; the workflow intentionally
  stays unsigned until then.

## Deferred (out of scope, unchanged from the plan)

- Phase 3 native Google sign-in plugin (+ Firebase SHA-1 step).
- Phase 4 native file delivery (`downloadBlob` → Filesystem/Share).
- Phase 5 storage-durability snapshots (P-6 mitigation).
- Android APK/AAB build (coordinator's JDK 17 + SDK lane), Play
  Console account ($25) + release keystore (TAIMUR's).
- PWA icon/splash wiring into the native projects; Android
  back-button polish; Kotlin `shouldInterceptRequest` soft-nav
  polish (Phase 1.5) — dynamic navigation in the shell is a
  hard load via the redirector, functional but not soft.
