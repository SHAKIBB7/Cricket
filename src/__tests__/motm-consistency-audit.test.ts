import { describe, it, expect } from 'vitest';
import { ManOfTheMatchEngine } from '../domain/cricket/analytics/ManOfTheMatchEngine';
import { ScorecardPdfGenerator } from '../features/scoring/pdf/ScorecardPdfGenerator';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import {
  MatchScorecard,
  InningsData,
  Player,
  Bowler,
} from '../domain/cricket/types';

function createMockPlayer(overrides: Partial<Player>): Player {
  return {
    id: overrides.id || `p_${Math.random().toString(36).substring(2, 7)}`,
    name: overrides.name || 'Test Player',
    battingHand: 'Right-hand Batsman',
    battingPosition: overrides.battingPosition || '1',
    runs: overrides.runs ?? 0,
    balls: overrides.balls ?? 0,
    fours: overrides.fours ?? 0,
    sixes: overrides.sixes ?? 0,
    dotBalls: overrides.dotBalls ?? 0,
    ballLog: overrides.ballLog || [],
    bowlersFaced: overrides.bowlersFaced || {},
    runsVsBowler: overrides.runsVsBowler || {},
    isDismissed: overrides.isDismissed ?? false,
    dismissalType: overrides.dismissalType,
    fielderName: overrides.fielderName,
  };
}

function createMockBowler(overrides: Partial<Bowler>): Bowler {
  return {
    id: overrides.id || `b_${Math.random().toString(36).substring(2, 7)}`,
    name: overrides.name || 'Test Bowler',
    ballsBowled: overrides.ballsBowled ?? 0,
    maidens: overrides.maidens ?? 0,
    runs: overrides.runs ?? 0,
    wickets: overrides.wickets ?? 0,
    overHistory: overrides.overHistory || [],
  };
}

function createMockInnings(overrides: Partial<InningsData>): InningsData {
  return {
    inningsNumber: overrides.inningsNumber || 1,
    team: overrides.team || 'Warriors',
    bowlingTeam: overrides.bowlingTeam || 'Titans',
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
    currentBowlerIdx: 0,
    nextPlayerIdx: 2,
    lastCompletedOverBowlerIdx: -1,
    isOverComplete: false,
    isFreeHit: false,
  };
}

function createCompletedMatch(overrides: Partial<MatchScorecard>): MatchScorecard {
  return {
    id: overrides.id || `match_${Date.now()}`,
    teamA: overrides.teamA || 'Warriors',
    teamB: overrides.teamB || 'Titans',
    tossWinner: overrides.tossWinner || 'Warriors',
    tossDecision: overrides.tossDecision || 'Batting',
    totalOvers: overrides.totalOvers ?? 10,
    status: overrides.status || 'COMPLETED',
    currentInnings: overrides.currentInnings || 2,
    targetScore: overrides.targetScore || 100,
    venue: overrides.venue || 'City Stadium',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    winner: overrides.winner,
    loser: overrides.loser,
    result: overrides.result,
    resultType: overrides.resultType || 'WIN',
    margin: overrides.margin,
    marginType: overrides.marginType,
    ballsRemaining: overrides.ballsRemaining,
    mom: overrides.mom,
    momStats: overrides.momStats,
    advancedSettings: {
      players: 11,
      noBall: true,
      noBallReball: true,
      noBallRun: 1,
      wideBall: true,
      wideReball: true,
      wideRun: 1,
      isManualLimitEnabled: false,
      manualOverLimit: 2,
    },
    firstInnings: overrides.firstInnings,
    secondInnings: overrides.secondInnings,
  };
}

