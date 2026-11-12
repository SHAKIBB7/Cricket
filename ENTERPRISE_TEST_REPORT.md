# Enterprise Test & Fix Programme — Report (2026-11-12)

Owner instruction: browser-test every feature, button and page; fix whatever is
needed to reach international/enterprise standard; per-step permission waived
for this programme; deliverable = the output + this report.

## How the site was tested

- **Interactive browser sweep** (Playwright, Chromium, 393×852 — the owner's
  phone class): every route cold (`/`, new match, history, tournaments, teams,
  grounds, players, profile, analytics, offline, 404), bottom-nav all tabs,
  theme toggle, then with seeded data: team expand/edit/delete controls,
  tournament card → details with every tab, history → scorecard (center),
  history → Resume → live score page, players → career profile, analytics
  charts, grounds search.
- **Full user journey**: New Match (pick both teams via the dropdowns, native
  validation on empty submit) → Opening Players (defaults pre-selected) →
  Start Live Scoring → scoring keypad verified ball by ball (1 → 1/0,
  4 → 5/0, Wide arms as a modifier, Wicket opens the dismissal flow and the
  next-batsman modal) → Undo.
- **BN pass**: headings on Home/History/Tournaments/Teams render Bengali;
  Schedule & Bracket tab verified in Bengali after the i18n fix.
- **Layout**: zero horizontal overflow on 5 routes at 393px and 1280px.
- **Error capture**: console errors + pageerrors recorded per route.
- **Static audits** (two independent passes): robustness (error handling,
  dead ends, type escapes) and accessibility/i18n (AST scan of 84 tsx files,
  305 buttons, 53 form controls).
- **Dev-build diagnosis** for the production hydration errors (below).

Sweep verdict before fixes: every feature worked. No dead buttons, no broken
flows, no pageerrors in EN. The defects were below the surface:

## Defects found & fixed

### 1. HIGH — React hydration failure on every cold load (root discarded)

Production threw React #418/#423/#425 on all main routes. Dev-build traces
isolated two independent causes, both the same class — first-render state
read from client-only sources the server cannot know:

- **Saved-Bengali users (all pages):** `LanguageContext` initialised from
  `localStorage`, so the client's first render diverged from the SSR HTML;
  React discarded the entire root and re-rendered client-side — a full
  double render on every cold start (and a plausible contributor to the
  "stepped" load feel reported in earlier programmes). Fix: the provider
  now initialises to the server language (`'en'`); the existing mount
  effect applies the saved language immediately after hydration. First
  paint timing for BN text is unchanged (the BN dictionary chunk loaded
  after first paint anyway) — only the failure and the root discard go away.
- **Everyone, /profile:** `PlatformContext` sniffed the real user agent in
  its state initializer AND inside `deriveInstallState` during render, so
  InstallAppCard's first client render picked a different branch (button)
  than the server HTML (span). Fix: platform initialises to a shared
  `SERVER_PLATFORM` constant; the UA became state (`''` until the mount
  effect supplies the real one). The mount effect already re-detected the
  platform, so behaviour after mount is identical.

Verified: production build, BN and EN, 9 routes — **0 hydration errors**
(before: errors on every route). Pinned by `enterprise-hydration.test.tsx`
+ a live mount test (`enterprise-language-mount.test.tsx`) proving the
saved language still applies post-hydration and `<html lang>` follows it.

### 2. HIGH — Tournament result writes could silently lose a result

The tournament details page's result handlers (winner / tie / no-result /
clear / schedule persist) awaited `saveTournament` with no guard: a Dexie
failure (quota, private mode, DB corruption) became an unhandled rejection
and the recorded result never persisted. All writes now go through one
`persistTournament` guard: on failure the UI state is left untouched and
the user gets a toast (`tournament_save_failed`, EN+BN). The page's load
path was already guarded; the writes were the inconsistent remainder.

### 3. MEDIUM — Analytics load unguarded

The only page load in the app with no try/catch: a rejected read left the
page showing its empty state, indistinguishable from an empty library.
Now guarded, with a distinct retryable error state
(`analytics_load_error` + Retry, EN+BN) and a cancellation guard.

