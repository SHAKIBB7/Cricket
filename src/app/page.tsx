'use client';

import { teamDisplayName } from '@/lib/teamDisplayName';
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
import dynamic from 'next/dynamic';
import { MatchRepository } from '@/infrastructure/storage/MatchRepository';
import { FeatureHubRepository } from '@/infrastructure/storage/FeatureHubRepository';
import { MatchScorecard } from '@/domain/cricket/types';
import { TeamBadgeIcon } from '@/components/common/TeamBadgeIcon';
import { Skeleton } from '@/components/common/Skeleton';
import { useEngineVersion } from '@/domain/cricket/match-engine/engine-metadata';
import { useLanguage } from '@/context/LanguageContext';

const StadiumLottieAnimation = dynamic(
  () =>
    import('@/components/common/StadiumLottieAnimation').then(
      (mod) => mod.StadiumLottieAnimation
    ),
  {
    ssr: false,
    loading: () => (
      <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
        <Trophy className="w-6 h-6 animate-pulse" />
      </div>
    ),
  }
);

export default function HomePage() {
  const { t } = useLanguage();
  const router = useRouter();
  const engineVersion = useEngineVersion();
  const [ongoingMatch, setOngoingMatch] = useState<MatchScorecard | null>(null);
  const [totalMatches, setTotalMatches] = useState<number>(0);
  const [teamCount, setTeamCount] = useState<number>(0);
  const [tournamentCount, setTournamentCount] = useState<number>(0);
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);

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
    } finally {
      setIsDashboardLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-5 w-full max-w-7xl mx-auto pb-safe pb-14 sm:pb-10 md:pb-8">
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
                    {t('home_live_arena', 'Live Match Arena')} • Cric Scorer Pro
                  </span>
                </div>
                <h1 className="font-black tracking-tight text-h2 leading-tight truncate">
                  {t('home_broadcast_center', 'Stadium Broadcast Center')}
                </h1>
                <p className="text-body-small text-emerald-100/80 line-clamp-1">
                  {t('home_broadcast_desc', 'Official tournament-grade ball tracking, wagon wheel & live scoring')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
              <Link
                href="/matches/new"
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold shadow-elev2 transition-all hover:scale-105 active:scale-95 py-2 px-4 rounded-xl text-body-small min-h-btn flex items-center gap-1.5"
              >
                <Play className="fill-current w-3.5 h-3.5" />
                <span>{t('home_start_match', 'Start Match')}</span>
              </Link>
            </div>
          </div>
        </div>

      {/* ── UNFINISHED MATCH RESUME BANNER ──
          While the dashboard loads, a placeholder that mirrors the
          card's own padding/flex layout reserves this slot, so the
          sections below never shift when the card swaps in — and the
          slot collapses exactly as before when no match is ongoing. */}
      {isDashboardLoading ? (
        <div
          aria-hidden="true"
          data-testid="home-ongoing-match-skeleton"
          className="relative overflow-hidden bg-[var(--card)] shadow-elev1 border border-[var(--border)] rounded-2xl p-card min-h-[110px]"
        >
          <div className="flex justify-between flex-wrap items-center gap-card-gap">
            <div className="flex flex-col gap-1">
              <Skeleton className="w-44 h-3.5" />
              <Skeleton className="w-64 max-w-full h-6" />
              <Skeleton className="w-36 h-3.5" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="w-32 min-h-btn rounded-xl" />
              <Skeleton className="w-24 min-h-btn rounded-xl" />
            </div>
          </div>
        </div>
      ) : ongoingMatch ? (
          <div className="relative overflow-hidden bg-gradient-to-r from-emerald-900 to-slate-900 shadow-xl border border-emerald-500/30 rounded-2xl text-white p-card">
            <div className="absolute top-0 right-0 -mt-4 -mr-4 bg-emerald-500/20 blur-2xl rounded-full w-32 h-32" />
            <img
              src="/assets/illustrations/chase_batsman.png"
              alt=""
              aria-hidden="true"
              width={112}
              height={112}
              loading="lazy"
              decoding="async"
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
                    {t('home_active_match', 'Active Match in Progress')}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <TeamBadgeIcon type="home" size="xs" />
                  <h2 className="font-black tracking-tight truncate max-w-full text-h2">
                    {teamDisplayName(ongoingMatch.teamA, 'Team A')} vs {teamDisplayName(ongoingMatch.teamB, 'Team B')}
                  </h2>
                  <TeamBadgeIcon type="away" size="xs" />
                </div>
                <p className="text-body-small">
                  {t('innings_label', 'Innings')} {ongoingMatch.currentInnings} • {ongoingMatch.totalOvers} {t('home_overs_match', 'Overs Match')}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push(`/matches/score/${ongoingMatch.id}`)}
                  className="flex-1 md:flex-initial flex items-center justify-center bg-emerald-500 hover:bg-emerald-400 font-bold shadow-elev2 transition-all hover:scale-105 active:scale-95 py-2.5 rounded-xl text-body-small min-h-btn gap-2 px-5"
                >
                  <Play className="fill-current w-4 h-4" />
                  <span>{t('home_resume_scoring', 'Resume Scoring')}</span>
                </button>

                <Link
                  href="/matches/history"
                  className="bg-white/10 hover:bg-white/20 font-medium flex items-center justify-center transition-colors shrink-0 px-4 py-2.5 rounded-xl text-body-small min-h-btn"
                >
                  {t('home_all_matches', 'All Matches')}
                </Link>
              </div>
            </div>
          </div>
      ) : null}

      {/* ── HERO ACTION CARDS ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
          {/* Tournaments Hub Card */}
          <Link
            href="/tournaments"
            className="group relative overflow-hidden bg-[var(--card)] border border-[var(--border)] shadow-elev1 hover:shadow-elev2 transition-all hover:-translate-y-0.5 active:scale-[0.99] flex flex-col justify-between rounded-2xl min-h-[160px] p-4 sm:p-5"
          >
            <img
              src="/assets/illustrations/man_of_match.png"
              alt=""
              aria-hidden="true"
              width={104}
              height={104}
              loading="lazy"
              decoding="async"
              className="absolute -right-3 -bottom-3 object-contain opacity-15 dark:opacity-25 group-hover:opacity-35 group-hover:scale-105 transition-all pointer-events-none w-26 h-26"
            />
            <div className="flex justify-between items-start relative z-10">
              <div className="bg-amber-500/10 dark:text-amber-400 flex items-center justify-center rounded-xl text-amber-600 w-12 h-12">
                <Trophy className="w-6 h-6" />
              </div>
              <span className="font-bold text-caption text-[var(--muted-foreground)]">
                {/* F5: dashboard counts render as plain text — the
                    rolling-digit counters animated for ~3x the page
                    transition when the real values land mid-slide. */}
                {tournamentCount} {t('tournaments', 'Tournaments')}
              </span>
            </div>

            <div className="relative z-10 my-0">
              <h2 className="font-bold tracking-tight text-h3">{t('home_tournaments_leagues', 'Tournaments & Leagues')}</h2>
              <p className="line-clamp-2 text-body-small mt-1 text-[var(--muted-foreground)]">
                {t('home_tournaments_desc', 'Knockout brackets with byes, round-robin, IPL playoffs & ICC NRR')}
              </p>
            </div>

            <div className="flex items-center font-bold text-amber-700 dark:text-amber-400 group-hover:translate-x-1 transition-transform relative z-10 gap-1.5 text-caption">
              <span>{t('home_view_tournament_hub', 'View Tournament Hub')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </Link>

          {/* Teams & Squad Management Card */}
          <Link
            href="/teams"
            className="group relative overflow-hidden bg-[var(--card)] border border-[var(--border)] shadow-elev1 hover:shadow-elev2 transition-all hover:-translate-y-0.5 active:scale-[0.99] flex flex-col justify-between col-span-1 rounded-2xl min-h-[160px] p-4 sm:p-5"
          >
            <img
              src="/assets/illustrations/strike_batsman.png"
              alt=""
              aria-hidden="true"
              width={104}
              height={104}
              loading="lazy"
              decoding="async"
              className="absolute -right-3 -bottom-3 object-contain opacity-15 dark:opacity-25 group-hover:opacity-35 group-hover:scale-105 transition-all pointer-events-none w-26 h-26"
            />
            <div className="flex justify-between items-start relative z-10">
              <div className="bg-blue-500/10 dark:text-blue-400 flex items-center justify-center rounded-xl text-blue-600 w-12 h-12">
                <Users className="w-6 h-6" />
              </div>
              <span className="font-bold text-caption text-[var(--muted-foreground)]">
                {teamCount} {t('home_teams_saved', 'Teams Saved')}
              </span>
            </div>

            <div className="relative z-10 my-0">
              <h2 className="font-bold tracking-tight text-h3">{t('home_team_squads', 'Team Squads')}</h2>
              <p className="line-clamp-2 text-body-small mt-1 text-[var(--muted-foreground)]">
                {t('home_team_squads_desc', 'Captains, managers & 15 structured squad positions')}
              </p>
            </div>

            <div className="flex items-center font-bold text-blue-600 dark:text-blue-400 group-hover:translate-x-1 transition-transform relative z-10 gap-1.5 text-caption">
              <span>{t('home_manage_squads', 'Manage Squads')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </Link>
        </div>

      {/* ── METRIC STATS STRIP ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5">
          <div className="floating-card shadow-elev1 p-3.5 sm:p-4">
            <div className="flex items-center font-semibold gap-2 text-caption">
              <Award className="w-4 h-4 text-emerald-500" />
              <span>{t('home_total_matches', 'Total Matches')}</span>
            </div>
            <p className="font-black num-font text-h2 mt-1">
              {totalMatches}
            </p>
          </div>

          <div className="floating-card shadow-elev1 p-3.5 sm:p-4">
            <div className="flex items-center font-semibold gap-2 text-caption">
              <Users className="w-4 h-4 text-blue-500" />
              <span>{t('home_saved_teams', 'Saved Teams')}</span>
            </div>
            <p className="font-black num-font text-h2 mt-1">
              {teamCount}
            </p>
          </div>

          <div className="floating-card shadow-elev1 p-3.5 sm:p-4">
            <div className="flex items-center font-semibold gap-2 text-caption">
              <Trophy className="w-4 h-4 text-amber-500" />
              <span>{t('tournaments', 'Tournaments')}</span>
            </div>
            <p className="font-black num-font text-h2 mt-1">
              {tournamentCount}
            </p>
          </div>

          <div className="floating-card shadow-elev1 p-3.5 sm:p-4">
            <div className="flex items-center font-semibold gap-2 text-caption">
              <TrendingUp className="w-4 h-4 text-purple-500" />
              <span>{t('home_engine_version', 'Engine Version')}</span>
            </div>
            <p className="font-black num-font text-h2 mt-1">{engineVersion}</p>
          </div>
        </div>
    </div>
  );
}
