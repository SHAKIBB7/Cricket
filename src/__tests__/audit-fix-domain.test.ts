/**
 * Audit Fix — Domain Partition (Phase 2 findings M1–M5, L1–L9, C1)
 *
 * Each test pins a behaviour the full-codebase audit found broken.
 * Every Medium test fails on the pre-fix code.
 */
import { describe, it, expect } from 'vitest';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { DlsEngine } from '../domain/cricket/dls/DlsEngine';
import { DotBallAnalytics } from '../domain/cricket/analytics/DotBallAnalytics';
import { ManOfTheMatchEngine } from '../domain/cricket/analytics/ManOfTheMatchEngine';
import { NetRunRateEngine } from '../domain/tournament/NetRunRateEngine';
import { TournamentEngine } from '../domain/tournament/TournamentEngine';
import { InningsData, Player, Bowler } from '../domain/cricket/types';

// ── Mock factories (shapes mirror universal-motm-engine.test.ts) ──

function mockPlayer(overrides: Partial<Player>): Player {
  return {
    id: overrides.id || `p_${Math.random().toString(36).substring(2, 6)}`,
    name: overrides.name || 'Player',
    battingHand: 'Right-hand Batsman',
    battingPosition: overrides.battingPosition || '1',
    runs: overrides.runs ?? 0,
    balls: overrides.balls ?? 0,
    fours: overrides.fours ?? 0,
    sixes: overrides.sixes ?? 0,
    dotBalls: overrides.dotBalls ?? 0,
    ballLog: overrides.ballLog || [],
    bowlersFaced: {},
    runsVsBowler: {},
    isDismissed: overrides.isDismissed ?? false,
    dismissalType: overrides.dismissalType,
    fielderName: overrides.fielderName,
  };
}

function mockBowler(overrides: Partial<Bowler>): Bowler {
  return {
    id: overrides.id || `b_${Math.random().toString(36).substring(2, 6)}`,
    name: overrides.name || 'Bowler',
    ballsBowled: overrides.ballsBowled ?? 0,
    maidens: overrides.maidens ?? 0,
    runs: overrides.runs ?? 0,
    wickets: overrides.wickets ?? 0,
    overHistory: overrides.overHistory || [],
  };
}

function mockInnings(overrides: Partial<InningsData>): InningsData {
  return {
    inningsNumber: overrides.inningsNumber || 1,
    team: overrides.team || 'Team Alpha',
    bowlingTeam: overrides.bowlingTeam || 'Team Beta',
    totalRuns: overrides.totalRuns ?? 0,
    totalWickets: overrides.totalWickets ?? 0,
    totalBalls: overrides.totalBalls ?? 0,
    oversString: overrides.oversString || '0.0',
    wideRuns: 0,
    nbRuns: 0,
    byeRuns: 0,
    lbRuns: 0,
    penaltyRuns: 0,
    penaltyRunsAgainst: 0,
    players: overrides.players || [],
    bowlers: overrides.bowlers || [],
    fallOfWickets: overrides.fallOfWickets || [],
    pastPartnerships: [],
    currentPartnership: { batter1: '', batter2: '', runs: 0, balls: 0 },
    thisOverLog: overrides.thisOverLog || [],
    strikerIdx: 0,
    nonStrikerIdx: 1,
    currentBowlerIdx: overrides.currentBowlerIdx ?? 0,
    nextPlayerIdx: 2,
    lastCompletedOverBowlerIdx: -1,
    isOverComplete: false,
    isFreeHit: false,
  };
}

function scoreOver(
  engine: EventSourcedMatchEngine,
  bowlerName: string,
  pattern: number[],
  firstOver = false
): void {
  if (!firstOver) engine.changeBowler(bowlerName);
  for (const runs of pattern) {
    engine.scoreBall({ runsScored: runs });
  }
}

// ═══════════════════════════════════════════════════════════════════
// M1 — DLS overs units: balls must convert to cricket notation
// ═══════════════════════════════════════════════════════════════════

