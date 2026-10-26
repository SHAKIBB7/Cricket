'use client';

import React, { useState, useMemo } from 'react';
import {
  Download,
  Users,
  Shield,
  Flame,
} from 'lucide-react';
import { EventSourcedMatchEngine } from '@/domain/cricket/match-engine/EventSourcedMatchEngine';
import { InningsData, Player, Bowler, Partnership, FallOfWicket } from '@/domain/cricket/types';
import { DlsEngine } from '@/domain/cricket/dls/DlsEngine';
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
import { TargetProgressBar } from '@/components/scoring/TargetProgressBar';
import { MatchProgressBar } from '@/components/scoring/MatchProgressBar';
import { PdfLoadingOverlay } from '@/components/common/PdfLoadingOverlay';
import { usePdfDownload } from '@/features/scoring/pdf/usePdfDownload';
import { BackButton } from '@/components/navigation';

interface IntegratedScoreboardProps {
  engine: EventSourcedMatchEngine;
  selectedTheme: ScoreboardTheme;
  onClose: () => void;
  onSelectBatsman?: (data: {
    player: Player;
    isStriker?: boolean;
    isNonStriker?: boolean;
    battingPosition?: number;
    partnerships?: Partnership[];
    fallOfWickets?: FallOfWicket[];
  }) => void;
  onSelectBowler?: (data: {
    bowler: Bowler;
    isCurrentlyBowling?: boolean;
    ongoingOverLog?: string[];
    ongoingMatchOver?: number;
    fallOfWickets?: FallOfWicket[];
  } | Bowler) => void;
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

  const isDlsApplied = Boolean(engine.advancedSettings?.dlsApplied);

  const liveDls = useMemo(() => {
    if (!isDlsApplied || selectedInnings !== 2 || !engine.firstInnings) return null;
    const originalOvers = engine.advancedSettings?.originalTotalOvers || engine.totalOvers;
    const team1TotalRuns = engine.firstInnings.totalRuns;
    const team2OversAvailable = engine.totalOvers;
    const team2WicketsLost = targetInn.totalWickets;
    const team2CurrentRuns = targetInn.totalRuns;
    const team2CurrentOversBowled = targetInn.totalBalls / 6;
    const matchType = (originalOvers <= 20 ? 'T20' : 'ODI') as 'T20' | 'ODI';

    return DlsEngine.calculate({
      originalOvers,
      team1TotalRuns,
      team2OversAvailable,
      team2WicketsLost,
      team2CurrentOversBowled,
      team2CurrentRuns,
      matchType,
    });
  }, [isDlsApplied, selectedInnings, engine, targetInn.totalWickets, targetInn.totalRuns, targetInn.totalBalls]);

  const { targetCrr, rrr, neededRuns, remainingBalls } = useMemo(() => {
    const crr = currentRunRate(targetInn.totalRuns, targetInn.totalBalls);
    const remaining = Math.max(0, engine.totalOvers * 6 - targetInn.totalBalls);
    const needed = Math.max(0, engine.targetScore - targetInn.totalRuns);
    const req = requiredRunRate(needed, remaining);
    return { targetCrr: crr, rrr: req, neededRuns: needed, remainingBalls: remaining };
  }, [targetInn.totalRuns, targetInn.totalBalls, engine.totalOvers, engine.targetScore]);

  // Filter played batters & calculate unbatted players
  const { battedPlayers, unbattedPlayers } = useMemo(() => {
    const batted = targetInn.players.filter((p, i) => {
      if (p.runs > 0 || p.balls > 0 || p.isDismissed) return true;
      if (targetInn.totalBalls > 0) {
        const isAtCrease = i === targetInn.strikerIdx || i === targetInn.nonStrikerIdx;
        if (isAtCrease && p.name && p.name.trim() !== '' && p.name !== 'Select Player') {
          return true;
        }
      }
      return false;
    });
    const unbatted = targetInn.players.filter((p) => {
      const isBatted = batted.includes(p);
      return !isBatted && p.name && p.name.trim() !== '' && p.name !== 'Select Player';
    });
    return { battedPlayers: batted, unbattedPlayers: unbatted };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetInn.players, targetInn.totalRuns, targetInn.totalBalls, targetInn.strikerIdx, targetInn.nonStrikerIdx]);

