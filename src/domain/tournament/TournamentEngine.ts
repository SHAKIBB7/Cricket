/**
 * TournamentEngine — Full parity with Flutter TournamentEngine
 * Supports Knockout brackets with byes, League round-robin with multi-meetings,
 * IPL-style 4-team playoffs (Q1, Eliminator, Q2, Final), and standings calculations.
 */

import { Tournament, TournamentFixture, TournamentStanding, TournamentFormat } from './types';

export class TournamentEngine {
 private static newId(prefix: string): string {
 return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
 }

 static createTournament(params: {
 name: string;
 format: TournamentFormat;
 teams: string[];
 leagueMeetings?: number;
 matchOvers?: number;
 fixturePairings?: [string, string][];
 }): Tournament {
 const cleanPairings = params.fixturePairings
 ? this.cleanFixturePairings(params.fixturePairings)
 : undefined;

 const cleanTeams = cleanPairings
 ? this.teamsFromPairings(cleanPairings)
 : this.cleanTeamNames(params.teams);

 if (cleanTeams.length < 2) {
 throw new Error('Add at least two teams');
 }

 if (params.fixturePairings && cleanPairings && cleanPairings.length === 0) {
 throw new Error('Add at least one fixture');
 }

 if (
 params.format === 'knockout' &&
 cleanPairings &&
 this.hasDuplicateTeam(cleanPairings)
) {
 throw new Error('Each knockout team can only be selected once');
 }

 const leagueMeetings = Math.max(1, params.leagueMeetings || 1);
 const matchOvers = Math.max(1, params.matchOvers || 16);

 let fixtures: TournamentFixture[] = [];
 if (!cleanPairings) {
 fixtures =
 params.format === 'knockout'
 ? this.knockoutFixtures(cleanTeams, 1)
 : this.leagueFixtures(cleanTeams, leagueMeetings);
 } else {
 fixtures =
 params.format === 'knockout'
 ? this.knockoutFixturesFromPairings(cleanPairings, 1)
 : this.leagueFixturesFromPairings(cleanPairings, leagueMeetings);
 }

 return {
 id: this.newId('tournament'),
 name: params.name.trim() || '',
 format: params.format,
 teams: cleanTeams,
 fixtures,
 createdAt: new Date().toISOString(),
 leagueMeetings,
 matchOvers,
 };
 }

 static recordWinner(params: {
 tournament: Tournament;
 fixtureId: string;
 winner: string;
 }): Tournament {
 let changedRound: number | undefined;
 let changedStage: string | undefined;

 let fixtures = params.tournament.fixtures.map((fixture) => {
 if (fixture.id !== params.fixtureId) return fixture;
 const canWin =
 fixture.homeTeam === params.winner || fixture.awayTeam === params.winner;
 if (!canWin) return fixture;
 changedRound = fixture.round;
 changedStage = fixture.stage;
 return {
 ...fixture,
 winner: params.winner,
 loser: fixture.homeTeam === params.winner ? fixture.awayTeam : fixture.homeTeam,
 resultType: 'WIN' as const,
 isTie: false,
 resultText: `${params.winner} won`,
 };
 });

 if (params.tournament.format === 'knockout' && changedRound !== undefined) {
 fixtures = fixtures.filter((f) => f.round <= changedRound!);
 }

 if (params.tournament.format === 'league') {
 fixtures = this.pruneLeagueFixturesAfterChange(fixtures, changedStage);
 return this.advanceLeagueTournament({
 ...params.tournament,
 fixtures,
 champion: undefined,
 });
 }

 const updated: Tournament = {
 ...params.tournament,
 fixtures,
 champion: undefined,
 };
 return this.advanceKnockout(updated);
 }

 static recordTie(params: {
 tournament: Tournament;
 fixtureId: string;
 }): Tournament {
 let changedStage: string | undefined;

 let fixtures = params.tournament.fixtures.map((fixture) => {
 if (fixture.id !== params.fixtureId || !fixture.awayTeam) return fixture;
 changedStage = fixture.stage;
 return {
 ...fixture,
 winner: undefined,
 loser: undefined,
 resultType: 'TIE' as const,
 isTie: true,
 resultText: 'Match Tied',
 };
 });

 if (params.tournament.format === 'league') {
 fixtures = this.pruneLeagueFixturesAfterChange(fixtures, changedStage);
 return this.advanceLeagueTournament({
 ...params.tournament,
 fixtures,
 champion: undefined,
 });
 }

 return {
 ...params.tournament,
 fixtures,
 champion: undefined,
 };
 }

