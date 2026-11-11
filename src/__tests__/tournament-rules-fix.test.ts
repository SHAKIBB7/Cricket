/**
 * League rules audit fixes (2026-11-11) — regression tests.
 *
 * The audit found the points table ran two rule systems at
 * once (points from fixtures, NRR from raw matches) plus a
 * set of seam bugs between the engine fixtures, the schedule
 * and the match records. Each test names the finding it pins.
 */
import { describe, it, expect } from 'vitest';
import { TournamentEngine } from '../domain/tournament/TournamentEngine';
import { NetRunRateEngine } from '../domain/tournament/NetRunRateEngine';
import {
  generateRoundRobinFixtures,
  linkScheduleToMatches,
  resolveKnockoutAdvancement,
  type ScheduleFixture,
} from '../features/tournaments/fixtures';

const mkMatch = (over: Record<string, unknown> = {}): any => ({
  id: 'm-x',
  status: 'COMPLETED',
  teamA: 'A',
  teamB: 'B',
  winner: 'A',
  resultType: 'WIN',
  result: 'A won by 40 runs',
  totalOvers: 20,
  createdAt: '2026-01-01T00:00:00.000Z',
  advancedSettings: { tournamentId: 'T1', players: 11 },
  firstInnings: {
    team: 'A',
    bowlingTeam: 'B',
    totalRuns: 180,
    totalBalls: 120,
    totalWickets: 5,
    players: [],
    bowlers: [],
  },
  secondInnings: {
    team: 'B',
    bowlingTeam: 'A',
    totalRuns: 140,
    totalBalls: 120,
    totalWickets: 9,
    players: [],
    bowlers: [],
  },
  ...over,
});

function leagueOf(teams: string[], id = 'T1'): any {
  const t = TournamentEngine.createTournament({
    name: 'Rules League',
    format: 'league',
    teams,
  });
  return { ...t, id };
}

function decideAll(t: any, winners: Record<string, string>): any {
  // winners keyed by "HOME>AWAY"
  let cur = t;
  for (const f of [...cur.fixtures]) {
    if (f.stage !== 'league') continue;
    const key = `${f.homeTeam}>${f.awayTeam}`;
    const winner = winners[key];
    if (winner) {
      cur = TournamentEngine.recordWinner({ tournament: cur, fixtureId: f.id, winner });
    }
  }
  return cur;
}

describe('points table coherence (audit verdict)', () => {
  it('a fixture-less tournament match counts for points AND NRR', () => {
    const t = leagueOf(['A', 'B', 'C']);
    const table = TournamentEngine.standings(t, [mkMatch({ id: 'm-free' })]);
    const a = table.find((r: any) => r.team === 'A')!;
    const b = table.find((r: any) => r.team === 'B')!;
    expect(a.played).toBe(1);
    expect(a.wins).toBe(1);
    expect(a.points).toBe(2);
    expect(b.losses).toBe(1);
    expect(a.netRunRate).toBeGreaterThan(0);
    expect(b.netRunRate).toBeLessThan(0);
  });

  it('a fixture-less abandoned match awards one point each and no NRR', () => {
    const t = leagueOf(['A', 'B', 'C']);
    const table = TournamentEngine.standings(t, [
      mkMatch({
        id: 'm-rain',
        status: 'ABANDONED',
        resultType: 'NO_RESULT',
        winner: undefined,
        firstInnings: null,
        secondInnings: null,
      }),
    ]);
    const a = table.find((r: any) => r.team === 'A')!;
    expect(a.played).toBe(1);
    expect(a.points).toBe(1);
    expect(a.netRunRate).toBe(0);
  });
});

