import { describe, expect, it } from 'vitest';
import { ScorecardHtmlGenerator } from '../features/scoring/pdf/ScorecardHtmlGenerator';
import { superOverMomOption } from '../features/scoring/pdf/superOverMom';
import type { Bowler, InningsData, MatchScorecard, Player } from '../domain/cricket/types';

/**
 * L2 (code-limitation bundle): the PDF generators used to resolve Man
 * of the Match from the main scorecard alone, so a tied match's PDF
 * could name a different winner than the summary and center pages
 * (which have passed the super over since F9-α). The generators now
 * accept the linked super-over scorecard and resolve through the same
 * channel. Fixtures mirror f9-super-over-mom.test.ts: SO Hero has a
 * quiet main match but dominates the super over.
 */

function player(overrides: Partial<Player>): Player {
  return {
    id: overrides.id || 'p_x',
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
    id: overrides.id || 'b_x',
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
    } as unknown as InningsData['currentPartnership'],
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

function mainScorecard(): MatchScorecard {
  const inn1 = innings({
    inningsNumber: 1,
    team: 'Team A',
    bowlingTeam: 'Team B',
    totalRuns: 60,
    totalWickets: 5,
    totalBalls: 60,
    oversString: '10.0',
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
    oversString: '10.0',
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
  return {
    id: 'main-1',
    teamA: 'Team A',
    teamB: 'Team B',
    status: 'COMPLETED',
    result: 'Match Tied (Team A won the Super Over)',
    resultType: 'SUPER_OVER',
    winner: 'Team A',
    tossWinner: 'Team A',
    tossDecision: 'Batting',
    totalOvers: 10,
    venue: 'Test Ground',
    date: '2026-11-09',
    firstInnings: inn1,
    secondInnings: inn2,
    superOverMatchId: 'so-1',
    superOverResult: { winner: 'Team A', resultText: 'Team A won the Super Over' },
  } as unknown as MatchScorecard;
}

function superOverScorecard(): MatchScorecard {
  const soInn1 = innings({
    inningsNumber: 1,
    team: 'Team A',
    bowlingTeam: 'Team B',
    totalRuns: 21,
    totalWickets: 0,
    totalBalls: 6,
    oversString: '1.0',
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
    oversString: '1.0',
    players: [
      player({ id: 'p_2_1', name: 'B Star', runs: 5, balls: 4 }),
      player({ id: 'p_2_2', name: 'B Two Bat', runs: 3, balls: 2 }),
    ],
    bowlers: [bowler({ id: 'b_2_1', name: 'SO Hero', ballsBowled: 6, runs: 8, wickets: 2 })],
  });
  return {
    id: 'so-1',
    teamA: 'Team A',
    teamB: 'Team B',
    status: 'COMPLETED',
    totalOvers: 1,
    firstInnings: soInn1,
    secondInnings: soInn2,
  } as unknown as MatchScorecard;
}

function momBlock(html: string): string {
  const start = html.indexOf('motm-val title');
  expect(start).toBeGreaterThan(-1);
  return html.slice(Math.max(0, start - 200), start + 400);
}

describe('L2 PDF super-over Man of the Match', () => {
  it('builds the resolve option from the linked scorecard, undefined without one', () => {
    const main = mainScorecard();
    const so = superOverScorecard();
    expect(superOverMomOption(main, null)).toBeUndefined();
    expect(superOverMomOption(main, undefined)).toBeUndefined();
    const opt = superOverMomOption(main, so);
    expect(opt?.superOver.innings1).toBe(so.firstInnings);
    expect(opt?.superOver.innings2).toBe(so.secondInnings);
    expect(opt?.superOver.winner).toBe('Team A');
  });

  it('names the super-over hero in the PDF when the linked match is supplied', () => {
    const main = mainScorecard();
    const withSo = ScorecardHtmlGenerator.generateHtml(main, 'Test Ground', superOverScorecard());
    expect(momBlock(withSo)).toContain('SO HERO');
  });

  it('falls back to the main-match award when no super over is supplied', () => {
    const main = mainScorecard();
    const withoutSo = ScorecardHtmlGenerator.generateHtml(main, 'Test Ground');
    expect(momBlock(withoutSo)).not.toContain('SO HERO');
  });
});
