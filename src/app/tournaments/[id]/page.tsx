'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
 Trophy,
 ArrowLeft,
 Calendar,
 Award,
 Layers,
 BarChart2,
 CheckCircle2,
 Play,
 Share2,
} from 'lucide-react';
import { FeatureHubRepository } from '@/infrastructure/storage/FeatureHubRepository';
import { MatchRepository } from '@/infrastructure/storage/MatchRepository';
import { Tournament, TournamentFixture } from '@/domain/tournament/types';
import { TournamentEngine } from '@/domain/tournament/TournamentEngine';
import { NetRunRateEngine } from '@/domain/tournament/NetRunRateEngine';
import { MatchScorecard } from '@/domain/cricket/types';
import { BowlingLimiter } from '@/domain/cricket/bowling-limiter/BowlingLimiter';
import { TeamBadgeIcon } from '@/components/common/TeamBadgeIcon';

export default function TournamentDetailPage() {
 const params = useParams();
 const router = useRouter();
 const tournamentId = params.id as string;

 const [tournament, setTournament] = useState<Tournament | null>(null);
 const [activeTab, setActiveTab] = useState<'fixtures' | 'standings' | 'playoffs' | 'leaders'>('fixtures');
 const [matches, setMatches] = useState<MatchScorecard[]>([]);
 const [loading, setLoading] = useState(true);

 const loadTournament = useCallback(async () => {
 if (!tournamentId) return;
 const tourney = await FeatureHubRepository.getTournament(tournamentId);
 const allMatches = await MatchRepository.getAllMatches();
 setTournament(tourney || null);
 setMatches(allMatches);
 setLoading(false);
 }, [tournamentId]);

 useEffect(() => {
 loadTournament();
 }, [loadTournament]);

 if (loading || !tournament) {
 return (
 <div className="flex items-center justify-center min-h-[60vh]">
 <div className="border-4 border-emerald-600 border-t-transparent animate-spin rounded-full w-10 h-10" />
 </div>
);
 }

 const standings = TournamentEngine.standings(tournament);
 const { battingLeaders, bowlingLeaders } = NetRunRateEngine.generateLeaderboard(tournament.id, matches);

 const handleRecordWinner = async (fixtureId: string, winner: string) => {
 const updated = TournamentEngine.recordWinner({
 tournament,
 fixtureId,
 winner,
 });
 await FeatureHubRepository.saveTournament(updated);
 setTournament(updated);
 };

 const handleRecordTie = async (fixtureId: string) => {
 const updated = TournamentEngine.recordTie({
 tournament,
 fixtureId,
 });
 await FeatureHubRepository.saveTournament(updated);
 setTournament(updated);
 };

 const handleLaunchMatch = (fixture: TournamentFixture) => {
 const setupData = {
 teamA: fixture.homeTeam,
 teamB: fixture.awayTeam || '',
 overs: tournament.matchOvers,
 tossWinner: fixture.homeTeam,
 tossDecision: '',
 venue: '',
  advancedSettings: {
   tournamentId: tournament.id,
   players: 11,
   wideBall: true,
   wideReball: true,
   wideRun: 1,
   noBall: true,
   noBallReball: true,
   noBallRun: 1,
   isManualLimitEnabled: false,
   manualOverLimit: BowlingLimiter.calculateMaxOvers(tournament.matchOvers),
   bowlingLimitMode: BowlingLimiter.resolveMode(tournament.matchOvers),
   maxOversPerBowler: BowlingLimiter.calculateMaxOvers(tournament.matchOvers),
  },
 };

 sessionStorage.setItem('pending_match_setup', JSON.stringify(setupData));
 router.push('/matches/opening-players');
 };

 const playoffFixtures = tournament.fixtures.filter((f) => f.stage !== 'league' && f.stage !== 'knockout');

 return (
 <div className="max-w-5xl xl:max-w-6xl mx-auto space-y-4 sm:space-y-5 w-full">
 {/* Top Bar */}
 <div className="flex items-center justify-between">
 <button
 onClick={() => router.push('/tournaments')}
 className="flex items-center font-semibold hover:text-[var(--foreground)] gap-1.5 text-caption min-h-[38px] p-1"
 >
 <ArrowLeft className="w-4 h-4" /> Tournaments
 </button>

 <span className="bg-amber-500/10 dark:text-amber-400 font-bold uppercase tracking-wider px-4 rounded-full text-caption py-1">
 {tournament.format}
 </span>
 </div>

 {/* Hero Banner */}
 <div className="bg-gradient-to-r from-amber-950 via-slate-900 to-emerald-950 shadow-xl border border-white/10 rounded-3xl text-white space-y-3 p-8">
 <div className="flex md:items-center justify-between flex-wrap gap-4">
 <div>
 <div className="flex items-center font-bold uppercase tracking-widest flex-wrap text-caption gap-2 mb-1">
 <span>{tournament.teams.length} Teams</span>
 <span>•</span>
 <span>{tournament.matchOvers} Overs</span>
 <span>•</span>
 <span>{tournament.fixtures.length} Fixtures</span>
 </div>
 <h1 className="font-black tracking-tight text-h1">{tournament.name}</h1>
 </div>

 {tournament.champion && (
 <div className="bg-amber-500/20 border border-amber-500/40 flex items-center p-3 rounded-2xl gap-3">
 <Award className="shrink-0 text-amber-400 w-8 h-8" />
 <div>
 <span className="uppercase font-bold text-amber-300">Tournament Champion</span>
 <p className="font-black text-card-title">{tournament.champion}</p>
 </div>
 </div>
)}
 </div>
 </div>

 {/* Tabs */}
 <div className="flex border-b border-[var(--border)] font-bold overflow-x-auto no-scrollbar gap-6 text-body-small">
 <button
 onClick={() => setActiveTab('fixtures')}
 className={`pb-2.5 sm:pb-3 border-b-2 transition-colors shrink-0 whitespace-nowrap min-h-[40px] ${
 activeTab === 'fixtures'
 ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
 : 'border-transparent text-[var(--muted-foreground)]'
 }`}
 >
 Fixtures ({tournament.fixtures.length})
 </button>

 {tournament.format === 'league' && (
 <button
 onClick={() => setActiveTab('standings')}
 className={`pb-2.5 sm:pb-3 border-b-2 transition-colors shrink-0 whitespace-nowrap min-h-[40px] ${
 activeTab === 'standings'
 ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
 : 'border-transparent text-[var(--muted-foreground)]'
 }`}
 >
 Points Table
 </button>
)}

 {tournament.format === 'league' && tournament.teams.length >= 4 && (
 <button
 onClick={() => setActiveTab('playoffs')}
 className={`pb-2.5 sm:pb-3 border-b-2 transition-colors shrink-0 whitespace-nowrap min-h-[40px] ${
 activeTab === 'playoffs'
 ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
 : 'border-transparent text-[var(--muted-foreground)]'
 }`}
 >
 IPL Playoffs
 </button>
)}

 <button
 onClick={() => setActiveTab('leaders')}
 className={`pb-2.5 sm:pb-3 border-b-2 transition-colors shrink-0 whitespace-nowrap min-h-[40px] ${
 activeTab === 'leaders'
 ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
 : 'border-transparent text-[var(--muted-foreground)]'
 }`}
 >
 Leaderboards
 </button>
 </div>

 {/* Tab 1: Fixtures */}
 {activeTab === 'fixtures' && (
 <div className="space-y-3">
 {tournament.fixtures.map((fixture, idx) => {
 const isBye = !fixture.awayTeam;
 const isComplete = !!fixture.winner || fixture.isTie;

 return (
 <div
 key={fixture.id}
 className="bg-[var(--card)] border border-[var(--border)] shadow-xs flex justify-between flex-wrap items-center p-5 rounded-2xl gap-4"
 >
 <div className="min-w-0 space-y-1">
 <div className="flex items-center gap-2">
 <span className="font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
 Match {idx + 1} • Round {fixture.round} • {fixture.stage}
 </span>
 {fixture.isTie && (
 <span className="bg-amber-500/10 font-extrabold py-0.5 rounded-full text-caption px-2">
 TIED
 </span>
)}
 </div>

 <div className="flex items-center flex-wrap gap-2">
 <div className="flex items-center font-extrabold tracking-tight gap-1.5 text-card-title">
 <TeamBadgeIcon type="home" size="xs" />
 <span>{fixture.homeTeam}</span>
 </div>
 <span className="font-bold text-caption">vs</span>
 <div className="flex items-center font-extrabold tracking-tight gap-1.5 text-card-title">
 <TeamBadgeIcon type="away" size="xs" />
 <span>{fixture.awayTeam || 'BYE'}</span>
 </div>
 </div>

 {fixture.winner && (
 <p className="font-semibold dark:text-emerald-400 text-caption">
 Winner: {fixture.winner}
 </p>
)}
 </div>

 {!isBye && (
 <div className="flex items-stretch sm:items-center shrink-0 border-t md:border-t-0 border-[var(--border)] flex-wrap gap-2 pt-0">
 {/* Launch Live Match */}
 <button
 onClick={() => handleLaunchMatch(fixture)}
 className="bg-emerald-600 hover:bg-emerald-500 font-bold flex items-center justify-center active:scale-[0.98] transition-all px-3.5 rounded-xl text-caption gap-1.5 min-h-[40px] py-2"
 >
 <Play className="fill-current shrink-0 w-3.5 h-3.5" />
 <span>Score Match</span>
 </button>

 {/* Manual Quick Record Options */}
 <div className="grid gap-1.5 grid-cols-3">
 <button
 onClick={() => handleRecordWinner(fixture.id, fixture.homeTeam)}
 className={`px-2 py-2 rounded-lg border text-caption font-bold min-h-[40px] transition-colors truncate text-center ${
 fixture.winner === fixture.homeTeam
 ? 'bg-emerald-600 text-white border-emerald-600'
 : 'bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)] hover:border-emerald-500/40'
 }`}
 title={`${fixture.homeTeam} Won`}
 >
 <span className="truncate block">{fixture.homeTeam} Won</span>
 </button>

 {fixture.awayTeam ? (
 <button
 onClick={() => handleRecordWinner(fixture.id, fixture.awayTeam!)}
 className={`px-2 py-2 rounded-lg border text-caption font-bold min-h-[40px] transition-colors truncate text-center ${
 fixture.winner === fixture.awayTeam
 ? 'bg-emerald-600 text-white border-emerald-600'
 : 'bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)] hover:border-emerald-500/40'
 }`}
 title={`${fixture.awayTeam} Won`}
 >
 <span className="truncate block">{fixture.awayTeam} Won</span>
 </button>
) : (
 <div />
)}

 <button
 onClick={() => handleRecordTie(fixture.id)}
 className={`px-2 py-2 rounded-lg border text-caption font-bold min-h-[40px] transition-colors flex items-center justify-center ${
 fixture.isTie
 ? 'bg-amber-500 text-slate-950 border-amber-500'
 : 'bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)]'
 }`}
 >
 Tie
 </button>
 </div>
 </div>
)}
 </div>
);
 })}
 </div>
)}

 {/* Tab 2: Standings / Points Table */}
 {activeTab === 'standings' && (
 <div className="floating-card overflow-hidden">
 <div className="overflow-x-auto table-scroll-container">
 <table className="text-caption min-w-[420px] w-full">
 <thead className="bg-[var(--muted)] font-bold uppercase border-b border-[var(--border)] text-[var(--muted-foreground)]">
 <tr>
 <th className="py-3 px-4">Pos</th>
 <th className="py-3 px-4">Team</th>
 <th className="py-3 px-3 text-center">
 <span className="sm:hidden">P</span>
 <span className="hidden sm:inline">Played</span>
 </th>
 <th className="py-3 px-3 text-center">
 <span className="sm:hidden">W</span>
 <span className="hidden sm:inline">Won</span>
 </th>
 <th className="py-3 px-3 text-center">
 <span className="sm:hidden">T</span>
 <span className="hidden sm:inline">Tied</span>
 </th>
 <th className="py-3 px-3 text-center">
 <span className="sm:hidden">L</span>
 <span className="hidden sm:inline">Lost</span>
 </th>
 <th className="font-black py-3 px-4 text-emerald-600">
 <span className="sm:hidden">Pts</span>
 <span className="hidden sm:inline">Points</span>
 </th>
 </tr>
 </thead>
 <tbody className="divide-y divide-[var(--border)] num-font">
 {standings.map((s, idx) => (
 <tr key={s.team} className="hover:bg-[var(--muted)]/40">
 <td className="font-bold py-3 text-[var(--muted-foreground)] px-4">
 {idx + 1}
 </td>
 <td className="font-black truncate py-3 px-4 text-body-small max-w-[150px]">
 {s.team}
 </td>
 <td className="font-semibold py-3 px-3 text-center">{s.played}</td>
 <td className="font-bold py-3 px-3 text-emerald-600">{s.wins}</td>
 <td className="py-3 px-3 text-amber-500">{s.ties}</td>
 <td className="py-3 px-3 text-red-500">{s.losses}</td>
 <td className="font-black py-3 px-4 text-body">
 {s.points}
 </td>
 </tr>
))}
 </tbody>
 </table>
 </div>
 </div>
)}

 {/* Tab 3: IPL Playoffs */}
 {activeTab === 'playoffs' && (
 <div className="space-y-4">
 <div className="bg-blue-500/10 border border-blue-500/20 font-semibold dark:text-blue-400 rounded-xl text-caption p-4">
 IPL-Style Playoff Bracket: Qualifier 1 (Top 2), Eliminator (3rd vs 4th), Qualifier 2, and Final!
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {playoffFixtures.map((fix) => (
 <div
 key={fix.id}
 className="bg-[var(--card)] border border-[var(--border)] shadow-xs rounded-2xl p-5 space-y-3"
 >
 <div className="flex items-center justify-between">
 <span className="bg-emerald-500/10 font-extrabold uppercase py-0.5 rounded-full text-caption px-2">
 {fix.stage}
 </span>
 {fix.winner && (
 <span className="font-bold text-caption">
 Winner: {fix.winner}
 </span>
)}
 </div>

 <h3 className="font-black text-card-title">
 {fix.homeTeam} vs {fix.awayTeam || 'TBD'}
 </h3>

 {fix.awayTeam && !fix.winner && (
 <div className="grid border-t border-[var(--border)] grid-cols-2 gap-2 pt-2">
 <button
 onClick={() => handleRecordWinner(fix.id, fix.homeTeam)}
 className="bg-[var(--muted)] hover:bg-emerald-600 hover:text-white font-bold transition-colors truncate px-4 rounded-lg min-h-[40px] w-full py-2 text-caption"
 title={`${fix.homeTeam} Won`}
 >
 <span className="truncate block">{fix.homeTeam} Won</span>
 </button>
 <button
 onClick={() => handleRecordWinner(fix.id, fix.awayTeam!)}
 className="bg-[var(--muted)] hover:bg-emerald-600 hover:text-white font-bold transition-colors truncate px-4 rounded-lg min-h-[40px] w-full py-2 text-caption"
 title={`${fix.awayTeam} Won`}
 >
 <span className="truncate block">{fix.awayTeam} Won</span>
 </button>
 </div>
)}
 </div>
))}
 </div>
 </div>
)}

 {/* Tab 4: Leaderboards (Orange Cap & Purple Cap) */}
 {activeTab === 'leaders' && (
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 {/* Orange Cap (Batting) */}
 <div className="floating-card overflow-hidden space-y-2">
 <div className="bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between p-4">
 <span className="font-black dark:text-amber-400 uppercase tracking-wider text-body-small">
 Orange Cap — Most Runs
 </span>
 </div>

 <div className="divide-y divide-[var(--border)] text-caption">
 {battingLeaders.length === 0 ? (
 <p className="italic text-[var(--muted-foreground)] p-6">
 No match data recorded for this tournament yet.
 </p>
) : (
 battingLeaders.slice(0, 10).map((b, i) => (
 <div key={i} className="flex items-center justify-between hover:bg-[var(--muted)]/30 p-3">
 <div>
 <span className="font-bold text-body-small">{b.name}</span>
 <p className="text-[var(--muted-foreground)]">{b.team} • {b.innings} innings</p>
 </div>
 <div className="num-font text-right">
 <span className="font-black text-body">{b.runs}</span>
 <p className="text-[var(--muted-foreground)]">SR: {b.strikeRate.toFixed(1)} | Avg: {b.average.toFixed(1)}</p>
 </div>
 </div>
))
)}
 </div>
 </div>

 {/* Purple Cap (Bowling) */}
 <div className="floating-card overflow-hidden space-y-2">
 <div className="bg-purple-500/10 border-b border-purple-500/20 flex items-center justify-between p-4">
 <span className="font-black dark:text-purple-400 uppercase tracking-wider text-body-small">
 Purple Cap — Most Wickets
 </span>
 </div>

 <div className="divide-y divide-[var(--border)] text-caption">
 {bowlingLeaders.length === 0 ? (
 <p className="italic text-[var(--muted-foreground)] p-6">
 No bowling data recorded for this tournament yet.
 </p>
) : (
 bowlingLeaders.slice(0, 10).map((b, i) => (
 <div key={i} className="flex items-center justify-between hover:bg-[var(--muted)]/30 p-3">
 <div>
 <span className="font-bold text-body-small">{b.name}</span>
 <p className="text-[var(--muted-foreground)]">{b.team} • {b.innings} innings</p>
 </div>
 <div className="num-font text-right">
 <span className="font-black text-body">{b.wickets} wkts</span>
 <p className="text-[var(--muted-foreground)]">Econ: {b.economy.toFixed(2)} | Best: {b.bestFigures}</p>
 </div>
 </div>
))
)}
 </div>
 </div>
 </div>
)}
 </div>
);
}
