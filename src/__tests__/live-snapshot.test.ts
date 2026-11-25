/**
 * Live Spectating Phase 1 — snapshot builder, ball text, win predictor.
 * Fixtures mirror the approved mockup scenario: HUNGRY XI 196/6,
 * PASASH chasing at 156/4 (16.3 ov), RIYAD 48*, ALAMIN bowling.
 */
import { describe, expect, it } from 'vitest';
import type { Bowler, DomainEvent, InningsData, MatchScorecard, Player } from '../domain/cricket/types';
import { ballFeedText, ballToken } from '../domain/live/ballText';
import { buildLiveSnapshot } from '../domain/live/buildLiveSnapshot';
import { predictChaseWinPct } from '../domain/live/winPredictor';

function player(name: string, over: Partial<Player> = {}): Player {
  return {
    id: `p-${name}`,
    name,
    battingHand: 'Right',
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    dotBalls: 0,
    ballLog: [],
    bowlersFaced: {},
    runsVsBowler: {},
    isDismissed: false,
    ...over,
  };
}

function bowler(name: string, over: Partial<Bowler> = {}): Bowler {
  return {
    id: `b-${name}`,
    name,
    ballsBowled: 0,
    maidens: 0,
    runs: 0,
    wickets: 0,
    overHistory: [],
    ...over,
  };
}

function innings(over: Partial<InningsData> = {}): InningsData {
  return {
    inningsNumber: 1,
    team: 'HUNGRY XI',
    bowlingTeam: 'PASASH',
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
    ...over,
  };
}

function ballEvent(payload: Record<string, unknown>, ts = 1_700_000_000_000): DomainEvent {
  return {
    eventId: `ev-${ts}-${Math.random()}`,
    matchId: 'm1',
    version: 1,
    timestamp: ts,
    type: 'BALL_SCORED',
    payload,
  };
}

function chaseScorecard(): MatchScorecard {
  const first = innings({
    inningsNumber: 1,
    team: 'HUNGRY XI',
    bowlingTeam: 'PASASH',
    totalRuns: 196,
    totalWickets: 6,
    totalBalls: 120,
    oversString: '20.0',
    players: [player('TAMIM', { runs: 62, balls: 40, fours: 7, sixes: 2, isDismissed: true, dismissalText: 'c ROBIN b ALAMIN' })],
    bowlers: [bowler('ALAMIN', { ballsBowled: 24, runs: 38, wickets: 1 })],
  });
  const second = innings({
    inningsNumber: 2,
    team: 'PASASH',
    bowlingTeam: 'HUNGRY XI',
    totalRuns: 156,
    totalWickets: 4,
    totalBalls: 99,
    oversString: '16.3',
    players: [
      player('RIYAD', { runs: 48, balls: 29, fours: 4, sixes: 2 }),
      player('SABBIR', { runs: 23, balls: 14, fours: 2, sixes: 1 }),
      player('OUTMAN', { runs: 10, balls: 8, isDismissed: true, dismissalText: 'b ALAMIN' }),
    ],
    bowlers: [bowler('ALAMIN', { ballsBowled: 21, runs: 31, wickets: 2 })],
    strikerIdx: 0,
    nonStrikerIdx: 1,
    currentBowlerIdx: 0,
  });
  return {
    id: 'm1',
    teamA: 'HUNGRY XI',
    teamB: 'PASASH',
    tossWinner: 'PASASH',
    tossDecision: 'Bowling',
    totalOvers: 20,
    status: 'ONGOING',
    currentInnings: 2,
    targetScore: 197,
    advancedSettings: {
      players: 11,
      noBall: true,
      noBallReball: true,
      noBallRun: 1,
      wideBall: true,
      wideReball: true,
      wideRun: 1,
      isManualLimitEnabled: false,
      manualOverLimit: 4,
    },
    firstInnings: first,
    secondInnings: second,
    createdAt: '2026-11-25T10:00:00.000Z',
    updatedAt: '2026-11-25T11:00:00.000Z',
  };
}