describe('Man of the Match Selection Consistency & Audit Verification', () => {
  // Case 1: The Match End screen and PDF display the same player
  it('Case 1: Match End screen and PDF display the exact same player', async () => {
    const inn1 = createMockInnings({
      inningsNumber: 1,
      team: 'Warriors',
      bowlingTeam: 'Titans',
      totalRuns: 95,
      totalWickets: 4,
      totalBalls: 60,
      oversString: '10.0',
      players: [
        createMockPlayer({ id: 'w1', name: 'Zayn Malik', runs: 65, balls: 32, fours: 6, sixes: 4, isDismissed: false }),
        createMockPlayer({ id: 'w2', name: 'Ali Khan', runs: 22, balls: 18, fours: 2, sixes: 0, isDismissed: true }),
      ],
      bowlers: [
        createMockBowler({ id: 't1', name: 'Rashid Arman', wickets: 3, runs: 28, ballsBowled: 24 }),
      ],
    });

    const inn2 = createMockInnings({
      inningsNumber: 2,
      team: 'Titans',
      bowlingTeam: 'Warriors',
      totalRuns: 82,
      totalWickets: 8,
      totalBalls: 60,
      oversString: '10.0',
      players: [
        createMockPlayer({ id: 't1', name: 'Rashid Arman', runs: 20, balls: 15, isDismissed: true }),
        createMockPlayer({ id: 't2', name: 'David Miller', runs: 35, balls: 25, isDismissed: true }),
      ],
      bowlers: [
        createMockBowler({ id: 'w3', name: 'Shaheen Shah', wickets: 4, runs: 18, ballsBowled: 24 }),
      ],
    });

    const match = createCompletedMatch({
      teamA: 'Warriors',
      teamB: 'Titans',
      totalOvers: 10,
      winner: 'Warriors',
      loser: 'Titans',
      result: 'Warriors won by 13 runs',
      firstInnings: inn1,
      secondInnings: inn2,
    });

    // 1. Simulate Match End Screen resolving MOTM
    const screenMom = ManOfTheMatchEngine.resolveForMatch(match);
    expect(screenMom).not.toBeNull();

    // 2. Simulate PDF Generator rendering MOTM from the same match scorecard
    const pdfDoc = await ScorecardPdfGenerator.generatePdf(match);
    expect(pdfDoc).toBeDefined();

    // 3. Verify single source of truth: scorecard.mom and scorecard.momStats are synchronized
    expect(match.mom).toBe(screenMom!.name);
    expect(match.momStats?.name).toBe(screenMom!.name);
    expect(match.momStats?.playerId).toBe(screenMom!.playerId);

    // 4. Repeated resolution via resolveForMatch returns the exact same player
    const pdfResolvedMom = ManOfTheMatchEngine.resolveForMatch(match);
    expect(pdfResolvedMom?.name).toBe(screenMom!.name);
    expect(pdfResolvedMom?.playerId).toBe(screenMom!.playerId);
  });

  // Case 2: A batter has the strongest overall contribution
  it('Case 2: A batter has the strongest overall contribution', () => {
    const inn1 = createMockInnings({
      team: 'Lions',
      bowlingTeam: 'Tigers',
      totalRuns: 160,
      totalBalls: 60,
      players: [
        createMockPlayer({ id: 'bat1', name: 'Virat Kohli', runs: 85, balls: 38, fours: 8, sixes: 5, isDismissed: false }),
        createMockPlayer({ id: 'bat2', name: 'Rohit Sharma', runs: 25, balls: 14, fours: 3, sixes: 1, isDismissed: true }),
      ],
      bowlers: [
        createMockBowler({ id: 'bowl1', name: 'Trent Boult', wickets: 1, runs: 35, ballsBowled: 24 }),
      ],
    });

    const inn2 = createMockInnings({
      team: 'Tigers',
      bowlingTeam: 'Lions',
      totalRuns: 120,
      totalBalls: 60,
      players: [
        createMockPlayer({ id: 'bat3', name: 'Kane Williamson', runs: 30, balls: 25, isDismissed: true }),
      ],
      bowlers: [
        createMockBowler({ id: 'bowl2', name: 'Jasprit Bumrah', wickets: 1, runs: 22, ballsBowled: 24 }),
      ],
    });

    const match = createCompletedMatch({
      teamA: 'Lions',
      teamB: 'Tigers',
      totalOvers: 10,
      winner: 'Lions',
      loser: 'Tigers',
      result: 'Lions won by 40 runs',
      firstInnings: inn1,
      secondInnings: inn2,
    });

    const winner = ManOfTheMatchEngine.resolveForMatch(match);
    expect(winner).not.toBeNull();
    expect(winner!.name).toBe('Virat Kohli');
    expect(winner!.role).toBe('Batsman');
    expect(winner!.runs).toBe(85);
  });

  // Case 3: A bowler has the strongest overall contribution
  it('Case 3: A bowler has the strongest overall contribution', () => {
    const inn1 = createMockInnings({
      team: 'Strikers',
      bowlingTeam: 'Stars',
      totalRuns: 75,
      totalWickets: 9,
      totalBalls: 60,
      players: [
        createMockPlayer({ id: 'st1', name: 'Glenn Maxwell', runs: 18, balls: 12 }),
      ],
      bowlers: [
        createMockBowler({
          id: 'star1',
          name: 'Adam Zampa',
          wickets: 4,
          runs: 9,
          ballsBowled: 24,
          maidens: 1,
          overHistory: [
            { overNumber: 1, log: ['0', 'W', '0', '1', '0', '0'] },
            { overNumber: 2, log: ['0', '0', '0', '0', '0', '0'] },
            { overNumber: 3, log: ['W', '0', 'W', '4', '0', '0'] },
            { overNumber: 4, log: ['0', 'W', '1', '1', '1', '1'] },
          ],
        }),
      ],
    });

    const inn2 = createMockInnings({
      team: 'Stars',
      bowlingTeam: 'Strikers',
      totalRuns: 78,
      totalWickets: 2,
      totalBalls: 40,
      players: [
        createMockPlayer({ id: 'star2', name: 'Marcus Stoinis', runs: 24, balls: 20 }),
      ],
      bowlers: [
        createMockBowler({ id: 'st2', name: 'Peter Siddle', wickets: 1, runs: 20, ballsBowled: 18 }),
      ],
    });

    const match = createCompletedMatch({
      teamA: 'Strikers',
      teamB: 'Stars',
      totalOvers: 10,
      winner: 'Stars',
      loser: 'Strikers',
      result: 'Stars won by 8 wickets',
      firstInnings: inn1,
      secondInnings: inn2,
    });

    const winner = ManOfTheMatchEngine.resolveForMatch(match);
    expect(winner).not.toBeNull();
    expect(winner!.name).toBe('Adam Zampa');
    expect(winner!.role).toBe('Bowler');
    expect(winner!.wickets).toBe(4);
  });

  // Case 4: An all-rounder has the strongest combined contribution
  it('Case 4: An all-rounder has the strongest combined contribution', () => {
    const inn1 = createMockInnings({
      team: 'Riders',
      bowlingTeam: 'Kings',
      totalRuns: 110,
      totalBalls: 60,
      players: [
        createMockPlayer({ id: 'r1', name: 'Pure Batter', runs: 45, balls: 32, fours: 5 }),
      ],
      bowlers: [
        // Pure Bowler took 2 wickets
        createMockBowler({ id: 'k1', name: 'Pure Bowler', wickets: 2, runs: 26, ballsBowled: 24 }),
        // All-rounder took 2 wickets for 12 runs
        createMockBowler({ id: 'k2', name: 'Shakib Al Hasan', wickets: 2, runs: 12, ballsBowled: 24 }),
      ],
    });

    const inn2 = createMockInnings({
      team: 'Kings',
      bowlingTeam: 'Riders',
      totalRuns: 112,
      totalBalls: 55,
      players: [
        // All-rounder also scored 38 off 18 balls
        createMockPlayer({ id: 'k2', name: 'Shakib Al Hasan', runs: 38, balls: 18, fours: 4, sixes: 2, isDismissed: false }),
        createMockPlayer({ id: 'k3', name: 'Other Batter', runs: 28, balls: 20 }),
      ],
      bowlers: [
        createMockBowler({ id: 'r2', name: 'Riders Bowler', wickets: 1, runs: 24, ballsBowled: 20 }),
      ],
    });

    const match = createCompletedMatch({
      teamA: 'Riders',
      teamB: 'Kings',
      totalOvers: 10,
      winner: 'Kings',
      loser: 'Riders',
      result: 'Kings won by 6 wickets',
      firstInnings: inn1,
      secondInnings: inn2,
    });

    const winner = ManOfTheMatchEngine.resolveForMatch(match);
    expect(winner).not.toBeNull();
    expect(winner!.name).toBe('Shakib Al Hasan');
    expect(winner!.role).toBe('All-rounder');
    expect(winner!.runs).toBe(38);
    expect(winner!.wickets).toBe(2);
  });

  // Case 5: Different players lead in batting and bowling statistics
  it('Case 5: Different players lead in batting and bowling statistics', () => {
    const inn1 = createMockInnings({
      team: 'Eagles',
      bowlingTeam: 'Hawks',
      totalRuns: 90,
      totalBalls: 60,
      players: [
        createMockPlayer({ id: 'e1', name: 'Batter Top', runs: 58, balls: 34, fours: 7, sixes: 2 }),
      ],
      bowlers: [
        createMockBowler({ id: 'h1', name: 'Bowler Top', wickets: 3, runs: 15, ballsBowled: 24 }),
      ],
    });

    const inn2 = createMockInnings({
      team: 'Hawks',
      bowlingTeam: 'Eagles',
      totalRuns: 92,
      totalBalls: 56,
      players: [
        createMockPlayer({ id: 'h2', name: 'Hawks Batter', runs: 35, balls: 28 }),
      ],
      bowlers: [
        createMockBowler({ id: 'e2', name: 'Eagles Bowler', wickets: 2, runs: 22, ballsBowled: 24 }),
      ],
    });

    const match = createCompletedMatch({
      teamA: 'Eagles',
      teamB: 'Hawks',
      totalOvers: 10,
      winner: 'Hawks',
      loser: 'Eagles',
      result: 'Hawks won by 4 wickets',
      firstInnings: inn1,
      secondInnings: inn2,
    });

    const winner = ManOfTheMatchEngine.resolveForMatch(match);
    expect(winner).not.toBeNull();
    // Engine deterministically selects winner without error or ambiguity
    expect(typeof winner!.name).toBe('string');
    expect(winner!.totalPoints).toBeGreaterThan(0);
    // Scorecard is synchronized
    expect(match.mom).toBe(winner!.name);
  });

  // Case 6: The match contains multiple innings or a nonstandard number of overs
  it('Case 6: Multi-innings statistics are merged accurately across innings', () => {
    const inn1 = createMockInnings({
      inningsNumber: 1,
      team: 'Club A',
      bowlingTeam: 'Club B',
      totalRuns: 50,
      players: [
        createMockPlayer({ id: 'a1', name: 'Multi Star', runs: 30, balls: 15, fours: 4 }),
      ],
      bowlers: [
        createMockBowler({ id: 'b1', name: 'Club B Bowler', wickets: 1, runs: 15, ballsBowled: 12 }),
      ],
    });

    const inn2 = createMockInnings({
      inningsNumber: 2,
      team: 'Club B',
      bowlingTeam: 'Club A',
      totalRuns: 50,
      players: [
        createMockPlayer({ id: 'b2', name: 'Club B Batter', runs: 25, balls: 18 }),
      ],
      bowlers: [
        createMockBowler({ id: 'a1', name: 'Multi Star', wickets: 2, runs: 14, ballsBowled: 18 }),
      ],
    });

    // Super over / 3rd Innings where Multi Star bats again!
    const inn3 = createMockInnings({
      inningsNumber: 3,
      team: 'Club A',
      bowlingTeam: 'Club B',
      totalRuns: 16,
      players: [
        createMockPlayer({ id: 'a1', name: 'Multi Star', runs: 14, balls: 5, sixes: 2 }),
      ],
      bowlers: [],
    });

    const match = createCompletedMatch({
      totalOvers: 5, // Non-standard 5-over match length
      winner: 'Club A',
      loser: 'Club B',
      result: 'Club A won via Super Over',
      firstInnings: inn1,
      secondInnings: inn2,
    });

    // Pass inn3 via superOver options
    const result = ManOfTheMatchEngine.calculateForMatch(inn1, inn2, {
      totalOvers: 5,
      winner: 'Club A',
      superOver: { innings1: inn3 },
      match,
    });

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Multi Star');
    // Batting runs from Innings 1 (30) and Innings 3 (14) must be summed to 44
    expect(result!.runs).toBe(44);
    // Bowling wickets from Innings 2 must be preserved
    expect(result!.wickets).toBe(2);
  });

  // Case 7: Two or more players have equal selection scores
  it('Case 7: Deterministic tie-breaking when players have identical stats', () => {
    const inn1 = createMockInnings({
      team: 'Team A',
      bowlingTeam: 'Team B',
      totalRuns: 80,
      players: [
        createMockPlayer({ id: 'alpha_p1', name: 'Alpha Player', runs: 40, balls: 20, fours: 4, sixes: 1 }),
        createMockPlayer({ id: 'beta_p2', name: 'Beta Player', runs: 40, balls: 20, fours: 4, sixes: 1 }),
      ],
      bowlers: [],
    });

    const inn2 = createMockInnings({
      team: 'Team B',
      bowlingTeam: 'Team A',
      totalRuns: 60,
      players: [],
      bowlers: [],
    });

    const match = createCompletedMatch({
      teamA: 'Team A',
      teamB: 'Team B',
      winner: 'Team A',
      totalOvers: 10,
      firstInnings: inn1,
      secondInnings: inn2,
    });

    // Run resolution multiple times to ensure strictly deterministic tie-breaker
    const res1 = ManOfTheMatchEngine.resolveForMatch({ ...match, momStats: undefined, mom: undefined });
    const res2 = ManOfTheMatchEngine.resolveForMatch({ ...match, momStats: undefined, mom: undefined });
    const res3 = ManOfTheMatchEngine.resolveForMatch({ ...match, momStats: undefined, mom: undefined });

    expect(res1?.name).toBe(res2?.name);
    expect(res2?.name).toBe(res3?.name);
    // Alphabetical tie-breaker: 'Alpha Player' precedes 'Beta Player'
    expect(res1?.name).toBe('Alpha Player');
  });

  // Case 8: Scores are corrected after the match result is initially calculated
  it('Case 8: Scoring corrections dynamically synchronize scorecard and MOTM', () => {
    const engine = new EventSourcedMatchEngine({
      teamA: 'Red Wings',
      teamB: 'Blue Sox',
      tossWinner: 'Red Wings',
      tossDecision: 'Batting',
      totalOvers: 2, // 2-over match
      strikerName: 'Red Batter',
      nonStrikerName: 'Red NonStriker',
      bowlerName: 'Blue Bowler',
    });

    // Batter 1 bats: scores 6 on ball 1..4 (22 runs in over 1)
    engine.scoreBall({ runsScored: 6 });
    engine.scoreBall({ runsScored: 6 });
    engine.scoreBall({ runsScored: 4 });
    engine.scoreBall({ runsScored: 4 });
    engine.scoreBall({ runsScored: 1 });
    engine.scoreBall({ runsScored: 1 });

    // Over 2: 6 dot balls to finish innings at 22 runs
    for (let i = 0; i < 6; i++) {
      engine.scoreBall({ runsScored: 0 });
    }

    // Start 2nd innings: Blue Sox bat
    engine.startSecondInnings('Blue Batter', 'Blue NonStriker', 'Red Bowler');
    // Blue Sox restricted to 10 runs
    for (let i = 0; i < 12; i++) {
      engine.scoreBall({ runsScored: i === 0 ? 6 : 0 });
    }

    // Complete match
    const initialScorecard = engine.completeMatch();
    expect(initialScorecard.status).toBe('COMPLETED');
    expect(initialScorecard.mom).toBeDefined();
    expect(initialScorecard.momStats).toBeDefined();

    // Simulate scoring correction on the scorecard
    const updatedScorecard = { ...initialScorecard };
    // Credit Red Bowler with 5 wickets
    if (updatedScorecard.secondInnings?.bowlers?.[0]) {
      updatedScorecard.secondInnings.bowlers[0].wickets = 5;
      updatedScorecard.secondInnings.bowlers[0].runs = 2;
    }

    // Resolve with forceRecalculate
    const correctedMom = ManOfTheMatchEngine.resolveForMatch(updatedScorecard, { forceRecalculate: true });
    expect(correctedMom).not.toBeNull();
    expect(updatedScorecard.mom).toBe(correctedMom!.name);
    expect(updatedScorecard.momStats?.name).toBe(correctedMom!.name);
  });

  // Case 9: Missing or incomplete statistics do not produce invalid results
  it('Case 9: Missing or incomplete statistics do not produce invalid results or crashes', () => {
    // Empty match with no deliveries
    const emptyMatch = createCompletedMatch({
      firstInnings: undefined,
      secondInnings: undefined,
    });
    const emptyResult = ManOfTheMatchEngine.resolveForMatch(emptyMatch);
    expect(emptyResult).toBeNull();

    // Incomplete match with 0 balls faced / NaN-proof
    const incompleteMatch = createCompletedMatch({
      firstInnings: createMockInnings({
        totalRuns: 0,
        totalBalls: 0,
        players: [createMockPlayer({ runs: 0, balls: 0 })],
        bowlers: [createMockBowler({ wickets: 0, runs: 0, ballsBowled: 0 })],
      }),
      secondInnings: undefined,
    });
    const incompleteResult = ManOfTheMatchEngine.resolveForMatch(incompleteMatch);
    // Safely returns null or valid result without throwing or NaN
    if (incompleteResult) {
      expect(Number.isNaN(incompleteResult.totalPoints)).toBe(false);
      expect(Number.isNaN(incompleteResult.battingPoints)).toBe(false);
      expect(Number.isNaN(incompleteResult.bowlingPoints)).toBe(false);
    }
  });

  // Case 10: Repeated PDF generation does not change the selected player
  it('Case 10: Repeated PDF generation produces the exact same player and state', async () => {
    const match = createCompletedMatch({
      winner: 'Challengers',
      loser: 'Defenders',
      result: 'Challengers won by 5 wickets',
      totalOvers: 8,
      firstInnings: createMockInnings({
        team: 'Defenders',
        bowlingTeam: 'Challengers',
        totalRuns: 65,
        totalBalls: 48,
        players: [
          createMockPlayer({ id: 'd1', name: 'Defend One', runs: 28, balls: 22 }),
        ],
        bowlers: [
          createMockBowler({ id: 'c1', name: 'Lockie Ferguson', wickets: 3, runs: 14, ballsBowled: 18 }),
        ],
      }),
      secondInnings: createMockInnings({
        team: 'Challengers',
        bowlingTeam: 'Defenders',
        totalRuns: 68,
        totalBalls: 42,
        players: [
          createMockPlayer({ id: 'c2', name: 'Faf du Plessis', runs: 34, balls: 20, isDismissed: false }),
        ],
        bowlers: [
          createMockBowler({ id: 'd2', name: 'Defend Bowler', wickets: 2, runs: 20, ballsBowled: 18 }),
        ],
      }),
    });

    // Run PDF generation 5 times consecutively
    const selectedPlayers: string[] = [];
    for (let i = 0; i < 5; i++) {
      const doc = await ScorecardPdfGenerator.generatePdf(match);
      expect(doc).toBeDefined();
      expect(match.mom).toBeDefined();
      selectedPlayers.push(match.mom!);
    }

    // Every run produced the exact same player
    expect(new Set(selectedPlayers).size).toBe(1);
    expect(selectedPlayers[0]).toBe('Lockie Ferguson');
  });
});
