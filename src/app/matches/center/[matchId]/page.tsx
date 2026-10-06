'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
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
import { ScorecardPdfGenerator } from '@/features/scoring/pdf/ScorecardPdfGenerator';
import { ManOfTheMatchEngine } from '@/domain/cricket/analytics/ManOfTheMatchEngine';
import { BatsmanProfileModal } from '@/components/modals/BatsmanProfileModal';
import { BowlerProfileModal } from '@/components/modals/BowlerProfileModal';
import { TeamBadgeIcon } from '@/components/common/TeamBadgeIcon';

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="text-center p-12 space-y-3">
        <h2 className="text-xl font-bold">Match Not Found</h2>
        <Link href="/matches/history" className="text-emerald-600 font-bold hover:underline">
          Back to Matches
        </Link>
      </div>
    );
  }

  const mom = ManOfTheMatchEngine.calculateForMatch(match.firstInnings, match.secondInnings);

  const renderInningsScorecard = (inn: InningsData, label: string) => {
    return (
      <div className="space-y-4">
        {/* Batting Card */}
        <div className="rounded-2xl bg-[var(--card)] border border-[var(--border)] overflow-hidden shadow-xs">
          <div className="p-4 bg-[var(--muted)] border-b border-[var(--border)] flex items-center justify-between">
            <span className="font-extrabold text-sm text-[var(--foreground)]">{label} — Batting</span>
            <span className="font-bold text-sm text-emerald-600 num-font">
              {inn.totalRuns}/{inn.totalWickets} ({inn.oversString} ov)
            </span>
          </div>

          <div className="overflow-x-auto table-scroll-container">
            <table className="w-full text-left text-xs min-w-[480px]">
              <thead className="bg-[var(--muted)]/50 text-[var(--muted-foreground)] font-bold uppercase border-b border-[var(--border)]">
                <tr>
                  <th className="py-2.5 px-2.5 sm:px-3">Batsman</th>
                  <th className="hidden sm:table-cell py-2.5 px-3">Dismissal</th>
                  <th className="py-2.5 px-1.5 sm:px-2 text-right">R</th>
                  <th className="py-2.5 px-1.5 sm:px-2 text-right">B</th>
                  <th className="py-2.5 px-1.5 sm:px-2 text-right">4s</th>
                  <th className="py-2.5 px-1.5 sm:px-2 text-right">6s</th>
                  <th className="py-2.5 px-2 sm:px-3 text-right">SR</th>
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
                      <td className="py-2 px-2.5 sm:py-2.5 sm:px-3 font-bold text-xs sm:text-sm text-[var(--foreground)] group-hover:text-emerald-500 transition-colors">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <span>{cleanPlayerName(p.name)}</span>
                            <span className="text-xs text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity font-normal">
                              ↗
                            </span>
                          </div>
                          <span className="sm:hidden text-xs text-[var(--muted-foreground)] font-normal italic font-sans truncate max-w-[150px]">
                            {dismissal}
                          </span>
                        </div>
                      </td>
                      <td className="hidden sm:table-cell py-2.5 px-3 text-[var(--muted-foreground)] italic font-sans text-xs">
                        {dismissal}
                      </td>
                      <td className="py-2 px-1.5 sm:py-2.5 sm:px-2 text-right font-black text-xs sm:text-sm">{p.runs}</td>
                      <td className="py-2 px-1.5 sm:py-2.5 sm:px-2 text-right text-[var(--muted-foreground)] text-xs">{p.balls}</td>
                      <td className="py-2 px-1.5 sm:py-2.5 sm:px-2 text-right text-[var(--muted-foreground)] text-xs">{p.fours}</td>
                      <td className="py-2 px-1.5 sm:py-2.5 sm:px-2 text-right text-[var(--muted-foreground)] text-xs">{p.sixes}</td>
                      <td className="py-2 px-2 sm:py-2.5 sm:px-3 text-right font-bold text-emerald-600 text-xs">
                        {strikeRate(p.runs, p.balls).toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-[var(--muted)]/30 border-t border-[var(--border)] text-xs text-[var(--muted-foreground)] flex justify-between">
            <span>Extras:</span>
            <span className="font-bold text-[var(--foreground)] num-font">
              {inn.wideRuns + inn.nbRuns + inn.byeRuns + inn.lbRuns + inn.penaltyRuns} (w {inn.wideRuns}, nb {inn.nbRuns}, b {inn.byeRuns}, lb {inn.lbRuns})
            </span>
          </div>
        </div>

        {/* Bowling Card */}
        <div className="rounded-2xl bg-[var(--card)] border border-[var(--border)] overflow-hidden shadow-xs">
          <div className="p-4 bg-[var(--muted)] border-b border-[var(--border)] flex items-center justify-between">
            <span className="font-extrabold text-sm text-[var(--foreground)]">{inn.bowlingTeam} — Bowling</span>
          </div>

          <div className="overflow-x-auto table-scroll-container">
            <table className="w-full text-left text-xs min-w-[440px]">
              <thead className="bg-[var(--muted)]/50 text-[var(--muted-foreground)] font-bold uppercase border-b border-[var(--border)]">
                <tr>
                  <th className="py-2.5 px-2.5 sm:px-3">Bowler</th>
                  <th className="py-2.5 px-1.5 sm:px-2 text-center">
                    <span className="sm:hidden">O</span>
                    <span className="hidden sm:inline">Overs</span>
                  </th>
                  <th className="py-2.5 px-1.5 sm:px-2 text-center">
                    <span className="sm:hidden">M</span>
                    <span className="hidden sm:inline">Maidens</span>
                  </th>
                  <th className="py-2.5 px-1.5 sm:px-2 text-center">
                    <span className="sm:hidden">R</span>
                    <span className="hidden sm:inline">Runs</span>
                  </th>
                  <th className="py-2.5 px-1.5 sm:px-2 text-center">
                    <span className="sm:hidden">W</span>
                    <span className="hidden sm:inline">Wickets</span>
                  </th>
                  <th className="py-2.5 px-2 sm:px-3 text-right">
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
                      <td className="py-2 px-2.5 sm:py-2.5 sm:px-3 font-bold text-xs sm:text-sm text-[var(--foreground)] group-hover:text-blue-500 transition-colors">
                        <div className="flex items-center gap-1.5">
                          <span>{cleanPlayerName(b.name)}</span>
                          <span className="text-xs text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity font-normal">
                            ↗
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-1.5 sm:py-2.5 sm:px-2 text-center font-bold text-xs">
                        {Math.floor(b.ballsBowled / 6)}.{b.ballsBowled % 6}
                      </td>
                      <td className="py-2 px-1.5 sm:py-2.5 sm:px-2 text-center text-[var(--muted-foreground)] text-xs">{b.maidens}</td>
                      <td className="py-2 px-1.5 sm:py-2.5 sm:px-2 text-center font-black text-xs">{b.runs}</td>
                      <td className="py-2 px-1.5 sm:py-2.5 sm:px-2 text-center font-black text-red-600 text-xs sm:text-sm">{b.wickets}</td>
                      <td className="py-2 px-2 sm:py-2.5 sm:px-3 text-right font-bold text-blue-600 text-xs">
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
          <div className="p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)] text-xs space-y-2">
            <span className="font-bold text-[var(--muted-foreground)] uppercase tracking-wider">
              Fall of Wickets
            </span>
            <div className="flex flex-wrap gap-2 pt-1">
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
                    className="max-w-full truncate px-2.5 py-1 rounded-lg bg-[var(--muted)] hover:bg-[var(--border)] border border-[var(--border)] font-semibold transition-colors cursor-pointer text-left"
                    title="Click to view player profile"
                  >
                    <b className="text-red-500">{f.wicket}-{f.score}</b> ({cleanPlayerName(f.player)}, {f.over} ov)
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
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] min-h-[38px] p-1"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="flex items-center gap-2">
          {match.status === 'ONGOING' && (
            <Link
              href={`/matches/score/${match.id}`}
              className="px-3 sm:px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs min-h-[38px] flex items-center"
            >
              Resume Scorer
            </Link>
          )}

          <button
            onClick={() => ScorecardPdfGenerator.downloadPdf(match)}
            className="flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-xl bg-[var(--muted)] hover:bg-[var(--border)] font-bold text-xs min-h-[38px]"
          >
            <FileText className="w-4 h-4 text-emerald-600" />
            <span>Download PDF</span>
          </button>
        </div>
      </div>

      {/* Hero Match Center Scoreboard Banner */}
      <div className="rounded-2xl sm:rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-4 sm:p-6 md:p-8 text-white shadow-xl border border-white/10 space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between text-xs sm:text-xs font-bold text-emerald-400 uppercase tracking-widest">
          <span className="truncate max-w-[200px] sm:max-w-none">{match.venue || 'Standard Ground'} • {match.totalOvers} Overs</span>
          <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full bg-white/10 text-white text-xs sm:text-xs shrink-0">
            {match.status}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pt-1 sm:pt-2">
          {/* Innings 1 */}
          {match.firstInnings && (
            <div className="space-y-0.5 sm:space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold">
                <TeamBadgeIcon type="home" size="xs" />
                <span className="truncate">{match.firstInnings.team} (1st Inn)</span>
              </div>
              <div className="text-2xl sm:text-3xl md:text-4xl font-black num-font">
                {match.firstInnings.totalRuns}/{match.firstInnings.totalWickets}
                <span className="text-sm sm:text-lg text-slate-400 ml-1.5 sm:ml-2 font-bold">
                  ({match.firstInnings.oversString} ov)
                </span>
              </div>
            </div>
          )}

          {/* Innings 2 */}
          {match.secondInnings && (
            <div className="space-y-0.5 sm:space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold">
                <TeamBadgeIcon type="away" size="xs" />
                <span className="truncate">{match.secondInnings.team} (2nd Inn)</span>
              </div>
              <div className="text-2xl sm:text-3xl md:text-4xl font-black num-font">
                {match.secondInnings.totalRuns}/{match.secondInnings.totalWickets}
                <span className="text-sm sm:text-lg text-slate-400 ml-1.5 sm:ml-2 font-bold">
                  ({match.secondInnings.oversString} ov)
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Result Text */}
        <div className="pt-2 sm:pt-3 border-t border-white/10 text-xs sm:text-sm font-extrabold text-amber-400">
          {match.result || (match.winner ? `${match.winner} won` : 'Match in progress')}
        </div>
      </div>

      {/* Man of the Match Hero Badge */}
      {mom && (
        <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border border-amber-500/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center p-1 shadow-md shadow-amber-500/10 shrink-0">
              <img
                src="/assets/illustrations/man_of_match.png"
                alt="Man of the Match"
                className="w-full h-full object-contain drop-shadow"
              />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Man of the Match
              </span>
              <h4 className="font-black text-sm sm:text-base tracking-tight truncate">{mom.name} ({mom.role})</h4>
              <p className="text-xs sm:text-xs text-[var(--muted-foreground)] truncate">
                {mom.balls > 0 ? `${mom.runs} (${mom.balls}b)` : ''}
                {mom.balls > 0 && mom.ballsBowled > 0 ? ' • ' : ''}
                {mom.ballsBowled > 0 ? `${mom.wickets}/${mom.bowlingRuns} (${(mom.ballsBowled / 6).toFixed(1)} ov)` : ''}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="text-xs sm:text-xs text-[var(--muted-foreground)]">Impact</span>
            <div className="text-lg sm:text-xl font-black text-amber-500 num-font">{mom.totalPoints} pts</div>
          </div>
        </div>
      )}

      {/* Tabs Switcher */}
      <div className="flex border-b border-[var(--border)] gap-4 sm:gap-6 text-xs sm:text-sm font-bold overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('scorecard')}
          className={`pb-2.5 sm:pb-3 border-b-2 whitespace-nowrap min-h-[40px] transition-colors ${
            activeTab === 'scorecard'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-[var(--muted-foreground)]'
          }`}
        >
          Scorecard
        </button>

        <button
          onClick={() => setActiveTab('partnerships')}
          className={`pb-2.5 sm:pb-3 border-b-2 whitespace-nowrap min-h-[40px] transition-colors ${
            activeTab === 'partnerships'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-[var(--muted-foreground)]'
          }`}
        >
          Partnerships
        </button>

        <button
          onClick={() => setActiveTab('info')}
          className={`pb-2.5 sm:pb-3 border-b-2 whitespace-nowrap min-h-[40px] transition-colors ${
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
        <div className="space-y-4 sm:space-y-6">
          {match.firstInnings && renderInningsScorecard(match.firstInnings, match.firstInnings.team)}
          {match.secondInnings && renderInningsScorecard(match.secondInnings, match.secondInnings.team)}
        </div>
      )}

      {/* Tab 2: Partnerships */}
      {activeTab === 'partnerships' && (
        <div className="space-y-3 sm:space-y-4">
          {[match.firstInnings, match.secondInnings].filter(Boolean).map((inn, idx) => (
            <div key={idx} className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] space-y-2.5 sm:space-y-3">
              <h4 className="font-extrabold text-xs sm:text-sm">{inn!.team} Partnerships</h4>
              <div className="space-y-2">
                {inn!.pastPartnerships.length === 0 ? (
                  <p className="text-xs text-[var(--muted-foreground)] italic">No partnerships completed yet.</p>
                ) : (
                  inn!.pastPartnerships.map((p, i) => (
                    <div key={i} className="p-2.5 sm:p-3 rounded-lg sm:rounded-xl bg-[var(--muted)] flex items-center justify-between text-xs gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <img
                          src="/assets/illustrations/running.png"
                          alt="Partnership"
                          className="w-4 h-4 object-contain shrink-0"
                        />
                        <span className="font-bold truncate">{cleanPlayerName(p.batter1)} & {cleanPlayerName(p.batter2)}</span>
                      </div>
                      <span className="font-black text-emerald-600 num-font shrink-0 text-xs sm:text-xs">{p.runs} runs ({p.balls}b)</span>
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
        <div className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] space-y-3 text-xs sm:text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <span className="text-xs sm:text-xs font-semibold text-[var(--muted-foreground)]">Toss</span>
              <p className="font-bold text-xs sm:text-sm mt-0.5">{match.tossWinner} opted to {match.tossDecision}</p>
            </div>
            <div>
              <span className="text-xs sm:text-xs font-semibold text-[var(--muted-foreground)]">Venue</span>
              <p className="font-bold text-xs sm:text-sm mt-0.5">{match.venue || 'Standard Ground'}</p>
            </div>
            <div>
              <span className="text-xs sm:text-xs font-semibold text-[var(--muted-foreground)]">Overs</span>
              <p className="font-bold text-xs sm:text-sm mt-0.5">{match.totalOvers} Overs per side</p>
            </div>
            <div>
              <span className="text-xs sm:text-xs font-semibold text-[var(--muted-foreground)]">Players</span>
              <p className="font-bold text-xs sm:text-sm mt-0.5">{match.advancedSettings?.players || 11} per team</p>
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
