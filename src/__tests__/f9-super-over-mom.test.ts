import { describe, expect, it } from 'vitest';
import { ManOfTheMatchEngine } from '../domain/cricket/analytics/ManOfTheMatchEngine';
import type { Bowler, InningsData, MatchScorecard, Player } from '../domain/cricket/types';

/**
 * F9-α (player identity, first slice): super-over performances must
 * reach Man of the Match, and same-named players on opposing teams must
 * stay separate.
 *
 * Two latent defects pinned here:
 *  1. evaluateMatch deduped innings by (inningsNumber, team) — a REAL
 *     super over is a separate match whose innings are numbered 1 and
 *     2, so its innings were silently dropped even when passed. (The
 *     older engine test used a fictional inningsNumber 3.)
 *  2. resolveForMatch had no superOver channel at all, so no
 *     production surface could pass the linked super-over match.
 *  3. The super over's positional ids are FOREIGN: in the scenario
 *     below the SO match's p_1_1 is 'SO Hero' while the main match's
 *     p_1_1 is 'Main Star' (different batting orders — exactly what a
 *     real SO match produces). Naive by-id merging credited SO Hero's
 *     20 runs to Main Star (45 total) and left SO Hero with 6. The
 *     engine now normalises SO innings (renumber 3/4, ids dropped) so
 *     they merge by (team, name).
 */