### 4. MEDIUM — Opening Players rendered a blank page while loading

`if (!setup) return null` — a blank screen inside the slide transition on
slow reads. It now renders a skeleton in the page's own layout shell with
`role="status"` (a failed read still bounces to New Match, as designed).

### 5. Accessibility pass (from the AST audit)

- The only two truly unnamed buttons in the app got names:
  CompactDropdown's clear-search (multiplies to every dropdown) and the
  score page's bowler-error dismiss — both via new `clear_search` /
  `dismiss` keys (EN+BN).
- Icon buttons that relied on `title` alone (teams edit/delete, tournament
  delete, history PDF/delete ×2) gained explicit `aria-label`s with the
  same translated strings.
- Placeholder-only inputs gained programmatic labels: profile display
  name / email / **password**, and all six GroundSelectorModal fields.
- CompactDropdown's three `focus:outline-none` elements with no focus
  replacement gained the app's standard `focus-visible:ring-2` emerald ring.
- The three big clickable cards (history match, tournament, teams expand
  header) are now keyboard-operable: `tabIndex={0}` + Enter/Space handlers
  with a self-target guard so nested buttons never double-trigger.
- `<html lang>` now follows the active UI language (WCAG 3.1.1) via an
  effect in LanguageContext.

### 6. i18n — Schedule & Bracket tab fully localised

The last fully-hardcoded surface (flagged in two earlier programmes):
21 new `schedule_*` keys (EN+BN, parity kept), covering the generate /
regenerate buttons, the league playoffs note, empty state, round headers,
status pills, winner/champion lines, semi-final/final labels, TBD/BYE, and
the regeneration confirmation dialog. Verified live in Bengali.

### 7. Housekeeping

- 8 intentional empty `catch {}` blocks (listener/Map/SW teardown,
  best-effort writes) annotated as intentional so the pattern stays
  reviewable.
- **Visual test baselines re-generated.** The Playwright visual suite had
  been silently stale since the 2026-11-10/11 Matchday redesigns (13 of 38
  comparisons failing against pre-redesign screenshots; CI does not run
  the visual suite, so nobody saw it). Baselines now match the approved
  live design and the suite is green again — it can catch real regressions
  from here.

## Gates (final tree)

- Unit: **1703/1703** (158 files; +9 new enterprise regression tests)
- Typecheck: 0 errors · Lint: exit 0 (3 pre-existing exhaustive-deps
  warnings in untouched effects — GroundSelectorModal, ToolsAndAccountsPanel,
  GoogleDriveBackupSection; none introduced here)
- Build: PASS
- Playwright visual: **38/38** · Offline e2e: **10/10** · navqa: **16/16**
- Production hydration check: **0 errors** (BN + EN, 9 routes)

## Verified clean (no action needed)

- Zero dead ends: no no-op handlers, no `href="#"`, no stubs anywhere.
- Zero `console.log/info/debug`, zero TODO/FIXME, zero `@ts-ignore` in src;
  a single confined `as any` (PDF route rate-limit key) — left as-is.
- The only `window.confirm` in the app remains the known one in
  useSmartNavigation (owner's separate decision, untouched).
- Firebase "NOT CONFIGURED" console errors appear only in this VM (no env);
  production is unaffected.

## Known backlog (documented, not hidden)

- **i18n retrofit, remaining surfaces** (~250 hardcoded strings): Batsman
  Profile modal (~42), Bowler Profile modal (~33), score page (~56),
  profile account section (~27), MatchesPanel (~19), BowlingLimiterDrawer
  (~15). A dedicated programme — the two profile modals don't import
  useLanguage at all today. Schedule & Bracket (this report, §6) is done.
- Remaining clickable-div surfaces beyond the three cards fixed here
  (summary performer cards, ground rows) — same keyboard pattern applies
  when that pass is scheduled.
- F11 (`npm audit` registry 403 in this VM) and the F12/P8 on-device
  verifications remain owner-side, unchanged by this programme.