const chaseEvents: DomainEvent[] = [
  ballEvent({ inningsNumber: 2, overNumber: 17, runsScored: 1, totalRunsGained: 1, isLegalBall: true, striker: 'SABBIR', bowler: 'ALAMIN' }, 1000),
  ballEvent({ inningsNumber: 2, overNumber: 17, runsScored: 4, totalRunsGained: 4, isLegalBall: true, striker: 'RIYAD', bowler: 'ALAMIN' }, 2000),
  ballEvent({ inningsNumber: 2, overNumber: 17, runsScored: 6, totalRunsGained: 6, isLegalBall: true, striker: 'RIYAD', bowler: 'ALAMIN' }, 3000),
];

describe('buildLiveSnapshot — chase', () => {
  const snap = buildLiveSnapshot(chaseScorecard(), chaseEvents, { tournamentName: 'NARSINGDI TOPY' });

  it('carries identity, format and tournament', () => {
    expect(snap.matchId).toBe('m1');
    expect(snap.status).toBe('live');
    expect(snap.formatLabel).toBe('T20');
    expect(snap.tournamentName).toBe('NARSINGDI TOPY');
    expect(snap.tossText).toContain('PASASH');
  });

  it('computes chase math exactly', () => {
    expect(snap.current).not.toBeNull();
    const c = snap.current!;
    expect(c.battingTeam).toBe('PASASH');
    expect(c.runs).toBe(156);
    expect(c.wickets).toBe(4);
    expect(c.target).toBe(197);
    expect(c.runsNeeded).toBe(41);
    expect(c.ballsLeft).toBe(21);
    expect(c.crr).toBe(9.45);
    expect(c.reqRate).toBe(11.71);
    expect(snap.statusLine).toBe('PASASH need 41 off 21 balls');
  });

  it('exposes crease pair and current bowler', () => {
    const c = snap.current!;
    expect(c.striker?.name).toBe('RIYAD');
    expect(c.striker?.runs).toBe(48);
    expect(c.nonStriker?.name).toBe('SABBIR');
    expect(c.bowler?.name).toBe('ALAMIN');
    expect(c.bowler?.oversText).toBe('3.3');
    expect(c.bowler?.wickets).toBe(2);
  });

  it('builds recent balls, feed (newest first) and over summary from events', () => {
    const c = snap.current!;
    expect(c.recentBalls).toEqual(['1', '4', '6']);
    expect(c.feed).toHaveLength(3);
    expect(c.feed[0].overText).toBe('16.3');
    expect(c.feed[0].text).toContain('SIX');
    expect(c.feed[0].kind).toBe('six');
    expect(c.overs).toHaveLength(1);
    expect(c.overs[0]).toMatchObject({ over: 17, runs: 11, wickets: 0 });
  });

  it('includes both innings summaries with batting/bowling cards', () => {
    expect(snap.innings).toHaveLength(2);
    expect(snap.innings[0]).toMatchObject({ team: 'HUNGRY XI', runs: 196, wickets: 6 });
    expect(snap.innings[0].batting[0]).toMatchObject({ name: 'TAMIM', out: true });
    expect(snap.innings[1].batting.map((b) => b.name)).toContain('OUTMAN');
  });

  it('win predictor favours the fielding side at 41 off 21 with RRR 11.71', () => {
    const pct = snap.current!.winPct;
    expect(pct).not.toBeNull();
    expect(pct!).toBeGreaterThanOrEqual(2);
    expect(pct!).toBeLessThan(50);
  });
});