 static standings(tournament: Tournament): TournamentStanding[] {
 const rows = new Map<string, TournamentStanding>();

 for (const team of tournament.teams) {
 rows.set(team, {
 team,
 played: 0,
 wins: 0,
 ties: 0,
 losses: 0,
 points: 0,
 runsFor: 0,
 ballsFor: 0,
 runsAgainst: 0,
 ballsAgainst: 0,
 netRunRate: 0,
 });
 }

 for (const fixture of tournament.fixtures) {
 if (
 tournament.format === 'league' &&
 fixture.stage !== 'league'
) {
 continue;
 }

 const away = fixture.awayTeam;
 if (!away) continue; // Bye fixture

 const homeRow = rows.get(fixture.homeTeam);
 const awayRow = rows.get(away);

 if (fixture.isTie || fixture.resultType === 'TIE') {
 if (homeRow) {
 homeRow.played += 1;
 homeRow.ties += 1;
 homeRow.points += 1;
 }
 if (awayRow) {
 awayRow.played += 1;
 awayRow.ties += 1;
 awayRow.points += 1;
 }
 continue;
 }

 const winner = fixture.winner;
 if (!winner) continue;

 const loser = winner === fixture.homeTeam ? away : fixture.homeTeam;
 const winRow = rows.get(winner);
 const loseRow = rows.get(loser);

 if (winRow) {
 winRow.played += 1;
 winRow.wins += 1;
 winRow.points += 2;
 }
 if (loseRow) {
 loseRow.played += 1;
 loseRow.losses += 1;
 }
 }

 const result = Array.from(rows.values());

 result.sort((a, b) => {
 if (b.points !== a.points) return b.points - a.points;
 if (b.wins !== a.wins) return b.wins - a.wins;
 return a.team.localeCompare(b.team);
 });

 return result;
 }

 private static cleanTeamNames(teams: string[]): string[] {
 const seen = new Set<string>();
 const cleaned: string[] = [];
 for (const team of teams) {
 const name = team.trim();
 if (!name || seen.has(name.toLowerCase())) continue;
 seen.add(name.toLowerCase());
 cleaned.push(name);
 }
 return cleaned;
 }

 private static cleanFixturePairings(pairings: [string, string][]): [string, string][] {
 const cleaned: [string, string][] = [];
 for (const [home, away] of pairings) {
 const h = home.trim();
 const a = away.trim();
 if (!h || !a || h.toLowerCase() === a.toLowerCase()) continue;
 cleaned.push([h, a]);
 }
 return cleaned;
 }

 private static teamsFromPairings(pairings: [string, string][]): string[] {
 const teams: string[] = [];
 const seen = new Set<string>();
 for (const [home, away] of pairings) {
 for (const t of [home, away]) {
 const lower = t.toLowerCase();
 if (!seen.has(lower)) {
 seen.add(lower);
 teams.push(t);
 }
 }
 }
 return teams;
 }

 private static hasDuplicateTeam(pairings: [string, string][]): boolean {
 const seen = new Set<string>();
 for (const [home, away] of pairings) {
 for (const t of [home, away]) {
 if (seen.has(t.toLowerCase())) return true;
 seen.add(t.toLowerCase());
 }
 }
 return false;
 }

 private static leagueFixtures(teams: string[], meetings: number): TournamentFixture[] {
 const fixtures: TournamentFixture[] = [];
 for (let meeting = 0; meeting < meetings; meeting++) {
 for (let i = 0; i < teams.length; i++) {
 for (let j = i + 1; j < teams.length; j++) {
 const shouldReverse = meeting % 2 === 1;
 fixtures.push({
 id: this.newId(`fixture-m${meeting + 1}-${i + 1}-${j + 1}`),
 round: 1,
 homeTeam: shouldReverse ? teams[j] : teams[i],
 awayTeam: shouldReverse ? teams[i] : teams[j],
 isTie: false,
 stage: 'league',
 });
 }
 }
 }
 return fixtures;
 }

 private static leagueFixturesFromPairings(
 pairings: [string, string][],
 meetings: number
): TournamentFixture[] {
 const fixtures: TournamentFixture[] = [];
 for (let meeting = 0; meeting < meetings; meeting++) {
 for (let i = 0; i < pairings.length; i++) {
 const [home, away] = pairings[i];
 const shouldReverse = meeting % 2 === 1;
 fixtures.push({
 id: this.newId(`fixture-manual-m${meeting + 1}-${i + 1}`),
 round: 1,
 homeTeam: shouldReverse ? away : home,
 awayTeam: shouldReverse ? home : away,
 isTie: false,
 stage: 'league',
 });
 }
 }
 return fixtures;
 }

 private static knockoutFixtures(teams: string[], round: number): TournamentFixture[] {
 const fixtures: TournamentFixture[] = [];
 for (let i = 0; i < teams.length; i += 2) {
 const away = i + 1 < teams.length ? teams[i + 1] : undefined;
 fixtures.push({
 id: this.newId(`fixture-r${round}-${Math.floor(i / 2)}`),
 round,
 homeTeam: teams[i],
 awayTeam: away,
 winner: away === undefined ? teams[i] : undefined, // Bye winner automatically set
 isTie: false,
 stage: 'knockout',
 });
 }
 return fixtures;
 }

