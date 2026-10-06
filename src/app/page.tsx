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
    <div className="space-y-4 sm:space-y-6">
      {/* ── UNFINISHED MATCH RESUME BANNER ── */}
      {ongoingMatch && (
        <div className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-r from-emerald-900 to-slate-900 p-4 sm:p-5 md:p-6 text-white shadow-xl border border-emerald-500/30">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-emerald-500/20 rounded-full blur-2xl" />
          <img
            src="/assets/illustrations/chase_batsman.png"
            alt="Cricket Action"
            className="hidden sm:block absolute right-6 bottom-0 w-28 h-28 object-contain opacity-20 pointer-events-none"
          />

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4 relative z-10">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
                <span className="text-xs sm:text-xs font-bold uppercase tracking-wider text-emerald-400">
                  Active Match in Progress
                </span>
              </div>
              <h2 className="text-lg sm:text-xl md:text-2xl font-black tracking-tight truncate max-w-full">
                {ongoingMatch.teamA} vs {ongoingMatch.teamB}
              </h2>
              <p className="text-xs sm:text-sm text-slate-300">
                Innings {ongoingMatch.currentInnings} • {ongoingMatch.totalOvers} Overs Match
              </p>
            </div>

            <div className="flex items-center gap-2.5 sm:gap-3 w-full md:w-auto">
              <button
                onClick={() => router.push(`/matches/score/${ongoingMatch.id}`)}
                className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm min-h-[44px] shadow-lg shadow-emerald-500/30 transition-all hover:scale-105 active:scale-95"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Resume Scoring</span>
              </button>

              <Link
                href="/matches/history"
                className="px-3.5 sm:px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-xs sm:text-sm min-h-[44px] flex items-center justify-center transition-colors text-center shrink-0"
              >
                All Matches
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── HERO ACTION CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
        {/* New Match Primary Card */}
        <Link
          href="/matches/new"
          className="group relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-br from-emerald-600 to-green-700 p-4 sm:p-5 md:p-6 text-white shadow-lg hover:shadow-emerald-600/30 transition-all hover:-translate-y-0.5 active:scale-[0.99] flex flex-col justify-between min-h-[140px] sm:h-48"
        >
          <img
            src="/assets/illustrations/st_bat.png"
            alt="Cricket Bat"
            className="absolute -right-3 -bottom-3 w-22 h-22 sm:w-28 sm:h-28 object-contain opacity-25 group-hover:opacity-40 group-hover:scale-105 transition-all pointer-events-none"
          />
          <div className="flex justify-between items-start relative z-10">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center">
              <PlusCircle className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full bg-white/20 text-xs sm:text-xs font-bold uppercase tracking-wider">
              Quick Start
            </span>
          </div>

          <div className="relative z-10 my-2 sm:my-0">
            <h3 className="text-xl sm:text-2xl font-black tracking-tight">Start New Match</h3>
            <p className="text-xs sm:text-sm text-emerald-100 mt-0.5 sm:mt-1 line-clamp-2">
              Custom overs, toss rules, 10 dismissal types & live scoring
            </p>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-200 group-hover:text-white transition-colors relative z-10">
            <span>Setup Match</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* Tournaments Hub Card */}
        <Link
          href="/tournaments"
          className="group relative overflow-hidden rounded-xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] p-4 sm:p-5 md:p-6 shadow-xs hover:shadow-md transition-all hover:-translate-y-0.5 active:scale-[0.99] flex flex-col justify-between min-h-[140px] sm:h-48"
        >
          <img
            src="/assets/illustrations/man_of_match.png"
            alt="Trophy"
            className="absolute -right-3 -bottom-3 w-22 h-22 sm:w-26 sm:h-26 object-contain opacity-15 dark:opacity-25 group-hover:opacity-35 group-hover:scale-105 transition-all pointer-events-none"
          />
          <div className="flex justify-between items-start relative z-10">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Trophy className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <span className="text-xs sm:text-xs font-bold text-[var(--muted-foreground)]">
              {tournamentCount} Tournaments
            </span>
          </div>

          <div className="relative z-10 my-2 sm:my-0">
            <h3 className="text-lg sm:text-xl font-bold tracking-tight">Tournaments & Leagues</h3>
            <p className="text-xs sm:text-sm text-[var(--muted-foreground)] mt-0.5 sm:mt-1 line-clamp-2">
              Knockout brackets with byes, round-robin, IPL playoffs & ICC NRR
            </p>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 group-hover:translate-x-1 transition-transform relative z-10">
            <span>View Tournament Hub</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </Link>

        {/* Teams & Squad Management Card */}
        <Link
          href="/teams"
          className="group relative overflow-hidden rounded-xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] p-4 sm:p-5 md:p-6 shadow-xs hover:shadow-md transition-all hover:-translate-y-0.5 active:scale-[0.99] flex flex-col justify-between min-h-[140px] sm:h-48 col-span-1 sm:col-span-2 md:col-span-1"
        >
          <img
            src="/assets/illustrations/strike_batsman.png"
            alt="Squads"
            className="absolute -right-3 -bottom-3 w-22 h-22 sm:w-26 sm:h-26 object-contain opacity-15 dark:opacity-25 group-hover:opacity-35 group-hover:scale-105 transition-all pointer-events-none"
          />
          <div className="flex justify-between items-start relative z-10">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Users className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <span className="text-xs sm:text-xs font-bold text-[var(--muted-foreground)]">
              {teamCount} Teams Saved
            </span>
          </div>

          <div className="relative z-10 my-2 sm:my-0">
            <h3 className="text-lg sm:text-xl font-bold tracking-tight">Team Squads</h3>
            <p className="text-xs sm:text-sm text-[var(--muted-foreground)] mt-0.5 sm:mt-1 line-clamp-2">
              Captains, managers & 15 structured squad positions
            </p>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 group-hover:translate-x-1 transition-transform relative z-10">
            <span>Manage Squads</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </Link>
      </div>

      {/* ── METRIC STATS STRIP ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
        <div className="p-3 sm:p-4 rounded-xl bg-[var(--card)] border border-[var(--border)]">
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-xs font-semibold text-[var(--muted-foreground)]">
            <Award className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500" />
            <span>Total Matches</span>
          </div>
          <p className="text-xl sm:text-2xl font-black mt-1 num-font">{recentMatches.length}</p>
        </div>

        <div className="p-3 sm:p-4 rounded-xl bg-[var(--card)] border border-[var(--border)]">
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-xs font-semibold text-[var(--muted-foreground)]">
            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500" />
            <span>Saved Teams</span>
          </div>
          <p className="text-xl sm:text-2xl font-black mt-1 num-font">{teamCount}</p>
        </div>

        <div className="p-3 sm:p-4 rounded-xl bg-[var(--card)] border border-[var(--border)]">
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-xs font-semibold text-[var(--muted-foreground)]">
            <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500" />
            <span>Tournaments</span>
          </div>
          <p className="text-xl sm:text-2xl font-black mt-1 num-font">{tournamentCount}</p>
        </div>

        <div className="p-3 sm:p-4 rounded-xl bg-[var(--card)] border border-[var(--border)]">
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-xs font-semibold text-[var(--muted-foreground)]">
            <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-500" />
            <span>Engine Version</span>
          </div>
          <p className="text-xl sm:text-2xl font-black mt-1 num-font">v2.1 Pro</p>
        </div>
      </div>

      {/* ── RECENT MATCHES SECTION ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-emerald-600" />
            <h3 className="text-lg font-bold">Recent Matches</h3>
          </div>
          <Link
            href="/matches/history"
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-500 flex items-center gap-1"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {recentMatches.length === 0 && !loading ? (
          <div className="p-10 text-center rounded-2xl bg-[var(--card)] border border-[var(--border)] border-dashed">
            <div className="w-12 h-12 rounded-full bg-[var(--muted)] flex items-center justify-center mx-auto mb-3 text-[var(--muted-foreground)]">
              <History className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-base">No Matches Scored Yet</h4>
            <p className="text-sm text-[var(--muted-foreground)] max-w-sm mx-auto mt-1 mb-4">
              Start your first cricket match scoring session with our live ball-by-ball engine.
            </p>
            <Link
              href="/matches/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-md shadow-emerald-600/20"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Score A Match</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recentMatches.map((m) => (
              <div
                key={m.id}
                className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] shadow-xs flex flex-col justify-between gap-3 hover:border-emerald-500/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-xs uppercase font-bold text-[var(--muted-foreground)] tracking-wider truncate block">
                      {m.totalOvers} Overs • {m.venue || 'Standard Ground'}
                    </span>
                    <h4 className="font-extrabold text-base tracking-tight mt-0.5 truncate">
                      {m.teamA} vs {m.teamB}
                    </h4>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-extrabold uppercase ${
                      m.status === 'ONGOING'
                        ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                        : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
                    }`}
                  >
                    {m.status}
                  </span>
                </div>

                <div className="text-xs text-[var(--muted-foreground)] font-medium">
                  {m.result || (m.status === 'ONGOING' ? 'Match In Progress' : 'Match Completed')}
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
                  {m.status === 'ONGOING' ? (
                    <Link
                      href={`/matches/score/${m.id}`}
                      className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold text-center min-h-[40px] flex items-center justify-center active:scale-[0.98] transition-all"
                    >
                      Resume Live
                    </Link>
                  ) : (
                    <Link
                      href={`/matches/center/${m.id}`}
                      className="flex-1 py-2 rounded-lg bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--foreground)] text-xs font-semibold text-center min-h-[40px] flex items-center justify-center active:scale-[0.98] transition-all"
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