describe('buildLiveSnapshot — first innings and completion', () => {
  it('first innings has no target/predictor and a CRR status line', () => {
    const sc = chaseScorecard();
    sc.currentInnings = 1;
    sc.secondInnings = undefined;
    sc.firstInnings = innings({
      inningsNumber: 1,
      team: 'SULTANPUR',
      bowlingTeam: 'HUNGRY XI',
      totalRuns: 89,
      totalWickets: 2,
      totalBalls: 61,
      oversString: '10.1',
      players: [player('ROBIN', { runs: 37, balls: 24, fours: 3, sixes: 1 }), player('X', {})],
      bowlers: [bowler('Y', { ballsBowled: 12, runs: 18 })],
    });
    sc.teamA = 'SULTANPUR';
    const snap = buildLiveSnapshot(sc, []);
    expect(snap.current?.target).toBeNull();
    expect(snap.current?.winPct).toBeNull();
    expect(snap.statusLine).toContain('CRR');
  });

  it('completed match reports result and no predictor', () => {
    const sc = chaseScorecard();
    sc.status = 'COMPLETED';
    sc.result = 'PASASH won by 6 wickets';
    const snap = buildLiveSnapshot(sc, chaseEvents);
    expect(snap.status).toBe('completed');
    expect(snap.resultText).toBe('PASASH won by 6 wickets');
    expect(snap.statusLine).toBe('PASASH won by 6 wickets');
    expect(snap.current?.winPct).toBeNull();
  });
});

describe('ball text', () => {
  it('tokens distinguish wicket, wide, no-ball, byes', () => {
    expect(ballToken({ isWicket: true })).toBe('W');
    expect(ballToken({ isWide: true, totalRunsGained: 1 })).toBe('wd');
    expect(ballToken({ isWide: true, totalRunsGained: 3 })).toBe('2wd');
    expect(ballToken({ isNoBall: true, runsScored: 0 })).toBe('nb');
    expect(ballToken({ isByes: true, runsScored: 2 })).toBe('b2');
    expect(ballToken({ runsScored: 4 })).toBe('4');
  });

  it('feed text is factual and names striker/bowler', () => {
    expect(ballFeedText({ isWicket: true, striker: 'RIYAD', bowler: 'ALAMIN', dismissalType: 'bowled' }).text).toContain('ALAMIN removes RIYAD');
    expect(ballFeedText({ runsScored: 6, striker: 'RIYAD', bowler: 'ALAMIN' }).kind).toBe('six');
    expect(ballFeedText({ runsScored: 0, striker: 'RIYAD', bowler: 'ALAMIN' }).text).toContain('Dot ball');
  });
});

describe('shell wiring for the live route', () => {
  it('the shell 404 redirector knows the /live/ pattern', () => {
    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    const script = fs.readFileSync(path.join(process.cwd(), 'scripts', 'build-shell.mjs'), 'utf8');
    expect(script).toContain("['/live/','/live/_/']");
  });
});

describe('predictChaseWinPct', () => {
  it('target reached is 98, no balls left is null', () => {
    expect(predictChaseWinPct({ runsNeeded: 0, ballsLeft: 10, ballsBowled: 100, wicketsLeft: 5 })).toBe(98);
    expect(predictChaseWinPct({ runsNeeded: 5, ballsLeft: 0, ballsBowled: 120, wicketsLeft: 5 })).toBeNull();
  });

  it('easy chase scores high, impossible chase scores low', () => {
    const easy = predictChaseWinPct({ runsNeeded: 10, ballsLeft: 30, ballsBowled: 90, wicketsLeft: 8 });
    const hard = predictChaseWinPct({ runsNeeded: 60, ballsLeft: 6, ballsBowled: 114, wicketsLeft: 3 });
    expect(easy!).toBeGreaterThan(70);
    expect(hard!).toBeLessThan(10);
  });

  it('very early chase stays near 50', () => {
    const early = predictChaseWinPct({ runsNeeded: 180, ballsLeft: 114, ballsBowled: 6, wicketsLeft: 10 });
    expect(early!).toBeGreaterThanOrEqual(40);
    expect(early!).toBeLessThanOrEqual(60);
  });
});