  // Active bowler figures
  const activeBowlers = useMemo(() => {
    return targetInn.bowlers.filter((b, idx) => {
      if (b.ballsBowled > 0 || b.runs > 0 || b.wickets > 0) return true;
      if (
        isLiveInnings &&
        idx === targetInn.currentBowlerIdx &&
        b.name &&
        b.name.trim() !== '' &&
        b.name !== 'Select Player'
      ) {
        return true;
      }
      return false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetInn.bowlers, targetInn.totalBalls, targetInn.totalRuns, isLiveInnings, targetInn.currentBowlerIdx]);

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

  const {
    isOpen: isPdfModalOpen,
    isGenerating: isExportingPdf,
    stage: pdfStage,
    status: pdfStatus,
    error: pdfError,
    downloadPdf,
    retry: retryPdf,
    close: closePdfModal,
  } = usePdfDownload();

  const handleDownloadPdf = async () => {
    if (!engine) return;
    await downloadPdf(engine.toScorecard());
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out max-w-4xl mx-auto w-full flex flex-col gap-3 pb-8 select-none">
      {/* ── STICKY TOP REVERSIBLE ACTION HEADER ── */}
      <div className="sticky top-0 z-30 -mx-1 sm:-mx-2 bg-[var(--card)]/90 backdrop-blur-xl border-b border-[var(--border)]/50 shadow-xs rounded-b-2xl px-3 sm:px-4 py-2 sm:py-2.5">
        <div className="flex items-center gap-2 sm:gap-3 w-full">
          <BackButton
            onClick={onClose}
            label="Back to Live Scoring"
            variant="pill"
            title="Return to live scoring cockpit"
            className="flex-1 sm:flex-initial justify-center !min-h-[42px] !py-2 text-xs font-bold !rounded-xl"
          />

          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isExportingPdf}
            className="flex-1 sm:flex-initial bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-extrabold py-2 sm:py-2.5 px-3 sm:px-4 rounded-xl text-xs shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1.5 min-h-[42px] cursor-pointer"
            title="Download PDF Scorecard"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span className="truncate">Download PDF</span>
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
            <MotionNumber value={engine.firstInnings.totalRuns} />/<MotionNumber value={engine.firstInnings.totalWickets} />
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
              <MotionNumber value={engine.secondInnings.totalRuns} />/<MotionNumber value={engine.secondInnings.totalWickets} />
            </span>
          </button>
        )}
      </div>

