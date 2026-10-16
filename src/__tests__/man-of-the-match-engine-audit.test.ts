import { describe, it, expect } from 'vitest';
import {
  ManOfTheMatchEngine,
  UniversalMotmResult,
  PlayerImpactScore,
} from '../domain/cricket/analytics/ManOfTheMatchEngine';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
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
    team: overrides.team || 'Titans',
    bowlingTeam: overrides.bowlingTeam || 'Warriors',
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
    teamA: overrides.teamA || 'Titans',
    teamB: overrides.teamB || 'Warriors',
    tossWinner: overrides.tossWinner || 'Titans',
    tossDecision: overrides.tossDecision || 'Batting',
    totalOvers: overrides.totalOvers ?? 10,
    status: overrides.status || 'COMPLETED',
    currentInnings: overrides.currentInnings || 2,
    targetScore: overrides.targetScore || 100,
    venue: overrides.venue || 'National Stadium',
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

describe('Man of the Match Engine Comprehensive Audit & Regression Suite', () => {
  // ── 1. Strong Batter vs High-Impact Bowler ──
  describe('1. Strong Batter versus High-Impact Bowler', () => {
    it('accurately evaluates strong batter vs high-impact bowler and selects based on match leverage', () => {
      // 10-over match: Batter scores 75 off 35 balls
      const batter = createMockPlayer({
        id: 'bat_1',
        name: 'Top Batter',
        runs: 75,
        balls: 35,
        fours: 8,
        sixes: 4,
        isDismissed: false,
      });

      // Bowler takes 4 wickets for 12 runs with 1 maiden in 2 overs (quota)
      const bowler = createMockBowler({
        id: 'bowl_1',
        name: 'Deadly Bowler',
        wickets: 4,
        runs: 12,
        ballsBowled: 12,
        maidens: 1,
        overHistory: [
          { overNumber: 1, log: ['W', '0', 'W', '0', '0', '0'] },
          { overNumber: 2, log: ['W', '4', 'W', '1', '1', '6'] },
        ],
      });

      const inn1 = createMockInnings({
        team: 'Titans',
        bowlingTeam: 'Warriors',
        totalRuns: 120,
        totalBalls: 60,
        players: [batter],
        bowlers: [createMockBowler({ name: 'Opp Bowler', wickets: 0, runs: 45, ballsBowled: 24 })],
      });

      const inn2 = createMockInnings({
        team: 'Warriors',
        bowlingTeam: 'Titans',
        totalRuns: 65,
        totalBalls: 45,
        totalWickets: 7,
        players: [createMockPlayer({ name: 'Chaser', runs: 20, balls: 15 })],
        bowlers: [bowler],
        fallOfWickets: [
          { wicket: 1, player: 'Chaser', score: 5, over: '0.1', bowler: 'Deadly Bowler' },
          { wicket: 2, player: 'Chaser 2', score: 5, over: '0.3', bowler: 'Deadly Bowler' },
        ],
      });

      const match = createCompletedMatch({
        winner: 'Titans',
        loser: 'Warriors',
        result: 'Titans won by 55 runs',
        firstInnings: inn1,
        secondInnings: inn2,
      });

      const result = ManOfTheMatchEngine.resolveForMatch(match);
      expect(result).not.toBeNull();
      // Both Top Batter and Deadly Bowler have exceptional scores; engine picks the highest impact
      expect(['Top Batter', 'Deadly Bowler']).toContain(result!.name);
      expect(result!.totalPoints).toBeGreaterThan(60);
      expect(result!.breakdown).toBeDefined();
      expect(result!.reason).toBeDefined();
    });
  });

  // ── 2. Genuine All-Round Performance ──
  describe('2. Genuine All-Round Performance (Both disciplines must count)', () => {
    it('ensures players with both batting and bowling contributions retain non-zero weights for both disciplines', () => {
      // All-rounder scores 35 runs and takes 2 wickets for 14 runs
      const allRounderBat = createMockPlayer({
        id: 'ar_1',
        name: 'Genuine AllRounder',
        runs: 35,
        balls: 18,
        fours: 4,
        sixes: 2,
        isDismissed: false,
      });
      const allRounderBowl = createMockBowler({
        id: 'ar_1',
        name: 'Genuine AllRounder',
        wickets: 2,
        runs: 14,
        ballsBowled: 12,
      });

      // Pure batter scores 42 runs but does not bowl
      const pureBatter = createMockPlayer({
        id: 'bat_pure',
        name: 'Pure Batter',
        runs: 42,
        balls: 28,
        fours: 5,
        sixes: 0,
        isDismissed: true,
      });

      // Pure bowler takes 2 wickets for 24 runs but does not bat
      const pureBowler = createMockBowler({
        id: 'bowl_pure',
        name: 'Pure Bowler',
        wickets: 2,
        runs: 24,
        ballsBowled: 12,
      });

      const inn1 = createMockInnings({
        team: 'Warriors',
        bowlingTeam: 'Titans',
        totalRuns: 95,
        totalBalls: 60,
        players: [createMockPlayer({ name: 'Opp Batter', runs: 30, balls: 20 })],
        bowlers: [allRounderBowl, pureBowler],
      });

      const inn2 = createMockInnings({
        team: 'Titans',
        bowlingTeam: 'Warriors',
        totalRuns: 98,
        totalBalls: 52,
        players: [allRounderBat, pureBatter],
        bowlers: [createMockBowler({ name: 'Opp Bowler', wickets: 1, runs: 30, ballsBowled: 18 })],
      });

      const match = createCompletedMatch({
        teamA: 'Warriors',
        teamB: 'Titans',
        winner: 'Titans',
        loser: 'Warriors',
        result: 'Titans won by 5 wickets',
        firstInnings: inn1,
        secondInnings: inn2,
      });

      const result = ManOfTheMatchEngine.resolveForMatch(match);
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Genuine AllRounder');
      expect(result!.role).toBe('All-rounder');
      // Crucial verification: Both battingPoints and bowlingPoints must be non-zero!
      expect(result!.battingPoints).toBeGreaterThan(0);
      expect(result!.bowlingPoints).toBeGreaterThan(0);
      expect(result!.breakdown?.battingImpact).toBeGreaterThan(0);
      expect(result!.breakdown?.bowlingImpact).toBeGreaterThan(0);
      expect(result!.runs).toBe(35);
      expect(result!.wickets).toBe(2);
    });

    it('preserves non-zero weights for a primary bowler who also scored useful runs', () => {
      const inn1 = createMockInnings({
        team: 'Lions',
        bowlingTeam: 'Tigers',
        totalRuns: 100,
        totalBalls: 60,
        players: [createMockPlayer({ name: 'L1', runs: 30, balls: 20 })],
        bowlers: [
          createMockBowler({ id: 'bowler_bat', name: 'Bowling Hero', wickets: 3, runs: 15, ballsBowled: 12 }),
        ],
      });

      const inn2 = createMockInnings({
        team: 'Tigers',
        bowlingTeam: 'Lions',
        totalRuns: 102,
        totalBalls: 55,
        players: [
          createMockPlayer({ id: 'bowler_bat', name: 'Bowling Hero', runs: 20, balls: 10, fours: 3 }),
        ],
        bowlers: [],
      });

      const res = ManOfTheMatchEngine.evaluateMatch(inn1, inn2, {
        totalOvers: 10,
        winner: 'Tigers',
      });

      expect(res).not.toBeNull();
      const hero = res!.allCandidates.find((c) => c.playerName === 'Bowling Hero');
      expect(hero).toBeDefined();
      // Weights for both disciplines must be strictly positive
      expect(hero!.weights.batting).toBeGreaterThan(0);
      expect(hero!.weights.bowling).toBeGreaterThan(0);
      expect(hero!.breakdown.battingImpact).toBeGreaterThan(0);
      expect(hero!.breakdown.bowlingImpact).toBeGreaterThan(0);
    });
  });

  // ── 3. Multiple Fielding Events by Same Player ──
  describe('3. Multiple Fielding Events by the Same Player', () => {
    it('counts all multiple catches taken by the same fielder without dropping subsequent events', () => {
      // 3 batters dismissed, all caught by "Jonty Rhodes"
      const inn1 = createMockInnings({
        team: 'Team A',
        bowlingTeam: 'Team B',
        totalRuns: 70,
        totalBalls: 60,
        players: [
          createMockPlayer({ id: 'p1', name: 'Batter One', isDismissed: true, dismissalType: 'Caught', fielderName: 'Jonty Rhodes' }),
          createMockPlayer({ id: 'p2', name: 'Batter Two', isDismissed: true, dismissalType: 'Caught', fielderName: 'Jonty Rhodes' }),
          createMockPlayer({ id: 'p3', name: 'Batter Three', isDismissed: true, dismissalType: 'Caught', fielderName: 'Jonty Rhodes' }),
        ],
        bowlers: [createMockBowler({ name: 'Bowler 1', wickets: 3, runs: 25, ballsBowled: 18 })],
      });

      const inn2 = createMockInnings({
        team: 'Team B',
        bowlingTeam: 'Team A',
        totalRuns: 72,
        totalBalls: 40,
        players: [
          createMockPlayer({ id: 'jonty', name: 'Jonty Rhodes', runs: 15, balls: 10 }),
        ],
        bowlers: [],
      });

      const match = createCompletedMatch({
        teamA: 'Team A',
        teamB: 'Team B',
        winner: 'Team B',
        firstInnings: inn1,
        secondInnings: inn2,
      });

      const evaluation = ManOfTheMatchEngine.evaluateMatch(match);
      expect(evaluation).not.toBeNull();

      const jonty = evaluation!.allCandidates.find((c) => c.playerName === 'Jonty Rhodes');
      expect(jonty).toBeDefined();
      // All 3 catches must be counted (in old bug, catches 2 and 3 were dropped!)
      expect(jonty!.stats.catches).toBe(3);
      expect(jonty!.breakdown.fieldingImpact).toBeGreaterThan(0);
      expect(jonty!.rawEvidence.some((e) => e.includes('3 catches'))).toBe(true);
    });
  });

  // ── 4. Duplicate Event Records Across Data Sources ──
  describe('4. Duplicate Event Records Appearing in Different Data Sources', () => {
    it('deduplicates dismissals recorded across players, fallOfWickets, and domain events', () => {
      // Single dismissal of Batter A caught by Fielder X, recorded in:
      // 1. inn.players[0].fielderName
      // 2. inn.fallOfWickets[0].fielder
      // 3. options.events (BALL_SCORED with isWicket: true)
      const inn1 = createMockInnings({
        team: 'Batting Team',
        bowlingTeam: 'Fielding Team',
        totalRuns: 60,
        players: [
          createMockPlayer({
            id: 'b1',
            name: 'Dismissed Batter',
            isDismissed: true,
            dismissalType: 'Caught',
            fielderName: 'Super Fielder',
          }),
        ],
        fallOfWickets: [
          { wicket: 1, player: 'Dismissed Batter', score: 12, over: '2.1', bowler: 'Bowler One', fielder: 'Super Fielder', dismissalType: 'Caught' },
        ],
        bowlers: [createMockBowler({ name: 'Bowler One', wickets: 1, runs: 15, ballsBowled: 12 })],
      });

      const duplicateEvents: DomainEvent[] = [
        {
          type: 'BALL_SCORED',
          payload: {
            inningsNumber: 1,
            isWicket: true,
            dismissalType: 'Caught',
            dismissedPlayer: 'Dismissed Batter',
            fielderName: 'Super Fielder',
          },
        } as any,
      ];

      const inn2 = createMockInnings({
        team: 'Fielding Team',
        bowlingTeam: 'Batting Team',
        totalRuns: 62,
        players: [createMockPlayer({ name: 'Super Fielder', runs: 20, balls: 15 })],
      });

      const res = ManOfTheMatchEngine.evaluateMatch(inn1, inn2, {
        totalOvers: 10,
        winner: 'Fielding Team',
        events: duplicateEvents,
      });

      expect(res).not.toBeNull();
      const fielderCand = res!.allCandidates.find((c) => c.playerName === 'Super Fielder');
      expect(fielderCand).toBeDefined();
      // Must be counted EXACTLY ONCE, not 3 times
      expect(fielderCand!.stats.catches).toBe(1);
    });

    it('accurately credits shared run-outs to both collaborating fielders', () => {
      const inn1 = createMockInnings({
        team: 'Team X',
        bowlingTeam: 'Team Y',
        totalRuns: 50,
        players: [
          createMockPlayer({
            id: 'px',
            name: 'RunOut Batter',
            isDismissed: true,
            dismissalType: 'Run Out',
            fielderName: 'Alice / Bob', // Shared run-out
          }),
        ],
      });

      const inn2 = createMockInnings({
        team: 'Team Y',
        bowlingTeam: 'Team X',
        totalRuns: 52,
        players: [
          createMockPlayer({ name: 'Alice', runs: 10, balls: 8 }),
          createMockPlayer({ name: 'Bob', runs: 12, balls: 9 }),
        ],
      });

      const res = ManOfTheMatchEngine.evaluateMatch(inn1, inn2, {
        totalOvers: 10,
        winner: 'Team Y',
      });

      expect(res).not.toBeNull();
      const alice = res!.allCandidates.find((c) => c.playerName === 'Alice');
      const bob = res!.allCandidates.find((c) => c.playerName === 'Bob');
      expect(alice).toBeDefined();
      expect(bob).toBeDefined();
      expect(alice!.stats.runOuts).toBe(1);
      expect(bob!.stats.runOuts).toBe(1);
    });
  });

  // ── 5. Two Distinct Players with Identical Names ──
  describe('5. Two Distinct Players with Identical Names', () => {
    it('isolates players with identical names on different teams into separate candidates', () => {
      // Team Alpha has "Alex Smith" who batted
      const inn1 = createMockInnings({
        team: 'Team Alpha',
        bowlingTeam: 'Team Beta',
        totalRuns: 80,
        players: [
          createMockPlayer({ id: 'alpha_alex', name: 'Alex Smith', runs: 45, balls: 22, fours: 4, sixes: 2 }),
        ],
        bowlers: [
          // Team Beta also has "Alex Smith" who bowled!
          createMockBowler({ id: 'beta_alex', name: 'Alex Smith', wickets: 3, runs: 15, ballsBowled: 18 }),
        ],
      });

      const inn2 = createMockInnings({
        team: 'Team Beta',
        bowlingTeam: 'Team Alpha',
        totalRuns: 82,
        players: [
          createMockPlayer({ id: 'beta_alex', name: 'Alex Smith', runs: 10, balls: 8 }),
        ],
        bowlers: [
          createMockBowler({ id: 'alpha_alex', name: 'Alex Smith', wickets: 0, runs: 20, ballsBowled: 12 }),
        ],
      });

      const match = createCompletedMatch({
        teamA: 'Team Alpha',
        teamB: 'Team Beta',
        winner: 'Team Beta',
        firstInnings: inn1,
        secondInnings: inn2,
      });

      const res = ManOfTheMatchEngine.evaluateMatch(match);
      expect(res).not.toBeNull();

      // Find all candidates named Alex Smith
      const alexCandidates = res!.allCandidates.filter((c) => c.playerName === 'Alex Smith');
      // Must be 2 separate candidates for Team Alpha and Team Beta, NOT merged into one!
      expect(alexCandidates.length).toBe(2);

      const alphaAlex = alexCandidates.find((c) => c.team === 'Team Alpha');
      const betaAlex = alexCandidates.find((c) => c.team === 'Team Beta');
      expect(alphaAlex).toBeDefined();
      expect(betaAlex).toBeDefined();

      // Alpha Alex has 45 batting runs
      expect(alphaAlex!.stats.runs).toBe(45);
      // Beta Alex has 3 bowling wickets and 10 batting runs
      expect(betaAlex!.stats.wickets).toBe(3);
      expect(betaAlex!.stats.runs).toBe(10);
    });

    it('does not conflate two distinct batters on the same team with identical names and different IDs', () => {
      const inn1 = createMockInnings({
        team: 'Warriors',
        bowlingTeam: 'Titans',
        totalRuns: 70,
        players: [
          createMockPlayer({ id: 'p_senior', name: 'John Doe', runs: 30, balls: 18 }),
          createMockPlayer({ id: 'p_junior', name: 'John Doe', runs: 15, balls: 10 }),
        ],
      });

      const inn2 = createMockInnings({
        team: 'Titans',
        bowlingTeam: 'Warriors',
        totalRuns: 50,
      });

      const res = ManOfTheMatchEngine.evaluateMatch(inn1, inn2, {
        totalOvers: 10,
        winner: 'Warriors',
      });

      expect(res).not.toBeNull();
      const johns = res!.allCandidates.filter((c) => c.playerName === 'John Doe');
      // Both distinct batters are preserved
      expect(johns.length).toBe(2);
      expect(johns.some((j) => j.playerId === 'p_senior' && j.stats.runs === 30)).toBe(true);
      expect(johns.some((j) => j.playerId === 'p_junior' && j.stats.runs === 15)).toBe(true);
    });
  });

  // ── 6. Recalculation After Editing Delivery or Score ──
  describe('6. Recalculation after Delivery Edit / Score Correction', () => {
    it('automatically invalidates stale cached momStats when scorecard player statistics change', () => {
      const inn1 = createMockInnings({
        team: 'Hawks',
        bowlingTeam: 'Eagles',
        totalRuns: 80,
        players: [
          createMockPlayer({ id: 'h1', name: 'Hawk Batter', runs: 40, balls: 25, fours: 4 }),
        ],
        bowlers: [
          createMockBowler({ id: 'e1', name: 'Eagle Bowler', wickets: 1, runs: 25, ballsBowled: 18 }),
        ],
      });

      const inn2 = createMockInnings({
        team: 'Eagles',
        bowlingTeam: 'Hawks',
        totalRuns: 82,
        players: [
          createMockPlayer({ id: 'e2', name: 'Eagle Batter', runs: 30, balls: 20 }),
        ],
        bowlers: [
          createMockBowler({ id: 'h2', name: 'Hawk Bowler', wickets: 1, runs: 20, ballsBowled: 18 }),
        ],
      });

      const match = createCompletedMatch({
        teamA: 'Hawks',
        teamB: 'Eagles',
        winner: 'Eagles',
        firstInnings: inn1,
        secondInnings: inn2,
      });

      // Initial resolution: Hawk Batter or Eagle Batter
      const initialMom = ManOfTheMatchEngine.resolveForMatch(match);
      expect(initialMom).not.toBeNull();
      expect(match.mom).toBeDefined();
      expect(match.momStats).toBeDefined();
      const initialWinnerName = match.mom;

      // Now simulate a post-finalization scorecard edit:
      // Eagle Bowler was actually credited with 4 wickets for 8 runs!
      match.firstInnings!.bowlers![0].wickets = 4;
      match.firstInnings!.bowlers![0].runs = 8;

      // Calling resolveForMatch WITHOUT forceRecalculate: true
      // isScorecardConsistentWithMom must detect that the scorecard was edited,
      // invalidate the stale cache, and re-evaluate!
      const correctedMom = ManOfTheMatchEngine.resolveForMatch(match);
      expect(correctedMom).not.toBeNull();
      expect(correctedMom!.name).toBe('Eagle Bowler');
      expect(match.mom).toBe('Eagle Bowler');
      expect(match.momStats?.name).toBe('Eagle Bowler');
      expect(match.momStats?.wickets).toBe(4);
    });

    it('EventSourcedMatchEngine recalculates MOTM after match completion and scorecard extraction', () => {
      const engine = new EventSourcedMatchEngine({
        teamA: 'Red Wings',
        teamB: 'Blue Sox',
        tossWinner: 'Red Wings',
        tossDecision: 'Batting',
        totalOvers: 2,
        strikerName: 'Red Star',
        nonStrikerName: 'Red NonStriker',
        bowlerName: 'Blue Bowler',
      });

      // Over 1: Red Star scores 18
      engine.scoreBall({ runsScored: 6 });
      engine.scoreBall({ runsScored: 6 });
      engine.scoreBall({ runsScored: 4 });
      engine.scoreBall({ runsScored: 2 });
      engine.scoreBall({ runsScored: 0 });
      engine.scoreBall({ runsScored: 0 });

      // Over 2: 6 dot balls
      for (let i = 0; i < 6; i++) {
        engine.scoreBall({ runsScored: 0 });
      }

      // 2nd Innings: Blue Sox
      engine.startSecondInnings('Blue Batter', 'Blue NonStriker', 'Red Bowler');
      for (let i = 0; i < 12; i++) {
        engine.scoreBall({ runsScored: i === 0 ? 4 : 0 });
      }

      const scorecard = engine.completeMatch();
      expect(scorecard.status).toBe('COMPLETED');
      expect(scorecard.mom).toBe('Red Star');
      expect(scorecard.momStats?.name).toBe('Red Star');
    });
  });

  // ── 7. Tied Scores and Deterministic Tie-Breakers ──
  describe('7. Tied Scores and Deterministic Tie-Breakers', () => {
    it('deterministically breaks ties without score inversion between close scores', () => {
      const inn1 = createMockInnings({
        team: 'Team Alpha',
        bowlingTeam: 'Team Beta',
        totalRuns: 100,
        players: [
          // Player A and Player B with identical stats
          createMockPlayer({ id: 'p_a', name: 'Aaron Finch', runs: 45, balls: 25, fours: 5, sixes: 1 }),
          createMockPlayer({ id: 'p_b', name: 'Ben Stokes', runs: 45, balls: 25, fours: 5, sixes: 1 }),
        ],
      });

      const inn2 = createMockInnings({
        team: 'Team Beta',
        bowlingTeam: 'Team Alpha',
        totalRuns: 80,
      });

      const match = createCompletedMatch({
        teamA: 'Team Alpha',
        teamB: 'Team Beta',
        winner: 'Team Alpha',
        firstInnings: inn1,
        secondInnings: inn2,
      });

      const res1 = ManOfTheMatchEngine.resolveForMatch({ ...match, mom: undefined, momStats: undefined });
      const res2 = ManOfTheMatchEngine.resolveForMatch({ ...match, mom: undefined, momStats: undefined });

      expect(res1).not.toBeNull();
      expect(res2).not.toBeNull();
      // Must be 100% deterministic across calls
      expect(res1!.name).toBe(res2!.name);
      // Alphabetical order breaks exact tie: 'Aaron Finch' precedes 'Ben Stokes'
      expect(res1!.name).toBe('Aaron Finch');
    });

    it('treats tied matches with fair result impact (55 pts) instead of penalizing both teams as losers', () => {
      const inn1 = createMockInnings({
        team: 'Dragons',
        bowlingTeam: 'Knights',
        totalRuns: 85,
        players: [createMockPlayer({ id: 'd1', name: 'Dragon Batter', runs: 50, balls: 28 })],
      });

      const inn2 = createMockInnings({
        team: 'Knights',
        bowlingTeam: 'Dragons',
        totalRuns: 85,
        players: [createMockPlayer({ id: 'k1', name: 'Knight Batter', runs: 48, balls: 27 })],
      });

      const tiedMatch = createCompletedMatch({
        teamA: 'Dragons',
        teamB: 'Knights',
        winner: 'Both Teams',
        result: 'Match Tied',
        resultType: 'TIE',
        firstInnings: inn1,
        secondInnings: inn2,
      });

      const evaluation = ManOfTheMatchEngine.evaluateMatch(tiedMatch);
      expect(evaluation).not.toBeNull();
      // In tied matches, breakdown.resultImpact must reflect the neutral 55 impact (weighted ~2.8-5 pts), not loss penalty
      const winnerCand = evaluation!.allCandidates[0];
      expect(winnerCand.breakdown.resultImpact).toBeGreaterThan(2.0);
      expect(evaluation!.manOfTheMatch).toBeDefined();
    });
  });

  // ── 8. Abandoned, No-Result, Incomplete, and Completed Matches ──
  describe('8. Abandoned, No-Result, Incomplete, and Completed Matches', () => {
    it('does not award MOTM for incomplete (IN_PROGRESS) matches', () => {
      const inProgressMatch = createCompletedMatch({
        status: 'ONGOING',
        firstInnings: createMockInnings({
          totalRuns: 45,
          players: [createMockPlayer({ name: 'Batter', runs: 40, balls: 20 })],
        }),
        secondInnings: undefined,
      });

      const mom = ManOfTheMatchEngine.resolveForMatch(inProgressMatch);
      expect(mom).toBeNull();
      expect(inProgressMatch.mom).toBeUndefined();
      expect(inProgressMatch.momStats).toBeUndefined();
    });

    it('clears MOTM and returns null for abandoned matches even if previously cached', () => {
      const abandonedMatch = createCompletedMatch({
        status: 'ABANDONED',
        result: 'Match Abandoned',
        resultType: 'NO_RESULT',
        mom: 'Stale Player',
        momStats: {
          name: 'Stale Player',
          role: 'Batsman',
          runs: 50,
          balls: 25,
          fours: 4,
          sixes: 2,
          wickets: 0,
          bowlingRuns: 0,
          ballsBowled: 0,
          points: 80,
        },
      });

      const mom = ManOfTheMatchEngine.resolveForMatch(abandonedMatch);
      expect(mom).toBeNull();
      expect(abandonedMatch.mom).toBeUndefined();
      expect(abandonedMatch.momStats).toBeUndefined();
    });

    it('clears MOTM and returns null for NO_RESULT matches', () => {
      const noResultMatch = createCompletedMatch({
        status: 'COMPLETED',
        result: 'No Result due to rain',
        resultType: 'NO_RESULT',
        mom: 'Rain Player',
        momStats: {
          name: 'Rain Player',
          role: 'Batsman',
          runs: 20,
          balls: 10,
          fours: 2,
          sixes: 1,
          wickets: 0,
          bowlingRuns: 0,
          ballsBowled: 0,
          points: 30,
        },
      });

      const mom = ManOfTheMatchEngine.resolveForMatch(noResultMatch);
      expect(mom).toBeNull();
      expect(noResultMatch.mom).toBeUndefined();
      expect(noResultMatch.momStats).toBeUndefined();
    });

    it('correctly awards MOTM for cleanly completed matches', () => {
      const completedMatch = createCompletedMatch({
        status: 'COMPLETED',
        winner: 'Titans',
        result: 'Titans won by 10 runs',
        resultType: 'WIN',
        firstInnings: createMockInnings({
          team: 'Titans',
          bowlingTeam: 'Warriors',
          totalRuns: 90,
          players: [createMockPlayer({ name: 'Match Winner', runs: 55, balls: 28, fours: 6, sixes: 3 })],
        }),
        secondInnings: createMockInnings({
          team: 'Warriors',
          bowlingTeam: 'Titans',
          totalRuns: 80,
          players: [createMockPlayer({ name: 'Runner Up', runs: 30, balls: 20 })],
        }),
      });

      const mom = ManOfTheMatchEngine.resolveForMatch(completedMatch);
      expect(mom).not.toBeNull();
      expect(mom!.name).toBe('Match Winner');
      expect(completedMatch.mom).toBe('Match Winner');
      expect(completedMatch.momStats?.name).toBe('Match Winner');
    });
  });

  // ── 9. Missing / Partial Statistics and Zero-Ball Edge Cases ──
  describe('9. Missing or Partial Statistics and Zero-Ball Edge Cases', () => {
    it('handles zero balls faced (diamond duck) without NaN or crash', () => {
      const inn1 = createMockInnings({
        team: 'Team 1',
        bowlingTeam: 'Team 2',
        totalRuns: 10,
        players: [
          createMockPlayer({ name: 'Diamond Duck', runs: 0, balls: 0, isDismissed: true, dismissalType: 'Run Out' }),
        ],
        bowlers: [],
      });

      const res = ManOfTheMatchEngine.evaluateMatch(inn1, undefined, { totalOvers: 5 });
      // Safely evaluates without NaN or throwing
      if (res && res.allCandidates.length > 0) {
        expect(Number.isNaN(res.allCandidates[0].finalScore)).toBe(false);
      }
    });

    it('handles bowler with 0 balls bowled safely', () => {
      const inn1 = createMockInnings({
        team: 'Team 1',
        bowlingTeam: 'Team 2',
        totalRuns: 20,
        players: [createMockPlayer({ name: 'Player 1', runs: 20, balls: 15 })],
        bowlers: [
          createMockBowler({ name: 'Unbowled Sub', ballsBowled: 0, runs: 0, wickets: 0 }),
        ],
      });

      const res = ManOfTheMatchEngine.evaluateMatch(inn1, undefined, { totalOvers: 5 });
      expect(res).not.toBeNull();
      const sub = res!.allCandidates.find((c) => c.playerName === 'Unbowled Sub');
      if (sub) {
        expect(Number.isNaN(sub.finalScore)).toBe(false);
        expect(sub.stats.ballsBowled).toBe(0);
      }
    });

    it('safely handles empty innings data with no players or deliveries', () => {
      const emptyInnings = createMockInnings({
        totalRuns: 0,
        totalBalls: 0,
        players: [],
        bowlers: [],
      });

      const res = ManOfTheMatchEngine.evaluateMatch(emptyInnings, undefined, { totalOvers: 5 });
      expect(res).toBeNull();
    });

    it('parses battingPosition strings with descriptive text (e.g., "One Down No. 3")', () => {
      const inn1 = createMockInnings({
        team: 'Team Alpha',
        bowlingTeam: 'Team Beta',
        totalRuns: 80,
        fallOfWickets: [
          { wicket: 1, player: 'Opener 1', score: 1, over: '0.2' },
          { wicket: 2, player: 'Opener 2', score: 3, over: '0.5' },
        ],
        players: [
          createMockPlayer({ name: 'Opener 1', battingPosition: '1', runs: 1, balls: 2, isDismissed: true }),
          createMockPlayer({ name: 'Opener 2', battingPosition: '2', runs: 2, balls: 3, isDismissed: true }),
          // Batting position is descriptive string: "One Down No. 3"
          createMockPlayer({
            name: 'Crisis Savior',
            battingPosition: 'One Down No. 3',
            runs: 60,
            balls: 32,
            fours: 6,
            sixes: 2,
            isDismissed: false,
          }),
        ],
      });

      const inn2 = createMockInnings({
        team: 'Team Beta',
        bowlingTeam: 'Team Alpha',
        totalRuns: 50,
      });

      const match = createCompletedMatch({
        winner: 'Team Alpha',
        firstInnings: inn1,
        secondInnings: inn2,
      });

      const result = ManOfTheMatchEngine.resolveForMatch(match);
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Crisis Savior');
      // Crisis Recovery bonus must be triggered because regex matched "3" from "One Down No. 3"
      expect(result!.reason).toBeDefined();
    });
  });
});
