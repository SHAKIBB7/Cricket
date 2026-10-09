'use client';

import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  FileText,
  Download,
  Users,
  Shield,
  Activity,
  Award,
  Sparkles,
  CheckCircle2,
  Clock,
  Flame,
} from 'lucide-react';
import { EventSourcedMatchEngine } from '@/domain/cricket/match-engine/EventSourcedMatchEngine';
import { InningsData, Player, Bowler, FallOfWicket } from '@/domain/cricket/types';
import { ScoreboardTheme } from '@/lib/theme/scoreboard-themes';
import {
  strikeRate,
  economyRate,
  currentRunRate,
  requiredRunRate,
  cleanPlayerName,
} from '@/domain/cricket/formatters';
import { TeamBadgeIcon } from '@/components/common/TeamBadgeIcon';
import { MotionNumber } from '@/components/common/MotionNumber';
import { motion, AnimatePresence } from 'framer-motion';
import { ScorecardPdfGenerator } from '@/features/scoring/pdf/ScorecardPdfGenerator';

interface IntegratedScoreboardProps {
  engine: EventSourcedMatchEngine;
  selectedTheme: ScoreboardTheme;
  onClose: () => void;
  onSelectBatsman?: (data: {
    player: Player;
    isStriker?: boolean;
    isNonStriker?: boolean;
    battingPosition?: number;
  }) => void;
  onSelectBowler?: (bowler: Bowler) => void;
  initialInnings?: 1 | 2;
}

