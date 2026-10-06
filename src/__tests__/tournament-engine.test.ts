import { describe, it, expect } from 'vitest';
import { TournamentEngine } from '../domain/tournament/TournamentEngine';
import { NetRunRateEngine } from '../domain/tournament/NetRunRateEngine';

describe('TournamentEngine', () => {
  it('knockout tournament advances winners through rounds and handles byes', () => {
    let tournament = TournamentEngine.createTournament({
      name: 'Asia Cup Knockout',
      format: 'knockout',
      teams: ['Bangladesh', 'India', 'Pakistan'],
    });

    expect(tournament.fixtures).toHaveLength(2);
    // Odd team count => Pakistan receives a bye and is already recorded as winner
    const byeFixture = tournament.fixtures.find((f) => !f.awayTeam);
    expect(byeFixture).toBeDefined();
    expect(byeFixture?.winner).toBe('Pakistan');

    const firstMatch = tournament.fixtures.find((f) => !!f.awayTeam)!;
    tournament = TournamentEngine.recordWinner({
      tournament,
      fixtureId: firstMatch.id,
      winner: 'Bangladesh',
    });

    // Final should be automatically generated between Bangladesh and Pakistan!
    const finalMatch = tournament.fixtures.find((f) => f.round === 2);
    expect(finalMatch).toBeDefined();
    expect(finalMatch?.homeTeam).toBe('Bangladesh');
    expect(finalMatch?.awayTeam).toBe('Pakistan');

    // Crown Champion
    tournament = TournamentEngine.recordWinner({
      tournament,
      fixtureId: finalMatch!.id,
      winner: 'Bangladesh',
    });
    expect(tournament.champion).toBe('Bangladesh');
  });

  it('league tournament calculates points table accurately', () => {
    let tournament = TournamentEngine.createTournament({
      name: 'Tri-Nation Series',
      format: 'league',
      teams: ['A', 'B', 'C'],
    });

    expect(tournament.fixtures).toHaveLength(3);

    const matches: [string, string, string][] = [
      ['A', 'B', 'A'],
      ['A', 'C', 'C'],
      ['B', 'C', 'C'],
    ];

    for (const [home, away, winner] of matches) {
      const fixture = tournament.fixtures.find(
        (f) => f.homeTeam === home && f.awayTeam === away
      )!;
      tournament = TournamentEngine.recordWinner({
        tournament,
        fixtureId: fixture.id,
        winner,
      });
    }

    const table = TournamentEngine.standings(tournament);
    expect(table[0].team).toBe('C');
    expect(table[0].points).toBe(4);
    expect(table[0].wins).toBe(2);

    expect(table[1].team).toBe('A');
    expect(table[1].points).toBe(2);
    expect(table[1].wins).toBe(1);

    expect(table[2].team).toBe('B');
    expect(table[2].points).toBe(0);
    expect(table[2].losses).toBe(2);
  });

  it('handles tied matches: awards 1 point to each team', () => {
    let tournament = TournamentEngine.createTournament({
      name: 'Tied League',
      format: 'league',
      teams: ['A', 'B', 'C'],
    });

    const match = tournament.fixtures[0];
    tournament = TournamentEngine.recordTie({
      tournament,
      fixtureId: match.id,
    });

    const table = TournamentEngine.standings(tournament);
    const teamA = table.find((t) => t.team === match.homeTeam)!;
    const teamB = table.find((t) => t.team === match.awayTeam)!;

    expect(teamA.played).toBe(1);
    expect(teamA.ties).toBe(1);
    expect(teamA.points).toBe(1);

    expect(teamB.played).toBe(1);
    expect(teamB.ties).toBe(1);
    expect(teamB.points).toBe(1);
  });

  it('advances 4-team league into IPL-style playoffs', () => {
    let tournament = TournamentEngine.createTournament({
      name: 'Premier League',
      format: 'league',
      teams: ['A', 'B', 'C', 'D'],
    });

    // 6 league matches
    const leagueResults: [string, string, string][] = [
      ['A', 'B', 'A'],
      ['A', 'C', 'A'],
      ['A', 'D', 'A'],
      ['B', 'C', 'B'],
      ['B', 'D', 'B'],
      ['C', 'D', 'C'],
    ];

    for (const [home, away, winner] of leagueResults) {
      const fix = tournament.fixtures.find(
        (f) => f.homeTeam === home && f.awayTeam === away
      )!;
      tournament = TournamentEngine.recordWinner({
        tournament,
        fixtureId: fix.id,
        winner,
      });
    }

    // Qualifier 1 (1v2 -> A vs B) and Eliminator (3v4 -> C vs D) should be generated!
    const q1 = tournament.fixtures.find((f) => f.stage === 'qualifier1');
    const elim = tournament.fixtures.find((f) => f.stage === 'eliminator');

    expect(q1).toBeDefined();
    expect(q1?.homeTeam).toBe('A');
    expect(q1?.awayTeam).toBe('B');

    expect(elim).toBeDefined();
    expect(elim?.homeTeam).toBe('C');
    expect(elim?.awayTeam).toBe('D');

    // Q1 winner: B, Eliminator winner: C
    tournament = TournamentEngine.recordWinner({
      tournament,
      fixtureId: q1!.id,
      winner: 'B',
    });
    tournament = TournamentEngine.recordWinner({
      tournament,
      fixtureId: elim!.id,
      winner: 'C',
    });

    // Qualifier 2 should be Loser of Q1 (A) vs Winner of Eliminator (C)
    const q2 = tournament.fixtures.find((f) => f.stage === 'qualifier2');
    expect(q2).toBeDefined();
    expect(q2?.homeTeam).toBe('A');
    expect(q2?.awayTeam).toBe('C');

    // Q2 winner: A
    tournament = TournamentEngine.recordWinner({
      tournament,
      fixtureId: q2!.id,
      winner: 'A',
    });

    // Final should be Winner of Q1 (B) vs Winner of Q2 (A)
    const finalMatch = tournament.fixtures.find((f) => f.stage === 'final');
    expect(finalMatch).toBeDefined();
    expect(finalMatch?.homeTeam).toBe('B');
    expect(finalMatch?.awayTeam).toBe('A');

    // Final winner: A
    tournament = TournamentEngine.recordWinner({
      tournament,
      fixtureId: finalMatch!.id,
      winner: 'A',
    });

    expect(tournament.champion).toBe('A');
  });

  it('implements official ICC Net Run Rate all-out full quota rule', () => {
    // If a team is all out (10 wickets in an 11-player squad) in 15.2 overs (92 balls) in a 20-over match:
    // Divider is 20 * 6 = 120 balls!
    const nrrBalls = NetRunRateEngine.getNrrBallsForInnings(10, 92, 20, 11);
    expect(nrrBalls).toBe(120);

    // If NOT all out (e.g. 7 wickets in 20 overs):
    const notAllOutBalls = NetRunRateEngine.getNrrBallsForInnings(7, 120, 20, 11);
    expect(notAllOutBalls).toBe(120);

    // Calculate NRR:
    // Team scored 180 in 20 overs (RR = 9.0)
    // Conceded 140 in 20 overs (RR = 7.0)
    // NRR = +2.0
    const nrr = NetRunRateEngine.calculateNrr(180, 120, 140, 120);
    expect(nrr).toBe(2.0);
  });
});
