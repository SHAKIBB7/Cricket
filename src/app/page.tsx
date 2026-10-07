'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
 Play,
 Trophy,
 Users,
 History,
 PlusCircle,
 Clock,
 ArrowRight,
 TrendingUp,
 Award,
} from 'lucide-react';
import { MatchRepository } from '@/infrastructure/storage/MatchRepository';
import { FeatureHubRepository } from '@/infrastructure/storage/FeatureHubRepository';
import { MatchScorecard } from '@/domain/cricket/types';

export default function HomePage() {
 const router = useRouter();
 const [ongoingMatch, setOngoingMatch] = useState<MatchScorecard | null>(null);
 const [recentMatches, setRecentMatches] = useState<MatchScorecard[]>([]);
 const [teamCount, setTeamCount] = useState<number>(0);
 const [tournamentCount, setTournamentCount] = useState<number>(0);
 const [loading, setLoading] = useState(true);

 useEffect(() => {
 loadDashboardData();
 }, []);

 async function loadDashboardData() {
 try {
 const ongoing = await MatchRepository.getLatestOngoingMatch();
 const all = await MatchRepository.getAllMatches();
 const teams = await FeatureHubRepository.loadTeams();
 const tournaments = await FeatureHubRepository.loadTournaments();

 setOngoingMatch(ongoing || null);
 setRecentMatches(all.slice(0, 5));
 setTeamCount(teams.length);
 setTournamentCount(tournaments.length);
 } catch {
 // Ignored for SSR safety
 } finally {
 setLoading(false);
 }
 }

 return (
 <div className="flex flex-col gap-4 sm:gap-5 w-full max-w-7xl mx-auto">
 {/* ── UNFINISHED MATCH RESUME BANNER ── */}
 {ongoingMatch && (
 <div className="relative overflow-hidden bg-gradient-to-r from-emerald-900 to-slate-900 shadow-xl border border-emerald-500/30 rounded-2xl text-white p-card">
 <div className="absolute top-0 right-0 -mt-4 -mr-4 bg-emerald-500/20 blur-2xl rounded-full w-32 h-32" />
 <img
 src="/assets/illustrations/chase_batsman.png"
 alt="Cricket Action"
 className="hidden sm:block absolute right-6 bottom-0 object-contain opacity-20 pointer-events-none w-28 h-28"
 />

 <div className="flex justify-between relative z-10 flex-wrap items-center gap-card-gap">
 <div className="flex flex-col gap-1">
 <div className="flex items-center gap-2">
 <span className="flex relative h-2.5 w-2.5">
 <span className="animate-ping absolute inline-flex bg-emerald-400 opacity-75 rounded-full h-full w-full" />
 <span className="relative inline-flex bg-emerald-500 rounded-full h-2.5 w-2.5" />
 </span>
 <span className="font-bold uppercase tracking-wider text-caption">
 Active Match in Progress
 </span>
 </div>
 <h2 className="font-black tracking-tight truncate max-w-full text-h2">
 {ongoingMatch.teamA} vs {ongoingMatch.teamB}
 </h2>
 <p className="text-body-small">
 Innings {ongoingMatch.currentInnings} • {ongoingMatch.totalOvers} Overs Match
 </p>
 </div>

 <div className="flex items-center gap-3">
 <button
 onClick={() => router.push(`/matches/score/${ongoingMatch.id}`)}
 className="flex-1 md:flex-initial flex items-center justify-center bg-emerald-500 hover:bg-emerald-400 font-bold shadow-lg shadow-emerald-500/30 transition-all hover:scale-105 active:scale-95 py-2.5 rounded-xl text-body-small min-h-btn gap-2 px-5"
 >
 <Play className="fill-current w-4 h-4" />
 <span>Resume Scoring</span>
 </button>

 <Link
 href="/matches/history"
 className="bg-white/10 hover:bg-white/20 font-medium flex items-center justify-center transition-colors shrink-0 px-4 py-2.5 rounded-xl text-body-small min-h-btn"
 >
 All Matches
 </Link>
 </div>
 </div>
 </div>
)}

 {/* ── HERO ACTION CARDS ── */}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
 {/* New Match Primary Card */}
 <Link
 href="/matches/new"
 className="group relative overflow-hidden bg-gradient-to-br from-emerald-600 to-green-700 shadow-lg hover:shadow-emerald-600/30 transition-all hover:-translate-y-0.5 active:scale-[0.99] flex flex-col justify-between rounded-2xl min-h-[160px] p-4 sm:p-5"
 >
 <img
 src="/assets/illustrations/st_bat.png"
 alt="Cricket Bat"
 className="absolute -right-3 -bottom-3 object-contain opacity-25 group-hover:opacity-40 group-hover:scale-105 transition-all pointer-events-none w-28 h-28"
 />
 <div className="flex justify-between items-start relative z-10">
 <div className="bg-white/15 backdrop-blur-md flex items-center justify-center rounded-xl w-12 h-12">
 <PlusCircle className="text-white w-6 h-6" />
 </div>
 <span className="bg-white/20 font-bold uppercase tracking-wider py-1 px-2 rounded-full text-caption">
 Quick Start
 </span>
 </div>

 <div className="relative z-10 my-0">
 <h3 className="font-black tracking-tight text-h2">Start New Match</h3>
 <p className="line-clamp-2 text-body-small mt-1">
 Custom overs, toss rules, 10 dismissal types & live scoring
 </p>
 </div>

 <div className="flex items-center font-bold group-hover:text-white transition-colors relative z-10 gap-1.5 text-caption">
 <span>Setup Match</span>
 <ArrowRight className="group-hover:translate-x-1 transition-transform w-3.5 h-3.5" />
 </div>
 </Link>

 {/* Tournaments Hub Card */}
 <Link
 href="/tournaments"
 className="group relative overflow-hidden bg-[var(--card)] border border-[var(--border)] shadow-xs hover:shadow-md transition-all hover:-translate-y-0.5 active:scale-[0.99] flex flex-col justify-between rounded-2xl min-h-[160px] p-4 sm:p-5"
 >
 <img
 src="/assets/illustrations/man_of_match.png"
 alt="Trophy"
 className="absolute -right-3 -bottom-3 object-contain opacity-15 dark:opacity-25 group-hover:opacity-35 group-hover:scale-105 transition-all pointer-events-none w-26 h-26"
 />
 <div className="flex justify-between items-start relative z-10">
 <div className="bg-amber-500/10 dark:text-amber-400 flex items-center justify-center rounded-xl text-amber-600 w-12 h-12">
 <Trophy className="w-6 h-6" />
 </div>
 <span className="font-bold text-caption">
 {tournamentCount} Tournaments
 </span>
 </div>

 <div className="relative z-10 my-0">
 <h3 className="font-bold tracking-tight text-h3">Tournaments & Leagues</h3>
 <p className="line-clamp-2 text-body-small mt-1">
 Knockout brackets with byes, round-robin, IPL playoffs & ICC NRR
 </p>
 </div>

 <div className="flex items-center font-bold dark:text-amber-400 group-hover:translate-x-1 transition-transform relative z-10 gap-1.5 text-caption">
 <span>View Tournament Hub</span>
 <ArrowRight className="w-3.5 h-3.5" />
 </div>
 </Link>

 {/* Teams & Squad Management Card */}
 <Link
 href="/teams"
 className="group relative overflow-hidden bg-[var(--card)] border border-[var(--border)] shadow-xs hover:shadow-md transition-all hover:-translate-y-0.5 active:scale-[0.99] flex flex-col justify-between col-span-1 rounded-2xl min-h-[160px] p-4 sm:p-5"
 >
 <img
 src="/assets/illustrations/strike_batsman.png"
 alt="Squads"
 className="absolute -right-3 -bottom-3 object-contain opacity-15 dark:opacity-25 group-hover:opacity-35 group-hover:scale-105 transition-all pointer-events-none w-26 h-26"
 />
 <div className="flex justify-between items-start relative z-10">
 <div className="bg-blue-500/10 dark:text-blue-400 flex items-center justify-center rounded-xl text-blue-600 w-12 h-12">
 <Users className="w-6 h-6" />
 </div>
 <span className="font-bold text-caption">
 {teamCount} Teams Saved
 </span>
 </div>

 <div className="relative z-10 my-0">
 <h3 className="font-bold tracking-tight text-h3">Team Squads</h3>
 <p className="line-clamp-2 text-body-small mt-1">
 Captains, managers & 15 structured squad positions
 </p>
 </div>

 <div className="flex items-center font-bold dark:text-blue-400 group-hover:translate-x-1 transition-transform relative z-10 gap-1.5 text-caption">
 <span>Manage Squads</span>
 <ArrowRight className="w-3.5 h-3.5" />
 </div>
 </Link>
 </div>

 {/* ── METRIC STATS STRIP ── */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5">
 <div className="floating-card p-3.5 sm:p-4">
 <div className="flex items-center font-semibold gap-2 text-caption">
 <Award className="w-4 h-4 text-emerald-500" />
 <span>Total Matches</span>
 </div>
 <p className="font-black num-font text-h2 mt-1">{recentMatches.length}</p>
 </div>

 <div className="floating-card p-3.5 sm:p-4">
 <div className="flex items-center font-semibold gap-2 text-caption">
 <Users className="w-4 h-4 text-blue-500" />
 <span>Saved Teams</span>
 </div>
 <p className="font-black num-font text-h2 mt-1">{teamCount}</p>
 </div>

 <div className="floating-card p-3.5 sm:p-4">
 <div className="flex items-center font-semibold gap-2 text-caption">
 <Trophy className="w-4 h-4 text-amber-500" />
 <span>Tournaments</span>
 </div>
 <p className="font-black num-font text-h2 mt-1">{tournamentCount}</p>
 </div>

 <div className="floating-card p-3.5 sm:p-4">
 <div className="flex items-center font-semibold gap-2 text-caption">
 <TrendingUp className="w-4 h-4 text-purple-500" />
 <span>Engine Version</span>
 </div>
 <p className="font-black num-font text-h2 mt-1">v2.1 Pro</p>
 </div>
 </div>

 {/* ── RECENT MATCHES SECTION ── */}
 <div className="flex flex-col gap-3">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Clock className="text-emerald-600 w-5 h-5" />
 <h3 className="font-bold text-card-title">Recent Matches</h3>
 </div>
 <Link
 href="/matches/history"
 className="font-semibold hover:text-emerald-500 flex items-center text-caption gap-1"
 >
 <span>View All</span>
 <ArrowRight className="w-3.5 h-3.5" />
 </Link>
 </div>

 {recentMatches.length === 0 && !loading ? (
 <div className="bg-[var(--card)] border border-[var(--border)] border-dashed text-center rounded-2xl p-10">
 <div className="bg-[var(--muted)] flex items-center justify-center rounded-full mx-auto text-[var(--muted-foreground)] w-12 h-12 mb-3">
 <History className="w-6 h-6" />
 </div>
 <h4 className="font-bold text-body">No Matches Scored Yet</h4>
 <p className="text-body-small max-w-sm mx-auto mt-1 mb-4">
 Start your first cricket match scoring session with our live ball-by-ball engine.
 </p>
 <Link
 href="/matches/new"
 className="inline-flex items-center bg-emerald-600 hover:bg-emerald-500 font-bold shadow-md shadow-emerald-600/20 rounded-xl text-body-small gap-2 px-4 py-2"
 >
 <PlusCircle className="w-4 h-4" />
 <span>Score A Match</span>
 </Link>
 </div>
) : (
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
 {recentMatches.map((m) => (
 <div
 key={m.id}
 className="floating-card flex flex-col justify-between hover:border-emerald-500/50 p-4 gap-3"
 >
 <div className="flex items-start justify-between gap-2">
 <div className="flex-1 min-w-0">
 <span className="uppercase font-bold tracking-wider truncate block text-[var(--muted-foreground)]">
 {m.totalOvers} Overs • {m.venue || 'Standard Ground'}
 </span>
 <h4 className="font-extrabold tracking-tight truncate mt-0.5 text-body">
 {m.teamA} vs {m.teamB}
 </h4>
 </div>

 <span
 className={`px-2 py-0.5 rounded-full text-caption font-extrabold uppercase ${
 m.status === 'ONGOING'
 ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
 : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
 }`}
 >
 {m.status}
 </span>
 </div>

 <div className="font-medium text-caption">
 {m.result || (m.status === 'ONGOING' ? 'Match In Progress' : 'Match Completed')}
 </div>

 <div className="flex items-center border-t border-[var(--border)] gap-2 pt-2">
 {m.status === 'ONGOING' ? (
 <Link
 href={`/matches/score/${m.id}`}
 className="flex-1 bg-emerald-600 hover:bg-emerald-500 font-bold flex items-center justify-center active:scale-[0.98] transition-all rounded-lg text-caption min-h-[40px] py-2"
 >
 Resume Live
 </Link>
) : (
 <Link
 href={`/matches/center/${m.id}`}
 className="flex-1 bg-[var(--muted)] hover:bg-[var(--border)] font-semibold flex items-center justify-center active:scale-[0.98] transition-all rounded-lg text-caption min-h-[40px] py-2"
 >
 Scorecard & PDF
 </Link>
)}
 </div>
 </div>
))}
 </div>
)}
 </div>
 </div>
);
}