describe('H2 — NRR scoping', () => {
  it('a playoff match linked to a playoff fixture does not move league NRR', () => {
    let t = leagueOf(['A', 'B', 'C', 'D']);
    t = decideAll(t, {
      'A>B': 'A', 'C>D': 'C', 'A>C': 'A', 'B>D': 'B', 'A>D': 'A', 'B>C': 'B',
    });
    // Pairings come from the circle method; decide whatever exists.
    if (!t.fixtures.some((f: any) => f.stage === 'qualifier1')) {
      for (const f of [...t.fixtures]) {
        if (f.stage === 'league' && !f.winner) {
          t = TournamentEngine.recordWinner({
            tournament: t,
            fixtureId: f.id,
            winner: f.homeTeam,
          });
        }
      }
    }
    const q1 = t.fixtures.find((f: any) => f.stage === 'qualifier1');
    expect(q1).toBeDefined();
    const withLink = {
      ...t,
      fixtures: t.fixtures.map((f: any) =>
        f.id === q1.id ? { ...f, matchId: 'm-q1' } : f
      ),
    };
    const table = TournamentEngine.standings(withLink, [
      mkMatch({
        id: 'm-q1',
        teamA: q1.homeTeam,
        teamB: q1.awayTeam,
        winner: q1.homeTeam,
        advancedSettings: { tournamentId: 'T1', players: 11, fixtureId: q1.id },
      }),
    ]);
    for (const row of table) expect(row.netRunRate).toBe(0);
  });

  it('a super-over record never feeds NRR', () => {
    const t = leagueOf(['A', 'B', 'C']);
    const table = TournamentEngine.standings(t, [
      mkMatch({
        id: 'm-so',
        advancedSettings: { tournamentId: 'T1', players: 11, isSuperOver: true },
        firstInnings: {
          team: 'A', bowlingTeam: 'B', totalRuns: 18, totalBalls: 6,
          totalWickets: 0, players: [], bowlers: [],
        },
        secondInnings: {
          team: 'B', bowlingTeam: 'A', totalRuns: 12, totalBalls: 6,
          totalWickets: 1, players: [], bowlers: [],
        },
      }),
    ]);
    for (const row of table) expect(row.netRunRate).toBe(0);
  });
});

describe('H3 — cleared results leave nothing behind', () => {
  it('clearResult drops the match link and the cleared match stops feeding NRR', () => {
    let t = leagueOf(['A', 'B', 'C']);
    const fixture = t.fixtures[0];
    t = TournamentEngine.recordWinner({
      tournament: t,
      fixtureId: fixture.id,
      winner: fixture.homeTeam,
    });
    t = {
      ...t,
      fixtures: t.fixtures.map((f: any) =>
        f.id === fixture.id ? { ...f, matchId: 'm-old' } : f
      ),
    };
    const cleared = TournamentEngine.clearResult({ tournament: t, fixtureId: fixture.id });
    const f = cleared.fixtures.find((x: any) => x.id === fixture.id)!;
    expect(f.matchId).toBeUndefined();
    const table = TournamentEngine.standings(cleared, [
      mkMatch({
        id: 'm-old',
        teamA: fixture.homeTeam,
        teamB: fixture.awayTeam,
        winner: fixture.homeTeam,
        advancedSettings: { tournamentId: 'T1', players: 11, fixtureId: fixture.id },
      }),
    ]);
    for (const row of table) expect(row.netRunRate).toBe(0);
  });
});

describe('H4 — no-result is a real result', () => {
  it('recordNoResult awards a point each and counts as played', () => {
    let t = leagueOf(['A', 'B', 'C']);
    const fixture = t.fixtures[0];
    t = TournamentEngine.recordNoResult({ tournament: t, fixtureId: fixture.id });
    const table = TournamentEngine.standings(t, []);
    const home = table.find((r: any) => r.team === fixture.homeTeam)!;
    const away = table.find((r: any) => r.team === fixture.awayTeam)!;
    expect(home.played).toBe(1);
    expect(home.points).toBe(1);
    expect(away.played).toBe(1);
    expect(away.points).toBe(1);
  });

  it('a league whose only undecided match is a no-result still reaches the playoffs', () => {
    let t = leagueOf(['A', 'B', 'C', 'D']);
    const fixtures = [...t.fixtures];
    fixtures.forEach((f, i) => {
      if (i === 0) {
        t = TournamentEngine.recordNoResult({ tournament: t, fixtureId: f.id });
      } else {
        t = TournamentEngine.recordWinner({
          tournament: t,
          fixtureId: f.id,
          winner: f.homeTeam,
        });
      }
    });
    expect(t.fixtures.some((f: any) => f.stage === 'qualifier1')).toBe(true);
    expect(t.fixtures.some((f: any) => f.stage === 'eliminator')).toBe(true);
  });
});

