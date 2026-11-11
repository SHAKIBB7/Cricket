/**
 * TournamentEngine — Full parity with Flutter TournamentEngine
 * Supports Knockout brackets with byes, League round-robin with multi-meetings,
 * IPL-style 4-team playoffs (Q1, Eliminator, Q2, Final), and standings calculations.
 */

import { Tournament, TournamentFixture, TournamentStanding, TournamentFormat } from './types';
import { NetRunRateEngine } from './NetRunRateEngine';
import { MatchScorecard } from '../cricket/types';

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
 name: (params.name || '').trim() || 'New Tournament',
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
 matches?: MatchScorecard[];
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
 return this.advanceLeagueTournament(
 {
 ...params.tournament,
 fixtures,
 champion: undefined,
 },
 params.matches
 );
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
 matches?: MatchScorecard[];
 }): Tournament {
 let changedRound: number | undefined;
 let changedStage: string | undefined;

 let fixtures = params.tournament.fixtures.map((fixture) => {
 if (fixture.id !== params.fixtureId || !fixture.awayTeam) return fixture;
 changedRound = fixture.round;
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
 return this.advanceLeagueTournament(
 {
 ...params.tournament,
 fixtures,
 champion: undefined,
 },
 params.matches
 );
 }

 // Correctness audit finding 3 (2026-11-11): the knockout
 // branch must prune and re-advance exactly like recordWinner
 // / recordNoResult / clearResult. A tie correction on a semi
 // used to leave the already-generated final naming the old
 // winner, which could then be decided and crown a champion
 // of a semi it did not win.
 if (params.tournament.format === 'knockout' && changedRound !== undefined) {
 fixtures = fixtures.filter((f) => f.round <= changedRound!);
 return this.advanceKnockout({
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

 static recordNoResult(params: {
 tournament: Tournament;
 fixtureId: string;
 matches?: MatchScorecard[];
 }): Tournament {
 let changedRound: number | undefined;
 let changedStage: string | undefined;

 const fixtures = params.tournament.fixtures.map((fixture) => {
 if (fixture.id !== params.fixtureId || !fixture.awayTeam) return fixture;
 changedRound = fixture.round;
 changedStage = fixture.stage;
 return {
 ...fixture,
 winner: undefined,
 loser: undefined,
 resultType: 'NO_RESULT' as const,
 isTie: false,
 resultText: 'No Result',
 };
 });

 if (params.tournament.format === 'league') {
 const pruned = this.pruneLeagueFixturesAfterChange(fixtures, changedStage);
 return this.advanceLeagueTournament(
 {
 ...params.tournament,
 fixtures: pruned,
 champion: undefined,
 },
 params.matches
 );
 }

 if (params.tournament.format === 'knockout' && changedRound !== undefined) {
 const kept = fixtures.filter((f) => f.round <= changedRound!);
 return this.advanceKnockout({
 ...params.tournament,
 fixtures: kept,
 champion: undefined,
 });
 }

 return {
 ...params.tournament,
 fixtures,
 champion: undefined,
 };
 }

 static clearResult(params: {
 tournament: Tournament;
 fixtureId: string;
 matches?: MatchScorecard[];
 }): Tournament {
 let changedRound: number | undefined;
 let changedStage: string | undefined;

 const cleared = params.tournament.fixtures.map((fixture) => {
 if (fixture.id !== params.fixtureId) return fixture;
 changedRound = fixture.round;
 changedStage = fixture.stage;
 return {
 ...fixture,
 winner: undefined,
 loser: undefined,
 resultType: undefined,
 isTie: false,
 resultText: undefined,
 matchId: undefined,
 };
 });

 if (params.tournament.format === 'knockout') {
 let fixtures = cleared;
 if (changedRound !== undefined) {
 fixtures = fixtures.filter((f) => f.round <= changedRound!);
 }
 return this.advanceKnockout({
 ...params.tournament,
 fixtures,
 champion: undefined,
 });
 }

 const fixtures = this.pruneLeagueFixturesAfterChange(cleared, changedStage);
 return this.advanceLeagueTournament(
 {
 ...params.tournament,
 fixtures,
 champion: undefined,
 },
 params.matches
 );
 }

 static standings(
 tournament: Tournament,
 matches?: MatchScorecard[]
 ): TournamentStanding[] {
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

 if (fixture.resultType === 'NO_RESULT') {
 if (homeRow) {
 homeRow.played += 1;
 homeRow.points += 1;
 }
 if (awayRow) {
 awayRow.played += 1;
 awayRow.points += 1;
 }
 continue;
 }

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

 // Compute actual Net Run Rate if match scorecards are supplied
 if (matches && matches.length > 0) {
 const processedMatchIds = new Set<string>();
 const fixtureById = new Map(tournament.fixtures.map((f) => [f.id, f]));
 const claimedMatchIds = new Set(
 tournament.fixtures.map((f) => f.matchId).filter(Boolean) as string[]
 );

 const getRow = (teamName: string): TournamentStanding | undefined => {
 if (!teamName) return undefined;
 const direct = rows.get(teamName);
 if (direct) return direct;
 const lower = teamName.trim().toLowerCase();
 for (const [key, val] of rows.entries()) {
 if (key.trim().toLowerCase() === lower) return val;
 }
 return undefined;
 };

 for (const match of matches) {
 const belongsToTournament =
 match.advancedSettings?.tournamentId === tournament.id ||
 match.id === tournament.id ||
 tournament.fixtures.some(
 (f) => f.matchId === match.id || f.id === match.advancedSettings?.fixtureId
 );

 if (!belongsToTournament || processedMatchIds.has(match.id)) {
 continue;
 }

 // Correctness audit finding 7 (2026-11-11): register the id
 // NOW, before any points branch runs. Registration used to
 // happen only at the NRR section, so a duplicated entry in
 // the caller's array double-counted a fixture-less match
 // (and the fixture-less ABANDONED branch, which continues
 // before the NRR section, never registered at all).
 processedMatchIds.add(match.id);

 // Rules fix (league audit 2026-11-11): super-over records are
 // separate 1-over matches that inherit the tournament link;
 // ICC records exclude them from tournament tables entirely.
 if (match.advancedSettings?.isSuperOver) {
 continue;
 }

 // A match tied to a fixture counts only while it is still
 // that fixture's recorded match. Clearing a result unlinks
 // it and a replay replaces it — stale attempts must not keep
 // feeding the table.
 const linkedFixture = match.advancedSettings?.fixtureId
 ? fixtureById.get(match.advancedSettings.fixtureId)
 : undefined;
 if (linkedFixture) {
 if (linkedFixture.matchId) {
 // The fixture names its recorded match; any other
 // attempt (cleared, replaced by a replay) is stale.
 if (linkedFixture.matchId !== match.id) {
 continue;
 }
 } else {
 // Legacy link: the fixture carries no match id (older
 // records, or a result entered by hand). The match then
 // counts only if the fixture is decided and this match
 // is that pairing — an undecided fixture (including one
 // whose result was just cleared) claims nothing.
 const decided =
 !!linkedFixture.winner ||
 linkedFixture.isTie ||
 linkedFixture.resultType === 'NO_RESULT';
 const matchHome = match.teamA || match.firstInnings?.team || '';
 const matchAway = match.teamB || match.firstInnings?.bowlingTeam || '';
 const samePairing =
 (matchHome === linkedFixture.homeTeam &&
 matchAway === linkedFixture.awayTeam) ||
 (matchHome === linkedFixture.awayTeam &&
 matchAway === linkedFixture.homeTeam);
 if (!decided || !samePairing) {
 continue;
 }
 }
 // Playoff matches never move the league table: the points
 // loop already ignores non-league fixtures, and their
 // innings must not move league NRR either.
 if (tournament.format === 'league' && linkedFixture.stage !== 'league') {
 continue;
 }
 } else if (
 !claimedMatchIds.has(match.id) &&
 (match.status === 'ABANDONED' || match.resultType === 'NO_RESULT')
 ) {
 // Fixture-less tournament match, no result: one point
 // each, and (per the skip below) no NRR inputs.
 const a = getRow(match.teamA || '');
 const b = getRow(match.teamB || '');
 if (a) {
 a.played += 1;
 a.points += 1;
 }
 if (b) {
 b.played += 1;
 b.points += 1;
 }
 } else if (!claimedMatchIds.has(match.id) && match.status === 'COMPLETED') {
 // Fixture-less tournament match: the table counts it in
 // full — points as well as NRR — so the two halves of the
 // table can never describe different matches again.
 const winnerName = (match.winner || '').trim();
 const winnerRow =
 winnerName && match.resultType !== 'TIE' ? getRow(winnerName) : undefined;
 const teamARow = getRow(match.teamA || '');
 const teamBRow = getRow(match.teamB || '');
 if (winnerRow && (teamARow || teamBRow)) {
 const loserRow = winnerRow === teamARow ? teamBRow : teamARow;
 winnerRow.played += 1;
 winnerRow.wins += 1;
 winnerRow.points += 2;
 if (loserRow) {
 loserRow.played += 1;
 loserRow.losses += 1;
 }
 } else if (teamARow && teamBRow) {
 teamARow.played += 1;
 teamARow.ties += 1;
 teamARow.points += 1;
 teamBRow.played += 1;
 teamBRow.ties += 1;
 teamBRow.points += 1;
 }
 }

 // Audit fix M3: ICC practice excludes abandoned / no-result
 // matches from Net Run Rate entirely. Points are unaffected (they
 // come from fixtures above); only the NRR inputs skip these
 // matches, whose partial first innings otherwise polluted the
 // standings' first tie-breaker.
 if (match.status === 'ABANDONED' || match.resultType === 'NO_RESULT') {
 continue;
 }

 // Correctness audit finding 2 (2026-11-11): NRR counts only
 // COMPLETED matches. The points branches above already gate
 // on status, but this section did not — a live fixture-less
 // match (or a live attempt under a manually decided fixture)
 // fed its half-finished innings into the table, recreating
 // the split-brain the league fix removed ("Played 0, NRR
 // moved"). One gate, before accumulation.
 if (match.status !== 'COMPLETED') {
 continue;
 }

 if (!match.firstInnings) continue;

 const matchTotalOvers = match.totalOvers || tournament.matchOvers || 20;
 const maxPlayers = match.advancedSettings?.players || 11;

 const inn1 = match.firstInnings;
 const inn2 = match.secondInnings;

 const row1Bat = getRow(inn1.team);
 const row1Bowl = getRow(inn1.bowlingTeam);

 // Audit fix L7: innings 1's all-out quota is its OWN allotment.
 // match.totalOvers may have been revised DOWN by a DLS application
 // for the chase; dividing a bowled-out first innings by the reduced
 // quota inflated team 1's for-rate. Innings 2 (below) correctly
 // keeps matchTotalOvers, the revised chase allotment.
 const inn1AllottedOvers = match.advancedSettings?.originalTotalOvers || matchTotalOvers;
 const inn1Balls = NetRunRateEngine.getNrrBallsForInnings(
 inn1.totalWickets,
 inn1.totalBalls,
 inn1AllottedOvers,
 maxPlayers
 );

 if (row1Bat) {
 row1Bat.runsFor += inn1.totalRuns;
 row1Bat.ballsFor += inn1Balls;
 }
 if (row1Bowl) {
 row1Bowl.runsAgainst += inn1.totalRuns;
 row1Bowl.ballsAgainst += inn1Balls;
 }

 if (inn2 && inn2.totalBalls > 0) {
 const inn2Balls = NetRunRateEngine.getNrrBallsForInnings(
 inn2.totalWickets,
 inn2.totalBalls,
 matchTotalOvers,
 maxPlayers
 );

 const row2Bat = getRow(inn2.team);
 const row2Bowl = getRow(inn2.bowlingTeam);

 if (row2Bat) {
 row2Bat.runsFor += inn2.totalRuns;
 row2Bat.ballsFor += inn2Balls;
 }
 if (row2Bowl) {
 row2Bowl.runsAgainst += inn2.totalRuns;
 row2Bowl.ballsAgainst += inn2Balls;
 }
 }
 }

 for (const row of rows.values()) {
 row.netRunRate = NetRunRateEngine.calculateNrr(
 row.runsFor,
 row.ballsFor,
 row.runsAgainst,
 row.ballsAgainst
 );
 }
 }

 const result = Array.from(rows.values());

 result.sort((a, b) => {
 if (b.points !== a.points) return b.points - a.points;
 if (b.netRunRate !== a.netRunRate) return b.netRunRate - a.netRunRate;
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
 // Circle method, so every fixture carries its real round
 // (previously every league fixture was stamped round 1).
 // The pairing set is unchanged: every pair meets once per
 // meeting, venues reversed on alternate meetings.
 const fixtures: TournamentFixture[] = [];
 const BYE = null as unknown as string;
 const ring: string[] = [...teams];
 if (ring.length % 2 === 1) ring.push(BYE);
 const slots = ring.length;
 const roundsPerMeeting = slots - 1;

 for (let meeting = 0; meeting < meetings; meeting++) {
 let positions = [...ring];
 for (let r = 0; r < roundsPerMeeting; r++) {
 const round = meeting * roundsPerMeeting + r + 1;
 for (let i = 0; i < slots / 2; i++) {
 const a = positions[i];
 const b = positions[slots - 1 - i];
 if (a === BYE || b === BYE) continue;
 const flip = meeting % 2 === 1;
 fixtures.push({
 id: this.newId(`fixture-m${meeting + 1}-r${round}-${i + 1}`),
 round,
 homeTeam: flip ? b : a,
 awayTeam: flip ? a : b,
 isTie: false,
 stage: 'league',
 });
 }
 positions = [positions[0], positions[slots - 1], ...positions.slice(1, slots - 1)];
 }
 }
 return fixtures;
 }

 private static leagueFixturesFromPairings(
 pairings: [string, string][],
 meetings: number
 ): TournamentFixture[] {
 // Greedy round assignment: a pairing joins the earliest
 // round where neither team already plays, so manual
 // fixtures get real round numbers too.
 const fixtures: TournamentFixture[] = [];
 for (let meeting = 0; meeting < meetings; meeting++) {
 const roundTeams: Set<string>[] = [];
 const roundOf: number[] = [];
 for (const [home, away] of pairings) {
 let r = 0;
 while (
 roundTeams[r] &&
 (roundTeams[r].has(home) || roundTeams[r].has(away))
 ) {
 r++;
 }
 if (!roundTeams[r]) roundTeams[r] = new Set();
 roundTeams[r].add(home);
 roundTeams[r].add(away);
 roundOf.push(r + 1);
 }
 const roundsUsed = Math.max(1, roundTeams.length);
 pairings.forEach(([home, away], i) => {
 const flip = meeting % 2 === 1;
 fixtures.push({
 id: this.newId(`fixture-manual-m${meeting + 1}-${i + 1}`),
 round: meeting * roundsUsed + roundOf[i],
 homeTeam: flip ? away : home,
 awayTeam: flip ? home : away,
 isTie: false,
 stage: 'league',
 });
 });
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
 // Playoff fixtures survive a league change; the advance
 // step validates their pairings against the final table
 // and only regenerates when the top four actually moved.
 return fixtures;
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

 private static advanceLeagueTournament(
 tournament: Tournament,
 matches?: MatchScorecard[]
 ): Tournament {
 const leagueFixtures = tournament.fixtures.filter((f) => f.stage === 'league');
 const isComplete =
 leagueFixtures.length > 0 &&
 leagueFixtures.every(
 (f) => !!f.winner || f.isTie || f.resultType === 'NO_RESULT'
 );

 if (!isComplete) return { ...tournament, champion: undefined };

 const table = this.standings(tournament, matches);
 if (table.length < 4) {
 return {
 ...tournament,
 champion: table.length > 0 ? table[0].team : undefined,
 };
 }

 // 4+ Teams: Progress through IPL-Style Playoffs!
 let fixtures = [...tournament.fixtures];
 const fixtureByStage = (stage: string) => fixtures.find((f) => f.stage === stage);

 // Preserved playoffs are only valid while their pairings
 // still match the final top four. If a corrected league
 // result moved the seeding, the postseason is regenerated
 // from scratch; if it did not, played playoff results —
 // including a crowned champion — survive the correction.
 const existingQ1 = fixtureByStage('qualifier1');
 const existingEl = fixtureByStage('eliminator');
 if (existingQ1 || existingEl) {
 const samePairing = (
 f: TournamentFixture | undefined,
 a: string,
 b: string
 ) =>
 !!f &&
 ((f.homeTeam === a && f.awayTeam === b) ||
 (f.homeTeam === b && f.awayTeam === a));
 if (
 !samePairing(existingQ1, table[0].team, table[1].team) ||
 !samePairing(existingEl, table[2].team, table[3].team)
 ) {
 fixtures = fixtures.filter((f) => f.stage === 'league');
 }
 }

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
