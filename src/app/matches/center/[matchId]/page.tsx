'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  FileText,
  Share2,
  ArrowLeft,
  Award,
  Users,
  Clock,
  Sparkles,
  BarChart2,
} from 'lucide-react';
import { MatchRepository } from '@/infrastructure/storage/MatchRepository';
import { MatchScorecard, InningsData, Player, Bowler, FallOfWicket, Partnership } from '@/domain/cricket/types';
import {
  cleanPlayerName,
  strikeRate,
  economyRate,
  currentRunRate,
} from '@/domain/cricket/formatters';
import { ManOfTheMatchEngine } from '@/domain/cricket/analytics/ManOfTheMatchEngine';
import { TeamBadgeIcon } from '@/components/common/TeamBadgeIcon';

const BatsmanProfileModal = dynamic(
  () => import('@/components/modals/BatsmanProfileModal').then((mod) => mod.BatsmanProfileModal),
  { ssr: false }
);
const BowlerProfileModal = dynamic(
  () => import('@/components/modals/BowlerProfileModal').then((mod) => mod.BowlerProfileModal),
  { ssr: false }
);

export default function MatchCenterPage() {
  const params = useParams();
  const router = useRouter();
  const matchId = params.matchId as string;

  const [match, setMatch] = useState<MatchScorecard | null>(null);
  const [activeTab, setActiveTab] = useState<'scorecard' | 'partnerships' | 'info'>('scorecard');
  const [loading, setLoading] = useState(true);

  // Profile Modals State
  const [selectedBatsman, setSelectedBatsman] = useState<{
    player: Player;
    battingPosition?: number;
    partnerships?: Partnership[];
    fallOfWickets?: FallOfWicket[];
  } | null>(null);

  const [selectedBowler, setSelectedBowler] = useState<{
    bowler: Bowler;
    fallOfWickets?: FallOfWicket[];
  } | null>(null);

  useEffect(() => {
    async function loadMatch() {
      if (!matchId) return;
      const data = await MatchRepository.getMatch(matchId);
      setMatch(data || null);
      setLoading(false);
    }
    loadMatch();
  }, [matchId]);

  const mom = useMemo(() => {
    if (!match) return null;
    return ManOfTheMatchEngine.calculateForMatch(match.firstInnings, match.secondInnings, {
      totalOvers: match.totalOvers,
      winner: match.winner,
      loser: match.loser,
      result: match.result,
      match,
    });
  }, [match]);

  const handleDownloadPdf = async () => {
    if (!match) return;
    const { ScorecardPdfGenerator } = await import('@/features/scoring/pdf/ScorecardPdfGenerator');
    ScorecardPdfGenerator.downloadPdf(match);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="border-4 border-emerald-600 border-t-transparent animate-spin rounded-full w-10 h-10" />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="text-center p-12 space-y-3">
        <h2 className="font-bold text-h3">Match Not Found</h2>
        <Link href="/matches/history" className="font-bold hover:underline text-emerald-600">
          Back to Matches
        </Link>
      </div>
    );
  }

  const renderInningsScorecard = (inn: InningsData, label: string) => {
    return (
      <div className="space-y-4 w-full min-w-0">
        {/* Batting Card */}
        <div className="floating-card overflow-hidden w-full min-w-0">
          <div className="bg-[var(--muted)] border-b border-[var(--border)] flex items-center justify-between p-3.5 sm:p-4 gap-2 min-w-0">
            <span className="font-extrabold text-body-small leading-none truncate">{label} — Batting</span>
            <span className="font-bold num-font text-body-small leading-none shrink-0">
              {inn.totalRuns} - {inn.totalWickets} ({inn.oversString} ov)
            </span>
          </div>

          <div className="overflow-x-auto table-scroll-container w-full">
            <table className="text-caption w-full min-w-full sm:min-w-[480px] border-collapse">
              <thead className="bg-[var(--muted)]/50 font-bold uppercase border-b border-[var(--border)] text-[var(--muted-foreground)]">
                <tr>
                  <th className="py-2.5 px-2.5 sm:px-3 text-left align-middle min-w-[100px]">Batsman</th>
                  <th className="hidden sm:table-cell py-2.5 px-3 text-left align-middle">Dismissal</th>
                  <th className="py-2.5 px-1.5 sm:px-2 text-right align-middle w-9 sm:w-12">R</th>
                  <th className="py-2.5 px-1.5 sm:px-2 text-right align-middle w-9 sm:w-12">B</th>
                  <th className="py-2.5 px-1.5 sm:px-2 text-right align-middle w-9 sm:w-12">4s</th>
                  <th className="py-2.5 px-1.5 sm:px-2 text-right align-middle w-9 sm:w-12">6s</th>
                  <th className="py-2.5 px-2 sm:px-3 text-right align-middle w-12 sm:w-16">SR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] num-font">
                {inn.players.map((p, i) => {
                  let dismissal = 'did not bat';
                  if (p.isDismissed) dismissal = p.dismissalText || 'out';
                  else if (p.balls > 0 || p.runs > 0) dismissal = 'not out*';

                  return (
                    <tr
                      key={i}
                      onClick={() =>
                        setSelectedBatsman({
                          player: p,
                          battingPosition: i + 1,
                          partnerships: inn.pastPartnerships,
                          fallOfWickets: inn.fallOfWickets,
                        })
                      }
                      className="hover:bg-[var(--muted)]/50 cursor-pointer transition-colors group"
                      title="Click to view batsman profile & metrics"
                    >
                      <td className="font-bold group-hover:text-emerald-500 transition-colors px-2.5 sm:px-3 py-2.5 text-body-small align-middle text-left">
                        <div className="flex flex-col justify-center min-w-0">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="truncate">{cleanPlayerName(p.name)}</span>
                            <span className="opacity-0 group-hover:opacity-100 transition-opacity font-normal text-emerald-500 shrink-0">
                              ↗
                            </span>
                          </div>
                          <span className="sm:hidden font-normal italic font-sans truncate text-[var(--muted-foreground)] text-[10px] sm:text-caption max-w-[140px]">
                            {dismissal}
                          </span>
                        </div>
                      </td>
                      <td className="hidden sm:table-cell italic font-sans py-2.5 px-3 text-caption align-middle text-left">
                        {dismissal}
                      </td>
                      <td className="font-black px-1.5 sm:px-2 py-2.5 text-body-small align-middle text-right text-[var(--foreground)]">
                        {p.runs}
                      </td>
                      <td className="px-1.5 sm:px-2 py-2.5 text-caption align-middle text-right text-[var(--muted-foreground)]">
                        {p.balls}
                      </td>
                      <td className="px-1.5 sm:px-2 py-2.5 text-caption align-middle text-right text-[var(--muted-foreground)]">
                        {p.fours}
                      </td>
                      <td className="px-1.5 sm:px-2 py-2.5 text-caption align-middle text-right text-[var(--muted-foreground)]">
                        {p.sixes}
                      </td>
                      <td className="font-bold px-2 sm:px-3 py-2.5 text-caption align-middle text-right text-[var(--foreground)]">
                        {strikeRate(p.runs, p.balls).toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="bg-[var(--muted)]/30 border-t border-[var(--border)] flex items-center justify-between text-caption p-3 gap-2 min-w-0">
            <span className="font-medium text-[var(--muted-foreground)] shrink-0">Extras:</span>
            <span className="font-bold num-font text-[var(--foreground)] text-right truncate">
              {inn.wideRuns + inn.nbRuns + inn.byeRuns + inn.lbRuns + inn.penaltyRuns} (w {inn.wideRuns}, nb {inn.nbRuns}, b {inn.byeRuns}, lb {inn.lbRuns})
            </span>
          </div>
        </div>

        {/* Bowling Card */}
        <div className="floating-card overflow-hidden w-full min-w-0">
          <div className="bg-[var(--muted)] border-b border-[var(--border)] flex items-center justify-between p-3.5 sm:p-4">
            <span className="font-extrabold text-body-small leading-none truncate">{inn.bowlingTeam} — Bowling</span>
          </div>

          <div className="overflow-x-auto table-scroll-container w-full">
            <table className="text-caption w-full min-w-full sm:min-w-[440px] border-collapse">
              <thead className="bg-[var(--muted)]/50 font-bold uppercase border-b border-[var(--border)] text-[var(--muted-foreground)]">
                <tr>
                  <th className="py-2.5 px-2.5 sm:px-3 text-left align-middle min-w-[100px]">Bowler</th>
                  <th className="py-2.5 px-1.5 sm:px-2 text-center align-middle w-9 sm:w-12">
                    <span className="sm:hidden">O</span>
                    <span className="hidden sm:inline">Overs</span>
                  </th>
                  <th className="py-2.5 px-1.5 sm:px-2 text-center align-middle w-9 sm:w-12">
                    <span className="sm:hidden">M</span>
                    <span className="hidden sm:inline">Maidens</span>
                  </th>
                  <th className="py-2.5 px-1.5 sm:px-2 text-center align-middle w-9 sm:w-12">
                    <span className="sm:hidden">R</span>
                    <span className="hidden sm:inline">Runs</span>
                  </th>
                  <th className="py-2.5 px-1.5 sm:px-2 text-center align-middle w-9 sm:w-12">
                    <span className="sm:hidden">W</span>
                    <span className="hidden sm:inline">Wickets</span>
                  </th>
                  <th className="py-2.5 px-2 sm:px-3 text-right align-middle w-12 sm:w-16">
                    <span className="sm:hidden">Eco</span>
                    <span className="hidden sm:inline">Econ</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] num-font">
                {inn.bowlers
                  .filter((b) => b.ballsBowled > 0 || b.runs > 0 || b.wickets > 0)
                  .map((b, i) => (
                    <tr
                      key={i}
                      onClick={() =>
                        setSelectedBowler({
                          bowler: b,
                          fallOfWickets: inn.fallOfWickets,
                        })
                      }
                      className="hover:bg-[var(--muted)]/50 cursor-pointer transition-colors group"
                      title="Click to view bowler profile & spell stats"
                    >
                      <td className="font-bold group-hover:text-blue-500 transition-colors px-2.5 sm:px-3 py-2.5 text-body-small align-middle text-left">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="truncate">{cleanPlayerName(b.name)}</span>
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity font-normal text-blue-500 shrink-0">
                            ↗
                          </span>
                        </div>
                      </td>
                      <td className="font-bold px-1.5 sm:px-2 py-2.5 text-caption align-middle text-center text-[var(--foreground)]">
                        {Math.floor(b.ballsBowled / 6)}.{b.ballsBowled % 6}
                      </td>
                      <td className="px-1.5 sm:px-2 py-2.5 text-caption align-middle text-center text-[var(--muted-foreground)]">
                        {b.maidens}
                      </td>
                      <td className="font-black px-1.5 sm:px-2 py-2.5 text-caption align-middle text-center text-[var(--foreground)]">
                        {b.runs}
                      </td>
                      <td className="font-black px-1.5 sm:px-2 py-2.5 text-body-small align-middle text-center text-blue-600 dark:text-blue-400">
                        {b.wickets}
                      </td>
                      <td className="font-bold px-2 sm:px-3 py-2.5 text-caption align-middle text-right text-[var(--foreground)]">
                        {economyRate(b.runs, b.ballsBowled).toFixed(2)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Fall of Wickets */}
        {inn.fallOfWickets && inn.fallOfWickets.length > 0 && (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-3.5 sm:p-4 text-caption space-y-2 w-full min-w-0">
            <span className="font-bold uppercase tracking-wider text-[var(--muted-foreground)] block">
              Fall of Wickets
            </span>
            <div className="flex flex-wrap gap-1.5 sm:gap-2 pt-1 items-center">
              {inn.fallOfWickets.map((f, i) => {
                const victimPlayer = inn.players.find(
                  (pl) => cleanPlayerName(pl.name).toLowerCase() === cleanPlayerName(f.player).toLowerCase()
                );
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      if (victimPlayer) {
                        setSelectedBatsman({
                          player: victimPlayer,
                          battingPosition: inn.players.indexOf(victimPlayer) + 1,
                          partnerships: inn.pastPartnerships,
                          fallOfWickets: inn.fallOfWickets,
                        });
                      }
                    }}
                    className="inline-flex items-center truncate bg-[var(--muted)] hover:bg-[var(--border)] border border-[var(--border)] font-semibold transition-colors cursor-pointer max-w-full px-2.5 sm:px-3 py-1.5 rounded-lg text-left gap-1"
                    title="Click to view player profile"
                  >
                    <b className="text-red-500 leading-none shrink-0">{f.wicket}-{f.score}</b>
                    <span className="leading-none text-[var(--muted-foreground)] truncate">({cleanPlayerName(f.player)}, {f.over} ov)</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-5xl xl:max-w-6xl mx-auto space-y-4 sm:space-y-5 w-full min-w-0 px-2 sm:px-0">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2 min-w-0 flex-wrap">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center font-semibold hover:text-[var(--foreground)] gap-1.5 text-caption min-h-[38px] p-1 text-[var(--muted-foreground)] shrink-0"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" /> <span className="leading-none">Back</span>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          {match.status === 'ONGOING' && (
            <Link
              href={`/matches/score/${match.id}`}
              className="bg-emerald-600 hover:bg-emerald-500 font-bold inline-flex items-center px-3 py-2 rounded-xl text-caption min-h-[38px] text-white leading-none shadow-xs"
            >
              Resume Scorer
            </Link>
          )}

          <button
            onClick={handleDownloadPdf}
            className="inline-flex items-center bg-[var(--muted)] hover:bg-[var(--border)] font-bold gap-1.5 px-3 py-2 rounded-xl min-h-[38px] text-caption text-[var(--foreground)] leading-none border border-[var(--border)]/50"
          >
            <FileText className="text-emerald-600 w-4 h-4 shrink-0" />
            <span className="leading-none">Download PDF</span>
          </button>
        </div>
      </div>

      {/* Hero Match Center Scoreboard Banner (Side-by-Side Teams on Mobile & Desktop) */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 shadow-xl border border-white/10 rounded-2xl sm:rounded-3xl text-white p-4 sm:p-6 md:p-8 space-y-3 sm:space-y-4 overflow-hidden min-w-0">
        <div className="flex items-center justify-between font-bold uppercase tracking-wider text-caption gap-2 min-w-0">
          <span className="truncate min-w-0 flex-1 leading-none">{match.venue || 'Venue not set'} • {match.totalOvers} Overs</span>
          <span className="bg-white/10 shrink-0 py-1 px-2.5 rounded-full text-caption leading-none inline-flex items-center whitespace-nowrap">
            {match.status}
          </span>
        </div>

        {/* ── Two Teams Side-by-Side (TEAM A vs TEAM B) ── */}
        <div className="grid grid-cols-2 gap-3 sm:gap-6 pt-1 sm:pt-2 items-stretch min-w-0">
          {/* Innings 1 */}
          {match.firstInnings && (
            <div className="flex flex-col justify-between gap-1.5 h-full min-w-0 border-r border-white/10 pr-2 sm:pr-4">
              <div className="flex items-center font-bold gap-1.5 text-caption min-h-[22px] min-w-0">
                <TeamBadgeIcon type="home" size="xs" />
                <span className="truncate leading-none text-white/90">{match.firstInnings.team}</span>
              </div>
              <div className="font-black num-font inline-flex items-baseline leading-none">
                <span className="text-2xl xs:text-3xl sm:text-display font-black leading-none">{match.firstInnings.totalRuns}</span>
                <span className="text-base xs:text-lg sm:text-xl font-light text-white/50 px-0.5 leading-none">/</span>
                <span className="text-lg xs:text-xl sm:text-2xl font-bold text-white/80 leading-none">{match.firstInnings.totalWickets}</span>
              </div>
              <span className="text-caption font-semibold text-white/70 leading-none block truncate">
                {match.firstInnings.oversString} Overs
              </span>
            </div>
          )}

          {/* Innings 2 */}
          {match.secondInnings ? (
            <div className="flex flex-col justify-between gap-1.5 h-full min-w-0 pl-1 sm:pl-2">
              <div className="flex items-center font-bold gap-1.5 text-caption min-h-[22px] min-w-0">
                <TeamBadgeIcon type="away" size="xs" />
                <span className="truncate leading-none text-white/90">{match.secondInnings.team}</span>
              </div>
              <div className="font-black num-font inline-flex items-baseline leading-none">
                <span className="text-2xl xs:text-3xl sm:text-display font-black leading-none">{match.secondInnings.totalRuns}</span>
                <span className="text-base xs:text-lg sm:text-xl font-light text-white/50 px-0.5 leading-none">/</span>
                <span className="text-lg xs:text-xl sm:text-2xl font-bold text-white/80 leading-none">{match.secondInnings.totalWickets}</span>
              </div>
              <span className="text-caption font-semibold text-white/70 leading-none block truncate">
                {match.secondInnings.oversString} Overs
              </span>
            </div>
          ) : (
            <div className="flex flex-col justify-between gap-1.5 h-full min-w-0 pl-1 sm:pl-2 opacity-60">
              <div className="flex items-center font-bold gap-1.5 text-caption min-h-[22px] min-w-0">
                <TeamBadgeIcon type="away" size="xs" />
                <span className="truncate leading-none text-white/90">
                  {match.firstInnings?.team === match.teamA ? match.teamB : match.teamA}
                </span>
              </div>
              <div className="font-black num-font inline-flex items-baseline leading-none">
                <span className="text-lg xs:text-xl sm:text-2xl font-bold text-white/80 leading-none">Yet to bat</span>
              </div>
              <span className="text-caption font-semibold text-white/70 leading-none block truncate">
                0.0 Overs
              </span>
            </div>
          )}
        </div>

        {/* Result Text & Chase Target */}
        <div className="border-t border-white/10 font-extrabold text-body-small pt-3 leading-normal flex items-center justify-between gap-2 flex-wrap min-w-0">
          <span className="truncate min-w-0 flex-1">{match.result || (match.winner ? `${match.winner} won` : 'Match in progress')}</span>
          {match.advancedSettings?.matchType === 'CHASE' && match.targetScore && (
            <span className="text-caption text-white/70 font-semibold shrink-0 whitespace-nowrap">
              Target: {match.targetScore}
            </span>
          )}
        </div>
      </div>

      {/* Man of the Match Hero Badge */}
      {mom && (
        <div className="bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border border-amber-500/30 flex flex-col p-3.5 sm:p-4 rounded-2xl gap-3 min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 w-full">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shadow-md shadow-amber-500/10 shrink-0 rounded-xl w-11 h-11 sm:w-12 sm:h-12 p-1">
                <img
                  src="/assets/illustrations/man_of_match.png"
                  alt="Man of the Match"
                  className="object-contain drop-shadow w-full h-full"
                />
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold uppercase tracking-wider dark:text-amber-400 text-amber-600 text-[10px] sm:text-caption leading-none block">
                    Man of the Match
                  </span>
                  {mom.confidence !== undefined && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 leading-none">
                      {Math.round(mom.confidence * 100)}% Conf
                    </span>
                  )}
                </div>
                <h4 className="font-black tracking-tight truncate text-body leading-snug">
                  {mom.name} ({mom.role})
                </h4>
                <p className="truncate text-caption leading-none text-[var(--muted-foreground)]">
                  {mom.balls > 0 ? `${mom.runs} (${mom.balls}b)` : ''}
                  {mom.balls > 0 && mom.ballsBowled > 0 ? ' • ' : ''}
                  {mom.ballsBowled > 0 ? `${mom.wickets}/${mom.bowlingRuns} (${(mom.ballsBowled / 6).toFixed(1)} ov)` : ''}
                  {mom.balls === 0 && mom.ballsBowled === 0 ? 'Match Impact Player' : ''}
                </p>
              </div>
            </div>
            <div className="shrink-0 text-right flex flex-col justify-center space-y-0.5 pl-1">
              <span className="text-[10px] sm:text-caption leading-none text-[var(--muted-foreground)] font-semibold block">
                Impact
              </span>
              <div className="font-black num-font text-base sm:text-h3 leading-tight text-amber-600 dark:text-amber-400 whitespace-nowrap">
                {mom.finalScore !== undefined ? mom.finalScore : mom.totalPoints} pts
              </div>
            </div>
          </div>

          {/* Breakdown and AI context */}
          {mom.breakdown && (
            <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-5 gap-1.5 pt-2 border-t border-amber-500/20 text-[11px]">
              <div className="bg-amber-500/10 rounded-lg p-1.5 text-center">
                <span className="block text-[var(--muted-foreground)] font-medium text-[10px]">Batting</span>
                <span className="font-black text-amber-600 dark:text-amber-400">{mom.breakdown.battingImpact}</span>
              </div>
              <div className="bg-amber-500/10 rounded-lg p-1.5 text-center">
                <span className="block text-[var(--muted-foreground)] font-medium text-[10px]">Bowling</span>
                <span className="font-black text-amber-600 dark:text-amber-400">{mom.breakdown.bowlingImpact}</span>
              </div>
              <div className="bg-amber-500/10 rounded-lg p-1.5 text-center">
                <span className="block text-[var(--muted-foreground)] font-medium text-[10px]">Fielding</span>
                <span className="font-black text-amber-600 dark:text-amber-400">{mom.breakdown.fieldingImpact}</span>
              </div>
              <div className="bg-amber-500/10 rounded-lg p-1.5 text-center">
                <span className="block text-[var(--muted-foreground)] font-medium text-[10px]">Pressure</span>
                <span className="font-black text-amber-600 dark:text-amber-400">{mom.breakdown.pressureImpact}</span>
              </div>
              <div className="bg-amber-500/10 rounded-lg p-1.5 text-center">
                <span className="block text-[var(--muted-foreground)] font-medium text-[10px]">Result</span>
                <span className="font-black text-amber-600 dark:text-amber-400">{mom.breakdown.resultImpact}</span>
              </div>
            </div>
          )}

          {mom.reason && (
            <div className="bg-amber-500/5 rounded-xl p-2.5 border border-amber-500/20 text-caption leading-relaxed text-[var(--foreground)]">
              <p className="line-clamp-2">
                <span className="font-bold text-amber-600 dark:text-amber-400">AI Analysis: </span>
                {mom.reason}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tabs Switcher */}
      <div className="flex border-b border-[var(--border)] font-bold overflow-x-auto no-scrollbar gap-4 sm:gap-6 text-body-small min-w-0">
        <button
          onClick={() => setActiveTab('scorecard')}
          className={`pb-2.5 sm:pb-3 border-b-2 whitespace-nowrap min-h-[40px] transition-colors leading-none inline-flex items-center ${
            activeTab === 'scorecard'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-[var(--muted-foreground)]'
          }`}
        >
          Scorecard
        </button>

        <button
          onClick={() => setActiveTab('partnerships')}
          className={`pb-2.5 sm:pb-3 border-b-2 whitespace-nowrap min-h-[40px] transition-colors leading-none inline-flex items-center ${
            activeTab === 'partnerships'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-[var(--muted-foreground)]'
          }`}
        >
          Partnerships
        </button>

        <button
          onClick={() => setActiveTab('info')}
          className={`pb-2.5 sm:pb-3 border-b-2 whitespace-nowrap min-h-[40px] transition-colors leading-none inline-flex items-center ${
            activeTab === 'info'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-[var(--muted-foreground)]'
          }`}
        >
          Match Info
        </button>
      </div>

      {/* Tab 1: Full Scorecards */}
      {activeTab === 'scorecard' && (
        <div className="space-y-5 sm:space-y-6 w-full min-w-0">
          {match.firstInnings && renderInningsScorecard(match.firstInnings, match.firstInnings.team)}
          {match.secondInnings && renderInningsScorecard(match.secondInnings, match.secondInnings.team)}
        </div>
      )}

      {/* Tab 2: Partnerships */}
      {activeTab === 'partnerships' && (
        <div className="space-y-4 w-full min-w-0">
          {[match.firstInnings, match.secondInnings].filter(Boolean).map((inn, idx) => (
            <div key={idx} className="bg-[var(--card)] border border-[var(--border)] p-4 sm:p-5 rounded-2xl space-y-3 w-full min-w-0 overflow-hidden">
              <h4 className="font-extrabold text-body-small truncate">{inn!.team} Partnerships</h4>
              <div className="space-y-2">
                {inn!.pastPartnerships.length === 0 ? (
                  <p className="italic text-caption text-[var(--muted-foreground)]">No partnerships completed yet.</p>
                ) : (
                  inn!.pastPartnerships.map((p, i) => (
                    <div key={i} className="bg-[var(--muted)] flex items-center justify-between p-3 rounded-xl text-caption gap-2 min-w-0">
                      <div className="flex items-center min-w-0 gap-2 flex-1">
                        <img
                          src="/assets/illustrations/running.png"
                          alt="Partnership"
                          className="object-contain shrink-0 w-4 h-4"
                        />
                        <span className="font-bold truncate">{cleanPlayerName(p.batter1)} & {cleanPlayerName(p.batter2)}</span>
                      </div>
                      <span className="font-black num-font shrink-0 text-caption leading-none whitespace-nowrap">{p.runs} runs ({p.balls}b)</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 3: Match Info */}
      {activeTab === 'info' && (
        <div className="bg-[var(--card)] border border-[var(--border)] p-4 sm:p-5 rounded-2xl space-y-3 text-body-small w-full min-w-0 overflow-hidden">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 items-start min-w-0">
            <div className="flex flex-col justify-start min-w-0">
              <span className="font-semibold text-caption text-[var(--muted-foreground)] leading-none truncate">Toss</span>
              <p className="font-bold mt-1 text-body-small leading-snug break-words">{match.tossWinner} opted to {match.tossDecision}</p>
            </div>
            <div className="flex flex-col justify-start min-w-0">
              <span className="font-semibold text-caption text-[var(--muted-foreground)] leading-none truncate">Venue</span>
              <p className="font-bold mt-1 text-body-small leading-snug break-words">{match.venue || 'Venue not set'}</p>
            </div>
            <div className="flex flex-col justify-start min-w-0">
              <span className="font-semibold text-caption text-[var(--muted-foreground)] leading-none truncate">Overs</span>
              <p className="font-bold mt-1 text-body-small leading-snug break-words">{match.totalOvers} Overs per side</p>
            </div>
            <div className="flex flex-col justify-start min-w-0">
              <span className="font-semibold text-caption text-[var(--muted-foreground)] leading-none truncate">Players</span>
              <p className="font-bold mt-1 text-body-small leading-snug break-words">{match.advancedSettings?.players || 11} per team</p>
            </div>
          </div>
        </div>
      )}

      {/* ── BATSMAN & BOWLER PROFILE MODALS ── */}
      <BatsmanProfileModal
        player={selectedBatsman?.player || null}
        isOpen={!!selectedBatsman}
        onClose={() => setSelectedBatsman(null)}
        battingPosition={selectedBatsman?.battingPosition}
        partnerships={selectedBatsman?.partnerships}
        fallOfWickets={selectedBatsman?.fallOfWickets}
      />

      <BowlerProfileModal
        bowler={selectedBowler?.bowler || null}
        isOpen={!!selectedBowler}
        onClose={() => setSelectedBowler(null)}
        fallOfWickets={selectedBowler?.fallOfWickets}
        advancedSettings={match.advancedSettings}
      />
    </div>
  );
}
