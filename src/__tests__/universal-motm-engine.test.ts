import { describe, it, expect } from 'vitest';
import {
  ManOfTheMatchEngine,
  UniversalMotmResult,
  MotmOptions,
} from '../domain/cricket/analytics/ManOfTheMatchEngine';
import { InningsData, Player, Bowler, MatchScorecard } from '../domain/cricket/types';

// Helper to construct mock Player
function createMockPlayer(overrides: Partial<Player>): Player {
  return {
    id: overrides.id || `p_${Math.random().toString(36).substring(2, 6)}`,
    name: overrides.name || 'Player Name',
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

// Helper to construct mock Bowler
function createMockBowler(overrides: Partial<Bowler>): Bowler {
  return {
    id: overrides.id || `b_${Math.random().toString(36).substring(2, 6)}`,
    name: overrides.name || 'Bowler Name',
    ballsBowled: overrides.ballsBowled ?? 0,
    maidens: overrides.maidens ?? 0,
    runs: overrides.runs ?? 0,
    wickets: overrides.wickets ?? 0,
    overHistory: overrides.overHistory || [],
  };
}

// Helper to construct mock InningsData
function createMockInnings(overrides: Partial<InningsData>): InningsData {
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
    currentBowlerIdx: 0,
    nextPlayerIdx: 2,
    lastCompletedOverBowlerIdx: -1,
    isOverComplete: false,
    isFreeHit: false,
  };
}

describe('Universal AI Man of the Match Engine', () => {
  // ── DYNAMIC PHASES & BENCHMARKS ──
  describe('Dynamic Phases and Benchmarks Scaling', () => {
    it('calculates dynamic phases by ball percentages for 5, 10, and 20 overs', () => {
      // 5 overs = 30 balls
      // Powerplay: 0% -> 30% (balls 1 to 9)
      // Middle: 30% -> 75% (balls 10 to 22)
      // Death: 75% -> 100% (balls 23 to 30)
      expect(ManOfTheMatchEngine.getMatchPhase(5, 5)).toBe('Powerplay');
      expect(ManOfTheMatchEngine.getMatchPhase(9, 5)).toBe('Powerplay');
      expect(ManOfTheMatchEngine.getMatchPhase(15, 5)).toBe('Middle');
      expect(ManOfTheMatchEngine.getMatchPhase(22, 5)).toBe('Middle');
      expect(ManOfTheMatchEngine.getMatchPhase(25, 5)).toBe('Death');

      // 10 overs = 60 balls
      // PP: 1 to 18, Middle: 19 to 45, Death: 46 to 60
      expect(ManOfTheMatchEngine.getMatchPhase(12, 10)).toBe('Powerplay');
      expect(ManOfTheMatchEngine.getMatchPhase(30, 10)).toBe('Middle');
      expect(ManOfTheMatchEngine.getMatchPhase(50, 10)).toBe('Death');

      // 20 overs = 120 balls
      // PP: 1 to 36, Middle: 37 to 90, Death: 91 to 120
      expect(ManOfTheMatchEngine.getMatchPhase(20, 20)).toBe('Powerplay');
      expect(ManOfTheMatchEngine.getMatchPhase(70, 20)).toBe('Middle');
      expect(ManOfTheMatchEngine.getMatchPhase(100, 20)).toBe('Death');
    });

    it('adapts benchmarks dynamically according to actual match length without hard-coded 20 overs', () => {
      const bench5 = ManOfTheMatchEngine.getBenchmarks(5);
      const bench10 = ManOfTheMatchEngine.getBenchmarks(10);
      const bench20 = ManOfTheMatchEngine.getBenchmarks(20);
      const bench50 = ManOfTheMatchEngine.getBenchmarks(50);

      // In shorter matches, par scoring rate is higher, benchmark runs are lower
      expect(bench5.parRunRate).toBeGreaterThan(bench20.parRunRate);
      expect(bench5.benchmarkRuns).toBeLessThan(bench20.benchmarkRuns);
      expect(bench5.benchmarkWickets).toBeLessThan(bench20.benchmarkWickets);
      expect(bench50.benchmarkRuns).toBe(100);
      expect(bench5.bowlerQuota).toBe(1);
      expect(bench10.bowlerQuota).toBe(2);
      expect(bench20.bowlerQuota).toBe(4);
    });
  });

  // ── TEST 1: 5-OVER MATCH ──
  describe('Test 1: 5-Over Match', () => {
    it('properly evaluates impact in a 5-over match', () => {
      // 5-over match: Team A 48/3, Team B 42/4. Team A won by 6 runs.
      // Batter X scored 28 off 12 balls (SR 233, 3x4, 2x6) for Team A.
      const inn1 = createMockInnings({
        team: 'Dhaka',
        bowlingTeam: 'Sylhet',
        totalRuns: 48,
        totalWickets: 3,
        totalBalls: 30,
        players: [
          createMockPlayer({ name: 'Tamim', runs: 28, balls: 12, fours: 3, sixes: 2 }),
          createMockPlayer({ name: 'Shanto', runs: 12, balls: 10 }),
        ],
        bowlers: [
          createMockBowler({ name: 'Taskin', ballsBowled: 6, runs: 12, wickets: 1 }),
        ],
      });

      const inn2 = createMockInnings({
        team: 'Sylhet',
        bowlingTeam: 'Dhaka',
        totalRuns: 42,
        totalWickets: 4,
        totalBalls: 30,
        players: [
          createMockPlayer({ name: 'Zakir', runs: 18, balls: 14 }),
        ],
        bowlers: [
          createMockBowler({ name: 'Mustafizur', ballsBowled: 6, runs: 6, wickets: 2 }),
        ],
      });

      const result = ManOfTheMatchEngine.evaluateMatch(inn1, inn2, {
        totalOvers: 5,
        winner: 'Dhaka',
        loser: 'Sylhet',
        result: 'Dhaka won by 6 runs',
      });

      expect(result).not.toBeNull();
      // In 5 overs, 2/6 in 1 over (defending at death) or 28 off 12 (58% of team runs) are elite
      expect(['Mustafizur', 'Tamim']).toContain(result!.manOfTheMatch.playerName);
      expect(result!.matchMetadata.actualOvers).toBe(5);
      expect(result!.manOfTheMatch.finalScore).toBeGreaterThan(70);
    });
  });

  // ── TEST 2: 6-OVER MATCH ──
  describe('Test 2: 6-Over Match', () => {
    it('normalizes appropriately for a 6-over match', () => {
      const inn1 = createMockInnings({
        team: 'Riders',
        bowlingTeam: 'Vikings',
        totalRuns: 65,
        totalWickets: 2,
        totalBalls: 36,
        players: [
          createMockPlayer({ name: 'Rony', runs: 38, balls: 18, fours: 4, sixes: 2 }),
        ],
      });
      const inn2 = createMockInnings({
        team: 'Vikings',
        bowlingTeam: 'Riders',
        totalRuns: 50,
        totalWickets: 5,
        totalBalls: 36,
        players: [
          createMockPlayer({ name: 'Yasir', runs: 20, balls: 15 }),
        ],
        bowlers: [
          createMockBowler({ name: 'Hasan', ballsBowled: 12, runs: 11, wickets: 3 }),
        ],
      });

      const result = ManOfTheMatchEngine.evaluateMatch(inn1, inn2, {
        totalOvers: 6,
        winner: 'Riders',
        loser: 'Vikings',
      });

      expect(result).not.toBeNull();
      // Hasan with 3 wickets in 2 overs (3/11) should be crowned or top contender
      expect(result!.manOfTheMatch.playerName).toBe('Hasan');
      expect(result!.matchMetadata.actualOvers).toBe(6);
    });
  });

  // ── TEST 3: 10-OVER MATCH ──
  describe('Test 3: 10-Over Match', () => {
    it('adapts benchmarks and evaluates 10-over game', () => {
      const inn1 = createMockInnings({
        team: 'Titans',
        bowlingTeam: 'Kings',
        totalRuns: 95,
        totalWickets: 4,
        totalBalls: 60,
        players: [
          createMockPlayer({ name: 'Mahmudullah', runs: 45, balls: 22, fours: 4, sixes: 3 }),
        ],
      });
      const inn2 = createMockInnings({
        team: 'Kings',
        bowlingTeam: 'Titans',
        totalRuns: 80,
        totalWickets: 6,
        totalBalls: 60,
        bowlers: [
          createMockBowler({ name: 'Taijul', ballsBowled: 12, runs: 14, wickets: 2 }),
        ],
      });

      const result = ManOfTheMatchEngine.evaluateMatch(inn1, inn2, {
        totalOvers: 10,
        winner: 'Titans',
      });

      expect(result).not.toBeNull();
      expect(result!.manOfTheMatch.playerName).toBe('Mahmudullah');
      expect(result!.matchMetadata.actualOvers).toBe(10);
      expect(result!.breakdown.battingImpact).toBeGreaterThan(30);
    });
  });

  // ── TEST 4: 15-OVER MATCH ──
  describe('Test 4: 15-Over Match', () => {
    it('adapts benchmarks for a 15-over game', () => {
      const inn1 = createMockInnings({
        team: 'Comilla',
        bowlingTeam: 'Barishal',
        totalRuns: 130,
        totalWickets: 5,
        totalBalls: 90,
        players: [
          createMockPlayer({ name: 'Litton', runs: 58, balls: 32, fours: 6, sixes: 2 }),
        ],
      });
      const inn2 = createMockInnings({
        team: 'Barishal',
        bowlingTeam: 'Comilla',
        totalRuns: 110,
        totalWickets: 8,
        totalBalls: 90,
      });

      const result = ManOfTheMatchEngine.evaluateMatch(inn1, inn2, {
        totalOvers: 15,
        winner: 'Comilla',
      });

      expect(result).not.toBeNull();
      expect(result!.manOfTheMatch.playerName).toBe('Litton');
      expect(result!.matchMetadata.actualOvers).toBe(15);
    });
  });

  // ── TEST 5: 20-OVER MATCH ──
  describe('Test 5: 20-Over Match', () => {
    it('properly handles standard 20-over match', () => {
      const inn1 = createMockInnings({
        team: 'Sixers',
        bowlingTeam: 'Stars',
        totalRuns: 175,
        totalWickets: 6,
        totalBalls: 120,
        players: [
          createMockPlayer({ name: 'Hales', runs: 72, balls: 45, fours: 7, sixes: 4 }),
        ],
      });
      const inn2 = createMockInnings({
        team: 'Stars',
        bowlingTeam: 'Sixers',
        totalRuns: 150,
        totalWickets: 8,
        totalBalls: 120,
      });

      const result = ManOfTheMatchEngine.evaluateMatch(inn1, inn2, {
        totalOvers: 20,
        winner: 'Sixers',
      });

      expect(result).not.toBeNull();
      expect(result!.manOfTheMatch.playerName).toBe('Hales');
      expect(result!.matchMetadata.actualOvers).toBe(20);
    });
  });

  // ── TEST 6: LOW-SCORING MATCH ──
  describe('Test 6: Low-Scoring Match', () => {
    it('heavily values bowling and gritty batting on a difficult pitch', () => {
      // 20-over match where Team A made 88 all out, Team B made 89/7 in 19 overs.
      // Bowler Nasum took 4/14 in 4 overs to bundle out Team A.
      const inn1 = createMockInnings({
        team: 'Challengers',
        bowlingTeam: 'Dynamites',
        totalRuns: 88,
        totalWickets: 10,
        totalBalls: 108,
      });

      const inn2 = createMockInnings({
        team: 'Dynamites',
        bowlingTeam: 'Challengers',
        totalRuns: 89,
        totalWickets: 7,
        totalBalls: 114,
        bowlers: [
          createMockBowler({ name: 'Nasum', ballsBowled: 24, runs: 14, wickets: 4, maidens: 1 }),
        ],
        players: [
          createMockPlayer({ name: 'Afif', runs: 32, balls: 38 }),
        ],
      });

      const result = ManOfTheMatchEngine.evaluateMatch(inn1, inn2, {
        totalOvers: 20,
        winner: 'Dynamites',
      });

      expect(result).not.toBeNull();
      expect(result!.manOfTheMatch.playerName).toBe('Nasum');
      expect(result!.manOfTheMatch.finalScore).toBeGreaterThan(80);
    });
  });

  // ── TEST 7: HIGH-SCORING MATCH ──
  describe('Test 7: High-Scoring Match', () => {
    it('rewards high strike rate and boundary destruction over slow volume', () => {
      // 220 vs 215. Player A made 65 off 28 (SR 232). Player B made 60 off 50 (SR 120).
      const inn1 = createMockInnings({
        team: 'Blasters',
        bowlingTeam: 'Strikers',
        totalRuns: 220,
        totalWickets: 3,
        totalBalls: 120,
        players: [
          createMockPlayer({ name: 'Russell', runs: 65, balls: 28, fours: 5, sixes: 6 }),
          createMockPlayer({ name: 'SlowBatter', runs: 60, balls: 50, fours: 4, sixes: 1 }),
        ],
      });

      const inn2 = createMockInnings({
        team: 'Strikers',
        bowlingTeam: 'Blasters',
        totalRuns: 205,
        totalWickets: 6,
        totalBalls: 120,
      });

      const result = ManOfTheMatchEngine.evaluateMatch(inn1, inn2, {
        totalOvers: 20,
        winner: 'Blasters',
      });

      expect(result).not.toBeNull();
      expect(result!.manOfTheMatch.playerName).toBe('Russell');
      expect(result!.manOfTheMatch.finalScore).toBeGreaterThan(
        result!.allCandidates.find((c) => c.playerName === 'SlowBatter')!.finalScore
      );
    });
  });

  // ── TEST 8: SUCCESSFUL CHASE ──
  describe('Test 8: Successful Chase', () => {
    it('rewards unbeaten finisher steering high-pressure chase to victory', () => {
      const inn1 = createMockInnings({
        team: 'Defenders',
        bowlingTeam: 'Chasers',
        totalRuns: 165,
        totalWickets: 5,
        totalBalls: 120,
      });

      const inn2 = createMockInnings({
        team: 'Chasers',
        bowlingTeam: 'Defenders',
        totalRuns: 168,
        totalWickets: 4,
        totalBalls: 118,
        players: [
          // Finisher remained not out on 54* off 30 balls
          createMockPlayer({
            name: 'Towhid Hridoy',
            runs: 54,
            balls: 30,
            fours: 4,
            sixes: 3,
            isDismissed: false,
          }),
        ],
      });

      const result = ManOfTheMatchEngine.evaluateMatch(inn1, inn2, {
        totalOvers: 20,
        winner: 'Chasers',
        result: 'Chasers won by 6 wickets',
      });

      expect(result).not.toBeNull();
      expect(result!.manOfTheMatch.playerName).toBe('Towhid Hridoy');
      expect(result!.manOfTheMatch.finalScore).toBeGreaterThan(80);
      expect(result!.breakdown.pressureImpact).toBeGreaterThan(5);
    });
  });

  // ── TEST 9: SUCCESSFUL DEFENCE ──
  describe('Test 9: Successful Defence', () => {
    it('awards bowler defending small total and delivering in death overs', () => {
      const inn1 = createMockInnings({
        team: 'Warriors',
        bowlingTeam: 'Titans',
        totalRuns: 135,
        totalWickets: 8,
        totalBalls: 120,
      });

      const inn2 = createMockInnings({
        team: 'Titans',
        bowlingTeam: 'Warriors',
        totalRuns: 128,
        totalWickets: 7,
        totalBalls: 120,
        bowlers: [
          createMockBowler({
            name: 'Shoriful Islam',
            ballsBowled: 24,
            runs: 18,
            wickets: 3,
            maidens: 1,
          }),
        ],
      });

      const result = ManOfTheMatchEngine.evaluateMatch(inn1, inn2, {
        totalOvers: 20,
        winner: 'Warriors',
        result: 'Warriors won by 7 runs',
      });

      expect(result).not.toBeNull();
      expect(result!.manOfTheMatch.playerName).toBe('Shoriful Islam');
      expect(result!.breakdown.bowlingImpact).toBeGreaterThan(45);
    });
  });

  // ── TEST 10: ALL-ROUNDER PERFORMANCE ──
  describe('Test 10: All-Rounder Performance', () => {
    it('rewards all-rounder contributing with both bat and ball over single-discipline players', () => {
      // Shakib scores 35 off 22 balls AND takes 2/18 in 4 overs.
      // Batter X scored 48 off 38 balls (bat only).
      const inn1 = createMockInnings({
        team: 'Tigers',
        bowlingTeam: 'Lions',
        totalRuns: 155,
        totalWickets: 5,
        totalBalls: 120,
        players: [
          createMockPlayer({ name: 'SingleBatter', runs: 48, balls: 38, fours: 4, sixes: 1 }),
          createMockPlayer({ name: 'Shakib', runs: 35, balls: 22, fours: 3, sixes: 2 }),
        ],
      });

      const inn2 = createMockInnings({
        team: 'Lions',
        bowlingTeam: 'Tigers',
        totalRuns: 140,
        totalWickets: 6,
        totalBalls: 120,
        bowlers: [
          createMockBowler({ name: 'Shakib', ballsBowled: 24, runs: 18, wickets: 2 }),
        ],
      });

      const result = ManOfTheMatchEngine.evaluateMatch(inn1, inn2, {
        totalOvers: 20,
        winner: 'Tigers',
      });

      expect(result).not.toBeNull();
      expect(result!.manOfTheMatch.playerName).toBe('Shakib');
      expect(result!.manOfTheMatch.role).toBe('All-rounder');
      expect(result!.breakdown.battingImpact).toBeGreaterThan(10);
      expect(result!.breakdown.bowlingImpact).toBeGreaterThan(10);
    });
  });

  // ── TEST 11: EXCEPTIONAL LOSING-TEAM PERFORMANCE ──
  describe('Test 11: Exceptional Losing-Team Performance', () => {
    it('allows a heroic solo effort from the losing side to win MOTM over modest winning players', () => {
      // In a 10-over match:
      // Winning team makes 90/3 (leading scorer 28).
      // Losing team collapses to 85 all out, but Lone Warrior scores 70 off 32 balls (82% of team total!).
      const inn1 = createMockInnings({
        team: 'Winners',
        bowlingTeam: 'Losers',
        totalRuns: 90,
        totalWickets: 3,
        totalBalls: 60,
        players: [
          createMockPlayer({ name: 'OrdinaryBatter', runs: 28, balls: 20 }),
        ],
      });

      const inn2 = createMockInnings({
        team: 'Losers',
        bowlingTeam: 'Winners',
        totalRuns: 85,
        totalWickets: 8,
        totalBalls: 60,
        players: [
          createMockPlayer({
            name: 'LoneWarrior',
            runs: 70,
            balls: 32,
            fours: 7,
            sixes: 4,
            isDismissed: true,
          }),
        ],
      });

      const result = ManOfTheMatchEngine.evaluateMatch(inn1, inn2, {
        totalOvers: 10,
        winner: 'Winners',
        loser: 'Losers',
        result: 'Winners won by 5 runs',
      });

      expect(result).not.toBeNull();
      // The heroic solo 70 (82% of team runs) MUST win MOTM per Requirement #14!
      expect(result!.manOfTheMatch.playerName).toBe('LoneWarrior');
      expect(result!.manOfTheMatch.team).toBe('Losers');
    });
  });

  // ── TEST 12: RAIN-REDUCED MATCH ──
  describe('Test 12: Rain-Reduced Match', () => {
    it('uses actual reduced available overs for phase and rate normalization', () => {
      // Scheduled 20 overs, reduced to 8 overs due to rain
      const inn1 = createMockInnings({
        team: 'RainTeamA',
        bowlingTeam: 'RainTeamB',
        totalRuns: 78,
        totalWickets: 3,
        totalBalls: 48,
        players: [
          createMockPlayer({ name: 'RainHitter', runs: 42, balls: 19, fours: 4, sixes: 3 }),
        ],
      });

      const inn2 = createMockInnings({
        team: 'RainTeamB',
        bowlingTeam: 'RainTeamA',
        totalRuns: 65,
        totalWickets: 5,
        totalBalls: 48,
      });

      const result = ManOfTheMatchEngine.evaluateMatch(inn1, inn2, {
        totalOvers: 20,
        actualAvailableOvers: 8,
        isReducedMatch: true,
        winner: 'RainTeamA',
      });

      expect(result).not.toBeNull();
      expect(result!.matchMetadata.actualOvers).toBe(8);
      expect(result!.matchMetadata.isReduced).toBe(true);
      expect(result!.manOfTheMatch.playerName).toBe('RainHitter');
    });
  });

  // ── TEST 13: VERY EARLY CHASE COMPLETION ──
  describe('Test 13: Very Early Chase Completion', () => {
    it('evaluates completed deliveries without inventing unused overs', () => {
      // Target of 50 reached in 4.3 overs (27 balls) of a 20-over match
      const inn1 = createMockInnings({
        team: 'LowScoreTeam',
        bowlingTeam: 'BlazingChasers',
        totalRuns: 49,
        totalWickets: 10,
        totalBalls: 70,
        bowlers: [
          createMockBowler({ name: 'FastDestroyer', ballsBowled: 18, runs: 12, wickets: 4 }),
        ],
      });

      const inn2 = createMockInnings({
        team: 'BlazingChasers',
        bowlingTeam: 'LowScoreTeam',
        totalRuns: 51,
        totalWickets: 1,
        totalBalls: 27,
        players: [
          createMockPlayer({ name: 'OpenerQuick', runs: 35, balls: 16 }),
        ],
      });

      const result = ManOfTheMatchEngine.evaluateMatch(inn1, inn2, {
        totalOvers: 20,
        winner: 'BlazingChasers',
        ballsRemaining: 93,
        result: 'BlazingChasers won by 9 wickets',
      });

      expect(result).not.toBeNull();
      // FastDestroyer who bowled them out for 49 with 4/12 should be top candidate
      expect(result!.manOfTheMatch.playerName).toBe('FastDestroyer');
    });
  });

  // ── TEST 14: ALL-OUT INNINGS ──
  describe('Test 14: All-Out Innings', () => {
    it('properly recognizes bowling attack destroying opposition lineup', () => {
      const inn1 = createMockInnings({
        team: 'BattingSide',
        bowlingTeam: 'BowlingSide',
        totalRuns: 65,
        totalWickets: 10,
        totalBalls: 72,
      });

      const inn2 = createMockInnings({
        team: 'BowlingSide',
        bowlingTeam: 'BattingSide',
        totalRuns: 66,
        totalWickets: 2,
        totalBalls: 55,
        bowlers: [
          createMockBowler({
            name: 'WicketHauler',
            ballsBowled: 24,
            runs: 10,
            wickets: 5,
            maidens: 1,
          }),
        ],
      });

      const result = ManOfTheMatchEngine.evaluateMatch(inn1, inn2, {
        totalOvers: 20,
        winner: 'BowlingSide',
      });

      expect(result).not.toBeNull();
      expect(result!.manOfTheMatch.playerName).toBe('WicketHauler');
      expect(result!.breakdown.bowlingImpact).toBeGreaterThan(60);
    });
  });

  // ── TEST 15: SUPER OVER ──
  describe('Test 15: Super Over', () => {
    it('factors in Super Over high-pressure performance without overwhelming regular innings', () => {
      const inn1 = createMockInnings({
        team: 'Team X',
        bowlingTeam: 'Team Y',
        totalRuns: 160,
        totalWickets: 5,
        totalBalls: 120,
        players: [
          createMockPlayer({ name: 'SuperStar', runs: 55, balls: 35 }),
        ],
      });

      const inn2 = createMockInnings({
        team: 'Team Y',
        bowlingTeam: 'Team X',
        totalRuns: 160,
        totalWickets: 6,
        totalBalls: 120,
        players: [
          createMockPlayer({ name: 'EqualHero', runs: 53, balls: 34 }),
        ],
      });

      const result = ManOfTheMatchEngine.evaluateMatch(inn1, inn2, {
        totalOvers: 20,
        winner: 'Team X',
        superOver: { winner: 'Team X' },
      });

      expect(result).not.toBeNull();
      expect(result!.manOfTheMatch.playerName).toBe('SuperStar');
      expect(result!.reason).toContain('Super Over');
    });
  });

  // ── SHORT MATCH PROTECTION ──
  describe('Short Match Protection', () => {
    it('does not let 1 single lucky wicket beat a 30-run blitz in a 5-over match', () => {
      const inn1 = createMockInnings({
        team: 'Smashers',
        bowlingTeam: 'BowlersUnited',
        totalRuns: 55,
        totalWickets: 1,
        totalBalls: 30,
        players: [
          createMockPlayer({ name: 'PowerHitter', runs: 35, balls: 14, fours: 4, sixes: 2 }),
        ],
        bowlers: [
          createMockBowler({ name: 'OneWicketGuy', ballsBowled: 6, runs: 16, wickets: 1 }),
        ],
      });

      const inn2 = createMockInnings({
        team: 'BowlersUnited',
        bowlingTeam: 'Smashers',
        totalRuns: 40,
        totalWickets: 3,
        totalBalls: 30,
      });

      const result = ManOfTheMatchEngine.evaluateMatch(inn1, inn2, {
        totalOvers: 5,
        winner: 'Smashers',
      });

      expect(result).not.toBeNull();
      // PowerHitter with 35 off 14 (64% of team runs) MUST beat OneWicketGuy (1/16)
      expect(result!.manOfTheMatch.playerName).toBe('PowerHitter');
    });
  });

  // ── DYNAMIC WEIGHT REDISTRIBUTION ──
  describe('Dynamic Weight Redistribution', () => {
    it('gives specialist batter 75% batting weight without penalizing missing bowling', () => {
      const inn1 = createMockInnings({
        team: 'BattersXI',
        bowlingTeam: 'BowlersXI',
        totalRuns: 180,
        totalWickets: 2,
        totalBalls: 120,
        players: [
          createMockPlayer({ name: 'PureBatter', runs: 85, balls: 50 }),
        ],
      });

      const inn2 = createMockInnings({
        team: 'BowlersXI',
        bowlingTeam: 'BattersXI',
        totalRuns: 140,
        totalWickets: 8,
        totalBalls: 120,
      });

      const result = ManOfTheMatchEngine.evaluateMatch(inn1, inn2, {
        totalOvers: 20,
        winner: 'BattersXI',
      });

      expect(result).not.toBeNull();
      const batterCand = result!.allCandidates.find((c) => c.playerName === 'PureBatter');
      expect(batterCand).toBeDefined();
      expect(batterCand!.role).toBe('Batsman');
      // Batting weight should be around 75% (or scaled if no fielding tracked)
      expect(batterCand!.weights.batting).toBeGreaterThanOrEqual(0.70);
      expect(batterCand!.weights.bowling).toBe(0);
    });
  });

  // ── STRUCTURED OUTPUT & REASONING ──
  describe('Structured Output & Confidence', () => {
    it('returns structured result adhering to required specification', () => {
      const inn1 = createMockInnings({
        team: 'Team 1',
        bowlingTeam: 'Team 2',
        totalRuns: 150,
        totalBalls: 120,
        players: [createMockPlayer({ name: 'MVP', runs: 60, balls: 35 })],
      });
      const inn2 = createMockInnings({
        team: 'Team 2',
        bowlingTeam: 'Team 1',
        totalRuns: 140,
        totalBalls: 120,
        players: [createMockPlayer({ name: 'Fighter', runs: 45, balls: 30 })],
      });

      const result = ManOfTheMatchEngine.evaluateMatch(inn1, inn2, {
        totalOvers: 20,
        winner: 'Team 1',
      });

      expect(result).toHaveProperty('manOfTheMatch');
      expect(result).toHaveProperty('breakdown');
      expect(result).toHaveProperty('reason');
      expect(result).toHaveProperty('allCandidates');
      expect(result!.manOfTheMatch.confidence).toBeGreaterThan(0.5);
      expect(typeof result!.reason).toBe('string');
      expect(result!.reason.length).toBeGreaterThan(20);
    });
  });
});