export const IntegratedScoreboard = React.memo(function IntegratedScoreboard({
  engine,
  selectedTheme,
  onClose,
  onSelectBatsman,
  onSelectBowler,
  initialInnings,
}: IntegratedScoreboardProps) {
  const [selectedInnings, setSelectedInnings] = useState<1 | 2>(
    initialInnings || (engine.currentInningsNumber as 1 | 2) || 1
  );

  const targetInn: InningsData =
    selectedInnings === 2 && engine.secondInnings
      ? engine.secondInnings
      : engine.firstInnings;

  const isLiveInnings = engine.currentInningsNumber === selectedInnings && !engine.isMatchCompleted;

  const { targetCrr, rrr, neededRuns, remainingBalls } = useMemo(() => {
    const crr = currentRunRate(targetInn.totalRuns, targetInn.totalBalls);
    const remaining = Math.max(0, engine.totalOvers * 6 - targetInn.totalBalls);
    const needed = Math.max(0, engine.targetScore - targetInn.totalRuns);
    const req = requiredRunRate(needed, remaining);
    return { targetCrr: crr, rrr: req, neededRuns: needed, remainingBalls: remaining };
  }, [targetInn.totalRuns, targetInn.totalBalls, engine.totalOvers, engine.targetScore]);

  // Filter played batters & calculate unbatted players
  const { battedPlayers, unbattedPlayers } = useMemo(() => {
    const batted = targetInn.players.filter(
      (p) => p.runs > 0 || p.balls > 0 || p.isDismissed
    );
    const unbatted = targetInn.players.filter(
      (p) => p.runs === 0 && p.balls === 0 && !p.isDismissed && p.name && p.name !== 'Select Player'
    );
    return { battedPlayers: batted, unbattedPlayers: unbatted };
  }, [targetInn.players]);

  // Active bowler figures
  const activeBowlers = useMemo(() => {
    return targetInn.bowlers.filter((b) => b.ballsBowled > 0);
  }, [targetInn.bowlers]);

  // Total Extras calculation
  const totalExtras = useMemo(() => {
    return (
      targetInn.wideRuns +
      targetInn.nbRuns +
      targetInn.byeRuns +
      targetInn.lbRuns +
      targetInn.penaltyRuns
    );
  }, [targetInn.wideRuns, targetInn.nbRuns, targetInn.byeRuns, targetInn.lbRuns, targetInn.penaltyRuns]);

  const handleDownloadPdf = async () => {
    const { ScorecardPdfGenerator } = await import('@/features/scoring/pdf/ScorecardPdfGenerator');
    ScorecardPdfGenerator.downloadPdf(engine.toScorecard());
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out max-w-4xl mx-auto w-full flex flex-col gap-3 pb-8 select-none">
      {/* ── STICKY TOP REVERSIBLE NAVIGATION BAR ── */}
      <div className="sticky top-0 z-30 -mx-1 sm:-mx-2 bg-[var(--card)]/80 backdrop-blur-xl border-b border-[var(--border)]/50 flex items-center justify-between shadow-xs rounded-b-2xl px-3 sm:px-4 py-2.5 gap-3">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center bg-emerald-600 hover:bg-emerald-500 font-bold text-white shadow-sm shadow-emerald-900/20 active:scale-[0.98] transition-all rounded-xl text-caption gap-1.5 px-3 py-2"
          title="Return to live scoring cockpit"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden xs:inline">Back to Scoring</span>
          <span className="xs:hidden">Back</span>
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <div className="bg-emerald-500/10 hidden sm:flex items-center justify-center p-1.5 rounded-lg">
            <FileText className="dark:text-emerald-400 text-emerald-600 w-4 h-4" />
          </div>
          <div className="min-w-0 text-center sm:text-left">
            <h2 className="font-extrabold tracking-tight truncate text-card-title leading-tight">
              Scoreboard
            </h2>
            <p className="text-[11px] text-[var(--muted-foreground)] truncate hidden xs:block">
              {engine.teamA} vs {engine.teamB} • {engine.totalOvers} Overs
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="flex items-center gap-1 bg-[var(--muted)] hover:bg-[var(--muted)]/80 text-[var(--foreground)] font-semibold rounded-xl px-2.5 py-1.5 text-caption transition-colors active:scale-95"
            title="Download PDF Scorecard"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden sm:inline">PDF</span>
          </button>
        </div>
      </div>

      {/* ── INNINGS SELECTOR TABS ── */}
      <div className="flex items-center bg-[var(--muted)]/60 p-1 rounded-xl border border-[var(--border)]/40 gap-1">
        <button
          type="button"
          onClick={() => setSelectedInnings(1)}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5 truncate ${
            selectedInnings === 1
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--card)]/50'
          }`}
        >
          <span className="truncate">1st Inn: {engine.firstInnings.team}</span>
          <span className="num-font opacity-90 shrink-0 font-extrabold">
            {engine.firstInnings.totalRuns}/{engine.firstInnings.totalWickets}
          </span>
        </button>

        {engine.secondInnings && (
          <button
            type="button"
            onClick={() => setSelectedInnings(2)}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5 truncate ${
              selectedInnings === 2
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--card)]/50'
            }`}
          >
            <span className="truncate">2nd Inn: {engine.secondInnings.team}</span>
            <span className="num-font opacity-90 shrink-0 font-extrabold">
              {engine.secondInnings.totalRuns}/{engine.secondInnings.totalWickets}
            </span>
          </button>
        )}
      </div>

      {/* ── COMPACT INNINGS OVERVIEW BANNER (THEME INTEGRATED) ── */}
      <div
        className="rounded-2xl shadow-md p-3.5 sm:p-4 text-white relative overflow-hidden transition-all duration-300"
        style={{
          background: `linear-gradient(135deg, ${selectedTheme.deep} 0%, ${selectedTheme.primary} 60%, ${selectedTheme.secondary} 100%)`,
        }}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          {/* Team & Innings Indicator */}
          <div className="flex items-center gap-2 min-w-0">
            <TeamBadgeIcon
              type={targetInn.team === engine.teamA ? 'home' : 'away'}
              size="sm"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-black text-base sm:text-lg tracking-wide uppercase truncate leading-tight">
                  {targetInn.team}
                </span>
                {isLiveInnings && (
                  <span className="flex relative shrink-0 h-2 w-2" title="Live Innings">
                    <span className="animate-ping absolute inline-flex bg-[#34C759] opacity-75 rounded-full h-full w-full" />
                    <span className="relative inline-flex bg-[#34C759] rounded-full h-2 w-2" />
                  </span>
                )}
              </div>
              <span className="text-[11px] font-semibold text-white/80 uppercase tracking-wider block">
                {selectedInnings === 1 ? '1st Innings' : '2nd Innings Chase'} • {engine.totalOvers} Ov Match
              </span>
            </div>
          </div>

          {/* Primary Score Counter */}
          <div className="flex flex-col items-end shrink-0 leading-none">
            <div className="inline-flex items-baseline num-font select-none">
              <span className="font-black text-2xl sm:text-3xl text-white drop-shadow-xs">
                <MotionNumber value={targetInn.totalRuns} />
              </span>
              <span className="text-lg font-light text-white/50 px-0.5">/</span>
              <span className="font-bold text-xl sm:text-2xl text-white/90">
                <MotionNumber value={targetInn.totalWickets} />
              </span>
            </div>
            <span className="text-[11px] font-bold num-font text-white/80 mt-1">
              ({targetInn.oversString} / {engine.totalOvers} ov)
            </span>
          </div>
        </div>

        {/* Rate & Target Strip */}
        <div className="border-t border-white/15 mt-2.5 pt-2 flex items-center justify-between flex-wrap gap-2 text-xs font-semibold">
          <div className="flex items-center gap-3">
            <span>
              <span className="text-white/70">CRR: </span>
              <span className="font-extrabold num-font text-white">{targetCrr.toFixed(2)}</span>
            </span>
            {selectedInnings === 1 ? (
              <span>
                <span className="text-white/70">Projected: </span>
                <span className="font-extrabold num-font text-[#34C759]">
                  {Math.round(targetCrr * engine.totalOvers)}
                </span>
              </span>
            ) : (
              <span>
                <span className="text-white/70">Target: </span>
                <span className="font-extrabold num-font text-[#34C759]">{engine.targetScore}</span>
              </span>
            )}
          </div>

          {selectedInnings === 2 && engine.targetScore > 0 && (
            <div className="text-[11px] font-bold text-white/90">
              {engine.isMatchCompleted ? (
                <span className="bg-white/20 px-2 py-0.5 rounded-full">Match Concluded</span>
              ) : neededRuns <= 0 ? (
                <span className="text-[#34C759]">Target achieved</span>
              ) : (
                <span>
                  Need <span className="text-[#34C759] num-font">{neededRuns}</span> from{' '}
                  <span className="num-font">{remainingBalls}</span>b (RRR{' '}
                  <span className="num-font">{rrr.toFixed(2)}</span>)
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── BATTING SCORECARD ── */}
      <div className="bg-[var(--card)] border border-[var(--border)]/70 rounded-2xl shadow-xs overflow-hidden">
        <div className="bg-[var(--muted)]/40 border-b border-[var(--border)]/60 px-3.5 py-2 flex items-center justify-between">
          <span className="font-extrabold text-caption uppercase tracking-wider text-[var(--foreground)] flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Batting</span>
          </span>
          <span className="text-[11px] font-bold text-[var(--muted-foreground)] num-font">
            {targetInn.totalRuns} Runs • {targetInn.totalWickets} Wickets
          </span>
        </div>

        <div className="overflow-x-auto table-scroll-container">
          <table className="w-full text-caption border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)]/40 text-[var(--muted-foreground)] text-[11px] uppercase font-bold bg-[var(--muted)]/20">
                <th className="py-2 px-3 text-left align-middle">Batter</th>
                <th className="py-2 px-2 text-right align-middle">R</th>
                <th className="py-2 px-2 text-right align-middle">B</th>
                <th className="py-2 px-2 text-right align-middle">4s</th>
                <th className="py-2 px-2 text-right align-middle">6s</th>
                <th className="py-2 px-3 text-right align-middle">SR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]/30 num-font">
              {battedPlayers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-4 text-center italic text-[var(--muted-foreground)] text-xs">
                    No batting data recorded yet
                  </td>
                </tr>
              ) : (
                battedPlayers.map((p, idx) => {
                  const isStriker =
                    isLiveInnings &&
                    targetInn.strikerIdx !== undefined &&
                    targetInn.players[targetInn.strikerIdx]?.name === p.name;
                  const isNonStriker =
                    isLiveInnings &&
                    targetInn.nonStrikerIdx !== undefined &&
                    targetInn.players[targetInn.nonStrikerIdx]?.name === p.name;
                  const isCurrentBatter = isStriker || isNonStriker;

                  return (
                    <tr
                      key={idx}
                      onClick={() => {
                        if (onSelectBatsman) {
                          onSelectBatsman({
                            player: p,
                            isStriker,
                            isNonStriker,
                            battingPosition: idx + 1,
                          });
                        }
                      }}
                      className={`hover:bg-[var(--muted)]/40 cursor-pointer transition-colors ${
                        isCurrentBatter ? 'bg-emerald-500/[0.05] dark:bg-emerald-500/[0.08]' : ''
                      }`}
                      title="Click to view batsman profile"
                    >
                      <td className="py-2.5 px-3 text-left align-middle">
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-bold text-[var(--foreground)] truncate text-body-small">
                              {cleanPlayerName(p.name)}
                            </span>
                            {isStriker && (
                              <span className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-extrabold text-[10px] px-1.5 py-0.2 rounded-full leading-tight">
                                Striker*
                              </span>
                            )}
                            {isNonStriker && (
                              <span className="bg-blue-500/15 text-blue-600 dark:text-blue-400 font-extrabold text-[10px] px-1.5 py-0.2 rounded-full leading-tight">
                                Non-striker
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-[var(--muted-foreground)] font-medium leading-tight">
                            {p.isDismissed ? (
                              <span className="text-red-500 dark:text-red-400">
                                {p.dismissalText || p.dismissalType || 'out'}
                              </span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                not out
                              </span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right font-black text-sm text-[var(--foreground)] align-middle">
                        {p.runs}
                      </td>
                      <td className="py-2.5 px-2 text-right text-[var(--muted-foreground)] align-middle">
                        {p.balls}
                      </td>
                      <td className="py-2.5 px-2 text-right text-[var(--muted-foreground)] align-middle">
                        {p.fours}
                      </td>
                      <td className="py-2.5 px-2 text-right text-[var(--muted-foreground)] align-middle">
                        {p.sixes}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-[var(--foreground)] align-middle">
                        {strikeRate(p.runs, p.balls).toFixed(1)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Extras & Totals Strip */}
        <div className="bg-[var(--muted)]/30 border-t border-[var(--border)]/60 px-3.5 py-2 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-[var(--foreground)]">Extras:</span>
            <span className="font-extrabold num-font text-emerald-600 dark:text-emerald-400">
              {totalExtras}
            </span>
            <span className="text-[11px] text-[var(--muted-foreground)] num-font">
              (w {targetInn.wideRuns}, nb {targetInn.nbRuns}, b {targetInn.byeRuns}, lb{' '}
              {targetInn.lbRuns}
              {targetInn.penaltyRuns > 0 ? `, pen ${targetInn.penaltyRuns}` : ''})
            </span>
          </div>

          <div className="flex items-center gap-1 num-font text-[11px] font-bold text-[var(--foreground)]">
            <span>Total: </span>
            <span className="font-black text-body-small">
              {targetInn.totalRuns}/{targetInn.totalWickets}
            </span>
            <span className="text-[var(--muted-foreground)]">
              ({targetInn.oversString} Ov, RR {targetCrr.toFixed(2)})
            </span>
          </div>
        </div>

        {/* Yet to Bat section */}
        {unbattedPlayers.length > 0 && (
          <div className="px-3.5 py-2 border-t border-[var(--border)]/40 bg-[var(--card)] text-[11px]">
            <span className="font-bold text-[var(--muted-foreground)] uppercase mr-1.5">
              Yet to bat:
            </span>
            <span className="text-[var(--foreground)] font-medium">
              {unbattedPlayers.map((p) => cleanPlayerName(p.name)).join(', ')}
            </span>
          </div>
        )}
      </div>

      {/* ── BOWLING FIGURES ── */}
      <div className="bg-[var(--card)] border border-[var(--border)]/70 rounded-2xl shadow-xs overflow-hidden">
        <div className="bg-[var(--muted)]/40 border-b border-[var(--border)]/60 px-3.5 py-2 flex items-center justify-between">
          <span className="font-extrabold text-caption uppercase tracking-wider text-[var(--foreground)] flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Bowling</span>
          </span>
          <span className="text-[11px] font-bold text-[var(--muted-foreground)] num-font">
            {targetInn.bowlers.length} Bowlers Used
          </span>
        </div>

        <div className="overflow-x-auto table-scroll-container">
          <table className="w-full text-caption border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)]/40 text-[var(--muted-foreground)] text-[11px] uppercase font-bold bg-[var(--muted)]/20">
                <th className="py-2 px-3 text-left align-middle">Bowler</th>
                <th className="py-2 px-2 text-right align-middle">O</th>
                <th className="py-2 px-2 text-right align-middle">M</th>
                <th className="py-2 px-2 text-right align-middle">R</th>
                <th className="py-2 px-2 text-right text-blue-600 dark:text-blue-400 align-middle">W</th>
                <th className="py-2 px-3 text-right align-middle">Econ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]/30 num-font">
              {activeBowlers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-4 text-center italic text-[var(--muted-foreground)] text-xs">
                    No bowling data recorded yet
                  </td>
                </tr>
              ) : (
                activeBowlers.map((b, idx) => {
                  const isCurrentBowler =
                    isLiveInnings &&
                    targetInn.bowlers[targetInn.currentBowlerIdx]?.name === b.name;

                  return (
                    <tr
                      key={idx}
                      onClick={() => {
                        if (onSelectBowler) {
                          onSelectBowler(b);
                        }
                      }}
                      className={`hover:bg-[var(--muted)]/40 cursor-pointer transition-colors ${
                        isCurrentBowler ? 'bg-blue-500/[0.05] dark:bg-blue-500/[0.08]' : ''
                      }`}
                      title="Click to view bowler profile"
                    >
                      <td className="py-2.5 px-3 text-left align-middle">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-bold text-[var(--foreground)] truncate text-body-small">
                            {cleanPlayerName(b.name)}
                          </span>
                          {isCurrentBowler && (
                            <span className="bg-blue-500/15 text-blue-600 dark:text-blue-400 font-extrabold text-[10px] px-1.5 py-0.2 rounded-full leading-tight">
                              Bowling
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right font-medium text-[var(--foreground)] align-middle">
                        {Math.floor(b.ballsBowled / 6)}.{b.ballsBowled % 6}
                      </td>
                      <td className="py-2.5 px-2 text-right text-[var(--muted-foreground)] align-middle">
                        {b.maidens}
                      </td>
                      <td className="py-2.5 px-2 text-right font-medium text-[var(--foreground)] align-middle">
                        {b.runs}
                      </td>
                      <td className="py-2.5 px-2 text-right font-black text-sm text-blue-600 dark:text-blue-400 align-middle">
                        {b.wickets}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-[var(--foreground)] align-middle">
                        {economyRate(b.runs, b.ballsBowled).toFixed(2)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── FALL OF WICKETS (SPACE-EFFICIENT CHIP STREAM) ── */}
      <div className="bg-[var(--card)] border border-[var(--border)]/70 rounded-2xl shadow-xs p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="font-extrabold text-caption uppercase tracking-wider text-[var(--foreground)] flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-red-500" />
            <span>Fall of Wickets</span>
          </span>
          <span className="text-[11px] text-[var(--muted-foreground)] num-font">
            {targetInn.fallOfWickets.length} Wickets
          </span>
        </div>

        {targetInn.fallOfWickets.length === 0 ? (
          <p className="italic text-[var(--muted-foreground)] text-xs py-1">
            No wickets fallen in this innings.
          </p>
        ) : (
          <div className="flex items-center flex-wrap gap-1.5">
            {targetInn.fallOfWickets.map((f, i) => (
              <div
                key={i}
                className="inline-flex items-center bg-[var(--muted)]/50 border border-[var(--border)]/50 rounded-lg px-2 py-1 text-xs gap-1.5"
              >
                <span className="font-black text-red-500 num-font">
                  {f.wicket}-{f.score}
                </span>
                <span className="text-[var(--foreground)] font-semibold truncate max-w-[120px]">
                  {cleanPlayerName(f.player)}
                </span>
                <span className="text-[10px] text-[var(--muted-foreground)] num-font">
                  ({f.over} ov)
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── BOTTOM ACTIONS ── */}
      <div className="flex items-center justify-between pt-1 gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 bg-[var(--muted)] hover:bg-[var(--muted)]/80 text-[var(--foreground)] font-bold py-2.5 rounded-xl text-xs transition-colors active:scale-95 text-center min-h-[42px]"
        >
          Back to Live Scoring
        </button>

        <button
          type="button"
          onClick={handleDownloadPdf}
          className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold py-2.5 rounded-xl text-xs shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1.5 min-h-[42px]"
        >
          <Download className="w-4 h-4" />
          <span>Download PDF</span>
        </button>
      </div>
    </div>
  );
});
