'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Play,
  Trophy,
  Users,
  ArrowRight,
  TrendingUp,
  Award,
} from 'lucide-react';
import { MatchRepository } from '@/infrastructure/storage/MatchRepository';
import { FeatureHubRepository } from '@/infrastructure/storage/FeatureHubRepository';
import { MatchScorecard } from '@/domain/cricket/types';
import { StadiumLottieAnimation } from '@/components/common/StadiumLottieAnimation';
import { TeamBadgeIcon } from '@/components/common/TeamBadgeIcon';

export default function HomePage() {
  const router = useRouter();
  const [ongoingMatch, setOngoingMatch] = useState<MatchScorecard | null>(null);
  const [totalMatches, setTotalMatches] = useState<number>(0);
  const [teamCount, setTeamCount] = useState<number>(0);
  const [tournamentCount, setTournamentCount] = useState<number>(0);

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    try {
      const [ongoing, totalMatchesCount, teamsCount, tournamentsCount] = await Promise.all([
        MatchRepository.getLatestOngoingMatch(),
        MatchRepository.countMatches(),
        FeatureHubRepository.countTeams(),
        FeatureHubRepository.countTournaments(),
      ]);

      setOngoingMatch(ongoing || null);
      setTotalMatches(totalMatchesCount);
      setTeamCount(teamsCount);
      setTournamentCount(tournamentsCount);
    } catch {
      // Ignored for SSR safety
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-5 w-full max-w-7xl mx-auto">
      {/* ── FIRST SCENE / STADIUM BROADCAST VISUAL IDENTITY ── */}
      <div className="relative overflow-hidden bg-gradient-to-r from-emerald-950/90 via-slate-900 to-slate-950 border border-emerald-500/30 rounded-2xl p-4 sm:p-5 shadow-floating text-white">
        <div className="absolute top-0 right-0 -mt-6 -mr-6 bg-emerald-500/15 blur-3xl rounded-full w-48 h-48 pointer-events-none" />
        <div className="flex flex-col sm:flex-row items-center sm:items-stretch justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3.5 sm:gap-4 min-w-0 w-full sm:w-auto text-left">
            <div className="bg-slate-900/80 border border-emerald-500/30 rounded-2xl p-1.5 shrink-0 flex items-center justify-center shadow-md shadow-emerald-500/10">
              <StadiumLottieAnimation size="hero" accentColor="#34C759" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex relative h-2 w-2">
                  <span className="animate-ping absolute inline-flex bg-[#34C759] opacity-75 rounded-full h-full w-full" />
                  <span className="relative inline-flex bg-[#34C759] rounded-full h-2 w-2" />
                </span>
                <span className="font-extrabold uppercase tracking-wider text-caption text-emerald-400">
                  Live Match Arena • Cric Scorer Pro
                </span>
              </div>
              <h1 className="font-black tracking-tight text-h2 leading-tight truncate">
                Stadium Broadcast Center
              </h1>
              <p className="text-body-small text-emerald-100/80 line-clamp-1">
                Official tournament-grade ball tracking, wagon wheel & live scoring
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
            <Link
              href="/matches/new"
              className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold shadow-md shadow-emerald-500/25 transition-all hover:scale-105 active:scale-95 py-2 px-4 rounded-xl text-body-small min-h-btn flex items-center gap-1.5"
            >
              <Play className="fill-current w-3.5 h-3.5" />
              <span>Start Match</span>
            </Link>
          </div>
        </div>
      </div>

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
              <div className="flex items-center gap-2 flex-wrap">
                <TeamBadgeIcon type="home" size="xs" />
                <h2 className="font-black tracking-tight truncate max-w-full text-h2">
                  {ongoingMatch.teamA} vs {ongoingMatch.teamB}
                </h2>
                <TeamBadgeIcon type="away" size="xs" />
              </div>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
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
            <span className="font-bold text-caption text-[var(--muted-foreground)]">
              {tournamentCount} Tournaments
            </span>
          </div>

          <div className="relative z-10 my-0">
            <h3 className="font-bold tracking-tight text-h3">Tournaments & Leagues</h3>
            <p className="line-clamp-2 text-body-small mt-1 text-[var(--muted-foreground)]">
              Knockout brackets with byes, round-robin, IPL playoffs & ICC NRR
            </p>
          </div>

          <div className="flex items-center font-bold text-amber-600 dark:text-amber-400 group-hover:translate-x-1 transition-transform relative z-10 gap-1.5 text-caption">
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
            <span className="font-bold text-caption text-[var(--muted-foreground)]">
              {teamCount} Teams Saved
            </span>
          </div>

          <div className="relative z-10 my-0">
            <h3 className="font-bold tracking-tight text-h3">Team Squads</h3>
            <p className="line-clamp-2 text-body-small mt-1 text-[var(--muted-foreground)]">
              Captains, managers & 15 structured squad positions
            </p>
          </div>

          <div className="flex items-center font-bold text-blue-600 dark:text-blue-400 group-hover:translate-x-1 transition-transform relative z-10 gap-1.5 text-caption">
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
          <p className="font-black num-font text-h2 mt-1">{totalMatches}</p>
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
    </div>
  );
}