describe('M3 — playoff results survive a correction that changes nothing', () => {
  function completedSeason(): any {
    let t = leagueOf(['A', 'B', 'C', 'D', 'E']);
    // A wins all, B beats C/D/E, C beats D/E, D beats E.
    const winners: Record<string, string> = {};
    for (const f of t.fixtures) {
      const pair = [f.homeTeam, f.awayTeam].sort().join('|');
      winners[`${f.homeTeam}>${f.awayTeam}`] =
        pair === 'A|B' || pair === 'A|C' || pair === 'A|D' || pair === 'A|E'
          ? 'A'
          : pair === 'B|C' || pair === 'B|D' || pair === 'B|E'
            ? 'B'
            : pair === 'C|D' || pair === 'C|E'
              ? 'C'
              : 'D';
    }
    t = decideAll(t, winners);
    const play = (stage: string, winner: string) => {
      const f = t.fixtures.find((x: any) => x.stage === stage);
      t = TournamentEngine.recordWinner({ tournament: t, fixtureId: f.id, winner });
    };
    play('qualifier1', 'A');
    play('eliminator', 'C');
    play('qualifier2', 'C');
    play('final', 'A');
    expect(t.champion).toBe('A');
    return t;
  }

  it('flipping a result that keeps the top four keeps the whole postseason', () => {
    let t = completedSeason();
    // Flip B vs E to E: B drops to 4 pts (level with C, ahead on
    // the wins/name tiebreaks), E rises to 2 (level with D,
    // behind on name) — the ordered top four is unchanged.
    const be = t.fixtures.find(
      (f: any) =>
        f.stage === 'league' &&
        [f.homeTeam, f.awayTeam].sort().join('|') === 'B|E'
    )!;
    t = TournamentEngine.recordWinner({ tournament: t, fixtureId: be.id, winner: 'E' });
    expect(t.champion).toBe('A');
    const final = t.fixtures.find((f: any) => f.stage === 'final');
    expect(final?.winner).toBe('A');
  });

  it('flipping a result that changes the top four regenerates the postseason', () => {
    let t = completedSeason();
    // Flip D vs E to E: E takes 4th place from D.
    const de = t.fixtures.find(
      (f: any) =>
        f.stage === 'league' &&
        [f.homeTeam, f.awayTeam].sort().join('|') === 'D|E'
    )!;
    t = TournamentEngine.recordWinner({ tournament: t, fixtureId: de.id, winner: 'E' });
    expect(t.champion).toBeUndefined();
    const el = t.fixtures.find((f: any) => f.stage === 'eliminator');
    expect([el.homeTeam, el.awayTeam].sort()).toEqual(['C', 'E']);
    expect(el.winner).toBeUndefined();
  });
});

describe('M2 — schedule round-robin honours leagueMeetings', () => {
  it('two meetings produce two full circles with swapped venues', () => {
    const fixtures = generateRoundRobinFixtures(['A', 'B', 'C', 'D'], { meetings: 2 });
    expect(fixtures).toHaveLength(12);
    expect(Math.max(...fixtures.map((f) => f.round))).toBe(6);
    const firstLeg = fixtures.filter((f) => f.round <= 3);
    const secondLeg = fixtures.filter((f) => f.round > 3);
    for (const f of firstLeg) {
      const mirror = secondLeg.find(
        (g) => g.homeTeam === f.awayTeam && g.awayTeam === f.homeTeam
      );
      expect(mirror).toBeDefined();
    }
  });
});

