import { describe, it, expect } from 'vitest';
import { ManOfTheMatchEngine } from '../domain/cricket/analytics/ManOfTheMatchEngine';
import { MatchScorecard, InningsData, Player, Bowler } from '../domain/cricket/types';

/**
 * Group B / Bug 8b — MoM cache invalidation (audit/fix-phase2-10).
 *
 * The cached-MoM consistency hash used to fingerprint only AGGREGATE
 * totals (runs/balls/wickets summed over everyone). Redistributing runs
 * between two players — e.g. a historical ball edit that moves a boundary
 * from one batter to another — left every total unchanged, so the stale
 * cached MoM was returned even though a different player now deserved it.
 */

function player(overrides: Partial<Player>): Player {
  return {
    id: overrides.id || 'p',
    name: overrides.name || 'Player',
    battingHand: 'Right-hand Batsman',
    battingPosition: '1',
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    dotBalls: 0,
    ballLog: [],
    bowlersFaced: {},
    runsVsBowler: {},
    isDismissed: false,
    ...overrides,
  } as Player;
}

function bowler(overrides: Partial<Bowler>): Bowler {
  return {
    id: overrides.id || 'b',
    name: overrides.name || 'Bowler',
    ballsBowled: 0,
    maidens: 0,
    runs: 0,
    wickets: 0,
    overHistory: [],
    ...overrides,
  } as Bowler;
}

function innings(overrides: Partial<InningsData>): InningsData {
  return {
    inningsNumber: 1,
    team: 'Warriors',
    bowlingTeam: 'Titans',
    totalRuns: 0,
    totalWickets: 0,
    totalBalls: 0,
    oversString: '0.0',
    wideRuns: 0,
    nbRuns: 0,
    byeRuns: 0,
    lbRuns: 0,
    penaltyRuns: 0,
    penaltyRunsAgainst: 0,
    players: [],
    bowlers: [],
    fallOfWickets: [],
    pastPartnerships: [],
    currentPartnership: { batter1: '', batter2: '', runs: 0, balls: 0 },
    thisOverLog: [],
    strikerIdx: 0,
    nonStrikerIdx: 1,
    currentBowlerIdx: 0,
    nextPlayerIdx: 2,
    lastCompletedOverBowlerIdx: -1,
    isOverComplete: false,
    isFreeHit: false,
    ...overrides,
  } as InningsData;
}

function completedMatch(inn1: InningsData, inn2: InningsData): MatchScorecard {
  return {
    id: 'mom-cache-test',
    teamA: 'Warriors',
    teamB: 'Titans',
    tossWinner: 'Warriors',
    tossDecision: 'Batting',
    totalOvers: 10,
    status: 'COMPLETED',
    currentInnings: 2,
    targetScore: 81,
    venue: 'City Stadium',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    winner: 'Warriors',
    loser: 'Titans',
    result: 'Warriors won by 10 runs',
    resultType: 'WIN',
    firstInnings: inn1,
    secondInnings: inn2,
    advancedSettings: { players: 11 } as any,
  } as MatchScorecard;
}

describe('Group B: MoM cache must notice per-player changes', () => {
  it('redistributing runs between batters (same totals) invalidates the cached MoM', () => {
    const inn1 = innings({
      inningsNumber: 1,
      team: 'Warriors',
      bowlingTeam: 'Titans',
      totalRuns: 90,
      totalWickets: 2,
      totalBalls: 60,
      oversString: '10.0',
      players: [
        player({ id: 'w1', name: 'Alpha Star', runs: 60, balls: 30, fours: 6, sixes: 2 }),
        player({ id: 'w2', name: 'Beta Quiet', runs: 20, balls: 20, fours: 1, sixes: 0, isDismissed: true }),
        player({ id: 'w3', name: 'Gamma Ten', runs: 10, balls: 10, isDismissed: true }),
      ],
      bowlers: [bowler({ id: 't1', name: 'Titan Bowler', wickets: 2, runs: 90, ballsBowled: 60 })],
    });
    const inn2 = innings({
      inningsNumber: 2,
      team: 'Titans',
      bowlingTeam: 'Warriors',
      totalRuns: 80,
      totalWickets: 8,
      totalBalls: 60,
      oversString: '10.0',
      players: [
        player({ id: 't9', name: 'Titan Bat', runs: 30, balls: 25, fours: 2, isDismissed: true }),
        player({ id: 't8', name: 'Titan Two', runs: 25, balls: 20, isDismissed: true }),
      ],
      bowlers: [bowler({ id: 'w9', name: 'Warrior Bowler', wickets: 3, runs: 80, ballsBowled: 60 })],
    });

    const match = completedMatch(inn1, inn2);
    const first = ManOfTheMatchEngine.resolveForMatch(match, { forceRecalculate: true });
    expect(first?.name).toBe('Alpha Star');
    expect(match.momStats?.matchHash).toBeTruthy();

    // A correction moves Alpha's runs to Beta — team totals, total balls
    // and total wickets are ALL unchanged.
    inn1.players[0].runs = 20;
    inn1.players[0].fours = 1;
    inn1.players[0].sixes = 0;
    inn1.players[1].runs = 60;
    inn1.players[1].fours = 6;
    inn1.players[1].sixes = 2;

    const second = ManOfTheMatchEngine.resolveForMatch(match);
    expect(second?.name).toBe('Beta Quiet');
  });
});