function player(overrides: Partial<Player>): Player {
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

function bowler(overrides: Partial<Bowler>): Bowler {
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

function innings(overrides: Partial<InningsData>): InningsData {
  return {
    inningsNumber: overrides.inningsNumber || 1,
    team: overrides.team || 'Team A',
    bowlingTeam: overrides.bowlingTeam || 'Team B',
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
    fallOfWickets: [],
    pastPartnerships: [],
    currentPartnership: {
      batter1Name: '',
      batter2Name: '',
      runs: 0,
      balls: 0,
    } as InningsData['currentPartnership'],
    thisOverLog: [],
    strikerIdx: 0,
    nonStrikerIdx: 1,
    currentBowlerIdx: 0,
    nextPlayerIdx: 2,
    lastCompletedOverBowlerIdx: -1,
    isOverComplete: false,
    isFreeHit: false,
  };
}

/** Tied main match, 60/60. Main-match star: 'Main Star' 25 (Team A).
 *  'SO Hero' (Team A) has a quiet main match (5 runs) but dominates the
 *  super over and took 2 wickets in innings 2. */
function tiedMatch() {
  const inn1 = innings({
    inningsNumber: 1,
    team: 'Team A',
    bowlingTeam: 'Team B',
    totalRuns: 60,
    totalWickets: 5,
    totalBalls: 60,
    players: [
      player({ id: 'p_1_1', name: 'Main Star', runs: 25, balls: 20, fours: 3 }),
      player({ id: 'p_1_2', name: 'SO Hero', runs: 5, balls: 5 }),
      player({ id: 'p_1_3', name: 'A Three', runs: 15, balls: 15 }),
      player({ id: 'p_1_4', name: 'A Four', runs: 15, balls: 20 }),
    ],
    bowlers: [
      bowler({ id: 'b_1_1', name: 'B One', ballsBowled: 30, runs: 30, wickets: 3 }),
      bowler({ id: 'b_1_2', name: 'B Two', ballsBowled: 30, runs: 30, wickets: 2 }),
    ],
  });
  const inn2 = innings({
    inningsNumber: 2,
    team: 'Team B',
    bowlingTeam: 'Team A',
    totalRuns: 60,
    totalWickets: 6,
    totalBalls: 60,
    players: [
      player({ id: 'p_2_1', name: 'B Star', runs: 22, balls: 18, fours: 2 }),
      player({ id: 'p_2_2', name: 'B Two Bat', runs: 20, balls: 22 }),
      player({ id: 'p_2_3', name: 'B Three', runs: 18, balls: 20 }),
    ],
    bowlers: [
      bowler({ id: 'b_2_1', name: 'SO Hero', ballsBowled: 24, runs: 20, wickets: 2 }),
      bowler({ id: 'b_2_2', name: 'A Four', ballsBowled: 36, runs: 40, wickets: 4 }),
    ],
  });
  // A REAL super over: separate match, innings numbered 1 and 2.
  const soInn1 = innings({
    inningsNumber: 1,
    team: 'Team A',
    bowlingTeam: 'Team B',
    totalRuns: 21,
    totalWickets: 0,
    totalBalls: 6,
    players: [
      player({ id: 'p_1_1', name: 'SO Hero', runs: 20, balls: 5, sixes: 3 }),
      player({ id: 'p_1_2', name: 'Main Star', runs: 1, balls: 1 }),
    ],
    bowlers: [bowler({ id: 'b_1_1', name: 'B One', ballsBowled: 6, runs: 21, wickets: 0 })],
  });
  const soInn2 = innings({
    inningsNumber: 2,
    team: 'Team B',
    bowlingTeam: 'Team A',
    totalRuns: 8,
    totalWickets: 2,
    totalBalls: 6,
    players: [player({ id: 'p_2_1', name: 'B Star', runs: 8, balls: 6 })],
    bowlers: [bowler({ id: 'b_2_1', name: 'SO Hero', ballsBowled: 6, runs: 8, wickets: 2 })],
  });

  const match = {
    id: 'match_tied',
    teamA: 'Team A',
    teamB: 'Team B',
    tossWinner: 'Team A',
    tossDecision: 'Batting',
    totalOvers: 10,
    status: 'COMPLETED',
    currentInnings: 2,
    targetScore: 61,
    advancedSettings: {},
    firstInnings: inn1,
    secondInnings: inn2,
    winner: 'Team A',
    result: 'Team A won via Super Over',
    superOverMatchId: 'match_tied_super_over',
    superOverResult: { winner: 'Team A', resultText: 'Team A won via Super Over' },
  } as unknown as MatchScorecard;

  return { match, inn1, inn2, soInn1, soInn2 };
}

describe('F9-α super-over MoM', () => {
  it('real-numbered (1/2) super-over innings are NOT dropped by dedupe', () => {
    const { inn1, inn2, soInn1, soInn2 } = tiedMatch();
    const result = ManOfTheMatchEngine.calculateForMatch(inn1, inn2, {
      totalOvers: 10,
      winner: 'Team A',
      superOver: { innings1: soInn1, innings2: soInn2, winner: 'Team A' },
    });
    expect(result).not.toBeNull();
    const hero = result!.allCandidates?.find((c) => c.playerName === 'SO Hero');
    expect(hero).toBeTruthy();
    // 5 (main) + 20 (super over) batting runs aggregated.
    expect(hero!.stats.runs).toBe(25);
    // 2 (main) + 2 (super over) wickets aggregated.
    expect(hero!.stats.wickets).toBe(4);
  });

  it('super-over performance flips the award', () => {
    const { inn1, inn2, soInn1, soInn2 } = tiedMatch();
    const withoutSo = ManOfTheMatchEngine.calculateForMatch(inn1, inn2, {
      totalOvers: 10,
      winner: 'Team A',
    });
    const withSo = ManOfTheMatchEngine.calculateForMatch(inn1, inn2, {
      totalOvers: 10,
      winner: 'Team A',
      superOver: { innings1: soInn1, innings2: soInn2, winner: 'Team A' },
    });
    expect(withoutSo!.name).not.toBe('SO Hero');
    expect(withSo!.name).toBe('SO Hero');
  });

  it('resolveForMatch accepts the superOver channel and the cache stays SO-inclusive for plain callers', () => {
    const { match, soInn1, soInn2 } = tiedMatch();

    const resolved = ManOfTheMatchEngine.resolveForMatch(match, {
      superOver: { innings1: soInn1, innings2: soInn2, winner: 'Team A' },
    });
    expect(resolved!.name).toBe('SO Hero');
    expect(match.mom).toBe('SO Hero');
    expect(match.momStats?.matchHash).toContain('|so:');

    // A plain caller (e.g. PDF) with no SO data must keep serving the
    // SO-inclusive award from cache, not flip back to the main-only one.
    const plain = ManOfTheMatchEngine.resolveForMatch(match);
    expect(plain!.name).toBe('SO Hero');
  });

  it('editing a main-match stat invalidates even an SO-inclusive cache', () => {
    const { match, soInn1, soInn2 } = tiedMatch();
    ManOfTheMatchEngine.resolveForMatch(match, {
      superOver: { innings1: soInn1, innings2: soInn2, winner: 'Team A' },
    });
    // Post-finalization correction: Main Star actually scored 55.
    match.firstInnings!.players[0].runs = 55;
    const afterEdit = ManOfTheMatchEngine.resolveForMatch(match);
    // The SO-inclusive cache must NOT be served: a fresh main-only
    // computation replaces it (new winner, hash without the |so: mark).
    expect(afterEdit!.name).not.toBe('SO Hero');
    expect(match.momStats?.matchHash).not.toContain('|so:');
  });
});

describe('F9-α identity: duplicate names on opposing teams', () => {
  it('the two Rahims stay separate candidates', () => {
    const inn1 = innings({
      inningsNumber: 1,
      team: 'Team A',
      bowlingTeam: 'Team B',
      totalRuns: 90,
      totalWickets: 4,
      totalBalls: 60,
      players: [
        player({ id: 'p_1_1', name: 'Rahim', runs: 50, balls: 30, fours: 6 }),
        player({ id: 'p_1_2', name: 'A Two', runs: 40, balls: 30 }),
      ],
      bowlers: [bowler({ id: 'b_1_1', name: 'Rahim', ballsBowled: 30, runs: 45, wickets: 1 })],
    });
    const inn2 = innings({
      inningsNumber: 2,
      team: 'Team B',
      bowlingTeam: 'Team A',
      totalRuns: 70,
      totalWickets: 8,
      totalBalls: 60,
      players: [
        player({ id: 'p_2_1', name: 'Rahim', runs: 10, balls: 12 }),
        player({ id: 'p_2_2', name: 'B Two', runs: 35, balls: 30 }),
        player({ id: 'p_2_3', name: 'B Three', runs: 25, balls: 18 }),
      ],
      bowlers: [bowler({ id: 'b_2_1', name: 'A Two', ballsBowled: 30, runs: 35, wickets: 1 })],
    });

    const result = ManOfTheMatchEngine.calculateForMatch(inn1, inn2, {
      totalOvers: 10,
      winner: 'Team A',
    });
    expect(result).not.toBeNull();
    const rahims = (result!.allCandidates || []).filter((c) => c.playerName === 'Rahim');
    expect(rahims.length).toBe(2);
    expect(rahims.map((r) => r.team).sort()).toEqual(['Team A', 'Team B']);
    // Team A's Rahim (50 runs) wins; his stats must not absorb the
    // other Rahim's 10 runs or Team B's Rahim-the-bowler figures.
    expect(result!.name).toBe('Rahim');
    expect(result!.team).toBe('Team A');
    expect(result!.runs).toBe(50);
    // Team B's Rahim merged his OWN batting (10) and bowling (1 wicket
    // in innings 1) — cross-innings merging works per (team, name).
    const rahimB = rahims.find((r) => r.team === 'Team B');
    expect(rahimB!.stats.runs).toBe(10);
    expect(rahimB!.stats.wickets).toBe(1);
  });
});
