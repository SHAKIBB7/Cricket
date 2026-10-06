'use client';

import React, { useEffect } from 'react';
import { Bowler, FallOfWicket, AdvancedSettings } from '@/domain/cricket/types';
import { cleanPlayerName, economyRate, oversString } from '@/domain/cricket/formatters';
import { DotBallAnalytics } from '@/domain/cricket/analytics/DotBallAnalytics';
import { X, ShieldCheck, AlertCircle, Award } from 'lucide-react';

interface BowlerProfileModalProps {
  bowler: Bowler | null;
  isOpen: boolean;
  onClose: () => void;
  isCurrentlyBowling?: boolean;
  ongoingOverLog?: string[];
  ongoingMatchOver?: number;
  fallOfWickets?: FallOfWicket[];
  advancedSettings?: AdvancedSettings;
}

export function BowlerProfileModal({
  bowler,
  isOpen,
  onClose,
  isCurrentlyBowling = false,
  ongoingOverLog = [],
  ongoingMatchOver = 1,
  fallOfWickets = [],
}: BowlerProfileModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !bowler) return null;

  const name = cleanPlayerName(bowler.name);
  const ballsBowled = bowler.ballsBowled || 0;
  const maidens = bowler.maidens || 0;
  const runs = bowler.runs || 0;
  const wickets = bowler.wickets || 0;
  const er = economyRate(runs, ballsBowled);

  // Combine completed overs with ongoing over if currently bowling
  const allOvers: { overNumber: number; log: string[]; isOngoing?: boolean }[] = [
    ...(bowler.overHistory || []),
  ];

  if (isCurrentlyBowling && ongoingOverLog.length > 0) {
    allOvers.push({
      overNumber: ongoingMatchOver,
      log: [...ongoingOverLog],
      isOngoing: true,
    });
  }

  const dotBalls = DotBallAnalytics.countBowlerDotBallsFromOvers(allOvers);
  const totalBallsConsidered = ballsBowled + (isCurrentlyBowling ? ongoingOverLog.filter(t => !t.startsWith('Wd') && !t.startsWith('Nb')).length : 0);
  const dotPercentage = totalBallsConsidered > 0 ? (dotBalls / totalBallsConsidered) * 100 : 0;
  const wides = DotBallAnalytics.countBowlerWidesFromOvers(allOvers);
  const noBalls = DotBallAnalytics.countBowlerNoBallsFromOvers(allOvers);

  // Calculate runs for an individual over log (excluding Byes/Leg-byes since they don't charge bowler)
  const calculateOverRuns = (log: string[]) => {
    let r = 0;
    for (const b of log) {
      if (b === 'W' || b === 'Out' || b.startsWith('W-') || b.startsWith('Retire')) {
        // wicket - 0 runs
      } else if (b.startsWith('Wd')) {
        const extra = parseInt(b.replace('Wd', ''), 10) || 0;
        r += 1 + extra;
      } else if (b.startsWith('Nb')) {
        const extra = parseInt(b.replace('Nb', ''), 10) || 0;
        r += 1 + extra;
      } else if (b.startsWith('B') || b.startsWith('LB')) {
        // Byes / Leg-byes not charged to bowler
      } else {
        r += parseInt(b, 10) || 0;
      }
    }
    return r;
  };

  // Ball circle formatting
  const getBallCircleStyle = (token: string) => {
    const t = token.trim();
    if (t === '4') return 'bg-emerald-600 text-white border-emerald-400';
    if (t === '6') return 'bg-teal-500 text-white border-teal-300 font-black';
    if (t === 'W' || t === 'Out' || t.startsWith('W-')) {
      return 'bg-red-600 text-white border-red-400 font-bold';
    }
    if (t === '0') return 'bg-slate-800 text-slate-400 border-slate-700';
    if (t.startsWith('Wd') || t.startsWith('Nb')) {
      return 'bg-amber-600/30 text-amber-300 border-amber-500 text-[10px]';
    }
    if (t.startsWith('B') || t.startsWith('LB')) {
      return 'bg-blue-900/30 text-blue-300 border-blue-600 text-[10px]';
    }
    return 'bg-slate-700 text-slate-100 border-slate-600';
  };

  // Find wickets that belong to an over
  const getWicketsForOver = (overNumber: number) => {
    return fallOfWickets.filter((w) => {
      try {
        const parts = w.over.split('.');
        const completedOvers = parseInt(parts[0], 10);
        return completedOvers + 1 === overNumber;
      } catch {
        return false;
      }
    });
  };

  // Economy tier color
  const getEconomyColor = (rate: number) => {
    if (rate <= 6.0) return 'text-emerald-400';
    if (rate <= 9.0) return 'text-amber-400';
    return 'text-red-400';
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100 animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="p-3.5 sm:p-5 border-b border-slate-800 flex items-start justify-between bg-slate-950/40">
          <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
            <div className="w-11 h-11 sm:w-13 sm:h-13 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 border border-blue-400/30 overflow-hidden relative shrink-0">
              <img
                src="/assets/illustrations/opening_bowler.png"
                alt={name}
                className="w-8 h-8 sm:w-10 sm:h-10 object-contain drop-shadow"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-white truncate max-w-[180px] sm:max-w-none">{name}</h2>
                {isCurrentlyBowling && (
                  <span className="text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-extrabold border border-blue-500/30 animate-pulse flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    CURRENT BOWLER
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-slate-400 mt-0.5">
                <span>Bowling Spell</span>
                <span>•</span>
                <span className="font-semibold text-slate-300">
                  {oversString(ballsBowled)} Overs
                </span>
                <span>•</span>
                <span className={`font-black ${getEconomyColor(er)}`}>
                  Econ {er.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0 ml-2"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-3.5 sm:p-5 overflow-y-auto space-y-3.5 sm:space-y-5 flex-1">
          {/* Primary Bowling Numbers (3+2 on Mobile, 5-col on Desktop) */}
          <div className="grid grid-cols-6 sm:grid-cols-5 gap-1.5 sm:gap-2 text-center">
            <div className="col-span-2 sm:col-span-1 p-2.5 sm:p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
              <span className="text-[10px] uppercase font-bold text-slate-400">Overs</span>
              <p className="text-lg sm:text-xl font-black text-white mt-0.5">{oversString(ballsBowled)}</p>
              <span className="text-[9px] text-slate-500">({ballsBowled}b)</span>
            </div>
            <div className="col-span-2 sm:col-span-1 p-2.5 sm:p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
              <span className="text-[10px] uppercase font-bold text-slate-400">Maidens</span>
              <p className="text-lg sm:text-xl font-black text-blue-400 mt-0.5">{maidens}</p>
              <span className="text-[9px] text-slate-500">0 run ov</span>
            </div>
            <div className="col-span-2 sm:col-span-1 p-2.5 sm:p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
              <span className="text-[10px] uppercase font-bold text-slate-400">Runs</span>
              <p className="text-lg sm:text-xl font-black text-amber-400 mt-0.5">{runs}</p>
              <span className="text-[9px] text-slate-500">conceded</span>
            </div>
            <div className="col-span-3 sm:col-span-1 p-2.5 sm:p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
              <span className="text-[10px] uppercase font-bold text-slate-400">Wickets</span>
              <p className="text-lg sm:text-xl font-black text-red-500 mt-0.5">{wickets}</p>
              <span className="text-[9px] text-slate-500">taken</span>
            </div>
            <div className="col-span-3 sm:col-span-1 p-2.5 sm:p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
              <span className="text-[10px] uppercase font-bold text-slate-400">Economy</span>
              <p className={`text-lg sm:text-xl font-black mt-0.5 ${getEconomyColor(er)}`}>{er.toFixed(1)}</p>
              <span className="text-[9px] text-slate-500">r/over</span>
            </div>
          </div>

          {/* Dot Performance & Discipline Card */}
          <div className="p-3 sm:p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-2.5 sm:space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-extrabold text-slate-300 uppercase tracking-wider text-[10px] sm:text-xs">
                Pressure &amp; Discipline
              </span>
              <span className="text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                {dotPercentage >= 45 ? 'High Pressure' : dotPercentage >= 30 ? 'Moderate' : 'Costly'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              {/* Dot Box */}
              <div className="p-2.5 sm:p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center gap-2.5 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                  <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-w-0">
                  <span className="text-[9px] sm:text-[10px] text-slate-400 font-bold uppercase block">Dot Deliveries</span>
                  <p className="text-base sm:text-lg font-black text-emerald-400 truncate">
                    {dotBalls} dots <span className="text-xs text-slate-400 font-normal">({dotPercentage.toFixed(0)}%)</span>
                  </p>
                </div>
              </div>

              {/* Discipline Box */}
              <div className="p-2.5 sm:p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center gap-2.5 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                  <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-w-0">
                  <span className="text-[9px] sm:text-[10px] text-slate-400 font-bold uppercase block">Illegal Extras</span>
                  <p className="text-base sm:text-lg font-black text-amber-400 truncate">
                    {wides + noBalls} <span className="text-xs text-slate-400 font-normal">({wides}w, {noBalls}nb)</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Over-by-Over Breakdown */}
          <div className="p-3 sm:p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-2.5 sm:space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-xs uppercase font-extrabold text-slate-400 tracking-wider">
                Over-by-Over Deliveries ({allOvers.length})
              </span>
              <span className="text-[10px] text-slate-500">Spell sequence</span>
            </div>

            {allOvers.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs">
                No overs completed yet in this spell.
              </div>
            ) : (
              <div className="space-y-2.5">
                {allOvers.map((ov, idx) => {
                  const overRuns = calculateOverRuns(ov.log);
                  const overWickets = getWicketsForOver(ov.overNumber);

                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border ${
                        ov.isOngoing
                          ? 'bg-blue-950/30 border-blue-600/40'
                          : 'bg-slate-900/60 border-slate-800'
                      } space-y-2`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-black ${
                              ov.isOngoing ? 'text-blue-400' : 'text-slate-300'
                            }`}
                          >
                            {ov.isOngoing ? 'Cur Over' : `Over ${ov.overNumber}`}
                          </span>
                          {ov.isOngoing && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400 font-bold">
                              LIVE
                            </span>
                          )}
                        </div>

                        <span
                          className={`text-xs font-black px-2 py-0.5 rounded-md ${
                            overRuns === 0
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {overRuns === 0 ? 'MAIDEN' : `${overRuns} runs`}
                        </span>
                      </div>

                      {/* Ball circles row */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        {ov.log.map((token, ballIdx) => (
                          <div
                            key={ballIdx}
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border ${getBallCircleStyle(
                              token
                            )} shadow-xs`}
                            title={`Ball ${ballIdx + 1}: ${token}`}
                          >
                            {token === '0' ? '•' : token}
                          </div>
                        ))}
                      </div>

                      {/* Fall of wickets during this over */}
                      {overWickets.length > 0 && (
                        <div className="pt-2 border-t border-slate-800/80 space-y-1">
                          {overWickets.map((w, wIdx) => (
                            <div
                              key={wIdx}
                              className="flex items-center gap-2 p-1.5 rounded-lg bg-red-950/40 border border-red-900/40 text-xs text-red-200"
                            >
                              <span className="w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px] font-black">
                                W
                              </span>
                              <span className="font-extrabold text-white">
                                {cleanPlayerName(w.player)}
                              </span>
                              <span className="text-red-300 text-[11px]">
                                ({w.wicket}-{w.score}, {w.over} ov)
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Dismissals Credited in this Spell */}
          {wickets > 0 && (
            <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs uppercase font-extrabold text-red-400">
                <Award className="w-4 h-4" />
                <span>Wickets Taken in Match ({wickets})</span>
              </div>
              <div className="space-y-1.5">
                {fallOfWickets
                  .filter((w) => w.dismissal?.toLowerCase().includes(name.toLowerCase()))
                  .map((w, wIdx) => (
                    <div
                      key={wIdx}
                      className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="w-5 h-5 rounded-md bg-red-500/20 text-red-400 font-black flex items-center justify-center text-[10px] shrink-0">
                          W{wIdx + 1}
                        </span>
                        <span className="font-bold text-slate-100 truncate">{cleanPlayerName(w.player)}</span>
                      </div>
                      <span className="text-slate-400 text-[11px] shrink-0 ml-2">
                        {w.wicket}-{w.score} ({w.over} ov)
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 sm:p-4 border-t border-slate-800 bg-slate-950/40 flex justify-end">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors min-h-[44px] flex items-center justify-center"
          >
            Close Profile
          </button>
        </div>
      </div>
    </div>
  );
}
