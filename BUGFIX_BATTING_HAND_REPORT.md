# Bugfix Report — Selected Left-Hand Silently Became Right-Hand

**Date:** 2026-11-10 · **Reported by:** TAIMUR (field report: at batting
selection, choosing Left-hand still produced Right-hand output)
**Status:** Fixed locally; gates green (see §5); push pending approval.

## 1. What was reproduced

Engine-level diagnosis (temporary scratch suite, since converted into
the permanent regression suite):

| Path | Result before fix |
| --- | --- |
| Opening page → mutate hands → `toScorecard()` | Left kept ✓ |
| Chase factory → mutate → `toScorecard()` | Left kept ✓ |
| Score page restore from scorecard | Left kept ✓ |
| **`fromEvents` replay** | **RESET to Right-hand ✗** |

## 2. Root cause

The Opening Players page stamped the chosen hands onto the engine by
**mutating state after construction**:

```ts
engine.currentInnings.players[0].battingHand = strikerHand;
engine.currentInnings.players[1].battingHand = nonStrikerHand;
```

The scorecard snapshot therefore carried the choice — but the choice
**never entered the event log**. The `MATCH_CREATED` payload held only
the openers' names. Every reconstruction from events rebuilt the
innings through `createEmptyInnings`, whose player factory hard-codes
`battingHand: 'Right-hand Batsman'`.

Replay is not exotic — it runs in two ordinary scoring actions:

- **Ball edit** (`editHistoricalBall`): replays the whole match and
  wholesale adopts the replayed innings (`this.firstInnings =
  replayed.firstInnings`). One edited ball silently flipped both
  openers back to right-handed, and that state was then saved.
- **Undo after a page refresh**: in-session undo uses state snapshots
  (safe), but with snapshots empty the engine falls back to
  `fromEvents` — same reset.

So a left-hander chosen at selection time became right-handed the
first time any ball was edited (or an undo happened after a reload),
in both innings' opening pairs and in chase matches.

## 3. Fix

The hands are engine **config** now — one source of truth, carried by
the event log:

- `EventSourcedMatchEngine` constructor config and
  `createChaseMatch` config accept `strikerHand` / `nonStrikerHand`;
  `createEmptyInnings` takes them as trailing optional parameters and
  applies them to the two opener slots (all other slots keep the
  Right default, as before).
- The `MATCH_CREATED` payload and the chase `INNINGS_STARTED` payload
  now include both hands; `fromEvents` threads them back into both
  construction branches.
- `startSecondInnings` accepts optional hands and emits them on its
  `INNINGS_STARTED` event, so a second-innings pair set with hands
  also survives replay (the score page's innings-2 form has no hand
  picker today; the mechanism is now in place).
- The Opening Players page passes `strikerHand` / `nonStrikerHand`
  into both engine constructions and the post-construction mutation
  block is deleted.

Legacy event logs (recorded before this fix) carry no hand fields;
replaying them behaves exactly as before (Right default). The stored
scorecard — which always held the true hands — remains authoritative
on the normal load path, so existing matches are unaffected.

## 4. Regression tests

New suite `src/__tests__/batting-hand-persistence.test.ts` (10 tests):
config → scorecard; defaults unchanged; `MATCH_CREATED` carries the
hands; `fromEvents` restores them (the reported bug); **ball edit no
longer resets the openers**; second-innings pair through replay;
chase through replay; legacy-log behaviour pinned; opening-page
source pins (hands via config in both constructions; mutation gone).

## 5. Gates

Unit 1552/1552 (142 files — +10 new) · typecheck 0 · lint clean ·
build PASS · visual 38/38 · offline 10/10 · overlay 4/4 · stageb 4/4.