      {/* ── COMPACT INNINGS OVERVIEW BANNER (EXACT REFERENCE DESIGN RECREATION) ── */}
      <div
        className="rounded-[26px] sm:rounded-[28px] shadow-[0_16px_36px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.12)] p-3.5 sm:p-5 text-white relative overflow-hidden transition-all duration-300 border border-emerald-500/25"
        style={{
          background: `linear-gradient(135deg, ${selectedTheme.deep} 0%, ${selectedTheme.primary} 60%, ${selectedTheme.secondary} 100%)`,
        }}
      >
        {/* Cricket Stadium Floodlit Atmosphere Backdrop */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-[26px] sm:rounded-[28px]">
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-4/5 h-28 bg-emerald-400/15 blur-2xl rounded-full" />
          <div className="absolute top-1 right-1/4 w-28 h-32 bg-emerald-300/10 rotate-12 blur-xl" />
          <div className="absolute top-1 left-1/4 w-28 h-32 bg-emerald-300/10 -rotate-12 blur-xl" />
          <div className="absolute bottom-0 inset-x-0 h-3/5 bg-gradient-to-t from-emerald-600/20 via-emerald-800/10 to-transparent" />
          <svg className="absolute inset-0 w-full h-full opacity-[0.08]" viewBox="0 0 600 200" fill="none" preserveAspectRatio="none">
            <circle cx="150" cy="40" r="30" fill="#34C759" filter="blur(15px)" />
            <circle cx="450" cy="40" r="30" fill="#34C759" filter="blur(15px)" />
            <path d="M 0 150 Q 300 110 600 150 L 600 200 L 0 200 Z" fill="#10b981" />
            <line x1="150" y1="40" x2="140" y2="150" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.3" />
            <line x1="450" y1="40" x2="460" y2="150" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.3" />
          </svg>
        </div>

        <div className="grid items-start grid-cols-[1.18fr_1fr] sm:grid-cols-2 gap-2 sm:gap-3 relative z-10">
          {/* Team & Innings Indicator */}
          <div className="flex flex-col items-start min-w-0 pr-1 space-y-1 text-left">
            <div className="flex items-center gap-2 min-w-0 text-left w-full">
              <div className="relative shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-emerald-400/75 p-0.5 sm:p-1 flex items-center justify-center bg-emerald-950/60 backdrop-blur-md shadow-[0_0_12px_rgba(16,185,129,0.35),inset_0_1px_1px_rgba(255,255,255,0.15)] ring-1 ring-emerald-500/20">
                <TeamBadgeIcon
                  type={targetInn.team === engine.teamA ? 'home' : 'away'}
                  size="sm"
                  variant="circle"
                />
              </div>
              <div className="flex flex-col justify-center min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-black text-base sm:text-xl tracking-tight uppercase truncate leading-tight drop-shadow-xs">
                    {targetInn.team || engine.teamA || 'HUNGRY XL'}
                  </span>
                  {isLiveInnings && (
                    <span className="flex relative shrink-0 h-2.5 w-2.5" title="Live Innings">
                      <span className="animate-ping absolute inline-flex bg-emerald-400 opacity-60 rounded-full h-full w-full" />
                      <span className="relative inline-flex bg-emerald-400 rounded-full h-2.5 w-2.5 shadow-[0_0_8px_#10b981]" />
                    </span>
                  )}
                </div>
                <span className="text-[11px] sm:text-xs font-semibold text-emerald-100/80 tracking-wide leading-tight mt-0.5">
                  {selectedInnings === 1 ? '1st Innings' : '2nd Innings Chase'}
                </span>
              </div>
            </div>

            {/* Single Statistics Pill (Below Innings Label - Target & CRR Swapped) */}
            {selectedInnings === 2 && engine.targetScore > 0 ? (
              <div className="inline-flex items-center flex-wrap rounded-full bg-black/35 border border-emerald-500/25 px-3 py-1 backdrop-blur-md mt-1.5 self-start select-none gap-x-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-emerald-200/80">
                  {isDlsApplied ? 'Revised Target (DLS): ' : 'Target: '}
                </span>
                <span className="text-xs sm:text-sm font-black text-[#34C759] num-font [font-variant-numeric:tabular-nums]">
                  <MotionNumber value={engine.targetScore} />
                </span>
                <span className="text-emerald-500/35 font-light text-xs">|</span>
                <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-emerald-200/80">
                  CRR:
                </span>
                <span className="text-xs sm:text-sm font-black text-white num-font [font-variant-numeric:tabular-nums]">
                  <MotionNumber value={targetCrr.toFixed(2)} mode="decimal" />
                </span>
              </div>
            ) : (
              <div className="inline-flex items-center rounded-full bg-black/35 border border-emerald-500/25 px-3.5 py-1 backdrop-blur-md mt-1.5 self-start select-none shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-emerald-200/80 mr-1.5">
                  CRR:
                </span>
                <span className="text-xs sm:text-sm font-black text-white num-font [font-variant-numeric:tabular-nums]">
                  <MotionNumber value={targetCrr.toFixed(2)} mode="decimal" />
                </span>
              </div>
            )}
          </div>

          {/* Right Frosted Glass Score Panel */}
          <div className="flex flex-col justify-between items-center min-w-0 bg-emerald-950/40 dark:bg-black/35 backdrop-blur-md border border-emerald-400/20 rounded-2xl p-2.5 sm:p-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.08),0_4px_16px_rgba(0,0,0,0.25)] relative">
            {/* Primary Score */}
            <div className="flex flex-col items-center justify-center w-full pt-1 pb-0.5">
              <div className="inline-flex items-baseline justify-center num-font leading-none select-none">
                <span className="font-black text-3xl sm:text-4xl lg:text-5xl tracking-tight text-emerald-50 drop-shadow-xs [font-variant-numeric:tabular-nums]">
                  <MotionNumber value={targetInn.totalRuns} />
                </span>
                <span className="text-xl sm:text-2xl lg:text-3xl font-light text-emerald-300/40 mx-1 select-none">
                  /
                </span>
                <span className="font-black text-2xl sm:text-3xl lg:text-4xl tracking-tight text-white [font-variant-numeric:tabular-nums]">
                  <MotionNumber value={targetInn.totalWickets} />
                </span>
              </div>
            </div>

            {/* Horizontal Divider */}
            <div className="border-t border-emerald-400/15 w-full my-1.5" />

            {/* Overs & Balls Left Strip */}
            <div className="flex items-center justify-between w-full text-xs font-semibold select-none px-0.5">
              <div className="flex items-baseline gap-1">
                <span className="text-[9px] sm:text-[10px] font-bold tracking-widest text-emerald-200/70 uppercase">
                  OVER
                </span>
                <span className="num-font font-black text-white text-xs sm:text-sm [font-variant-numeric:tabular-nums]">
                  <MotionNumber value={targetInn.oversString} mode="cricket-overs" />
                </span>
              </div>

              <span className="text-emerald-400/20 font-light text-xs">|</span>

              <div className="flex flex-col items-center">
                <span className="font-black num-font text-emerald-300 text-xs sm:text-sm leading-none [font-variant-numeric:tabular-nums]">
                  <MotionNumber value={remainingBalls} />
                </span>
                <span className="text-[8px] font-bold tracking-widest text-emerald-200/70 uppercase leading-none mt-0.5">
                  BALLS LEFT
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* DLS Par Score Strip (Shown ONLY when DLS is applied to this match) */}
        {isDlsApplied && liveDls && selectedInnings === 2 && !engine.isMatchCompleted && (
          <div className="border-t border-emerald-400/15 mt-2.5 pt-2 flex items-center justify-between flex-wrap gap-2 text-xs font-semibold relative z-10">
            <div className="flex items-center gap-1.5 text-cyan-300">
              <span className="font-extrabold tracking-wider bg-cyan-500/20 px-1.5 py-0.5 rounded text-[10px] border border-cyan-400/30">
                DLS PAR
              </span>
              <span className="font-extrabold num-font text-white [font-variant-numeric:tabular-nums]"><MotionNumber value={liveDls.parScore} /></span>
              <span className="text-white/40">•</span>
              {targetInn.totalRuns > liveDls.parScore ? (
                <span className="text-[#34C759] font-bold">+{targetInn.totalRuns - liveDls.parScore} Ahead</span>
              ) : targetInn.totalRuns < liveDls.parScore ? (
                <span className="text-rose-400 font-bold">{targetInn.totalRuns - liveDls.parScore} Behind</span>
              ) : (
                <span className="text-amber-300 font-bold">Level</span>
              )}
            </div>
            {!liveDls.isMinimumOversMet && (
              <span className="text-[10px] text-amber-300/80 font-normal">
                ({liveDls.minimumOversRequired} ov min for legal result)
              </span>
            )}
          </div>
        )}