describe('M1 — schedule state never goes stale', () => {
  const bracket = (): ScheduleFixture[] => [
    { id: 's-sf1', round: 1, homeTeam: 'A', awayTeam: 'D', stage: 'SEMI', status: 'COMPLETED', winner: 'A', matchId: 'm1' },
    { id: 's-sf2', round: 1, homeTeam: 'B', awayTeam: 'C', stage: 'SEMI', status: 'COMPLETED', winner: 'C', matchId: 'm2' },
    { id: 's-final', round: 2, homeTeam: 'A', awayTeam: 'C', stage: 'FINAL', status: 'COMPLETED', winner: 'A', matchId: 'm3', resultText: 'A won' },
  ];

  it('changing a semi winner replaces the finalists and clears the old final result', () => {
    const changed = bracket().map((f) =>
      f.id === 's-sf1' ? { ...f, winner: 'D' } : f
    );
    const out = resolveKnockoutAdvancement(changed);
    const final = out.find((f) => f.stage === 'FINAL')!;
    expect(final.homeTeam).toBe('D');
    expect(final.awayTeam).toBe('C');
    expect(final.winner).toBeUndefined();
    expect(final.matchId).toBeUndefined();
    expect(final.status).toBe('SCHEDULED');
  });

  it('clearing a semi winner sends the final back to placeholders', () => {
    const changed = bracket().map((f) =>
      f.id === 's-sf1' ? { ...f, winner: undefined } : f
    );
    const out = resolveKnockoutAdvancement(changed);
    const final = out.find((f) => f.stage === 'FINAL')!;
    expect(final.homeTeam).toBe('Winner SF1');
    expect(final.winner).toBeUndefined();
  });

  it('a fixture whose linked match was deleted returns to unplayed', () => {
    const schedule: ScheduleFixture[] = [
      { id: 's-r1-0', round: 1, homeTeam: 'A', awayTeam: 'B', stage: 'LEAGUE', status: 'COMPLETED', winner: 'A', matchId: 'gone', resultText: 'A won' },
    ];
    const out = linkScheduleToMatches(schedule, [], 'T1');
    expect(out[0].status).toBe('SCHEDULED');
    expect(out[0].winner).toBeUndefined();
    expect(out[0].matchId).toBeUndefined();
  });
});

describe('M8 — super overs stay out of the cap tables', () => {
  it('generateLeaderboard ignores super-over records', () => {
    const soMatch: any = {
      id: 'm-so',
      advancedSettings: { tournamentId: 'T1', isSuperOver: true },
      firstInnings: {
        team: 'A',
        bowlingTeam: 'B',
        players: [],
        bowlers: [
          { name: 'Super Over Bowler', ballsBowled: 6, runs: 4, wickets: 3, maidens: 0, overHistory: [] },
        ],
      },
      secondInnings: null,
    };
    const { bowlingLeaders } = NetRunRateEngine.generateLeaderboard('T1', [soMatch]);
    expect(bowlingLeaders.find((b) => b.name === 'Super Over Bowler')).toBeUndefined();
  });
});

describe('L2 — league fixtures carry real rounds', () => {
  it('four teams produce three rounds with every team playing once per round', () => {
    const t = leagueOf(['A', 'B', 'C', 'D']);
    const rounds = new Map<number, string[]>();
    for (const f of t.fixtures) {
      const list = rounds.get(f.round) ?? [];
      list.push(f.homeTeam, f.awayTeam!);
      rounds.set(f.round, list);
    }
    expect([...rounds.keys()].sort()).toEqual([1, 2, 3]);
    for (const teams of rounds.values()) {
      expect(new Set(teams).size).toBe(4);
    }
    const pairs = new Set(
      t.fixtures.map((f: any) => [f.homeTeam, f.awayTeam].sort().join('|'))
    );
    expect(pairs.size).toBe(6);
  });
});

