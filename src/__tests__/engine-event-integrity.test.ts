import { describe, it, expect } from 'vitest';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';

/**
 * Correctness audit 2026-11-11 — engine findings 4 & 5, plus
 * scoring audit H1 (clone structural sharing).
 *
 * Finding 5: event version/eventId derived from the mutable
 * events.length — reuse after undo, and same-millisecond id
 * collisions overwriting stored events.
 * Finding 4: concludeMatchWithDls below the minimum overs
 * mutated state with no event and no snapshot — replay could
 * not reproduce the abandoned match.
 * H1: clone() deep-copied every player/bowler record after
 * every ball, defeating the score page's React.memo children.
 */

function makeEngine(): EventSourcedMatchEngine {
  return new EventSourcedMatchEngine({
    id: 'm-events',
    teamA: 'Alpha',
    teamB: 'Beta',
    tossWinner: 'Alpha',
    tossDecision: 'Batting',
    totalOvers: 20,
    strikerName: 'S1',
    nonStrikerName: 'S2',
    bowlerName: 'BW1',
  });
}

describe('finding 5: monotonic event versions and unique event ids', () => {
  it('undo then score: the new event version exceeds the removed event version', () => {
    const e = makeEngine();
    e.scoreBall({ runsScored: 1 });
    e.scoreBall({ runsScored: 2 });
    e.scoreBall({ runsScored: 4 });

    const ballEvents = e.events.filter((ev) => ev.type === 'BALL_SCORED');
    const removedVersion = ballEvents[ballEvents.length - 1].version;

    expect(e.undo()).toBe(true);
    e.scoreBall({ runsScored: 6 });

    const versions = e.events.map((ev) => ev.version);
    // No version is ever reused, and the log stays strictly
    // increasing in array order (undo appends, never renumbers).
    expect(new Set(versions).size).toBe(versions.length);
    for (let i = 1; i < versions.length; i++) {
      expect(versions[i]).toBeGreaterThan(versions[i - 1]);
    }
    expect(e.events[e.events.length - 1].version).toBeGreaterThan(removedVersion);
  });

  it('rapid consecutive events never share an eventId', () => {
    const e = makeEngine();
    const bowlers = ['BW1', 'BW2'];
    for (let over = 0; over < 3; over++) {
      if (over > 0) e.changeBowler(bowlers[over % 2]);
      for (let b = 0; b < 6; b++) {
        e.scoreBall({ runsScored: b % 3 });
      }
    }
    const ids = e.events.map((ev) => ev.eventId);
    expect(ids.length).toBeGreaterThan(18);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('an engine restored with existing events never reuses their versions', () => {
    const source = makeEngine();
    source.scoreBall({ runsScored: 3 });
    const maxVersion = Math.max(...source.events.map((ev) => ev.version));

    const restored = new EventSourcedMatchEngine({
      id: 'm-events',
      teamA: 'Alpha',
      teamB: 'Beta',
      tossWinner: 'Alpha',
      tossDecision: 'Batting',
      totalOvers: 20,
      strikerName: 'S1',
      nonStrikerName: 'S2',
      bowlerName: 'BW1',
      events: source.events,
    });
    restored.scoreBall({ runsScored: 1 });
    const last = restored.events[restored.events.length - 1];
    expect(last.version).toBeGreaterThan(maxVersion);
  });
});

describe('finding 4: DLS conclusion below the minimum overs is replayable', () => {
  it('emits a terminal NO_RESULT event and fromEvents reproduces ABANDONED', () => {
    const e = makeEngine();
    e.firstInnings.totalRuns = 150;
    e.startSecondInnings('C1', 'C2', 'BW1');

    // 3 overs of the chase — below the 5-over T20 DLS minimum.
    for (let over = 0; over < 3; over++) {
      if (over > 0) e.changeBowler(over % 2 === 0 ? 'BW1' : 'BW2');
      for (let b = 0; b < 6; b++) {
        e.scoreBall({ runsScored: 1 });
      }
    }

    e.concludeMatchWithDls();
    expect(e.status).toBe('ABANDONED');

    const terminal = e.events.filter((ev) => ev.type === 'MATCH_COMPLETED');
    expect(terminal).toHaveLength(1);
    expect(terminal[0].payload.resultType).toBe('NO_RESULT');
    expect(terminal[0].payload.dlsApplied).toBe(true);

    const replayed = EventSourcedMatchEngine.fromEvents(e.events);
    expect(replayed.status).toBe('ABANDONED');
    expect(replayed.advancedSettings.dlsApplied).toBe(true);
  });
});

describe('H1: clone() structural sharing', () => {
  it('copies the live records and shares the untouched ones', () => {
    const e = makeEngine();
    e.scoreBall({ runsScored: 4 });
    e.scoreBall({
      runsScored: 0,
      isWicket: true,
      dismissalType: 'Bowled',
      newBatsmanName: 'S3',
    });
    e.changeBowler('BW2');

    const inn = e.currentInnings;
    const cloned = e.clone();
    const cinn = cloned.currentInnings;

    // Containers and arrays are always fresh.
    expect(cinn).not.toBe(inn);
    expect(cinn.players).not.toBe(inn.players);
    expect(cinn.bowlers).not.toBe(inn.bowlers);

    // Live records are copies: striker, non-striker, current bowler.
    expect(cinn.players[cinn.strikerIdx]).not.toBe(inn.players[inn.strikerIdx]);
    expect(cinn.players[cinn.nonStrikerIdx]).not.toBe(inn.players[inn.nonStrikerIdx]);
    expect(cinn.bowlers[cinn.currentBowlerIdx]).not.toBe(inn.bowlers[inn.currentBowlerIdx]);

    // Untouched records keep their identity — this is what
    // lets the score page's React.memo tables skip re-renders.
    expect(cinn.players[0]).toBe(inn.players[0]); // dismissed S1
    expect(cinn.players[5]).toBe(inn.players[5]); // yet to bat
    expect(cinn.bowlers[0]).toBe(inn.bowlers[0]); // BW1, no longer bowling

    // Scoring on the clone never writes into the source engine.
    const sourceRuns = inn.totalRuns;
    const sourceStrikerRuns = inn.players[inn.strikerIdx].runs;
    const sourceBowlerRuns = inn.bowlers[inn.currentBowlerIdx].runs;
    cloned.scoreBall({ runsScored: 6 });
    expect(inn.totalRuns).toBe(sourceRuns);
    expect(inn.players[inn.strikerIdx].runs).toBe(sourceStrikerRuns);
    expect(inn.bowlers[inn.currentBowlerIdx].runs).toBe(sourceBowlerRuns);
    expect(cloned.currentInnings.totalRuns).toBe(sourceRuns + 6);
  });
});