        {/* Dedicated Innings Progress Frosted Glass Panel (Chase or 1st Innings) */}
        <div className="w-full mt-2.5 sm:mt-3 rounded-2xl bg-black/30 border border-emerald-400/15 p-2.5 sm:p-3 backdrop-blur-md relative z-10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
          {selectedInnings === 2 && engine.targetScore > 0 ? (
            <TargetProgressBar
              currentRuns={targetInn.totalRuns}
              targetRuns={engine.targetScore}
              ballsRemaining={remainingBalls}
              totalOvers={engine.totalOvers}
              rrr={rrr}
              isDlsApplied={isDlsApplied}
              isMatchCompleted={engine.isMatchCompleted}
            />
          ) : (
            <MatchProgressBar
              currentBalls={targetInn.totalBalls}
              totalOvers={engine.totalOvers}
              crr={targetCrr}
            />
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
                      key={p.id || `batter-${idx}`}
                      onClick={() => {
                        if (onSelectBatsman) {
                          onSelectBatsman({
                            player: p,
                            isStriker,
                            isNonStriker,
                            battingPosition: idx + 1,
                            partnerships: targetInn.pastPartnerships,
                            fallOfWickets: targetInn.fallOfWickets,
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
                        <MotionNumber value={p.runs} />
                      </td>
                      <td className="py-2.5 px-2 text-right text-[var(--muted-foreground)] align-middle">
                        <MotionNumber value={p.balls} />
                      </td>
                      <td className="py-2.5 px-2 text-right text-[var(--muted-foreground)] align-middle">
                        <MotionNumber value={p.fours} />
                      </td>
                      <td className="py-2.5 px-2 text-right text-[var(--muted-foreground)] align-middle">
                        <MotionNumber value={p.sixes} />
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-[var(--foreground)] align-middle">
                        <MotionNumber value={strikeRate(p.runs, p.balls).toFixed(1)} mode="decimal" />
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
              <MotionNumber value={totalExtras} />
            </span>
            <span className="text-[11px] text-[var(--muted-foreground)] num-font">
              (w <MotionNumber value={targetInn.wideRuns} />, nb <MotionNumber value={targetInn.nbRuns} />, b <MotionNumber value={targetInn.byeRuns} />, lb{' '}
              <MotionNumber value={targetInn.lbRuns} />
              {targetInn.penaltyRuns > 0 ? <>, pen <MotionNumber value={targetInn.penaltyRuns} /></> : ''})
            </span>
          </div>

          <div className="flex items-center gap-1 num-font text-[11px] font-bold text-[var(--foreground)]">
            <span>Total: </span>
            <span className="font-black text-body-small">
              <MotionNumber value={targetInn.totalRuns} />/<MotionNumber value={targetInn.totalWickets} />
            </span>
            <span className="text-[var(--muted-foreground)]">
              (<MotionNumber value={targetInn.oversString} mode="cricket-overs" /> Ov, RR <MotionNumber value={targetCrr.toFixed(2)} mode="decimal" />)
            </span>
          </div>
        </div>

        {/* Yet to Bat section - Only displayed during ongoing match, not after match completion */}
        {unbattedPlayers.length > 0 && !engine.isMatchCompleted && (
          <div className="px-3.5 py-2 border-t border-[var(--border)]/40 bg-[var(--card)] text-[11px]">
            <span className="font-bold text-[var(--muted-foreground)] uppercase mr-1.5">
              Yet to bat:
            </span>
            <span className="text-[var(--foreground)] font-medium">
              {unbattedPlayers.map((p, uIdx) => (
                <button
                  key={p.id || `unbatted-${uIdx}`}
                  type="button"
                  onClick={() => {
                    if (onSelectBatsman) {
                      onSelectBatsman({
                        player: p,
                        isStriker: false,
                        isNonStriker: false,
                        battingPosition: battedPlayers.length + uIdx + 1,
                        partnerships: targetInn.pastPartnerships,
                        fallOfWickets: targetInn.fallOfWickets,
                      });
                    }
                  }}
                  className="hover:underline hover:text-emerald-600 dark:hover:text-emerald-400 font-medium cursor-pointer inline bg-transparent border-0 p-0 text-inherit text-left"
                  title="Click to view batsman profile"
                >
                  {cleanPlayerName(p.name)}{uIdx < unbattedPlayers.length - 1 ? ', ' : ''}
                </button>
              ))}
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
            {activeBowlers.length} Bowler{activeBowlers.length === 1 ? '' : 's'} Used
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
                      key={b.id || b.name || `bowler-${idx}`}
                      onClick={() => {
                        if (onSelectBowler) {
                          onSelectBowler({
                            bowler: b,
                            isCurrentlyBowling: isCurrentBowler && !targetInn.isOverComplete,
                            ongoingOverLog: isCurrentBowler ? targetInn.thisOverLog : [],
                            ongoingMatchOver: Math.floor(targetInn.totalBalls / 6) + 1,
                            fallOfWickets: targetInn.fallOfWickets,
                          });
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
                        <MotionNumber value={`${Math.floor(b.ballsBowled / 6)}.${b.ballsBowled % 6}`} mode="cricket-overs" />
                      </td>
                      <td className="py-2.5 px-2 text-right text-[var(--muted-foreground)] align-middle">
                        <MotionNumber value={b.maidens} />
                      </td>
                      <td className="py-2.5 px-2 text-right font-medium text-[var(--foreground)] align-middle">
                        <MotionNumber value={b.runs} />
                      </td>
                      <td className="py-2.5 px-2 text-right font-black text-sm text-blue-600 dark:text-blue-400 align-middle">
                        <MotionNumber value={b.wickets} />
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-[var(--foreground)] align-middle">
                        <MotionNumber value={economyRate(b.runs, b.ballsBowled).toFixed(2)} mode="decimal" />
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

      {/* Full Viewport PDF Generation Loading Overlay */}
      <PdfLoadingOverlay
        isOpen={isPdfModalOpen}
        stage={pdfStage}
        status={pdfStatus}
        errorMessage={pdfError}
        onRetry={retryPdf}
        onClose={closePdfModal}
      />
    </div>
  );
});
