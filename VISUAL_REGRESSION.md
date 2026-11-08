# Visual Regression Testing (Phase 14)
Established: 2026-11-08 · Branch: `audit/fix-phase2-10` (local only — not pushed, not deployed)

## What exists
- `playwright.config.ts` — Chromium, production build on :3100 (webServer),
  projects `mobile` (390×844, touch, 2x) and `desktop` (1280×800, 1x),
  reduced-motion emulation, Asia/Dhaka timezone, en-US locale.
- `e2e/visual-routes.visual.ts` — 26 screenshot tests:
  routes `/`, `/teams`, `/tournaments`, `/analytics`, `/matches/new`,
  `/offline` × light + dark themes × both viewports (24), plus the
  dashboard in the `sunlight` theme × both viewports (2).
- Baselines: `e2e/visual-routes.visual.ts-snapshots/` (26 PNGs, ~2.4 MB) —
  COMMITTED on purpose; they are the regression reference.
- `@playwright/test@1.63.0` added as devDependency, matching the existing
  `playwright@1.63.0`. Browsers: `npx playwright install chromium` (once).

## How to run
```
npm run build            # visual tests run against the production build
npm run test:visual      # compare against baselines
npm run test:visual:update   # regenerate baselines after INTENTIONAL UI changes
```
Verified 2026-11-08: baseline generation 26/26 written; immediate rerun
26/26 PASS with zero flakes (workers: 1, animations disabled for
screenshots, fonts awaited, 1% pixel tolerance for rasterization noise).

## Rules
- Never blanket-update baselines to make a red run green. A diff means the
  UI changed — look at the diff image (test-results/) and decide whether
  the change was intended.
- Baselines are platform-specific (`-linux` suffix): screenshots taken on
  macOS/Windows will differ in font rasterization. Regenerate per platform
  if the suite is ever adopted there; do not mix.
- Specs are named `*.visual.ts` so Vitest never collects them, and `e2e/`
  + `playwright.config.ts` are excluded from the app tsconfig — the unit
  suite and typecheck gates are completely unaffected.

## Deliberately NOT covered yet
- Live score page, match center, match summary: they need a seeded match
  in IndexedDB (Dexie). Seeding deterministically (fixed teams/players/
  score state) is the next step before baselining them — screenshotting
  whatever state a previous run left behind would be worse than nothing.
- Modals/sheets/toasts and interaction states (hover/focus/pressed):
  follow once seeded-data specs exist.
- Cross-browser (Firefox/WebKit): Chromium only for now; the app's
  primary targets are Android Chrome and iOS Safari — WebKit project is
  the highest-value addition when this is picked up again.
