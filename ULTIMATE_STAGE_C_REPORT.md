# Ultimate Master Prompt — Stage C Report (Decisions Implemented)

Date: 2026-11-09 · Local commit: c938c39 · Base: 7cb635e (Stage B)
Decisions approved by TAIMUR 2026-11-09: **F4-A, F8-A, E1-A** (all
recommended options from `Cricket-StageC-Decisions.md`).

## F8-A — Penalty entries no longer corrupt ball editing (LIVE BUG fixed)

Root cause (verified in code): `awardPenaltyRuns()` pushes `+{runs}P` /
`-{runs}P` into `innings.thisOverLog` — the only non-delivery entry in
that log. The score page's `handleOpenEditBall` mapped a clicked log
position to a `BALL_SCORED` event index using the RAW log length
(`events − log.length + idx`). After a penalty, every ball bowled
BEFORE the penalty in that over mapped one event too early (the
previous over's last ball), and the penalty chip itself opened a real
ball in the edit modal. The engine-side `editHistoricalBall` was always
correct; the corruption entered through this UI mapping.

Fix:

- New pure helper `src/lib/overLogEdit.ts` — `isPenaltyLogEntry`,
  `countOverLogBalls`, `resolveEditTargetIndex(log, logIdx,
  totalBallEvents)` (ball-only ordinal mapping; penalty positions and
  out-of-range resolve to `null`).
- Score page `handleOpenEditBall` now resolves through the helper;
  penalty chips open nothing.
- `OverBallButton` renders penalty markers as a non-interactive dashed
  amber chip (no long-press, no button semantics), labelled as penalty
  runs.
- No log-format change → existing saved matches unaffected, no
  migration.

Tests: `src/__tests__/over-log-edit.test.ts` (7) — including the exact
pre-fix failure (ball before a mid-over penalty) pinned numerically.

## F4-A — Private matches: the documented privacy half now exists

Public-by-default is the README-documented Public Match Center design;
the missing half was any way to make a match private (`isPublic` was
never set anywhere). Implementation threads the flag through the
engine, because the score page persists `engine.toScorecard()`
wholesale — a scorecard-only flag would have been silently reverted
to public on the first ball.

- Engine: `isPublic` field + constructor config (`?? true`),
  `createChaseMatch` config passthrough, `toScorecard()` emits it,
  `fromScorecard()` restores it (legacy scorecards without the flag
  restore as public). `clone()` carries it (Object.assign). Undo
  snapshots intentionally do not include it (not scoring state — same
  treatment as venue), so undoing a ball never flips visibility.
- Creation: `/matches/new` gains a **Private Match** toggle (default
  off = public) → `setupData.isPublic` → opening-players passes it
  into both engine constructors (standard + chase).
- Settings: score page **Match Info** modal gains a Match Visibility
  row with Make Private / Make Public, applied via the normal
  clone → setEngine → persistState path, so it reaches Dexie and the
  existing SyncEngine write (`isPublic: scorecard.isPublic ?? true`)
  unchanged. Firestore/Supabase rules already enforce both modes.

Tests: `src/__tests__/match-visibility.test.ts` (5) — default public,
private round-trip through scorecard/restore, legacy default, clone
toggle path, chase factory.

## E1-A — Divider contrast exception accepted (documentation only)

TAIMUR accepted the Phase 17 E1 exception (decorative `--border`
dividers at 1.87:1 light / 2.34:1 dark, redundantly carried by fill +
shadow) as a documented design decision. Recorded in
`PHASE17_COLOR_REPORT.md`. No code or token change.

## Not in Stage C (unchanged, needs TAIMUR/external input)

- **F9** — player-ID migration: plan approved as a future separate
  phase (not started).
- **F10** — Firestore composite indexes: needs production query
  inventory / console suggestions.
- **F11** — `npm audit`: blocked in this environment (registry
  policy); run on a normal network / CI.
- **F12** — multi-device sync verification: needs a
  Firebase-configured build + signed-in user.
- **F2-strong** — optional auto-recovery for cross-tab conflicts
  (warn-only guard shipped in Stage B).

## Gates

- Unit: **1254/1254 PASS** (111 files; +12 new: 7 over-log-edit,
  5 match-visibility)
- Typecheck: PASS · Lint: PASS · Build: PASS
- Visual: **38/38 unchanged** (the new-match toggle sits below the
  baselined fold; no baseline regeneration needed)
- Offline: **10/10** · Overlay: **4/4** · Stage B suite: **4/4**
