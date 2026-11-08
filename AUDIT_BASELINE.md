# Audit Baseline — Cricket Scorer Pro

Recorded: 2026-11-08 (Asia/Dhaka)
Branch: `audit/fix-phase2-10`
Baseline commit: `f3046325a602bac09cd28705975e6e0d0668c947` (main)
Environment: Node v24.22.1 (project requires >=22), npm 10.9.4, Linux VM
Deps: `npm ci --ignore-scripts` (571 packages); Puppeteer Chrome 154.0.8037.57 installed separately via `npx puppeteer browsers install chrome`

## Results

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | PASS — 0 errors |
| Lint | `npm run lint` | PASS — no ESLint warnings or errors |
| Tests | `npm run test` (Vitest 3.2.7) | PASS — 1044/1044 tests, 90/90 files (see note) |
| Build | `npm run build` (Next 14.2.35) | PASS — 18/18 static pages generated |

### Test note (important)
- Without a Chrome executable, 2 tests in `src/__tests__/bengali-pdf-scorecard.test.ts` fail:
  "Chrome/Chromium executable not found" (Puppeteer PDF test + `/api/pdf/export` POST returns 500).
- After installing Puppeteer's Chrome, that file passes 5/5 and the full suite is 1044/1044.
- Conclusion: those 2 failures are ENVIRONMENTAL (CI/dev machines need Chrome for the PDF path), not code bugs. They also prove the server PDF route hard-depends on a Chrome binary at runtime.

### Build size snapshot (First Load JS)
- Shared by all: 88.4 kB
- Heaviest routes: `/matches/center/[matchId]` 481 kB, `/matches/opening-players` 474 kB,
  `/matches/score/[matchId]` 473 kB (page itself 24.7 kB), `/matches/summary/[matchId]` 470 kB,
  `/profile` 459 kB, `/tournaments/[id]` 450 kB
- Lightest full routes: `/grounds` 388 kB — i.e. almost every route ships ~390-480 kB on first load.

## Baseline interpretation
- The codebase is green on all automated gates at baseline, yet users report 15 bugs.
  => The existing 91 test files do NOT reproduce the reported user-visible bugs
  (or reproduce them only at engine level, not at UI/state-integration level).
  Phase 3 must therefore trace real code paths instead of trusting test coverage.
- No PRE-EXISTING test failures to carry forward (with Chrome present).