describe('M1: DLS balls→notation conversion', () => {
  it('ballsToOversNotation converts ball counts to cricket notation', () => {
    expect(DlsEngine.ballsToOversNotation(9)).toBe(1.3);
    expect(DlsEngine.ballsToOversNotation(63)).toBe(10.3);
    expect(DlsEngine.ballsToOversNotation(60)).toBe(10);
    expect(DlsEngine.ballsToOversNotation(0)).toBe(0);
  });

  it('parseOversBalls handles the previously untested 3/6 case (9 balls = 1.3)', () => {
    // 1.3 notation is 1 over 3 balls = 1.5 decimal overs
    expect(DlsEngine.parseOversBalls(1.3)).toBe(1.5);
    // Round-trip: notation -> parsed decimal -> exact ball count
    expect(DlsEngine.parseOversBalls(DlsEngine.ballsToOversNotation(63))).toBeCloseTo(63 / 6, 6);
    expect(DlsEngine.parseOversBalls(DlsEngine.ballsToOversNotation(9))).toBe(1.5);
  });

  it('autoCalculateDlsTarget at a balls%6==3 state uses the true overs bowled', () => {
    const engine = new EventSourcedMatchEngine({
      id: 'm1_auto',
      teamA: 'Dhaka Gladiators',
      teamB: 'Chittagong Kings',
      tossWinner: 'Dhaka Gladiators',
      tossDecision: 'Batting',
      totalOvers: 20,
    });
    engine.firstInnings.totalRuns = 150;
    engine.startSecondInnings('Chaser 1', 'Chaser 2', 'Bowler 1');

    // Score exactly 63 balls (10.3 overs) of singles, rotating bowlers
    for (let over = 0; over < 10; over++) {
      if (over > 0) engine.changeBowler(`Bowler ${(over % 3) + 1}`);
      for (let b = 0; b < 6; b++) engine.scoreBall({ runsScored: 1 });
    }
    engine.changeBowler('Bowler 2');
    for (let b = 0; b < 3; b++) engine.scoreBall({ runsScored: 1 });

    expect(engine.secondInnings?.totalBalls).toBe(63);
    expect(engine.secondInnings?.totalRuns).toBe(63);

    const auto = engine.autoCalculateDlsTarget();
    const reference = DlsEngine.calculate({
      originalOvers: 20,
      team1TotalRuns: 150,
      team2OversAvailable: 20,
      team2WicketsLost: 0,
      team2CurrentOversBowled: 10.3, // notation, NOT 63/6 = 10.5
      team2CurrentRuns: 63,
      matchType: 'T20',
    });

    expect(auto.parScore).toBe(reference.parScore);
    expect(auto.team2ResourcePct).toBe(reference.team2ResourcePct);
    // 57 balls remain in a 20-over chase after 63 balls — the buggy
    // decimal path reported 55 (it believed 65 balls were bowled).
    expect(auto.ballsRemaining).toBe(57);
  });
});

// ═══════════════════════════════════════════════════════════════════
// M2 — Retired Hurt is not a dismissal in tournament averages
// ═══════════════════════════════════════════════════════════════════

