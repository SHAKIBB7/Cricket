import { describe, it, expect } from 'vitest';
import {
  ManOfTheMatchEngine,
  UniversalMotmResult,
  PlayerImpactScore,
  MOTM_CONFIG,
} from '../domain/cricket/analytics/ManOfTheMatchEngine';
import { ScorecardPdfGenerator } from '../features/scoring/pdf/ScorecardPdfGenerator';
import { ScorecardHtmlGenerator } from '../features/scoring/pdf/ScorecardHtmlGenerator';
import {
  MatchScorecard,
  InningsData,
  Player,
  Bowler,
  DomainEvent,
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
    wideRuns: overrides.wideRuns ?? 0,
    nbRuns: overrides.nbRuns ?? 0,
    byeRuns: overrides.byeRuns ?? 0,
    lbRuns: overrides.lbRuns ?? 0,
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
    ...overrides,
  };
}

describe('Man of the Match Comprehensive Specification & Edge Cases', () => {
  // ── 1. A High-Scoring Batter on the Winning Team ──
  it('1. Correctly awards a high-scoring batter on the winning team with dominant batting impact', () => {
    const inn1 = createMockInnings({
      team: 'Titans',
      bowlingTeam: 'Warriors',
      totalRuns: 160,
      totalBalls: 60,
      players: [
        createMockPlayer({ id: 'bat_win', name: 'Champion Opener', runs: 85, balls: 38, fours: 8, sixes: 5 }),
        createMockPlayer({ id: 'bat_win2', name: 'Partner', runs: 40, balls: 22 }),
      ],
      bowlers: [createMockBowler({ name: 'Opp Bowler', wickets: 1, runs: 40, ballsBowled: 24 })],
    });

    const inn2 = createMockInnings({
      team: 'Warriors',
      bowlingTeam: 'Titans',
      totalRuns: 110,
      totalBalls: 60,
      players: [createMockPlayer({ name: 'Chaser', runs: 30, balls: 25 })],
      bowlers: [createMockBowler({ name: 'Titan Bowler', wickets: 2, runs: 25, ballsBowled: 24 })],
    });

    const match = createCompletedMatch({
      winner: 'Titans',
      loser: 'Warriors',
      result: 'Titans won by 50 runs',
      firstInnings: inn1,
      secondInnings: inn2,
    });

    const result = ManOfTheMatchEngine.resolveForMatch(match);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Champion Opener');
    expect(result!.role).toBe('Batsman');
    expect(result!.breakdown?.battingImpact).toBeGreaterThan(50);
    expect(result!.breakdown?.resultImpact).toBeGreaterThan(5);
    expect(result!.finalScore).toBeGreaterThan(80);
  });

  // ── 2. A High-Scoring Batter on the Losing Team (Lone Warrior) ──
  it('2. Awards a heroic high-scoring batter on the losing team when their performance vastly dominates the match', () => {
    // Lone Warrior scores 72 out of 85 (85% of team total!) in 10-over match
    const inn1 = createMockInnings({
      team: 'Lions',
      bowlingTeam: 'Tigers',
      totalRuns: 90,
      totalWickets: 4,
      totalBalls: 60,
      players: [createMockPlayer({ name: 'Average Batter', runs: 28, balls: 22 })],
    });

    const inn2 = createMockInnings({
      team: 'Tigers',
      bowlingTeam: 'Lions',
      totalRuns: 85,
      totalWickets: 8,
      totalBalls: 60,
      players: [
        createMockPlayer({
          id: 'lone_hero',
          name: 'Lone Warrior',
          runs: 72,
          balls: 32,
          fours: 7,
          sixes: 4,
          isDismissed: true,
        }),
      ],
    });

    const match = createCompletedMatch({
      winner: 'Lions',
      loser: 'Tigers',
      result: 'Lions won by 5 runs',
      firstInnings: inn1,
      secondInnings: inn2,
    });

    const result = ManOfTheMatchEngine.resolveForMatch(match);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Lone Warrior');
    expect(result!.team).toBe('Tigers');
    expect(result!.reason).toContain('solo performance');
  });

  // ── 3. A Bowler with Match-Changing Wicket-Taking Performance ──
  it('3. Selects a bowler with a match-changing wicket haul over modest batting performances', () => {
    const inn1 = createMockInnings({
      team: 'Hawks',
      bowlingTeam: 'Eagles',
      totalRuns: 70,
      totalWickets: 9,
      totalBalls: 60,
      players: [createMockPlayer({ name: 'Hawk Batter', runs: 20, balls: 18 })],
      bowlers: [
        createMockBowler({
          id: 'wkt_destroyer',
          name: 'Wicket Destroyer',
          wickets: 4,
          runs: 10,
          ballsBowled: 24,
          maidens: 1,
        }),
      ],
    });

    const inn2 = createMockInnings({
      team: 'Eagles',
      bowlingTeam: 'Hawks',
      totalRuns: 72,
      totalWickets: 2,
      totalBalls: 45,
      players: [createMockPlayer({ name: 'Eagle Chaser', runs: 26, balls: 20 })],
    });

    const match = createCompletedMatch({
      winner: 'Eagles',
      loser: 'Hawks',
      result: 'Eagles won by 8 wickets',
      firstInnings: inn1,
      secondInnings: inn2,
    });

    const result = ManOfTheMatchEngine.resolveForMatch(match);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Wicket Destroyer');
    expect(result!.role).toBe('Bowler');
    expect(result!.wickets).toBe(4);
    expect(result!.breakdown?.bowlingImpact).toBeGreaterThan(50);
  });

  // ── 4. A Player with Strong Batting and Bowling Contributions ──
  it('4. Rewards a genuine all-rounder whose combined contributions exceed single-discipline performances without penalty', () => {
    // All-rounder scores 36 off 18 balls AND takes 2 wickets for 14 runs in 2 overs
    const allRounderBat = createMockPlayer({
      id: 'ar_hero',
      name: 'Dynamic AllRounder',
      runs: 36,
      balls: 18,
      fours: 4,
      sixes: 2,
      isDismissed: false,
    });

    const allRounderBowl = createMockBowler({
      id: 'ar_hero',
      name: 'Dynamic AllRounder',
      wickets: 2,
      runs: 14,
      ballsBowled: 12,
    });

    const inn1 = createMockInnings({
      team: 'Riders',
      bowlingTeam: 'Knights',
      totalRuns: 95,
      totalBalls: 60,
      players: [createMockPlayer({ name: 'Pure Batter Opp', runs: 40, balls: 30 })],
      bowlers: [allRounderBowl, createMockBowler({ name: 'Other Bowler', wickets: 1, runs: 30, ballsBowled: 18 })],
    });

    const inn2 = createMockInnings({
      team: 'Knights',
      bowlingTeam: 'Riders',
      totalRuns: 98,
      totalBalls: 52,
      players: [allRounderBat, createMockPlayer({ name: 'Partner Batter', runs: 25, balls: 20 })],
      bowlers: [],
    });

    const match = createCompletedMatch({
      winner: 'Knights',
      loser: 'Riders',
      result: 'Knights won by 5 wickets',
      firstInnings: inn1,
      secondInnings: inn2,
    });

    const result = ManOfTheMatchEngine.resolveForMatch(match);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Dynamic AllRounder');
    expect(result!.role).toBe('All-rounder');
    expect(result!.battingPoints).toBeGreaterThan(0);
    expect(result!.bowlingPoints).toBeGreaterThan(0);
    expect(result!.breakdown?.battingImpact).toBeGreaterThan(0);
    expect(result!.breakdown?.bowlingImpact).toBeGreaterThan(0);
    expect(result!.runs).toBe(36);
    expect(result!.wickets).toBe(2);
  });

  // ── 5. A Player with High Strike Rate from Very Few Balls ──
  it('5. Dampens extreme strike rates from very few balls to prevent small samples from unfairly winning MOTM', () => {
    // 10-over match:
    // Player A: 14 runs off 3 balls (SR 466.7, 2x6)
    // Player B: 60 runs off 30 balls (SR 200.0, 6x4, 3x6)
    const inn1 = createMockInnings({
      team: 'Blast XI',
      bowlingTeam: 'Field XI',
      totalRuns: 130,
      totalBalls: 60,
      players: [
        createMockPlayer({ id: 'cameo', name: 'Cameo Hitter', runs: 14, balls: 3, fours: 0, sixes: 2 }),
        createMockPlayer({ id: 'main_scorer', name: 'Main Scorer', runs: 60, balls: 30, fours: 6, sixes: 3 }),
      ],
    });

    const inn2 = createMockInnings({
      team: 'Field XI',
      bowlingTeam: 'Blast XI',
      totalRuns: 100,
      totalBalls: 60,
    });

    const match = createCompletedMatch({
      winner: 'Blast XI',
      loser: 'Field XI',
      result: 'Blast XI won by 30 runs',
      firstInnings: inn1,
      secondInnings: inn2,
    });

    const evaluation = ManOfTheMatchEngine.evaluateMatch(match);
    expect(evaluation).not.toBeNull();
    expect(evaluation!.manOfTheMatch.playerName).toBe('Main Scorer');

    const cameo = evaluation!.allCandidates.find((c) => c.playerName === 'Cameo Hitter');
    const main = evaluation!.allCandidates.find((c) => c.playerName === 'Main Scorer');
    expect(main!.finalScore).toBeGreaterThan(cameo!.finalScore + 30);
  });

  // ── 6. Deterministic Tie-Breaking Between Two Players ──
  it('6. Deterministically breaks exact statistical ties with complete consistency', () => {
    const inn1 = createMockInnings({
      team: 'Dragons',
      bowlingTeam: 'Panthers',
      totalRuns: 110,
      players: [
        createMockPlayer({ id: 'p_adam', name: 'Adam Gilchrist', runs: 50, balls: 25, fours: 5, sixes: 2 }),
        createMockPlayer({ id: 'p_brian', name: 'Brian Lara', runs: 50, balls: 25, fours: 5, sixes: 2 }),
      ],
    });

    const inn2 = createMockInnings({
      team: 'Panthers',
      bowlingTeam: 'Dragons',
      totalRuns: 90,
    });

    const match = createCompletedMatch({
      winner: 'Dragons',
      loser: 'Panthers',
      firstInnings: inn1,
      secondInnings: inn2,
    });

    const res1 = ManOfTheMatchEngine.resolveForMatch({ ...match, mom: undefined, momStats: undefined });
    const res2 = ManOfTheMatchEngine.resolveForMatch({ ...match, mom: undefined, momStats: undefined });

    expect(res1).not.toBeNull();
    expect(res2).not.toBeNull();
    expect(res1!.name).toBe(res2!.name);
    // Alphabetical tie-breaker: Adam Gilchrist precedes Brian Lara
    expect(res1!.name).toBe('Adam Gilchrist');
  });

  // ── 7. Missing or Incomplete Statistics ──
  it('7. Handles missing statistics, diamond ducks, and unrecorded bowling without NaN or crashes', () => {
    const inn1 = createMockInnings({
      team: 'Team A',
      bowlingTeam: 'Team B',
      totalRuns: 20,
      players: [
        createMockPlayer({ name: 'Diamond Duck', runs: 0, balls: 0, isDismissed: true, dismissalType: 'Run Out' }),
        createMockPlayer({ name: 'Normal Batter', runs: 20, balls: 15 }),
      ],
      bowlers: [
        createMockBowler({ name: 'Unbowled Bowler', ballsBowled: 0, runs: 0, wickets: 0 }),
      ],
    });

    const evaluation = ManOfTheMatchEngine.evaluateMatch(inn1, undefined, { totalOvers: 5 });
    expect(evaluation).not.toBeNull();
    for (const c of evaluation!.allCandidates) {
      expect(Number.isNaN(c.finalScore)).toBe(false);
      expect(Number.isNaN(c.baseScore)).toBe(false);
    }
  });

  // ── 8. Duplicate Player Names with Different Player IDs ──
  it('8. Isolates two distinct players on the same team who share identical names but have different player IDs', () => {
    const inn1 = createMockInnings({
      team: 'United',
      bowlingTeam: 'City',
      totalRuns: 80,
      players: [
        createMockPlayer({ id: 'player_senior', name: 'Mohammad Ali', runs: 45, balls: 22 }),
        createMockPlayer({ id: 'player_junior', name: 'Mohammad Ali', runs: 20, balls: 12 }),
      ],
    });

    const inn2 = createMockInnings({
      team: 'City',
      bowlingTeam: 'United',
      totalRuns: 70,
    });

    const match = createCompletedMatch({
      winner: 'United',
      firstInnings: inn1,
      secondInnings: inn2,
    });

    const evaluation = ManOfTheMatchEngine.evaluateMatch(match);
    expect(evaluation).not.toBeNull();
    const alis = evaluation!.allCandidates.filter((c) => c.playerName === 'Mohammad Ali');
    expect(alis.length).toBe(2);
    expect(alis.some((a) => a.playerId === 'player_senior' && a.stats.runs === 45)).toBe(true);
    expect(alis.some((a) => a.playerId === 'player_junior' && a.stats.runs === 20)).toBe(true);
  });

  // ── 9. Match Statistics Change After Initial MOTM Calculation ──
  it('9. Automatically recalculates and invalidates stale cached MOTM when scorecard data is modified', () => {
    const inn1 = createMockInnings({
      team: 'Strikers',
      bowlingTeam: 'Stars',
      totalRuns: 80,
      players: [createMockPlayer({ id: 'bat_1', name: 'Initial Winner', runs: 45, balls: 25 })],
      bowlers: [createMockBowler({ id: 'bowl_opp', name: 'Opp Bowler', wickets: 1, runs: 25, ballsBowled: 18 })],
    });

    const inn2 = createMockInnings({
      team: 'Stars',
      bowlingTeam: 'Strikers',
      totalRuns: 60,
      players: [createMockPlayer({ name: 'Chaser', runs: 20, balls: 18 })],
      bowlers: [createMockBowler({ id: 'bowl_striker', name: 'Striker Bowler', wickets: 1, runs: 20, ballsBowled: 18 })],
    });

    const match = createCompletedMatch({
      winner: 'Strikers',
      loser: 'Stars',
      firstInnings: inn1,
      secondInnings: inn2,
    });

    // 1. Initial resolution awards 'Initial Winner'
    const initial = ManOfTheMatchEngine.resolveForMatch(match);
    expect(initial?.name).toBe('Initial Winner');

    // 2. Scorecard post-match edit: Striker Bowler actually took 5 wickets for 10 runs!
    match.secondInnings!.bowlers![0].wickets = 5;
    match.secondInnings!.bowlers![0].runs = 10;

    // 3. Resolve without forcing recalculate; scorecard hash inconsistency must trigger recalculation
    const updated = ManOfTheMatchEngine.resolveForMatch(match);
    expect(updated?.name).toBe('Striker Bowler');
    expect(match.mom).toBe('Striker Bowler');
    expect(match.momStats?.name).toBe('Striker Bowler');
  });

  // ── 10. DLS-Adjusted Match ──
  it('10. Correctly evaluates a DLS-revised rain-shortened match using revised overs and target', () => {
    const inn1 = createMockInnings({
      team: 'Rain Team A',
      bowlingTeam: 'Rain Team B',
      totalRuns: 120,
      totalBalls: 60,
      players: [createMockPlayer({ name: 'Opener A', runs: 50, balls: 24 })],
    });

    const inn2 = createMockInnings({
      team: 'Rain Team B',
      bowlingTeam: 'Rain Team A',
      totalRuns: 70,
      totalBalls: 30, // 5 overs bowled
      players: [createMockPlayer({ name: 'DLS Chaser', runs: 45, balls: 18, isDismissed: false })],
    });

    const match = createCompletedMatch({
      totalOvers: 10,
      winner: 'Rain Team B',
      result: 'Rain Team B won by 5 wickets (DLS method)',
      firstInnings: inn1,
      secondInnings: inn2,
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
        dlsApplied: true,
        dlsRevisedOvers: 5,
        dlsRevisedTarget: 68,
      },
    });

    const evaluation = ManOfTheMatchEngine.evaluateMatch(match);
    expect(evaluation).not.toBeNull();
    expect(evaluation!.matchMetadata.actualOvers).toBe(5);
    expect(evaluation!.matchMetadata.isReduced).toBe(true);
    expect(evaluation!.manOfTheMatch.playerName).toBe('DLS Chaser');
  });

  // ── 11. Abandoned, Incomplete, or Cancelled Match ──
  it('11. Refuses to award MOTM for abandoned, in-progress, or no-result matches', () => {
    const abandonedMatch = createCompletedMatch({
      status: 'ABANDONED',
      result: 'Match Abandoned due to rain',
      resultType: 'NO_RESULT',
    });
    expect(ManOfTheMatchEngine.resolveForMatch(abandonedMatch)).toBeNull();

    const ongoingMatch = createCompletedMatch({
      status: 'ONGOING',
      result: 'Match in progress',
    });
    expect(ManOfTheMatchEngine.resolveForMatch(ongoingMatch)).toBeNull();
  });

  // ── 12. Innings Containing Extras and Run-Outs ──
  it('12. Accurately segregates extras from player scores and credits run-outs to the correct fielders', () => {
    const inn1 = createMockInnings({
      team: 'Batting Side',
      bowlingTeam: 'Fielding Side',
      totalRuns: 105,
      wideRuns: 4,
      nbRuns: 1,
      byeRuns: 0,
      lbRuns: 0,
      players: [
        createMockPlayer({ id: 'b1', name: 'Batter 1', runs: 50, balls: 25 }),
        createMockPlayer({ id: 'b2', name: 'Batter 2', runs: 50, balls: 25, isDismissed: true, dismissalType: 'Run Out', fielderName: 'Ace Fielder' }),
      ],
      bowlers: [
        createMockBowler({ id: 'f1', name: 'Bowler 1', wickets: 0, runs: 105, ballsBowled: 60 }),
      ],
    });

    const inn2 = createMockInnings({
      team: 'Fielding Side',
      bowlingTeam: 'Batting Side',
      totalRuns: 80,
      players: [createMockPlayer({ id: 'ace', name: 'Ace Fielder', runs: 20, balls: 15 })],
    });

    const match = createCompletedMatch({
      winner: 'Batting Side',
      firstInnings: inn1,
      secondInnings: inn2,
    });

    const evaluation = ManOfTheMatchEngine.evaluateMatch(match);
    expect(evaluation).not.toBeNull();
    const ace = evaluation!.allCandidates.find((c) => c.playerName === 'Ace Fielder');
    expect(ace).toBeDefined();
    expect(ace!.stats.runOuts).toBe(1);
    expect(ace!.breakdown.fieldingImpact).toBeGreaterThan(0);
  });

  // ── 13. REGRESSION TEST: HUNGRY XL vs PALASH ──
  describe('13. Real Match Regression Test: HUNGRY XL vs PALASH (10 overs)', () => {
    it('selects TAIMUR as MOTM over MAMUN and ALAMIN and resolves the 1-run extras discrepancy', async () => {
      // 1st Innings: HUNGRY XL batting (155/2 in 10 overs)
      // Batters: RIYAD 37(13), TAIMUR 73*(27), SOYKOT 31(17), RATUL 13*(4)
      // Sum = 154 runs off bat + 1 wide extra = 155 team total runs!
      const inn1 = createMockInnings({
        inningsNumber: 1,
        team: 'HUNGRY XL',
        bowlingTeam: 'PALASH',
        totalRuns: 155,
        totalWickets: 2,
        totalBalls: 60,
        oversString: '10.0',
        wideRuns: 1,
        players: [
          createMockPlayer({ id: 'h_riyad', name: 'RIYAD', runs: 37, balls: 13, fours: 4, sixes: 3, isDismissed: true }),
          createMockPlayer({ id: 'h_taimur', name: 'TAIMUR', runs: 73, balls: 27, fours: 6, sixes: 6, isDismissed: false }),
          createMockPlayer({ id: 'h_soykot', name: 'SOYKOT', runs: 31, balls: 17, fours: 3, sixes: 2, isDismissed: true }),
          createMockPlayer({ id: 'h_ratul', name: 'RATUL', runs: 13, balls: 4, fours: 1, sixes: 1, isDismissed: false }),
        ],
        bowlers: [
          createMockBowler({ id: 'p_alamin', name: 'ALAMIN', ballsBowled: 12, runs: 20, wickets: 0 }),
          createMockBowler({ id: 'p_yasin', name: 'YASIN', ballsBowled: 12, runs: 35, wickets: 1 }),
          createMockBowler({ id: 'p_pronoy', name: 'PRONOY', ballsBowled: 12, runs: 29, wickets: 0 }),
          createMockBowler({ id: 'p_emdat', name: 'EMDAT', ballsBowled: 12, runs: 28, wickets: 1 }),
          createMockBowler({ id: 'p_dino', name: 'DINO', ballsBowled: 6, runs: 18, wickets: 0 }),
          createMockBowler({ id: 'p_fahad', name: 'FAHAD', ballsBowled: 6, runs: 25, wickets: 0 }),
        ],
      });

      // 2nd Innings: PALASH batting (136/0 in 10 overs, chasing 156)
      // Batters: ALAMIN 75*(35), MAMUN 61*(25) -> Sum = 136 runs
      const inn2 = createMockInnings({
        inningsNumber: 2,
        team: 'PALASH',
        bowlingTeam: 'HUNGRY XL',
        totalRuns: 136,
        totalWickets: 0,
        totalBalls: 60,
        oversString: '10.0',
        players: [
          createMockPlayer({ id: 'p_alamin', name: 'ALAMIN', runs: 75, balls: 35, fours: 8, sixes: 4, isDismissed: false }),
          createMockPlayer({ id: 'p_mamun', name: 'MAMUN', runs: 61, balls: 25, fours: 6, sixes: 4, isDismissed: false }),
        ],
        bowlers: [
          createMockBowler({ id: 'h_chhium', name: 'CHHIUM', ballsBowled: 12, runs: 30, wickets: 0 }),
          createMockBowler({ id: 'h_riyad', name: 'RIYAD', ballsBowled: 12, runs: 18, wickets: 0 }),
          createMockBowler({ id: 'h_taimur', name: 'TAIMUR', ballsBowled: 12, runs: 15, wickets: 0 }),
          createMockBowler({ id: 'h_ratul', name: 'RATUL', ballsBowled: 12, runs: 39, wickets: 0 }),
          createMockBowler({ id: 'h_nayem', name: 'Nayem', ballsBowled: 6, runs: 12, wickets: 0 }),
          createMockBowler({ id: 'h_nobikul', name: 'NOBIKUL', ballsBowled: 6, runs: 22, wickets: 0 }),
        ],
      });

      const match = createCompletedMatch({
        teamA: 'HUNGRY XL',
        teamB: 'PALASH',
        winner: 'HUNGRY XL',
        loser: 'PALASH',
        result: 'HUNGRY XL won by 19 runs',
        totalOvers: 10,
        targetScore: 156,
        firstInnings: inn1,
        secondInnings: inn2,
      });

      const result = ManOfTheMatchEngine.resolveForMatch(match);
      expect(result).not.toBeNull();

      // 1. TAIMUR must be selected as Man of the Match!
      expect(result!.name).toBe('TAIMUR');
      expect(result!.team).toBe('HUNGRY XL');
      expect(result!.role).toBe('All-rounder');
      expect(result!.runs).toBe(73);
      expect(result!.wickets).toBe(0);
      expect(result!.bowlingRuns).toBe(15);
      expect(result!.ballsBowled).toBe(12);

      // 2. Verified candidates hierarchy
      const evaluation = ManOfTheMatchEngine.evaluateMatch(match);
      expect(evaluation).not.toBeNull();
      const taimurCand = evaluation!.allCandidates.find((c) => c.playerName === 'TAIMUR');
      const alaminCand = evaluation!.allCandidates.find((c) => c.playerName === 'ALAMIN');
      const mamunCand = evaluation!.allCandidates.find((c) => c.playerName === 'MAMUN');

      expect(taimurCand).toBeDefined();
      expect(alaminCand).toBeDefined();
      expect(mamunCand).toBeDefined();

      // TAIMUR beats both ALAMIN and MAMUN
      expect(taimurCand!.finalScore).toBeGreaterThan(alaminCand!.finalScore);
      expect(taimurCand!.finalScore).toBeGreaterThan(mamunCand!.finalScore);
      // ALAMIN beats MAMUN (75 runs + 2 overs vs 61 runs + 0 overs)
      expect(alaminCand!.finalScore).toBeGreaterThan(mamunCand!.finalScore);

      // 3. UI and PDF Consistency: Verify PDF and HTML generation reflect the exact authoritative MOTM
      const pdf = await ScorecardPdfGenerator.generatePdf(match);
      expect(pdf).toBeDefined();
      expect(match.mom).toBe('TAIMUR');
      expect(match.momStats?.name).toBe('TAIMUR');
      expect(match.momStats?.finalScore).toBe(taimurCand!.finalScore);

      const html = ScorecardHtmlGenerator.generateHtml(match);
      expect(html).toContain('TAIMUR');
      expect(html).toContain('MAN OF THE MATCH');
    });
  });
});