 private static knockoutFixturesFromPairings(
 pairings: [string, string][],
 round: number
): TournamentFixture[] {
 const fixtures: TournamentFixture[] = [];
 for (let i = 0; i < pairings.length; i++) {
 const [home, away] = pairings[i];
 fixtures.push({
 id: this.newId(`fixture-manual-r${round}-${i}`),
 round,
 homeTeam: home,
 awayTeam: away,
 isTie: false,
 stage: 'knockout',
 });
 }
 return fixtures;
 }

 private static advanceKnockout(tournament: Tournament): Tournament {
 const rounds = Array.from(
 new Set(tournament.fixtures.map((f) => f.round).filter((r) => r >= 1))
).sort((a, b) => a - b);

 let fixtures = [...tournament.fixtures];

 for (const round of rounds) {
 const roundFixtures = fixtures.filter((f) => f.round === round);
 if (roundFixtures.some((f) => !f.winner)) {
 return { ...tournament, fixtures, champion: undefined };
 }

 const winners = roundFixtures.map((f) => f.winner!);
 if (winners.length === 1) {
 return { ...tournament, fixtures, champion: winners[0] };
 }

 const hasNextRound = fixtures.some((f) => f.round === round + 1);
 if (!hasNextRound) {
 fixtures = [...fixtures, ...this.knockoutFixtures(winners, round + 1)];
 return { ...tournament, fixtures, champion: undefined };
 }
 }

 return { ...tournament, fixtures, champion: undefined };
 }

 private static pruneLeagueFixturesAfterChange(
 fixtures: TournamentFixture[],
 changedStage?: string
): TournamentFixture[] {
 switch (changedStage) {
 case 'league':
 return fixtures.filter((f) => f.stage === 'league');
 case 'qualifier1':
 case 'eliminator':
 return fixtures.filter(
 (f) => f.stage !== 'qualifier2' && f.stage !== 'final'
);
 case 'qualifier2':
 return fixtures.filter((f) => f.stage !== 'final');
 default:
 return fixtures;
 }
 }

 private static advanceLeagueTournament(tournament: Tournament): Tournament {
 const leagueFixtures = tournament.fixtures.filter((f) => f.stage === 'league');
 const isComplete =
 leagueFixtures.length > 0 &&
 leagueFixtures.every((f) => !!f.winner || f.isTie);

 if (!isComplete) return { ...tournament, champion: undefined };

 const table = this.standings(tournament);
 if (table.length < 4) {
 return {
 ...tournament,
 champion: table.length > 0 ? table[0].team : undefined,
 };
 }

 // 4+ Teams: Progress through IPL-Style Playoffs!
 let fixtures = [...tournament.fixtures];
 const fixtureByStage = (stage: string) => fixtures.find((f) => f.stage === stage);

 // 1. Initial Playoff generation: Qualifier 1 (1v2) and Eliminator (3v4)
 if (!fixtureByStage('qualifier1') && !fixtureByStage('eliminator')) {
 fixtures.push(
 {
 id: this.newId('fixture-qualifier-1'),
 round: 2,
 homeTeam: table[0].team,
 awayTeam: table[1].team,
 isTie: false,
 stage: 'qualifier1',
 },
 {
 id: this.newId('fixture-eliminator'),
 round: 3,
 homeTeam: table[2].team,
 awayTeam: table[3].team,
 isTie: false,
 stage: 'eliminator',
 }
);
 return { ...tournament, fixtures, champion: undefined };
 }

 const qualifier1 = fixtureByStage('qualifier1');
 const eliminator = fixtureByStage('eliminator');

 // 2. Qualifier 2 generation: Loser of Q1 vs Winner of Eliminator
 if (
 qualifier1?.winner &&
 eliminator?.winner &&
 !fixtureByStage('qualifier2')
) {
 fixtures.push({
 id: this.newId('fixture-qualifier-2'),
 round: 4,
 homeTeam: this.loserOf(qualifier1),
 awayTeam: eliminator.winner,
 isTie: false,
 stage: 'qualifier2',
 });
 return { ...tournament, fixtures, champion: undefined };
 }

 const qualifier2 = fixtureByStage('qualifier2');

 // 3. Final generation: Winner of Q1 vs Winner of Q2
 if (
 qualifier1?.winner &&
 qualifier2?.winner &&
 !fixtureByStage('final')
) {
 fixtures.push({
 id: this.newId('fixture-final'),
 round: 5,
 homeTeam: qualifier1.winner,
 awayTeam: qualifier2.winner,
 isTie: false,
 stage: 'final',
 });
 return { ...tournament, fixtures, champion: undefined };
 }

 const finalFixture = fixtureByStage('final');
 return {
 ...tournament,
 fixtures,
 champion: finalFixture?.winner,
 };
 }

 private static loserOf(fixture: TournamentFixture): string {
 const away = fixture.awayTeam;
 const winner = fixture.winner;
 if (!away || !winner) return fixture.homeTeam;
 return winner === fixture.homeTeam ? away : fixture.homeTeam;
 }
}