describe('M2: tournament batting averages exclude Retired Hurt', () => {
  it('does not count retired-hurt FOW entries as dismissals (typed or legacy)', () => {
    const mockMatch: any = {
      id: 'm-rh',
      advancedSettings: { tournamentId: 't-rh' },
      firstInnings: {
        team: 'Team A',
        bowlingTeam: 'Team B',
        totalRuns: 110,
        totalWickets: 2,
        totalBalls: 90,
        players: [
          { name: 'Hurt Hero', runs: 40, balls: 30, fours: 4, sixes: 0, dotBalls: 5, ballLog: [], bowlersFaced: {}, runsVsBowler: {}, isDismissed: false },
          { name: 'Out Ollie', runs: 40, balls: 30, fours: 4, sixes: 0, dotBalls: 5, ballLog: [], bowlersFaced: {}, runsVsBowler: {}, isDismissed: true },
          { name: 'Legacy Larry', runs: 20, balls: 15, fours: 2, sixes: 0, dotBalls: 3, ballLog: [], bowlersFaced: {}, runsVsBowler: {}, isDismissed: false },
          { name: 'Retired Ron', runs: 10, balls: 8, fours: 1, sixes: 0, dotBalls: 2, ballLog: [], bowlersFaced: {}, runsVsBowler: {}, isDismissed: true },
        ],
        bowlers: [],
        fallOfWickets: [
          { score: 50, wicket: 1, over: '5.0', player: 'Out Ollie', dismissalType: 'Bowled', dismissal: 'Out Ollie (Bowled)' },
          { score: 60, wicket: 1, over: '6.0', player: 'Hurt Hero', dismissalType: 'Retire Hurt', dismissal: 'Hurt Hero (Retire Hurt)' },
          // Legacy entry: no dismissalType stamped, text only
          { score: 70, wicket: 1, over: '7.0', player: 'Legacy Larry', dismissal: 'Legacy Larry (Retired Hurt)' },
          { score: 80, wicket: 2, over: '8.0', player: 'Retired Ron', dismissalType: 'Retired Out', dismissal: 'Retired Ron (Retired Out)' },
        ],
      },
      secondInnings: null,
    };

    const { battingLeaders } = NetRunRateEngine.generateLeaderboard('t-rh', [mockMatch]);
    const byName = (n: string) => battingLeaders.find((b) => b.name === n);

    expect(byName('Hurt Hero')?.dismissals).toBe(0);
    expect(byName('Hurt Hero')?.average).toBe(40);
    expect(byName('Legacy Larry')?.dismissals).toBe(0);
    // Genuine dismissals still count, including Retired Out
    expect(byName('Out Ollie')?.dismissals).toBe(1);
    expect(byName('Retired Ron')?.dismissals).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// M3 — NRR excludes abandoned / no-result matches
// ═══════════════════════════════════════════════════════════════════

describe('M3: standings NRR skips no-result matches', () => {
  it('a washed-out match with a partial first innings contributes nothing to NRR', () => {
    const tournament = TournamentEngine.createTournament({
      name: 'Rain Cup',
      format: 'league',
      teams: ['Alpha', 'Bravo'],
      matchOvers: 20,
    });

    const abandoned: any = {
      id: 'm-abandoned',
      totalOvers: 20,
      status: 'ABANDONED',
      resultType: 'NO_RESULT',
      advancedSettings: { tournamentId: tournament.id, players: 11 },
      firstInnings: {
        team: 'Alpha',
        bowlingTeam: 'Bravo',
        totalRuns: 40,
        totalWickets: 0,
        totalBalls: 30,
        players: [],
        bowlers: [],
        fallOfWickets: [],
      },
      secondInnings: undefined,
    };

    const table = TournamentEngine.standings(tournament, [abandoned]);
    const alpha = table.find((t) => t.team === 'Alpha')!;
    const bravo = table.find((t) => t.team === 'Bravo')!;

    expect(alpha.runsFor).toBe(0);
    expect(alpha.ballsFor).toBe(0);
    expect(alpha.netRunRate).toBe(0);
    expect(bravo.runsAgainst).toBe(0);
    expect(bravo.ballsAgainst).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// M4 — MoM weight budgets normalised to a common 1.00
// ═══════════════════════════════════════════════════════════════════

describe('M4: MoM weights share a common budget', () => {
  it('every role shape sums to 1.00 after redistribution', () => {
    const E = ManOfTheMatchEngine as any;
    const shapes: any[] = [
      // Specialist batsman, with and without fielding data
      { hasBatting: true, hasBowling: false, hasFieldingDataAcrossMatch: true, role: 'Batsman', battingImpact: 80, bowlingImpact: 0 },
      { hasBatting: true, hasBowling: false, hasFieldingDataAcrossMatch: false, role: 'Batsman', battingImpact: 80, bowlingImpact: 0 },
      // Specialist bowler
      { hasBatting: false, hasBowling: true, hasFieldingDataAcrossMatch: true, role: 'Bowler', battingImpact: 0, bowlingImpact: 85 },
      { hasBatting: false, hasBowling: true, hasFieldingDataAcrossMatch: false, role: 'Bowler', battingImpact: 0, bowlingImpact: 85 },
      // Wicketkeeper shape
      { hasBatting: true, hasBowling: true, hasFieldingDataAcrossMatch: true, role: 'Wicketkeeper', battingImpact: 60, bowlingImpact: 10 },
      // Balanced all-rounder (raw budget was ~1.24 pre-fix)
      { hasBatting: true, hasBowling: true, hasFieldingDataAcrossMatch: true, role: 'All-rounder', battingImpact: 90, bowlingImpact: 40 },
      { hasBatting: true, hasBowling: true, hasFieldingDataAcrossMatch: false, role: 'All-rounder', battingImpact: 85, bowlingImpact: 55 },
      // Primary batter / primary bowler who also contributed
      { hasBatting: true, hasBowling: true, hasFieldingDataAcrossMatch: true, role: 'All-rounder', battingImpact: 90, bowlingImpact: 10 },
      { hasBatting: true, hasBowling: true, hasFieldingDataAcrossMatch: true, role: 'All-rounder', battingImpact: 10, bowlingImpact: 90 },
    ];

    for (const shape of shapes) {
      const w = E.redistributeWeights(shape);
      const sum = w.batting + w.bowling + w.fielding + w.pressure + w.result;
      expect(sum).toBeCloseTo(1, 2);
    }
  });

  it('all evaluated candidates in a real evaluation carry weights summing to ~1', () => {
    const inn1 = mockInnings({
      team: 'Team A',
      bowlingTeam: 'Team B',
      totalRuns: 150,
      totalWickets: 4,
      totalBalls: 120,
      players: [mockPlayer({ name: 'All Round Andy', runs: 45, balls: 30 })],
      bowlers: [mockBowler({ name: 'Pure Bowler', ballsBowled: 24, runs: 20, wickets: 3 })],
    });
    const inn2 = mockInnings({
      inningsNumber: 2,
      team: 'Team B',
      bowlingTeam: 'Team A',
      totalRuns: 140,
      totalWickets: 6,
      totalBalls: 120,
      players: [mockPlayer({ name: 'Chaser', runs: 50, balls: 35 })],
      bowlers: [mockBowler({ name: 'All Round Andy', ballsBowled: 24, runs: 25, wickets: 2 })],
    });

    const result = ManOfTheMatchEngine.evaluateMatch(inn1, inn2, {
      totalOvers: 20,
      winner: 'Team A',
    });
    expect(result).not.toBeNull();
    for (const c of result!.allCandidates) {
      const sum =
        c.weights.batting + c.weights.bowling + c.weights.fielding + c.weights.pressure + c.weights.result;
      expect(sum).toBeCloseTo(1, 1);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// M5 — DLS par-score conclusions survive event replay
// ═══════════════════════════════════════════════════════════════════

describe('M5: DLS conclusion replay round-trip', () => {
  it('fromEvents reproduces the status, par score and result of a DLS-concluded match', () => {
    const engine = new EventSourcedMatchEngine({
      id: 'm5_dls',
      teamA: 'Alpha',
      teamB: 'Beta',
      tossWinner: 'Alpha',
      tossDecision: 'Batting',
      totalOvers: 6,
    });

    // Innings 1: 42/0 off 6 overs
    const inn1Pattern = [1, 1, 2, 1, 1, 1];
    for (let over = 0; over < 6; over++) {
      scoreOver(engine, over % 2 === 0 ? 'B1' : 'B2', inn1Pattern, over === 0);
    }
    expect(engine.firstInnings.totalRuns).toBe(42);

    engine.startSecondInnings('C1', 'C2', 'B1');

    // Innings 2: 40/0 off 5 overs (minimum for a T20 DLS result),
    // short of the 43 target but ahead of par.
    const inn2Pattern = [2, 1, 2, 1, 1, 1];
    for (let over = 0; over < 5; over++) {
      scoreOver(engine, over % 2 === 0 ? 'B1' : 'B2', inn2Pattern, over === 0);
    }
    expect(engine.secondInnings?.totalRuns).toBe(40);
    expect(engine.secondInnings?.totalBalls).toBe(30);

    const outcome = engine.concludeMatchWithDls();
    expect(outcome.resultType).toBe('WIN');
    expect(outcome.winner).toBe('Beta');
    expect(engine.status).toBe('COMPLETED');
    // The live engine's own result derivation agrees with the outcome
    expect(engine.calculateResult().resultText).toBe(outcome.resultText);

    const replayed = EventSourcedMatchEngine.fromEvents(engine.events);
    expect(replayed.status).toBe('COMPLETED');
    expect(replayed.advancedSettings?.dlsParScore).toBe(engine.advancedSettings?.dlsParScore);
    expect(replayed.advancedSettings?.dlsApplied).toBe(true);

    const replayedResult = replayed.calculateResult();
    expect(replayedResult.isCompleted).toBe(true);
    expect(replayedResult.resultType).toBe(outcome.resultType);
    expect(replayedResult.winner).toBe(outcome.winner);
    expect(replayedResult.margin).toBe(outcome.margin);
    expect(replayedResult.resultText).toBe(outcome.resultText);
  });
});

// ═══════════════════════════════════════════════════════════════════
// L1 — undo after DLS / rename must not diverge state from log
// ═══════════════════════════════════════════════════════════════════

describe('L1: undo consistency for DLS and rename actions', () => {
  it('undo after applyDlsTarget removes the DLS application, not a ball', () => {
    const engine = new EventSourcedMatchEngine({
      id: 'l1_dls',
      teamA: 'Alpha',
      teamB: 'Beta',
      tossWinner: 'Alpha',
      tossDecision: 'Batting',
      totalOvers: 20,
    });
    engine.firstInnings.totalRuns = 150;
    engine.startSecondInnings('C1', 'C2', 'Bowler 1');
    for (let b = 0; b < 6; b++) engine.scoreBall({ runsScored: 1 });
    expect(engine.secondInnings?.totalRuns).toBe(6);

    engine.applyDlsTarget(120, 15);
    expect(engine.totalOvers).toBe(15);
    expect(engine.targetScore).toBe(120);

    expect(engine.undo()).toBe(true);
    // The DLS application is undone; the scored over is untouched
    expect(engine.totalOvers).toBe(20);
    expect(engine.targetScore).toBe(151);
    expect(engine.advancedSettings?.dlsApplied).toBeFalsy();
    expect(engine.secondInnings?.totalRuns).toBe(6);
    expect(engine.events.some((e) => e.type === 'DLS_TARGET_APPLIED')).toBe(false);
  });

  it('undo after renamePlayer restores the old name and prunes the event', () => {
    const engine = new EventSourcedMatchEngine({
      id: 'l1_rename',
      teamA: 'Alpha',
      teamB: 'Beta',
      tossWinner: 'Alpha',
      tossDecision: 'Batting',
      totalOvers: 20,
    });
    engine.scoreBall({ runsScored: 0 });

    const res = engine.renamePlayer('Batter 1', 'Renamed One');
    expect(res.success).toBe(true);
    expect(engine.firstInnings.players[0].name).toContain('Renamed One');

    expect(engine.undo()).toBe(true);
    expect(engine.firstInnings.players[0].name).toBe('Batter 1');
    expect(engine.events.some((e) => e.type === 'PLAYER_RENAMED')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// L2 — bowler dot balls include the final partial over
// ═══════════════════════════════════════════════════════════════════

describe('L2: dot ball analytics completeness', () => {
  it('countBowlerDotBallsFromOvers merges the partial over log', () => {
    const history = [{ log: ['0', '1', '0', '0', '1', '0'] }]; // 4 dots
    expect(DotBallAnalytics.countBowlerDotBallsFromOvers(history)).toBe(4);
    expect(DotBallAnalytics.countBowlerDotBallsFromOvers(history, ['0', '0', '4'])).toBe(6);
  });

  it('partialOverLogForBowler only fires mid-over for the current bowler', () => {
    const inn = { totalBalls: 63, currentBowlerIdx: 1, thisOverLog: ['0', '1'] };
    expect(DotBallAnalytics.partialOverLogForBowler(inn, 1)).toEqual(['0', '1']);
    expect(DotBallAnalytics.partialOverLogForBowler(inn, 0)).toBeUndefined();
    // At an exact boundary the log is the completed over (already counted)
    expect(
      DotBallAnalytics.partialOverLogForBowler({ ...inn, totalBalls: 60 }, 1)
    ).toBeUndefined();
  });

  it('leaderboard bowler dots include the final partial over', () => {
    const mockMatch: any = {
      id: 'm-dots',
      advancedSettings: { tournamentId: 't-dots' },
      firstInnings: {
        team: 'Team A',
        bowlingTeam: 'Team B',
        totalRuns: 30,
        totalWickets: 0,
        totalBalls: 63,
        players: [],
        fallOfWickets: [],
        currentBowlerIdx: 0,
        thisOverLog: ['0', '0', '1'],
        bowlers: [
          {
            name: 'Dot Machine',
            ballsBowled: 63,
            runs: 30,
            wickets: 1,
            maidens: 0,
            overHistory: [{ overNumber: 1, log: ['0', '0', '1', '0', '0', '1'] }],
          },
        ],
      },
      secondInnings: null,
    };
    const { bowlingLeaders } = NetRunRateEngine.generateLeaderboard('t-dots', [mockMatch]);
    const bowler = bowlingLeaders.find((b) => b.name === 'Dot Machine');
    expect(bowler?.dotBalls).toBe(6); // 4 completed-over dots + 2 partial-over dots
  });

  it('MoM candidate stats include partial-over dot balls', () => {
    const inn1 = mockInnings({
      team: 'Team A',
      bowlingTeam: 'Team B',
      totalRuns: 30,
      totalWickets: 1,
      totalBalls: 63,
      players: [mockPlayer({ name: 'Batter One', runs: 20, balls: 30 })],
      bowlers: [
        mockBowler({
          name: 'Dot Machine',
          ballsBowled: 9,
          runs: 10,
          wickets: 1,
          overHistory: [{ overNumber: 1, log: ['0', '0', '0', '0', '0', '0'] }],
        }),
      ],
      thisOverLog: ['0', '0', '0'],
      currentBowlerIdx: 0,
    });
    const inn2 = mockInnings({
      inningsNumber: 2,
      team: 'Team B',
      bowlingTeam: 'Team A',
      totalRuns: 25,
      totalWickets: 2,
      totalBalls: 40,
      players: [mockPlayer({ name: 'Chaser', runs: 15, balls: 20 })],
    });

    const result = ManOfTheMatchEngine.evaluateMatch(inn1, inn2, {
      totalOvers: 20,
      winner: 'Team A',
    });
    const cand = result!.allCandidates.find((c) => c.playerName === 'Dot Machine');
    expect(cand).toBeDefined();
    expect(cand!.stats.dotBalls).toBe(9); // 6 from the completed over + 3 partial
  });

  it('batsman dot predicate: a wicket token carrying runs is not a dot', () => {
    expect(DotBallAnalytics.isBatsmanDotBall('0')).toBe(true);
    expect(DotBallAnalytics.isBatsmanDotBall('W')).toBe(true);
    expect(DotBallAnalytics.isBatsmanDotBall('W2')).toBe(false); // run out, 2 completed
    expect(DotBallAnalytics.isBatsmanDotBall('W-2')).toBe(false);
    expect(DotBallAnalytics.isBatsmanDotBall('W+1')).toBe(false);
    expect(DotBallAnalytics.isBatsmanDotBall('Wd')).toBe(false);
    expect(DotBallAnalytics.isBatsmanDotBall('4')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// L3 — a wide never consumes a free hit
// ═══════════════════════════════════════════════════════════════════

describe('L3: free hit survives a wide when wideReball is off', () => {
  it('wide on a free hit carries the free hit to the next delivery', () => {
    const engine = new EventSourcedMatchEngine({
      id: 'l3_fh',
      teamA: 'Alpha',
      teamB: 'Beta',
      tossWinner: 'Alpha',
      tossDecision: 'Batting',
      totalOvers: 20,
      advancedSettings: { wideReball: false },
    });

    engine.scoreBall({ runsScored: 0, isNoBall: true });
    expect(engine.currentInnings.isFreeHit).toBe(true);

    // With wideReball off this wide counts as a bowled ball — but a
    // wide must still never consume the free hit (ICC).
    engine.scoreBall({ runsScored: 0, isWide: true });
    expect(engine.currentInnings.isFreeHit).toBe(true);

    // A genuine legal delivery consumes it
    engine.scoreBall({ runsScored: 0 });
    expect(engine.currentInnings.isFreeHit).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// L4 — fromScorecard must not alias the caller's innings
// ═══════════════════════════════════════════════════════════════════

describe('L4: fromScorecard deep-copies innings', () => {
  it('mutating the rebuilt engine leaves the source scorecard untouched', () => {
    const engine = new EventSourcedMatchEngine({
      id: 'l4_alias',
      teamA: 'Alpha',
      teamB: 'Beta',
      tossWinner: 'Alpha',
      tossDecision: 'Batting',
      totalOvers: 20,
    });
    engine.scoreBall({ runsScored: 4 });
    const scorecard = engine.toScorecard();
    expect(scorecard.firstInnings?.totalRuns).toBe(4);

    const restored = EventSourcedMatchEngine.fromScorecard(scorecard);
    restored.firstInnings.totalRuns = 999;
    restored.firstInnings.players[0].runs = 999;

    expect(scorecard.firstInnings?.totalRuns).toBe(4);
    expect(scorecard.firstInnings?.players[0].runs).toBe(4);
  });
});

// ═══════════════════════════════════════════════════════════════════
// L5 — invariant 3 counts only genuine dismissals
// ═══════════════════════════════════════════════════════════════════

describe('L5: scoring invariants tolerate retired hurt', () => {
  it('a full innings with one retired hurt does not trip invariant 3', () => {
    const engine = new EventSourcedMatchEngine({
      id: 'l5_inv',
      teamA: 'Alpha',
      teamB: 'Beta',
      tossWinner: 'Alpha',
      tossDecision: 'Batting',
      totalOvers: 20,
    });
    expect(engine.retirePlayer(true, 'Retire Hurt')).toBe(true);

    const inn = engine.firstInnings;
    expect(inn.fallOfWickets).toHaveLength(1);
    // Simulate the remaining 10 genuine wickets
    inn.totalWickets = 10;
    for (let i = 0; i < 10; i++) {
      inn.fallOfWickets.push({
        score: 0,
        wicket: i + 1,
        over: '1.0',
        player: `P${i}`,
        dismissalType: 'Bowled',
      });
    }
    expect(inn.fallOfWickets).toHaveLength(11);

    const result = engine.validateScoringInvariants();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);

    // An 11th genuine dismissal entry still trips the invariant
    inn.fallOfWickets.push({
      score: 0,
      wicket: 11,
      over: '1.0',
      player: 'Extra',
      dismissalType: 'Bowled',
    });
    expect(engine.validateScoringInvariants().valid).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// L6 — editHistoricalBall must detect replay divergence
// ═══════════════════════════════════════════════════════════════════

describe('L6: historical ball edit integrity', () => {
  function buildAllOutEngine(id: string): EventSourcedMatchEngine {
    const engine = new EventSourcedMatchEngine({
      id,
      teamA: 'Alpha',
      teamB: 'Beta',
      tossWinner: 'Alpha',
      tossDecision: 'Batting',
      totalOvers: 5,
      strikerName: 'S1',
      nonStrikerName: 'S2',
      bowlerName: 'BW1',
    });
    let ball = 0;
    while (engine.firstInnings.totalWickets < 10 && ball < 30) {
      if (ball > 0 && ball % 6 === 0) {
        engine.changeBowler(Math.floor(ball / 6) % 2 === 0 ? 'BW1' : 'BW2');
      }
      const isWicket = ball % 2 === 1;
      engine.scoreBall({
        runsScored: 0,
        isWicket,
        dismissalType: isWicket ? 'Bowled' : undefined,
      });
      ball++;
    }
    return engine;
  }

  it('refuses an edit whose replay would silently drop deliveries', () => {
    const engine = buildAllOutEngine('l6_diverge');
    expect(engine.firstInnings.totalWickets).toBe(10);
    expect(engine.firstInnings.totalBalls).toBe(20);

    // Turning ball 1 into a wicket ends the innings one ball early;
    // the final two deliveries would vanish in replay.
    const ok = engine.editHistoricalBall(0, 1, {
      runsScored: 0,
      isWicket: true,
      dismissalType: 'Bowled',
    });
    expect(ok).toBe(false);
    // State and log are left exactly as they were
    expect(engine.firstInnings.totalBalls).toBe(20);
    expect(engine.firstInnings.totalWickets).toBe(10);
    const firstBall = engine.events.filter((e) => e.type === 'BALL_SCORED')[0];
    expect(firstBall.payload.ballInput.isWicket).toBeFalsy();
  });

  it('still accepts a benign edit', () => {
    const engine = buildAllOutEngine('l6_benign');
    const ok = engine.editHistoricalBall(0, 1, { runsScored: 1 });
    expect(ok).toBe(true);
    expect(engine.firstInnings.totalRuns).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// L7 — NRR innings-1 all-out quota uses its own allotment
// ═══════════════════════════════════════════════════════════════════

describe('L7: NRR quota after a DLS reduction', () => {
  it('innings 1 is divided by the original overs, innings 2 by the revised overs', () => {
    const tournament = TournamentEngine.createTournament({
      name: 'DLS Cup',
      format: 'league',
      teams: ['Alpha', 'Bravo'],
      matchOvers: 20,
    });

    const match: any = {
      id: 'm-dls-nrr',
      totalOvers: 10, // revised down by DLS for the chase
      status: 'COMPLETED',
      resultType: 'WIN',
      advancedSettings: { tournamentId: tournament.id, players: 11, originalTotalOvers: 20 },
      firstInnings: {
        team: 'Alpha',
        bowlingTeam: 'Bravo',
        totalRuns: 100,
        totalWickets: 10, // all out
        totalBalls: 60,
        players: [],
        bowlers: [],
        fallOfWickets: [],
      },
      secondInnings: {
        team: 'Bravo',
        bowlingTeam: 'Alpha',
        totalRuns: 90,
        totalWickets: 5,
        totalBalls: 50,
        players: [],
        bowlers: [],
        fallOfWickets: [],
      },
    };

    const table = TournamentEngine.standings(tournament, [match]);
    const alpha = table.find((t) => t.team === 'Alpha')!;
    const bravo = table.find((t) => t.team === 'Bravo')!;

    // All-out innings 1: full ORIGINAL quota (20 ov = 120 balls)
    expect(alpha.ballsFor).toBe(120);
    expect(bravo.ballsAgainst).toBe(120);
    // Innings 2 not all out: actual balls stand
    expect(bravo.ballsFor).toBe(50);
    expect(alpha.ballsAgainst).toBe(50);
  });
});

// ═══════════════════════════════════════════════════════════════════
// L8 — maxOversPerBowler getter matches enforcement
// ═══════════════════════════════════════════════════════════════════

describe('L8: maxOversPerBowler getter delegates to the limiter', () => {
  it('tracks the enforced limit after a DLS overs reduction', () => {
    const engine = new EventSourcedMatchEngine({
      id: 'l8_getter',
      teamA: 'Alpha',
      teamB: 'Beta',
      tossWinner: 'Alpha',
      tossDecision: 'Batting',
      totalOvers: 20,
    });
    expect(engine.getMaxBowlerLimit()).toBe(4);
    expect(engine.maxOversPerBowler).toBe(4);

    engine.applyDlsTarget(120, 10);
    expect(engine.getMaxBowlerLimit()).toBe(2);
    // Pre-fix the getter returned the stale stored value (4)
    expect(engine.maxOversPerBowler).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// L9 — super-over credit only for actual participants
// ═══════════════════════════════════════════════════════════════════

describe('L9: super-over MoM credit requires participation', () => {
  function tiedMatchInnings() {
    const inn1 = mockInnings({
      team: 'Team X',
      bowlingTeam: 'Team Y',
      totalRuns: 160,
      totalWickets: 5,
      totalBalls: 120,
      players: [mockPlayer({ name: 'SuperStar', runs: 55, balls: 35 })],
    });
    const inn2 = mockInnings({
      inningsNumber: 2,
      team: 'Team Y',
      bowlingTeam: 'Team X',
      totalRuns: 160,
      totalWickets: 6,
      totalBalls: 120,
      players: [mockPlayer({ name: 'EqualHero', runs: 53, balls: 34 })],
    });
    return { inn1, inn2 };
  }

  it('does not credit the winner with a super-over performance they never made', () => {
    const { inn1, inn2 } = tiedMatchInnings();
    const soInn1 = mockInnings({
      team: 'Team X',
      bowlingTeam: 'Team Y',
      totalRuns: 15,
      totalWickets: 0,
      totalBalls: 6,
      players: [mockPlayer({ name: 'SO Finisher', runs: 15, balls: 5 })],
    });
    const soInn2 = mockInnings({
      inningsNumber: 2,
      team: 'Team Y',
      bowlingTeam: 'Team X',
      totalRuns: 9,
      totalWickets: 1,
      totalBalls: 6,
      players: [mockPlayer({ name: 'SO Chaser', runs: 9, balls: 6 })],
    });

    const result = ManOfTheMatchEngine.evaluateMatch(inn1, inn2, {
      totalOvers: 20,
      winner: 'Team X',
      superOver: { innings1: soInn1, innings2: soInn2, winner: 'Team X' },
    });

    expect(result).not.toBeNull();
    expect(result!.manOfTheMatch.playerName).toBe('SuperStar');
    // SuperStar never appeared in the super over — no credit
    expect(result!.reason).not.toContain('Super Over');
    const superstar = result!.allCandidates.find((c) => c.playerName === 'SuperStar');
    expect(
      superstar!.rawEvidence.some((e) => e.toLowerCase().includes('super over'))
    ).toBe(false);
  });

  it('credits the winner when they actually starred in the super over', () => {
    const { inn1, inn2 } = tiedMatchInnings();
    const soInn1 = mockInnings({
      team: 'Team X',
      bowlingTeam: 'Team Y',
      totalRuns: 14,
      totalWickets: 0,
      totalBalls: 6,
      players: [mockPlayer({ name: 'SuperStar', runs: 14, balls: 4 })],
    });
    const soInn2 = mockInnings({
      inningsNumber: 2,
      team: 'Team Y',
      bowlingTeam: 'Team X',
      totalRuns: 9,
      totalWickets: 1,
      totalBalls: 6,
      players: [mockPlayer({ name: 'SO Chaser', runs: 9, balls: 6 })],
    });

    const result = ManOfTheMatchEngine.evaluateMatch(inn1, inn2, {
      totalOvers: 20,
      winner: 'Team X',
      superOver: { innings1: soInn1, innings2: soInn2, winner: 'Team X' },
    });

    expect(result).not.toBeNull();
    expect(result!.manOfTheMatch.playerName).toBe('SuperStar');
    expect(result!.reason).toContain('Super Over');
  });
});

// ═══════════════════════════════════════════════════════════════════
// C1 — candidate confidence is computed, never a hardcoded 0.9
// ═══════════════════════════════════════════════════════════════════

describe('C1: confidence is computed for every candidate', () => {
  it('runners-up get a confidence from the same formula as the winner', () => {
    const inn1 = mockInnings({
      team: 'Team A',
      bowlingTeam: 'Team B',
      totalRuns: 170,
      totalWickets: 3,
      totalBalls: 120,
      players: [
        mockPlayer({ name: 'Centurion', runs: 100, balls: 55 }),
        mockPlayer({ name: 'Support Act', runs: 40, balls: 30 }),
      ],
    });
    const inn2 = mockInnings({
      inningsNumber: 2,
      team: 'Team B',
      bowlingTeam: 'Team A',
      totalRuns: 120,
      totalWickets: 8,
      totalBalls: 120,
      players: [mockPlayer({ name: 'Lone Fighter', runs: 30, balls: 25 })],
    });

    const result = ManOfTheMatchEngine.evaluateMatch(inn1, inn2, {
      totalOvers: 20,
      winner: 'Team A',
    });
    expect(result).not.toBeNull();
    expect(result!.allCandidates.length).toBeGreaterThan(1);

    const E = ManOfTheMatchEngine as any;
    const top = result!.allCandidates[0];
    const hasFieldingData = result!.allCandidates.some(
      (c) => c.stats.catches + c.stats.runOuts + c.stats.stumpings > 0
    );
    const hasBallLogs = Boolean(inn1.thisOverLog.length || inn2.thisOverLog.length);

    for (const candidate of result!.allCandidates.slice(1)) {
      const expected = E.calculateConfidenceScore({
        scoreGap: top.finalScore - candidate.finalScore,
        actualOvers: result!.matchMetadata.actualOvers,
        hasFieldingData,
        hasBallLogs,
        winner: top,
        runnerUp: candidate,
      });
      expect(candidate.confidence).toBe(expected);
      expect(candidate.confidence).toBeGreaterThan(0);
    }
  });
});