describe('correctness audit 2026-11-11 — findings 2, 3, 4, 8', () => {
  it('finding 2: a live fixture-less match moves neither points nor NRR', () => {
    const t = leagueOf(['A', 'B', 'C']);
    const live = mkMatch({
      id: 'm-live',
      status: 'ONGOING',
      winner: undefined,
      resultType: undefined,
      result: undefined,
      firstInnings: {
        team: 'A',
        bowlingTeam: 'B',
        totalRuns: 100,
        totalBalls: 60,
        totalWickets: 2,
        players: [],
        bowlers: [],
      },
      secondInnings: null,
    });
    const table = TournamentEngine.standings(t, [live]);
    const a = table.find((r: any) => r.team === 'A')!;
    const b = table.find((r: any) => r.team === 'B')!;
    expect(a.played).toBe(0);
    expect(a.points).toBe(0);
    expect(a.netRunRate).toBe(0);
    expect(b.netRunRate).toBe(0);
  });

  it('finding 4: a duplicated fixture-less abandoned match is counted once', () => {
    const t = leagueOf(['A', 'B', 'C']);
    const rain = mkMatch({
      id: 'm-rain-dup',
      status: 'ABANDONED',
      resultType: 'NO_RESULT',
      winner: undefined,
      firstInnings: null,
      secondInnings: null,
    });
    const table = TournamentEngine.standings(t, [rain, rain]);
    const a = table.find((r: any) => r.team === 'A')!;
    const b = table.find((r: any) => r.team === 'B')!;
    expect(a.played).toBe(1);
    expect(a.points).toBe(1);
    expect(b.played).toBe(1);
    expect(b.points).toBe(1);
  });

  it('finding 4: a duplicated completed fixture-less match counts once (points + NRR)', () => {
    const t = leagueOf(['A', 'B', 'C']);
    const m = mkMatch({ id: 'm-dup' });
    const single = TournamentEngine.standings(t, [m]);
    const doubled = TournamentEngine.standings(t, [m, m]);
    expect(doubled).toEqual(single);
    expect(doubled.find((r: any) => r.team === 'A')!.points).toBe(2);
  });

  it('finding 3: recordTie on a knockout semi prunes the generated final', () => {
    let t: any = TournamentEngine.createTournament({
      name: 'KO Cup',
      format: 'knockout',
      teams: ['A', 'B', 'C', 'D'],
    });
    const [sf1, sf2] = t.fixtures.filter((f: any) => f.round === 1);
    t = TournamentEngine.recordWinner({ tournament: t, fixtureId: sf1.id, winner: sf1.homeTeam });
    t = TournamentEngine.recordWinner({ tournament: t, fixtureId: sf2.id, winner: sf2.homeTeam });

    // Both semis decided -> the final exists and names SF1's winner.
    const finalBefore = t.fixtures.find((f: any) => f.round === 2);
    expect(finalBefore).toBeDefined();
    expect([finalBefore.homeTeam, finalBefore.awayTeam]).toContain(sf1.homeTeam);

    // Correcting SF1 to a tie must retract the final entirely.
    t = TournamentEngine.recordTie({ tournament: t, fixtureId: sf1.id });
    expect(t.fixtures.some((f: any) => f.round === 2)).toBe(false);
    expect(t.champion).toBeUndefined();
    const sf1After = t.fixtures.find((f: any) => f.id === sf1.id);
    expect(sf1After.isTie).toBe(true);
    expect(sf1After.winner).toBeUndefined();
  });

  it('finding 8: leaderboards skip abandoned and no-result matches', () => {
    const abandoned: any = {
      id: 'm-abandoned',
      status: 'ABANDONED',
      advancedSettings: { tournamentId: 'T1' },
      firstInnings: {
        team: 'A',
        bowlingTeam: 'B',
        players: [
          { name: 'Rain Batter', runs: 40, balls: 20, fours: 4, sixes: 1, dotBalls: 5, ballLog: [] },
        ],
        bowlers: [
          { name: 'Rain Bowler', ballsBowled: 30, runs: 40, wickets: 2, maidens: 0, overHistory: [] },
        ],
      },
      secondInnings: null,
    };
    const noResult: any = {
      ...abandoned,
      id: 'm-no-result',
      status: 'COMPLETED',
      resultType: 'NO_RESULT',
    };
    const { battingLeaders, bowlingLeaders } = NetRunRateEngine.generateLeaderboard('T1', [
      abandoned,
      noResult,
    ]);
    expect(battingLeaders.find((b) => b.name === 'Rain Batter')).toBeUndefined();
    expect(bowlingLeaders.find((b) => b.name === 'Rain Bowler')).toBeUndefined();
  });
});
