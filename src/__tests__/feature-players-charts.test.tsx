// @vitest-environment jsdom
/**
 * Career player profiles + match charts (improvement programme).
 *
 * Covers:
 *  - aggregateCareers across two matches: a player shared by stable
 *    playerId across a RENAME ('Rahim' → 'Rahim Uddin'), a player
 *    shared by name fallback only ('Karim'), bowling best figures,
 *    fielding credits from fall-of-wicket fielders, MoM by id and
 *    by name, and squad seeding for a player who never played.
 *  - playerKey mint/parse/resolve/find round-trips.
 *  - buildOverSeries: completed overs from bowler overHistory,
 *    extras counting (wides / no-balls / byes / penalties), the
 *    in-progress final over from thisOverLog, no double-count at an
 *    exact over boundary, and the empty legacy case.
 *  - WormChart / ManhattanChart render their series and their
 *    empty states.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import type {
  Bowler,
  InningsData,
  MatchScorecard,
  Player,
} from '@/domain/cricket/types';
import type { SavedTeam } from '@/infrastructure/database/dexie-db';
import {
  aggregateCareers,
  findCareerPlayer,
  parsePlayerKey,
  playerKeyForName,
  playerKeyForRecord,
  resolvePlayerKey,
  sortCareerPlayers,
} from '@/features/players/careerStats';
import {
  buildOverSeries,
  buildOverSeriesFromInnings,
  overLogTokenIsWicket,
  overLogTokenRuns,
} from '@/components/scoring/charts/overSeries';
import { WormChart } from '@/components/scoring/charts/WormChart';
import { ManhattanChart } from '@/components/scoring/charts/ManhattanChart';
import { renderToHtml } from './helpers/render-dom';

// ── Fixture builders (mirrors the f9 suite's pattern) ────────────

function batter(overrides: Partial<Player>): Player {
  return {
    id: overrides.id || 'p_x',
    playerId: overrides.playerId,
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
    playerId: overrides.playerId,
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
    team: overrides.team || 'Tigers',
    bowlingTeam: overrides.bowlingTeam || 'Lions',
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
    currentPartnership: {
      batter1Name: '',
      batter2Name: '',
      runs: 0,
      balls: 0,
    } as unknown as InningsData['currentPartnership'],
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

function scorecard(overrides: Record<string, unknown>): MatchScorecard {
  return {
    teamA: 'Tigers',
    teamB: 'Lions',
    status: 'COMPLETED',
    updatedAt: '2026-01-01T00:00:00Z',
    advancedSettings: { wideRun: 1, noBallRun: 1 },
    ...overrides,
  } as unknown as MatchScorecard;
}

// ── Match 1: Tigers 30/2 (2 ov) beat Lions 21/1 (2.3 ov) ────────

const OVER_A = ['4', 'Wd', '1', 'W', 'Nb2', '6', '0']; // 15 runs, 1 wkt
const OVER_B = ['B2', 'LB1', '2+W', '+5P', '0', '1', '4']; // 15 runs, 1 wkt

const match1 = scorecard({
  id: 'm1',
  createdAt: '2026-01-01T10:00:00Z',
  result: 'Tigers won by 9 runs',
  momStats: { playerId: 'pl_rahim', name: 'Rahim', runs: 75, balls: 40, wickets: 0, catches: 0 },
  firstInnings: innings({
    inningsNumber: 1,
    team: 'Tigers',
    bowlingTeam: 'Lions',
    totalRuns: 30,
    totalWickets: 2,
    totalBalls: 12,
    players: [
      batter({ id: 'p1', playerId: 'pl_rahim', name: 'Rahim', runs: 75, balls: 40, fours: 8, sixes: 2 }),
      batter({ id: 'p2', name: 'Karim', battingPosition: '2', runs: 10, balls: 8, isDismissed: true, dismissalType: 'Caught' }),
      batter({ id: 'p3', name: 'Nabil', battingPosition: '3', runs: 0, balls: 1, isDismissed: true, dismissalType: 'Run Out' }),
    ],
    bowlers: [
      bowler({
        id: 'b1',
        name: 'Imran',
        ballsBowled: 12,
        runs: 30,
        wickets: 1,
        overHistory: [
          { overNumber: 1, log: OVER_A },
          { overNumber: 2, log: OVER_B },
        ],
      }),
    ],
    fallOfWickets: [
      { score: 18, wicket: 1, over: '1.4', player: 'Karim', dismissal: 'c Shakib b Imran', dismissalType: 'Caught', fielder: 'Shakib', bowler: 'Imran' },
      { score: 30, wicket: 2, over: '2.6', player: 'Nabil', dismissal: 'run out (Rahim)', dismissalType: 'Run Out', fielder: 'Rahim' },
    ],
    // At an exact over boundary thisOverLog duplicates over 2 and
    // must NOT be counted again.
    thisOverLog: OVER_B,
  }),
  secondInnings: innings({
    inningsNumber: 2,
    team: 'Lions',
    bowlingTeam: 'Tigers',
    totalRuns: 21,
    totalWickets: 1,
    totalBalls: 15,
    players: [
      batter({ id: 'p4', playerId: 'pl_shakib', name: 'Shakib', runs: 12, balls: 9, isDismissed: true, dismissalType: 'Stumped' }),
      batter({ id: 'p5', name: 'Imran', battingPosition: '2', runs: 9, balls: 6 }),
    ],
    bowlers: [
      bowler({
        id: 'b2',
        playerId: 'pl_rahim',
        name: 'Rahim',
        ballsBowled: 12,
        runs: 14,
        wickets: 0,
        overHistory: [
          { overNumber: 1, log: ['1', '1', '1', '1', '1', '1'] },
          { overNumber: 2, log: ['4', '0', '4', '0', '0', '0'] },
        ],
      }),
      bowler({ id: 'b3', name: 'Karim', ballsBowled: 3, runs: 7, wickets: 1 }),
    ],
    fallOfWickets: [
      { score: 20, wicket: 1, over: '3.2', player: 'Shakib', dismissal: 'st Karim b Karim', dismissalType: 'Stumped', fielder: 'Karim', bowler: 'Karim' },
    ],
    // Innings ended mid-over: the partial over lives only here.
    thisOverLog: ['6', 'W', '1'],
  }),
});

// ── Match 2: the rematch — Rahim renamed, Karim is MoM by name ───

const match2 = scorecard({
  id: 'm2',
  createdAt: '2026-02-01T10:00:00Z',
  result: 'Tigers won by 12 runs',
  mom: 'Karim',
  firstInnings: innings({
    inningsNumber: 1,
    team: 'Tigers',
    bowlingTeam: 'Lions',
    totalRuns: 88,
    totalWickets: 1,
    totalBalls: 24,
    players: [
      batter({ id: 'p1', playerId: 'pl_rahim', name: 'Rahim Uddin', runs: 55, balls: 30, fours: 5, sixes: 1, isDismissed: true, dismissalType: 'Bowled' }),
      batter({ id: 'p2', name: 'Karim', battingPosition: '2', runs: 33, balls: 20, fours: 3 }),
    ],
    bowlers: [
      bowler({
        id: 'b4',
        playerId: 'pl_shakib',
        name: 'Shakib',
        ballsBowled: 24,
        runs: 40,
        wickets: 3,
        overHistory: [{ overNumber: 1, log: ['1', '1', '1', '1', '1', '1'] }],
      }),
    ],
    fallOfWickets: [
      { score: 70, wicket: 1, over: '3.4', player: 'Rahim Uddin', dismissal: 'b Shakib', dismissalType: 'Bowled', bowler: 'Shakib' },
    ],
  }),
  secondInnings: innings({
    inningsNumber: 2,
    team: 'Lions',
    bowlingTeam: 'Tigers',
    totalRuns: 76,
    totalWickets: 4,
    totalBalls: 24,
    players: [
      batter({ id: 'p4', playerId: 'pl_shakib', name: 'Shakib', runs: 5, balls: 4, isDismissed: true, dismissalType: 'Bowled' }),
    ],
    bowlers: [
      bowler({ id: 'b5', playerId: 'pl_rahim', name: 'Rahim Uddin', ballsBowled: 6, runs: 5, wickets: 1 }),
    ],
  }),
});

const tigersTeam: SavedTeam = {
  id: 't1',
  name: 'Tigers',
  captain: '',
  manager: '',
  players: [
    { id: 'pl_rahim', name: 'Rahim Uddin' },
    { id: 'pl_newguy', name: 'New Guy' },
  ],
  createdAt: '2025-12-01T00:00:00Z',
};

const careers = aggregateCareers([match1, match2], [tigersTeam]);
const byKey = (key: string) => careers.find((c) => c.key === key);

// ── Career aggregation ───────────────────────────────────────────

describe('aggregateCareers', () => {
  it('unifies a renamed player across matches by stable playerId', () => {
    const rahim = byKey('pl_rahim');
    expect(rahim).toBeTruthy();
    expect(rahim!.playerId).toBe('pl_rahim');
    // Most recent recorded name wins; both variants are kept.
    expect(rahim!.name).toBe('Rahim Uddin');
    expect(rahim!.nameVariants).toEqual(['Rahim', 'Rahim Uddin']);
    expect(rahim!.teams).toContain('Tigers');
    expect(rahim!.matchesPlayed).toBe(2);
  });

  it('aggregates career batting for the id-shared player', () => {
    const b = byKey('pl_rahim')!.batting;
    expect(b.matches).toBe(2);
    expect(b.innings).toBe(2);
    expect(b.runs).toBe(130);
    expect(b.balls).toBe(70);
    expect(b.highScore).toBe(75);
    expect(b.highScoreNotOut).toBe(true);
    expect(b.fifties).toBe(2); // 75 and 55 are both 50s (sub-100) scores
    expect(b.hundreds).toBe(0);
    expect(b.notOuts).toBe(1);
    expect(b.average).toBe(130); // 130 runs / 1 dismissal
    expect(b.strikeRate).toBeCloseTo((130 / 70) * 100, 1);
    expect(b.fours).toBe(13);
    expect(b.sixes).toBe(3);
    expect(b.ducks).toBe(0);
  });

  it('aggregates career bowling incl. best figures', () => {
    const rahim = byKey('pl_rahim')!.bowling;
    expect(rahim.innings).toBe(2);
    expect(rahim.balls).toBe(18);
    expect(rahim.runs).toBe(19);
    expect(rahim.wickets).toBe(1);
    expect(rahim.bestWickets).toBe(1);
    expect(rahim.bestRuns).toBe(5);
    expect(rahim.average).toBe(19);

    const shakib = byKey('pl_shakib')!.bowling;
    expect(shakib.wickets).toBe(3);
    expect(shakib.bestWickets).toBe(3);
    expect(shakib.bestRuns).toBe(40);
    expect(shakib.average).toBeCloseTo(40 / 3, 5);
  });

  it('unifies a name-only player across matches by name fallback', () => {
    const karim = byKey(playerKeyForName('Karim'));
    expect(karim).toBeTruthy();
    expect(karim!.playerId).toBeNull();
    expect(karim!.batting.innings).toBe(2);
    expect(karim!.batting.runs).toBe(43);
    expect(karim!.batting.notOuts).toBe(1);
    expect(karim!.batting.average).toBe(43);
    expect(karim!.batting.highScore).toBe(33);
    expect(karim!.batting.highScoreNotOut).toBe(true);
    expect(karim!.bowling.wickets).toBe(1);
    expect(karim!.matchesPlayed).toBe(2);
  });

  it('credits fielding dismissals from fall-of-wicket fielders', () => {
    expect(byKey('pl_shakib')!.fielding.catches).toBe(1);
    expect(byKey(playerKeyForName('Karim'))!.fielding.stumpings).toBe(1);
    // 'Rahim' had no id on the FoW credit, but the name is a known
    // variant of pl_rahim — the run out lands on the id career.
    expect(byKey('pl_rahim')!.fielding.runOuts).toBe(1);
    expect(byKey('pl_rahim')!.fielding.total).toBe(1);
  });

  it('counts MoM by stable id and by name fallback', () => {
    expect(byKey('pl_rahim')!.momCount).toBe(1);
    expect(byKey(playerKeyForName('Karim'))!.momCount).toBe(1);
    const m1 = byKey('pl_rahim')!.appearances.find((a) => a.matchId === 'm1');
    expect(m1?.isMom).toBe(true);
    expect(m1?.batting).toEqual({ runs: 75, balls: 40, fours: 8, sixes: 2, dismissed: false });
    expect(m1?.bowling).toEqual({ balls: 12, runs: 14, wickets: 0 });
  });

  it('records ducks and zero averages honestly', () => {
    const nabil = byKey(playerKeyForName('Nabil'))!;
    expect(nabil.batting.ducks).toBe(1);
    expect(nabil.batting.runs).toBe(0);
    expect(nabil.batting.average).toBe(0);
    expect(nabil.matchesPlayed).toBe(1);
  });

  it('seeds squad players who have never played a match', () => {
    const rookie = byKey('pl_newguy');
    expect(rookie).toBeTruthy();
    expect(rookie!.matchesPlayed).toBe(0);
    expect(rookie!.batting.runs).toBe(0);
    expect(rookie!.teams).toEqual(['Tigers']);
  });

  it('orders appearances most-recent first and sorts the list', () => {
    const rahim = byKey('pl_rahim')!;
    expect(rahim.appearances.map((a) => a.matchId)).toEqual(['m2', 'm1']);
    expect(sortCareerPlayers(careers)[0].key).toBe('pl_rahim');
  });
});

// ── playerKey scheme ─────────────────────────────────────────────

describe('playerKey scheme', () => {
  it('mints id keys and encoded name keys', () => {
    expect(playerKeyForRecord({ playerId: 'pl_abc', name: 'Who Ever' })).toBe('pl_abc');
    expect(playerKeyForRecord({ name: 'A B' })).toBe('n_A%20B');
    expect(playerKeyForName('A B')).toBe('n_A%20B');
  });

  it('parses keys back', () => {
    expect(parsePlayerKey('pl_rahim')).toEqual({ kind: 'id', playerId: 'pl_rahim' });
    expect(parsePlayerKey(playerKeyForName('A B'))).toEqual({ kind: 'name', name: 'A B' });
  });

  it('resolves names to stable ids when the name is a known variant', () => {
    expect(resolvePlayerKey([match1, match2], 'Rahim')).toBe('pl_rahim');
    expect(resolvePlayerKey([match1, match2], 'Rahim Uddin')).toBe('pl_rahim');
    expect(resolvePlayerKey([match1, match2], 'Karim')).toBe(playerKeyForName('Karim'));
  });

  it('finds careers by id key, exact name key, and old-name variant', () => {
    expect(findCareerPlayer(careers, 'pl_rahim')?.name).toBe('Rahim Uddin');
    expect(findCareerPlayer(careers, playerKeyForName('Karim'))?.playerId).toBeNull();
    // A link minted under the OLD name still lands on the unified career.
    expect(findCareerPlayer(careers, playerKeyForName('Rahim'))?.key).toBe('pl_rahim');
    expect(findCareerPlayer(careers, 'pl_missing')).toBeUndefined();
  });
});

// ── Over-series builder ──────────────────────────────────────────

describe('over-series builder', () => {
  it('counts extras toward team runs per over', () => {
    expect(overLogTokenRuns('4')).toBe(4);
    expect(overLogTokenRuns('Wd')).toBe(1);
    expect(overLogTokenRuns('Wd3')).toBe(4);
    expect(overLogTokenRuns('Wd+2+W')).toBe(3);
    expect(overLogTokenRuns('Nb')).toBe(1);
    expect(overLogTokenRuns('Nb2')).toBe(3);
    expect(overLogTokenRuns('B')).toBe(0);
    expect(overLogTokenRuns('B2')).toBe(2);
    expect(overLogTokenRuns('LB1')).toBe(1);
    expect(overLogTokenRuns('2+W')).toBe(2);
    expect(overLogTokenRuns('W')).toBe(0);
    expect(overLogTokenRuns('+5P')).toBe(5);
    expect(overLogTokenRuns('-5P')).toBe(0);
    expect(overLogTokenRuns('Wd', { wideRun: 2 })).toBe(2);
    expect(overLogTokenRuns('Nb', { noBallRun: 3 })).toBe(3);
  });

  it('detects wickets without flagging plain wides', () => {
    expect(overLogTokenIsWicket('W')).toBe(true);
    expect(overLogTokenIsWicket('2+W')).toBe(true);
    expect(overLogTokenIsWicket('Wd+W')).toBe(true);
    expect(overLogTokenIsWicket('Wd')).toBe(false);
    expect(overLogTokenIsWicket('Nb2')).toBe(false);
    expect(overLogTokenIsWicket('4')).toBe(false);
  });

  it('rebuilds completed overs from bowler overHistory', () => {
    expect(buildOverSeries(match1, 1)).toEqual([
      { over: 1, runs: 15, wickets: 1, cumulative: 15 },
      { over: 2, runs: 15, wickets: 1, cumulative: 30 },
    ]);
  });

  it('includes the in-progress final over from thisOverLog', () => {
    expect(buildOverSeries(match1, 2)).toEqual([
      { over: 1, runs: 6, wickets: 0, cumulative: 6 },
      { over: 2, runs: 8, wickets: 0, cumulative: 14 },
      { over: 3, runs: 7, wickets: 1, cumulative: 21 },
    ]);
  });

  it('returns an empty series for legacy innings without over logs', () => {
    const legacy = innings({ totalBalls: 12, totalRuns: 40 });
    expect(buildOverSeriesFromInnings(legacy)).toEqual([]);
    expect(buildOverSeriesFromInnings(undefined)).toEqual([]);
  });
});

// ── Chart components ─────────────────────────────────────────────

describe('chart components', () => {
  const seriesA = buildOverSeries(match1, 1);
  const seriesB = buildOverSeries(match1, 2);

  it('WormChart renders both innings lines with a legend', () => {
    const html = renderToHtml(
      <WormChart
        series={[
          { label: 'Tigers', points: seriesA },
          { label: 'Lions', points: seriesB },
        ]}
        target={31}
      />
    );
    expect(html).toContain('worm-chart');
    expect(html).toContain('Tigers');
    expect(html).toContain('Lions');
    expect(html).toContain('<path');
    expect(html).toContain('Target 31');
    expect(html).not.toContain('worm-chart-empty');
  });

  it('WormChart renders its empty state when no series has data', () => {
    const html = renderToHtml(
      <WormChart series={[{ label: 'Tigers', points: [] }]} emptyLabel="No over data here" />
    );
    expect(html).toContain('worm-chart-empty');
    expect(html).toContain('No over data here');
  });

  it('ManhattanChart renders one bar per over with wicket dots', () => {
    const html = renderToHtml(<ManhattanChart series={seriesB} label="Lions" />);
    expect(html).toContain('manhattan-chart');
    expect(html).toContain('Lions');
    expect((html.match(/<rect/g) || []).length).toBe(3);
    expect((html.match(/<circle/g) || []).length).toBe(1); // one wicket, in over 3
    expect(html).not.toContain('manhattan-chart-empty');
  });

  it('ManhattanChart renders its empty state for an empty series', () => {
    const html = renderToHtml(<ManhattanChart series={[]} emptyLabel="Nothing recorded" />);
    expect(html).toContain('manhattan-chart-empty');
    expect(html).toContain('Nothing recorded');
  });
});
