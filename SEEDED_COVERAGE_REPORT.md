# Dexie-Seeded Score-Page Coverage — Report

Date: 2026-11-08 · Branch: `audit/fix-phase2-10` · Status: COMPLETE (local commit, not pushed/deployed)

## What was missing

The Playwright visual suite covered only empty-state shell routes. The
three pages users actually live in — live score, match center, match
summary — need a match in IndexedDB and were deliberately left out.

## Key finding that made it simple

The score page rebuilds its engine from the stored `MatchScorecard`
snapshot and only attaches the event log for history
(`loadMatch` in `src/app/matches/score/[matchId]/page.tsx`); center and
summary read the same record. Seeding the `matches` store alone is
therefore sufficient — no fabricated event log needed.

## What was built

- `e2e/fixtures/generate-seed.mjs` + `seeded-matches.json` — two fixed
  records derived from the proven unit-test fixture
  (`dynamic-pdf-match-report.test.ts`, Thunder Storm vs Hungry Eleven):
  - `e2e-seed-completed` — COMPLETED, 149/3 vs 120/9, "Hungry Eleven won
    by 29 runs", MoM Taimur, full 11-name squads, fixed timestamps.
  - `e2e-seed-live` — ONGOING chase: 64/1 after 4.3 overs, target 150.
- `e2e/seed.ts` — raw-IndexedDB seeding helper (fresh context per test).
- `e2e/seeded-pages.visual.ts` — 12 baselines: score / center / summary
  × light / dark × mobile / desktop. Content-gated before capture
  (`main-score-runs` == 64, result string visible).
- `e2e/seeded-offline.validation.ts` — offline scoring journey: seed →
  open score page → offline → reload renders 64/1 → keyboard '1' scores
  → 65 persisted in Dexie → offline reload still 65.
- `package.json` — `test:visual` / `test:visual:update` / `test:offline`
  now include the seeded specs.
- `VISUAL_REGRESSION.md` — coverage section updated.

## Seed corrections vs the source fixture (with reasons)

- Striker indices pointed at listed, not-out rows (fixture carried
  full-XI indices 9/10 over a 3-row player list — out-of-bounds risk).
- Live innings bowlers rebuilt (9 + 12 + 6 = 27 balls, each within the
  2-over quota of a 10-over match). The fixture's current bowler had 18
  balls ("QUOTA REACHED") and the engine correctly refused to score off
  him — the journey's first run exposed exactly this.

## Validation (all against the production build)

- Seeded visual: generation 12/12, verification rerun 12/12.
- Seeded offline journey: 2/2 (mobile + desktop).
- Pre-existing suites unchanged: visual 26/26, offline 8/8.
- Unit 1155/1155 · typecheck PASS · lint PASS · build PASS.

## Known limits

- Seed timestamps are fixed (2025-06-15/16); if a page ever renders
  relative dates from them, baselines may need regeneration as wall
  clock moves. Current pages render them stably (verified across runs).
- Baselines carry the `-linux` suffix like the existing suite.
- Modals/interaction states on the seeded pages are the natural next
  layer; cloud sync drain remains unverifiable without a configured
  Firebase backend (unchanged from Phase 15).
