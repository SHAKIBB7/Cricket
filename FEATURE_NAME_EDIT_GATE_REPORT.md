# Feature — Name-Edit Gate (crease-only renaming) — Report

Date: 2026-11-10 · Instruction: TAIMUR proposed the rule and asked JINI's
opinion; JINI agreed (scorecard integrity — the genuine need is fixing
the current pair's names while scoring); TAIMUR then directed both
modals be done together ("দুইটা একসাথে ইমপ্লিমেন্ট করো").

## The rule

- **BatsmanProfileModal**: the click-to-edit name + pencil render only
  when the player is at the crease (`isStriker || isNonStriker`). For
  dismissed or yet-to-bat players the name renders read-only.
- **BowlerProfileModal**: the same gate on `isCurrentlyBowling` — only
  the bowler bowling right now can be renamed.
- Because the gate lives in the modals, it applies on every surface at
  once: live score page, full scoreboard, match centre and summary.
  The summary page passes no crease flags at all, so completed-match
  profiles are fully read-only (as they should be).
- An effect cancels an in-progress edit if the gate closes while the
  modal is open (e.g. the player changes underneath it).

## Changes

- `src/components/modals/BatsmanProfileModal.tsx` — `canEditName`
  derived from the crease props; read-only `<h2>` fallback.
- `src/components/modals/BowlerProfileModal.tsx` — same, keyed on
  `isCurrentlyBowling`.
- Tests: 4 new gate pins in `player-name-editing.test.ts` (non-striker
  editable; dismissed read-only; yet-to-bat read-only; non-current
  bowler read-only). One superseded pin updated as a documented
  expectation: the DLS suite's bowler-rename render now passes
  `isCurrentlyBowling: true` (the rename flow itself is unchanged and
  still covered).

## Verification

- Real-modal screenshot (seeded live match, 430px): striker Sanaj's
  profile still shows the pencil — crease editing is intact.
- Gates ALL GREEN: unit **1556/1556** (142 files, +4), typecheck 0,
  lint clean, build PASS, visual 38/38, offline 10/10, overlay 4/4,
  stageb 4/4.

## Local commits

`be72054` (feature + tests + this report), on top of `0d904aa`. NOT
pushed — awaiting TAIMUR's push instruction.
