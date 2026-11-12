import { describe, it, expect } from 'vitest';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { BowlingLimiter } from '../domain/cricket/bowling-limiter/BowlingLimiter';
import { NetRunRateEngine } from '../domain/tournament/NetRunRateEngine';

/**
 * Bug hunt 2026-11-12, Batch A (engine & score page):
 * C-1 resume restarts event versions · C-2 penalty runs against
 * the batting side are a no-op · C-5 scoreBall silently swallows
 * balls at bowler quota · C-6 MATCH_COMPLETED duplicated and
 * unsnapshotted on the DLS conclude path · C-7 leaderboards key
 * by name only · C-8 under-10 bowler limit unclamped · C-9
 * tossWinner not normalised.
 */

function makeEngine(): EventSourcedMatchEngine {
  return new EventSourcedMatchEngine({
    id: 'm-bughunt-a',
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

/** Bowl a full over of singles with the given bowler. */
function bowlOver(e: EventSourcedMatchEngine, bowler: string) {
  e.changeBowler(bowler);
  for (let b = 0; b < 6; b++) e.scoreBall({ runsScored: 1 });
}

// ═══════════════════════════════════════════════════════════════
// C-1 — resume via fromScorecard seeds the event version counter
// ═══════════════════════════════════════════════════════════════

describe('C-1: resuming a match never reuses restored event versions', () => {
  it('the next event after a fromScorecard resume exceeds every restored version', () => {
    const source = makeEngine();
    for (let b = 0; b < 6; b++) source.scoreBall({ runsScored: 1 });
    source.changeBowler('BW2');
    // Stop mid-over so the resumed engine can score immediately.
    for (let b = 0; b < 3; b++) source.scoreBall({ runsScored: 2 });

    const maxVersion = Math.max(...source.events.map((ev) => ev.version));
    expect(maxVersion).toBeGreaterThan(2); // the old bug restarted at 2

    // The score page's resume path (post-fix).
    const restored = EventSourcedMatchEngine.fromScorecard(
      source.toScorecard(),
      source.events
    );
    restored.scoreBall({ runsScored: 1 });

    const versions = restored.events.map((ev) => ev.version);
    expect(new Set(versions).size).toBe(versions.length);
    for (let i = 1; i < versions.length; i++) {
      expect(versions[i]).toBeGreaterThan(versions[i - 1]);
    }
    expect(versions[versions.length - 1]).toBeGreaterThan(maxVersion);
  });

  it('fromScorecard deep-copies the innings instead of aliasing the scorecard', () => {
    const source = makeEngine();
    source.scoreBall({ runsScored: 4 });
    const scorecard = source.toScorecard();

    const restored = EventSourcedMatchEngine.fromScorecard(scorecard, source.events);
    expect(restored.firstInnings).not.toBe(scorecard.firstInnings);
    restored.firstInnings.totalRuns = 999;
    expect(scorecard.firstInnings!.totalRuns).toBe(4);
  });

  it('fromScorecard preserves innings state, current innings, target and status', () => {
    const source = makeEngine();
    source.firstInnings.totalRuns = 120;
    source.startSecondInnings('C1', 'C2', 'BW1');
    source.scoreBall({ runsScored: 4 });
    source.scoreBall({ runsScored: 1 });

    const restored = EventSourcedMatchEngine.fromScorecard(
      source.toScorecard(),
      source.events
    );
    expect(restored.currentInningsNumber).toBe(2);
    expect(restored.targetScore).toBe(121);
    expect(restored.status).toBe(source.status);
    expect(restored.secondInnings!.totalRuns).toBe(5);
    expect(restored.secondInnings!.totalBalls).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// C-2 — penalty runs against the batting side credit the other team
// ═══════════════════════════════════════════════════════════════

describe('C-2: penalty runs against the batting side reach a total', () => {
  it('innings 1: the credit lands on the second innings when it is created', () => {
    const e = makeEngine();
    e.scoreBall({ runsScored: 4 });
    e.awardPenaltyRuns(5, false, 'Penalty');

    // Audit field records it; the batting side's own total is untouched.
    expect(e.firstInnings.penaltyRunsAgainst).toBe(5);
    expect(e.firstInnings.totalRuns).toBe(4);

    e.startSecondInnings('C1', 'C2', 'BW1');
    expect(e.secondInnings!.penaltyRuns).toBe(5);
    expect(e.secondInnings!.totalRuns).toBe(5);
    // The target still derives from the first innings alone.
    expect(e.targetScore).toBe(5); // 4 + 1
  });

  it('the deferred credit survives a save/resume before the innings break', () => {
    const e = makeEngine();
    e.awardPenaltyRuns(5, false, 'Penalty');

    const restored = EventSourcedMatchEngine.fromScorecard(e.toScorecard(), e.events);
    expect(restored.firstInnings.penaltyRunsAgainst).toBe(5);
    restored.startSecondInnings('C1', 'C2', 'BW1');
    expect(restored.secondInnings!.totalRuns).toBe(5);
    expect(restored.secondInnings!.penaltyRuns).toBe(5);
  });

  it('event replay reproduces the credited second-innings total', () => {
    const e = makeEngine();
    e.awardPenaltyRuns(5, false, 'Penalty');
    e.startSecondInnings('C1', 'C2', 'BW1');
    e.scoreBall({ runsScored: 1 });

    const replayed = EventSourcedMatchEngine.fromEvents(e.events);
    expect(replayed.secondInnings!.penaltyRuns).toBe(5);
    expect(replayed.secondInnings!.totalRuns).toBe(e.secondInnings!.totalRuns);
  });

  it('innings 2: the credit lands on the first innings and lifts the target', () => {
    const e = makeEngine();
    e.firstInnings.totalRuns = 100;
    e.startSecondInnings('C1', 'C2', 'BW1');
    expect(e.targetScore).toBe(101);

    e.scoreBall({ runsScored: 1 });
    e.awardPenaltyRuns(5, false, 'Penalty');

    expect(e.secondInnings!.penaltyRunsAgainst).toBe(5);
    expect(e.firstInnings.totalRuns).toBe(105);
    expect(e.firstInnings.penaltyRuns).toBe(5);
    expect(e.targetScore).toBe(106);
  });

  it('innings 2: the credit changes the final result margin', () => {
    const e = makeEngine();
    e.firstInnings.totalRuns = 100;
    e.startSecondInnings('C1', 'C2', 'BW1');
    e.secondInnings!.totalRuns = 96;
    e.secondInnings!.totalBalls = 119; // one ball left — award lands first

    e.awardPenaltyRuns(5, false, 'Penalty');
    e.secondInnings!.totalBalls = 120; // innings now complete

    const result = e.calculateResult();
    expect(result.isCompleted).toBe(true);
    expect(result.winner).toBe('Alpha');
    // Par is now 105, not 100: margin 9, not 4.
    expect(result.margin).toBe(9);
    expect(result.resultText).toContain('won by 9 runs');
  });

  it('penalty runs awarded TO the batting team still count as before', () => {
    const e = makeEngine();
    e.awardPenaltyRuns(5, true, 'Penalty');
    expect(e.firstInnings.totalRuns).toBe(5);
    expect(e.firstInnings.penaltyRuns).toBe(5);
    expect(e.firstInnings.penaltyRunsAgainst).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// C-5 — scoreBall signals a bowler-limit refusal instead of silence
// ═══════════════════════════════════════════════════════════════

describe('C-5: scoreBall returns bowler-limit when the quota blocks the ball', () => {
  it('a mid-innings DLS reduction onto the current bowler is signalled, not swallowed', () => {
    const e = makeEngine(); // 20 overs, international rule → limit 4
    e.firstInnings.totalRuns = 150;
    e.startSecondInnings('C1', 'C2', 'BW1');

    // BW1 bowls overs 1 and 3, BW2 overs 2 and 4; BW1 starts over 5.
    for (let b = 0; b < 6; b++) e.scoreBall({ runsScored: 1 }); // over 1 (BW1)
    bowlOver(e, 'BW2');
    bowlOver(e, 'BW1'); // BW1: 12 balls = 2 completed overs
    bowlOver(e, 'BW2');
    e.changeBowler('BW1');
    e.scoreBall({ runsScored: 1 }); // BW1 mid-over: 13 balls

    const ballsBefore = e.secondInnings!.totalBalls;
    const runsBefore = e.secondInnings!.totalRuns;

    // Rain: match cut to 10 overs → per-bowler limit drops to 2,
    // exactly the overs BW1 has already completed.
    e.applyDlsTarget(140, 10);
    expect(e.getMaxBowlerLimit()).toBe(2);

    const refused = e.scoreBall({ runsScored: 1 });
    expect(refused).toBe('bowler-limit');
    // Nothing was scored by the refused tap.
    expect(e.secondInnings!.totalBalls).toBe(ballsBefore);
    expect(e.secondInnings!.totalRuns).toBe(runsBefore);

    // A fresh bowler can continue the over.
    expect(e.changeBowler('BW3').success).toBe(true);
    expect(e.scoreBall({ runsScored: 1 })).toBeUndefined();
    expect(e.secondInnings!.totalBalls).toBe(ballsBefore + 1);
  });

  it('ordinary balls still return undefined', () => {
    const e = makeEngine();
    expect(e.scoreBall({ runsScored: 1 })).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// C-6 — exactly one MATCH_COMPLETED; DLS conclude snapshots
// ═══════════════════════════════════════════════════════════════

describe('C-6: MATCH_COMPLETED is unique and the DLS conclude path snapshots', () => {
  it('conclude via DLS then completeMatch() emits exactly one MATCH_COMPLETED', () => {
    const e = makeEngine();
    e.firstInnings.totalRuns = 140;
    e.startSecondInnings('C1', 'C2', 'BW1');

    // 8 overs: 95/1 — ahead of the DLS par score for 140.
    for (let over = 0; over < 8; over++) {
      if (over > 0) e.changeBowler(over % 2 === 0 ? 'BW1' : 'BW2');
      for (let b = 0; b < 6; b++) {
        const ballIdx = over * 6 + b;
        e.scoreBall({
          runsScored: ballIdx === 10 ? 0 : 2,
          isWicket: ballIdx === 10,
          dismissalType: ballIdx === 10 ? 'Caught' : undefined,
        });
      }
    }

    const snapshotsBefore = e.snapshots.length;
    const outcome = e.concludeMatchWithDls();
    expect(outcome.isCompleted).toBe(true);
    expect(e.status).toBe('COMPLETED');
    // The success path now snapshots like the abandon path.
    expect(e.snapshots.length).toBe(snapshotsBefore + 1);
    expect(e.events.filter((ev) => ev.type === 'MATCH_COMPLETED')).toHaveLength(1);

    // The score page's completion check calls completeMatch() next.
    e.completeMatch();
    expect(e.events.filter((ev) => ev.type === 'MATCH_COMPLETED')).toHaveLength(1);

    // A second conclude call is likewise emission-free.
    e.concludeMatchWithDls();
    expect(e.events.filter((ev) => ev.type === 'MATCH_COMPLETED')).toHaveLength(1);

    // Replay of the log still yields one terminal event and the result.
    const replayed = EventSourcedMatchEngine.fromEvents(e.events);
    expect(replayed.status).toBe('COMPLETED');
    expect(replayed.events.filter((ev) => ev.type === 'MATCH_COMPLETED')).toHaveLength(1);
    expect(replayed.calculateResult().resultText).toContain('(DLS Method)');
  });

  it('completeMatch() called twice emits exactly one MATCH_COMPLETED', () => {
    const e = makeEngine();
    e.completeMatch();
    e.completeMatch();
    expect(e.events.filter((ev) => ev.type === 'MATCH_COMPLETED')).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// C-7 — leaderboards key by playerId, falling back to name
// ═══════════════════════════════════════════════════════════════

describe('C-7: tournament leaderboards separate same-named players', () => {
  const batter = (name: string, playerId: string | undefined, runs: number, balls: number) => ({
    name,
    playerId,
    runs,
    balls,
    fours: 2,
    sixes: 0,
    dotBalls: 3,
    ballLog: [],
    bowlersFaced: {},
    runsVsBowler: {},
    isDismissed: false,
  });
  const bowler = (name: string, playerId: string | undefined, wickets: number) => ({
    name,
    playerId,
    ballsBowled: 24,
    maidens: 0,
    runs: 20,
    wickets,
    overHistory: [],
  });
  const match = (id: string, inn: unknown) => ({
    id,
    status: 'COMPLETED',
    advancedSettings: { tournamentId: 'T-A' },
    firstInnings: inn,
    secondInnings: null,
  });
  const innings = (
    team: string,
    bowlingTeam: string,
    players: unknown[],
    bowlers: unknown[]
  ) => ({
    team,
    bowlingTeam,
    players,
    bowlers,
    fallOfWickets: [],
    thisOverLog: [],
    currentBowlerIdx: 0,
  });

  it('two same-named players on different teams produce two rows (batting and bowling)', () => {
    const m1 = match(
      'm1',
      innings('Team A', 'Team B', [batter('Rahim', 'pl_aaa', 50, 30)], [bowler('Karim', 'pl_bbb', 2)])
    );
    const m2 = match(
      'm2',
      innings('Team C', 'Team D', [batter('Rahim', 'pl_ccc', 30, 20)], [bowler('Karim', 'pl_ddd', 3)])
    );

    const { battingLeaders, bowlingLeaders } = NetRunRateEngine.generateLeaderboard('T-A', [
      m1 as never,
      m2 as never,
    ]);

    const rahims = battingLeaders.filter((b) => b.name === 'Rahim');
    expect(rahims).toHaveLength(2);
    expect(rahims.map((r) => r.team).sort()).toEqual(['Team A', 'Team C']);
    expect(rahims.map((r) => r.runs).sort((x, y) => x - y)).toEqual([30, 50]);

    const karims = bowlingLeaders.filter((b) => b.name === 'Karim');
    expect(karims).toHaveLength(2);
    expect(karims.map((k) => k.wickets).sort((x, y) => x - y)).toEqual([2, 3]);
  });

  it('the same playerId across matches still merges into one row', () => {
    const m1 = match(
      'm1',
      innings('Team A', 'Team B', [batter('Rahim', 'pl_aaa', 50, 30)], [])
    );
    const m2 = match(
      'm2',
      innings('Team A', 'Team C', [batter('Rahim', 'pl_aaa', 20, 10)], [])
    );

    const { battingLeaders } = NetRunRateEngine.generateLeaderboard('T-A', [
      m1 as never,
      m2 as never,
    ]);
    const rahims = battingLeaders.filter((b) => b.name === 'Rahim');
    expect(rahims).toHaveLength(1);
    expect(rahims[0].runs).toBe(70);
    expect(rahims[0].innings).toBe(2);
  });

  it('records without a playerId keep the historical name keying', () => {
    const m1 = match(
      'm1',
      innings('Team A', 'Team B', [batter('Guest Guy', undefined, 40, 25)], [])
    );
    const m2 = match(
      'm2',
      innings('Team A', 'Team C', [batter('Guest Guy', undefined, 10, 5)], [])
    );

    const { battingLeaders } = NetRunRateEngine.generateLeaderboard('T-A', [
      m1 as never,
      m2 as never,
    ]);
    const guests = battingLeaders.filter((b) => b.name === 'Guest Guy');
    expect(guests).toHaveLength(1);
    expect(guests[0].runs).toBe(50);
  });
});

// ═══════════════════════════════════════════════════════════════
// C-8 — under-10 bowler limit is clamped to the match length
// ═══════════════════════════════════════════════════════════════

describe('C-8: BowlingLimiter under-10 clamp', () => {
  it('a short match cannot report a bowler limit longer than itself', () => {
    expect(BowlingLimiter.calculateMaxOvers(2)).toBe(2);
    expect(BowlingLimiter.calculateMaxOvers(3)).toBe(3);
    expect(BowlingLimiter.calculateMaxOvers(4)).toBe(4);
    // The intended default still applies once the match is long enough.
    expect(BowlingLimiter.calculateMaxOvers(5)).toBe(4);
    expect(BowlingLimiter.calculateMaxOvers(9)).toBe(4);
  });

  it('the engine surface agrees for a 2-over match', () => {
    const e = new EventSourcedMatchEngine({
      teamA: 'Alpha',
      teamB: 'Beta',
      tossWinner: 'Alpha',
      tossDecision: 'Batting',
      totalOvers: 2,
    });
    expect(e.getMaxBowlerLimit()).toBe(2);
    expect(e.maxOversPerBowler).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// C-9 — constructor normalises tossWinner against the team names
// ═══════════════════════════════════════════════════════════════

describe('C-9: tossWinner normalisation', () => {
  it('snaps a padded, lower-case toss winner to the canonical team name', () => {
    const e = new EventSourcedMatchEngine({
      teamA: 'Team A',
      teamB: 'Team B',
      tossWinner: ' team a ',
      tossDecision: 'Batting',
      totalOvers: 10,
    });
    expect(e.tossWinner).toBe('Team A');
    // …and the toss winner actually bats first.
    expect(e.firstInnings.team).toBe('Team A');
  });

  it('a case-mismatched winner choosing to bowl still fields first', () => {
    const e = new EventSourcedMatchEngine({
      teamA: 'Team A',
      teamB: 'Team B',
      tossWinner: 'TEAM B',
      tossDecision: 'Bowling',
      totalOvers: 10,
    });
    expect(e.tossWinner).toBe('Team B');
    expect(e.firstInnings.team).toBe('Team A');
    expect(e.firstInnings.bowlingTeam).toBe('Team B');
  });

  it('an exact toss winner is stored unchanged', () => {
    const e = makeEngine();
    expect(e.tossWinner).toBe('Alpha');
    expect(e.firstInnings.team).toBe('Alpha');
  });
});
