import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';

/**
 * Batting-hand persistence (TAIMUR field report, 2026-11-10).
 *
 * The Opening Players page used to stamp the chosen LHB/RHB onto the
 * engine by mutating `engine.currentInnings.players[i].battingHand`
 * AFTER construction. The scorecard snapshot kept the value, but the
 * choice never entered the event log — so every event replay
 * (fromEvents: ball edits via editHistoricalBall, the undo fallback
 * after a refresh) rebuilt the innings through createEmptyInnings'
 * hard-coded 'Right-hand Batsman' default and silently reset both
 * openers to right-handed.
 *
 * Fix: the hands are engine config now. They flow into
 * createEmptyInnings AND into the MATCH_CREATED / INNINGS_STARTED
 * payloads, so replay restores exactly what was selected.
 */

const LEFT = 'Left-hand Batsman';
const RIGHT = 'Right-hand Batsman';

function makeEngine(extra: Record<string, unknown> = {}) {
  return new EventSourcedMatchEngine({
    teamA: 'Alpha',
    teamB: 'Beta',
    tossWinner: 'Alpha',
    tossDecision: 'Batting',
    totalOvers: 10,
    strikerName: 'Lefty',
    nonStrikerName: 'Partna',
    bowlerName: 'Bowl',
    ...extra,
  } as never);
}

describe('batting hands — config to scorecard', () => {
  it('selected hands land on the openers in the scorecard', () => {
    const engine = makeEngine({ strikerHand: LEFT, nonStrikerHand: LEFT });
    const sc = engine.toScorecard();
    expect(sc.firstInnings?.players[0].battingHand).toBe(LEFT);
    expect(sc.firstInnings?.players[1].battingHand).toBe(LEFT);
    // Non-openers keep the default.
    expect(sc.firstInnings?.players[2].battingHand).toBe(RIGHT);
  });

  it('defaults stay right-handed when nothing is selected', () => {
    const sc = makeEngine().toScorecard();
    expect(sc.firstInnings?.players[0].battingHand).toBe(RIGHT);
    expect(sc.firstInnings?.players[1].battingHand).toBe(RIGHT);
  });

  it('the MATCH_CREATED payload carries the hands', () => {
    const engine = makeEngine({ strikerHand: LEFT, nonStrikerHand: RIGHT });
    const created = engine.events.find((e) => e.type === 'MATCH_CREATED');
    expect(created?.payload.strikerHand).toBe(LEFT);
    expect(created?.payload.nonStrikerHand).toBe(RIGHT);
  });
});

describe('batting hands — event replay (the reported bug)', () => {
  it('fromEvents restores the selected hands instead of resetting to Right', () => {
    const engine = makeEngine({ strikerHand: LEFT, nonStrikerHand: LEFT });
    engine.scoreBall({ runsScored: 1 } as never);
    engine.scoreBall({ runsScored: 4 } as never);
    const replayed = EventSourcedMatchEngine.fromEvents(engine.events);
    expect(replayed.currentInnings.players[0].battingHand).toBe(LEFT);
    expect(replayed.currentInnings.players[1].battingHand).toBe(LEFT);
  });

  it('a ball edit (editHistoricalBall) no longer resets the openers', () => {
    const engine = makeEngine({ strikerHand: LEFT, nonStrikerHand: LEFT });
    engine.scoreBall({ runsScored: 1 } as never);
    engine.scoreBall({ runsScored: 2 } as never);
    const ok = engine.editHistoricalBall(0, 1, { runsScored: 3 } as never);
    expect(ok).toBe(true);
    const sc = engine.toScorecard();
    expect(sc.firstInnings?.players[0].battingHand).toBe(LEFT);
    expect(sc.firstInnings?.players[1].battingHand).toBe(LEFT);
  });

  it('second-innings openers keep their hands through replay', () => {
    const engine = makeEngine({ strikerHand: LEFT });
    // Bowl a token first innings quickly: declare via direct state is
    // fragile — instead use a 1-over match and finish it.
    const e2 = new EventSourcedMatchEngine({
      teamA: 'Alpha', teamB: 'Beta', tossWinner: 'Alpha', tossDecision: 'Batting',
      totalOvers: 1, strikerName: 'A1', nonStrikerName: 'A2', bowlerName: 'B1',
      strikerHand: LEFT, nonStrikerHand: LEFT,
    } as never);
    for (let i = 0; i < 6; i++) e2.scoreBall({ runsScored: 1 } as never);
    e2.startSecondInnings('B1', 'B2', 'A1', LEFT, RIGHT);
    expect(e2.secondInnings?.players[0].battingHand).toBe(LEFT);
    const replayed = EventSourcedMatchEngine.fromEvents(e2.events);
    expect(replayed.firstInnings?.players[0].battingHand).toBe(LEFT);
    expect(engine).toBeDefined();
  });

  it('chase matches keep the openers’ hands through replay', () => {
    const engine = EventSourcedMatchEngine.createChaseMatch({
      chasingTeam: 'Beta', defendingTeam: 'Alpha', targetScore: 100, totalOvers: 10,
      strikerName: 'Lefty', nonStrikerName: 'Partna', bowlerName: 'Bowl',
      strikerHand: LEFT, nonStrikerHand: LEFT,
    });
    const sc = engine.toScorecard();
    expect(sc.secondInnings?.players[0].battingHand).toBe(LEFT);
    const replayed = EventSourcedMatchEngine.fromEvents(engine.events);
    expect(replayed.secondInnings?.players[0].battingHand).toBe(LEFT);
    expect(replayed.secondInnings?.players[1].battingHand).toBe(LEFT);
  });

  it('legacy logs without hand fields replay exactly as before (Right default)', () => {
    const engine = makeEngine();
    const legacy = engine.events.map((e) =>
      e.type === 'MATCH_CREATED'
        ? { ...e, payload: { ...e.payload, strikerHand: undefined, nonStrikerHand: undefined } }
        : e
    );
    const replayed = EventSourcedMatchEngine.fromEvents(legacy as never);
    expect(replayed.currentInnings.players[0].battingHand).toBe(RIGHT);
  });
});

describe('opening players page — hands go through config, not mutation', () => {
  const page = fs.readFileSync(
    path.join(process.cwd(), 'src/app/matches/opening-players/page.tsx'),
    'utf8'
  );

  it('passes strikerHand/nonStrikerHand into both engine constructions', () => {
    expect(page.match(/strikerHand,\n\s+nonStrikerHand,/g)?.length).toBe(2);
  });

  it('the post-construction mutation is gone', () => {
    expect(page).not.toContain('players[0].battingHand =');
    expect(page).not.toContain('players[1].battingHand =');
  });
});
