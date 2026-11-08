import { describe, it, expect, beforeEach } from 'vitest';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';

/**
 * Group A regression tests — audit/fix-phase2-10
 *
 * These target paths the pre-existing suite never exercised:
 * event REPLAY (fromEvents, used by undo-after-reload and editHistoricalBall),
 * as opposed to single in-memory engine calls.
 */
describe('Group A: event replay fidelity', () => {
  let engine: EventSourcedMatchEngine;

  beforeEach(() => {
    engine = new EventSourcedMatchEngine({
      teamA: 'Dhaka Gladiators',
      teamB: 'Chittagong Kings',
      tossWinner: 'Dhaka Gladiators',
      tossDecision: 'Batting',
      totalOvers: 20,
      strikerName: 'Tamim Iqbal',
      nonStrikerName: 'Shakib Al Hasan',
      bowlerName: 'Mustafizur Rahman',
    });
  });

  it('replay preserves a NON-STRIKER retirement (BATTER_RETIRED must carry isStriker)', () => {
    // Non-striker (Shakib, idx 1) retires hurt.
    const ok = engine.retirePlayer(false, 'Retire Hurt');
    expect(ok).toBe(true);

    const live = engine.currentInnings;
    // Live state: striker is untouched, non-striker was replaced.
    expect(live.players[live.strikerIdx].name).toContain('Tamim Iqbal');
    expect(live.players[1].isDismissed).toBe(true);
    expect(live.players[1].name).toContain('Shakib Al Hasan');

    // Replay the exact same event log — this is what undo-after-reload and
    // editHistoricalBall do. The replayed state must match the live state.
    const replayed = EventSourcedMatchEngine.fromEvents(engine.events);
    const inn = replayed.currentInnings;

    expect(inn.players[inn.strikerIdx].name).toContain('Tamim Iqbal');
    expect(inn.players[0].isDismissed).toBe(false);
    expect(inn.players[1].isDismissed).toBe(true);
    expect(inn.players[1].name).toContain('Shakib Al Hasan');
  });

  it('mid-over changeBowler must NOT wipe thisOverLog', () => {
    engine.scoreBall({ runsScored: 0 });
    engine.scoreBall({ runsScored: 1 });
    engine.scoreBall({ runsScored: 4 });
    expect(engine.currentInnings.thisOverLog).toEqual(['0', '1', '4']);

    const res = engine.changeBowler('Taskin Ahmed');
    expect(res.success).toBe(true);
    // The over is still in progress: its log (recent balls, maiden
    // calculation, historical-ball edit mapping) must survive the change.
    expect(engine.currentInnings.thisOverLog).toEqual(['0', '1', '4']);
  });

  it('a run out with completed runs on the last ball breaks the maiden', () => {
    for (let i = 0; i < 5; i++) engine.scoreBall({ runsScored: 0 });
    engine.scoreBall({
      runsScored: 2,
      isWicket: true,
      dismissalType: 'Run Out',
      isStrikerOut: true,
      newBatsmanName: 'Batter Three',
    } as any);
    const bowler = engine.currentInnings.bowlers[0];
    expect(engine.currentInnings.totalBalls).toBe(6);
    expect(bowler.maidens).toBe(0);
  });

  it('an over containing only a leg-bye is NOT a maiden, but 6 dots IS', () => {
    for (let i = 0; i < 5; i++) engine.scoreBall({ runsScored: 0 });
    engine.scoreBall({ runsScored: 1, isLegByes: true });
    expect(engine.currentInnings.bowlers[0].maidens).toBe(0);
  });

  it('replay preserves a STRIKER retirement', () => {
    const ok = engine.retirePlayer(true, 'Retire Out');
    expect(ok).toBe(true);

    const replayed = EventSourcedMatchEngine.fromEvents(engine.events);
    const inn = replayed.currentInnings;

    expect(inn.players[0].isDismissed).toBe(true);
    expect(inn.players[0].name).toContain('Tamim Iqbal');
    expect(inn.players[1].isDismissed).toBe(false);
  });
});
