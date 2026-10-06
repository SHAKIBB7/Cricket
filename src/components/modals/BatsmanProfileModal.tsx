'use client';

import React, { useEffect } from 'react';
import { Player, Partnership, FallOfWicket } from '@/domain/cricket/types';
import { cleanPlayerName, strikeRate } from '@/domain/cricket/formatters';
import { DotBallAnalytics } from '@/domain/cricket/analytics/DotBallAnalytics';
import { X, Target, Zap, Shield, Flame, Activity } from 'lucide-react';

interface BatsmanProfileModalProps {
  player: Player | null;
  isOpen: boolean;
  onClose: () => void;
  isStriker?: boolean;
  isNonStriker?: boolean;
  battingPosition?: number;
  partnerships?: Partnership[];
  fallOfWickets?: FallOfWicket[];
  allBowlersNames?: string[];
}

export function BatsmanProfileModal({
  player,
  isOpen,
  onClose,
  isStriker = false,
  isNonStriker = false,
  battingPosition,
  partnerships = [],
  fallOfWickets = [],
}: BatsmanProfileModalProps) {
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

  if (!isOpen || !player) return null;

  const name = cleanPlayerName(player.name);
  const runs = player.runs || 0;
  const balls = player.balls || 0;
  const fours = player.fours || 0;
  const sixes = player.sixes || 0;
  const sr = strikeRate(runs, balls);

  const dotBalls = DotBallAnalytics.countBatsmanDotBalls(player.dotBalls || 0, player.ballLog || []);
  const scoringBalls = Math.max(0, balls - dotBalls);
  const dotBallPercent = DotBallAnalytics.calculateDotBallPercentage(dotBalls, balls);
  const shotControl = Math.max(0, 100 - dotBallPercent);
  const longestStreak = DotBallAnalytics.longestDotStreak(player.ballLog || []);

  const runsByBoundary = fours * 4 + sixes * 6;
  const runsByRunning = Math.max(0, runs - runsByBoundary);
  const boundaryRunsPct = runs > 0 ? (runsByBoundary / runs) * 100 : 0;
  const runningRunsPct = runs > 0 ? (runsByRunning / runs) * 100 : 0;
  const boundaryBallPct = balls > 0 ? ((fours + sixes) / balls) * 100 : 0;

  const intent = DotBallAnalytics.classifyBattingIntent(boundaryRunsPct, shotControl, sr, balls);

  const intentColors = {
    Finisher: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/40', icon: Zap },
    Attacking: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/40', icon: Flame },
    Anchor: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/40', icon: Shield },
    Balanced: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/40', icon: Target },
    Defensive: { bg: 'bg-slate-500/20', text: 'text-slate-400', border: 'border-slate-500/40', icon: Activity },
  };

  const intentConfig = intentColors[intent] || intentColors.Balanced;
  const IntentIcon = intentConfig.icon;

  // Find dismissal if out
  const fow = fallOfWickets.find(
    (f) => cleanPlayerName(f.player).toLowerCase() === name.toLowerCase()
  );

  // Bowler dominance breakdown
  const bowlersFaced = player.bowlersFaced || {};
  const runsVsBowler = player.runsVsBowler || {};
  const bowlerEntries = Object.keys(bowlersFaced)
    .filter((b) => bowlersFaced[b] > 0 || (runsVsBowler[b] || 0) > 0)
    .map((bowlerName) => {
      const bBalls = bowlersFaced[bowlerName] || 0;
      const bRuns = runsVsBowler[bowlerName] || 0;
      const bSr = strikeRate(bRuns, bBalls);
      return { bowlerName, balls: bBalls, runs: bRuns, sr: bSr };
    })
    .sort((a, b) => b.runs - a.runs);

  // Ball circle formatting
  const getBallCircleStyle = (token: string) => {
    const t = token.trim();
    if (t === '4') return 'bg-emerald-600 text-white border-emerald-400';
    if (t === '6') return 'bg-teal-500 text-white border-teal-300 font-black';
    if (t === 'W' || t === 'Out' || t.startsWith('W-') || t.startsWith('Retire')) {
      return 'bg-red-600 text-white border-red-400';
    }
    if (t === '0') return 'bg-slate-800 text-slate-400 border-slate-700';
    if (t.startsWith('Wd') || t.startsWith('Nb')) {
      return 'bg-amber-600/30 text-amber-300 border-amber-500';
    }
    return 'bg-slate-700 text-slate-100 border-slate-600';
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
            <div className="w-11 h-11 sm:w-13 sm:h-13 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 border border-emerald-400/30 overflow-hidden relative shrink-0">
              <img
                src={
                  isStriker
                    ? '/assets/illustrations/strike_batsman.png'
                    : isNonStriker
                    ? '/assets/illustrations/non_strike_batsman.png'
                    : '/assets/illustrations/st_bat.png'
                }
                alt={name}
                className="w-8 h-8 sm:w-10 sm:h-10 object-contain drop-shadow"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-white truncate max-w-[180px] sm:max-w-none">{name}</h2>
                {battingPosition && (
                  <span className="text-xs px-1.5 sm:px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 font-bold border border-slate-700">
                    #{battingPosition}
                  </span>
                )}
                {isStriker && (
                  <span className="text-xs sm:text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-extrabold border border-emerald-500/30 animate-pulse">
                    ★ STRIKER
                  </span>
                )}
                {isNonStriker && (
                  <span className="text-xs sm:text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-bold border border-blue-500/30">
                    NON-STRIKER
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-xs text-slate-400 mt-0.5">
                <span>{player.battingHand || 'Right-hand Batsman'}</span>
                <span>•</span>
                <span className={player.isDismissed ? 'text-red-400 font-medium' : 'text-emerald-400 font-semibold'}>
                  {player.isDismissed
                    ? player.dismissalText || fow?.dismissal || 'Dismissed'
                    : balls > 0 || runs > 0
                    ? 'Not Out*'
                    : 'Yet to bat'}
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
          {/* Batting Intent Banner */}
          <div className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl border ${intentConfig.bg} ${intentConfig.border} flex items-center justify-between relative overflow-hidden gap-2`}>
            <div className="flex items-center gap-2.5 sm:gap-3 relative z-10 min-w-0">
              <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-900/60 flex items-center justify-center ${intentConfig.text} shrink-0`}>
                <IntentIcon className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  <span className="text-xs sm:text-xs uppercase font-extrabold tracking-wider text-slate-400">
                    Batting Intent
                  </span>
                  <span className={`text-xs sm:text-xs px-2 py-0.5 rounded-full font-black uppercase ${intentConfig.text} bg-slate-900/80`}>
                    {intent}
                  </span>
                </div>
                <p className="text-xs sm:text-xs text-slate-300 mt-0.5 line-clamp-2 sm:line-clamp-none">
                  {intent === 'Finisher' && 'High-velocity boundary hitting with elevated strike rate'}
                  {intent === 'Attacking' && 'Dominant strokeplay putting regular pressure on bowlers'}
                  {intent === 'Anchor' && 'Steadies the innings with disciplined strike rotation'}
                  {intent === 'Balanced' && 'Controlled tempo with balanced dot control and boundaries'}
                  {intent === 'Defensive' && 'Careful risk aversion and wicket preservation mode'}
                </p>
              </div>
            </div>
            <img
              src="/assets/illustrations/batting_intent.png"
              alt="Batting Intent"
              className="hidden xs:block w-12 h-12 sm:w-16 sm:h-16 object-contain opacity-80 drop-shadow ml-1 shrink-0 relative z-10"
            />
          </div>

          {/* Key Match Numbers (2x2 on Mobile, 4-col on Tablet/Desktop) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
            <div className="p-2.5 sm:p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-center">
              <span className="text-xs uppercase font-bold text-slate-400">Runs</span>
              <p className="text-xl sm:text-2xl font-black text-emerald-400 mt-0.5">{runs}</p>
              <span className="text-xs text-slate-500 font-medium">({balls} balls)</span>
            </div>
            <div className="p-2.5 sm:p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-center">
              <span className="text-xs uppercase font-bold text-slate-400">Strike Rate</span>
              <p className="text-xl sm:text-2xl font-black text-white mt-0.5">{sr.toFixed(1)}</p>
              <span className="text-xs text-slate-500 font-medium">runs/100b</span>
            </div>
            <div className="p-2.5 sm:p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-center">
              <span className="text-xs uppercase font-bold text-slate-400">Fours (4s)</span>
              <p className="text-xl sm:text-2xl font-black text-blue-400 mt-0.5">{fours}</p>
              <span className="text-xs text-slate-500 font-medium">{fours * 4} runs</span>
            </div>
            <div className="p-2.5 sm:p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-center">
              <span className="text-xs uppercase font-bold text-slate-400">Sixes (6s)</span>
              <p className="text-xl sm:text-2xl font-black text-purple-400 mt-0.5">{sixes}</p>
              <span className="text-xs text-slate-500 font-medium">{sixes * 6} runs</span>
            </div>
          </div>

          {/* Runs Source Distribution: Boundary vs Running */}
          <div className="p-3 sm:p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-2.5 sm:space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-300">
              <span>Run Production Sources</span>
              <span className="text-slate-400">{runs} Total Runs</span>
            </div>

            {/* Stacked Progress Bar */}
            <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden flex">
              <div
                style={{ width: `${boundaryRunsPct}%` }}
                className="bg-emerald-500 h-full transition-all duration-500"
                title={`Boundaries: ${runsByBoundary} (${boundaryRunsPct.toFixed(0)}%)`}
              />
              <div
                style={{ width: `${runningRunsPct}%` }}
                className="bg-blue-500 h-full transition-all duration-500"
                title={`Running: ${runsByRunning} (${runningRunsPct.toFixed(0)}%)`}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-xs pt-1">
              <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-2">
                  <img
                    src="/assets/illustrations/boundary_percentage.png"
                    alt="Boundaries"
                    className="w-4 h-4 object-contain shrink-0"
                  />
                  <span className="text-slate-300">Boundaries</span>
                </div>
                <span className="font-extrabold text-emerald-400">
                  {runsByBoundary}r ({boundaryRunsPct.toFixed(0)}%)
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="flex items-center gap-2">
                  <img
                    src="/assets/illustrations/running.png"
                    alt="Running"
                    className="w-4 h-4 object-contain shrink-0"
                  />
                  <span className="text-slate-300">Running</span>
                </div>
                <span className="font-extrabold text-blue-400">
                  {runsByRunning}r ({runningRunsPct.toFixed(0)}%)
                </span>
              </div>
            </div>
          </div>

          {/* Dot Ball & Control Analytics */}
          <div className="p-3 sm:p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-2 sm:space-y-2.5">
            <span className="text-xs sm:text-xs uppercase font-extrabold text-slate-400 tracking-wider">
              Dot Ball &amp; Control Analytics
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 pt-1 text-center">
              <div className="p-2 sm:p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="text-xs sm:text-xs text-slate-400 uppercase font-semibold">Dot Balls</span>
                <p className="text-base sm:text-lg font-black text-amber-400 mt-0.5">{dotBalls}</p>
                <span className="text-xs sm:text-xs text-slate-500">{dotBallPercent.toFixed(0)}% of balls</span>
              </div>
              <div className="p-2 sm:p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="text-xs sm:text-xs text-slate-400 uppercase font-semibold">Scoring Balls</span>
                <p className="text-base sm:text-lg font-black text-emerald-400 mt-0.5">{scoringBalls}</p>
                <span className="text-xs sm:text-xs text-slate-500">{(100 - dotBallPercent).toFixed(0)}% score rate</span>
              </div>
              <div className="p-2 sm:p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="text-xs sm:text-xs text-slate-400 uppercase font-semibold">Shot Control</span>
                <p className="text-base sm:text-lg font-black text-teal-400 mt-0.5">{shotControl.toFixed(0)}%</p>
                <span className="text-xs sm:text-xs text-slate-500">non-dot ratio</span>
              </div>
              <div className="p-2 sm:p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="text-xs sm:text-xs text-slate-400 uppercase font-semibold">Max Dot Streak</span>
                <p className="text-base sm:text-lg font-black text-red-400 mt-0.5">{longestStreak}</p>
                <span className="text-xs sm:text-xs text-slate-500">consecutive</span>
              </div>
            </div>
          </div>

          {/* Head-to-Head vs Bowlers */}
          {bowlerEntries.length > 0 && (
            <div className="p-3 sm:p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-2 sm:space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-xs uppercase font-extrabold text-slate-400 tracking-wider">
                  Encounter vs Bowlers
                </span>
                <span className="text-xs sm:text-xs text-slate-500">Sorted by runs scored</span>
              </div>
              <div className="overflow-x-auto no-scrollbar table-scroll-container">
                <table className="w-full min-w-[320px] text-xs text-left whitespace-nowrap">
                  <thead className="text-xs uppercase text-slate-400 border-b border-slate-700">
                    <tr>
                      <th className="py-1.5 px-2 font-bold">Bowler</th>
                      <th className="py-1.5 px-2 text-center font-bold">Runs</th>
                      <th className="py-1.5 px-2 text-center font-bold">Balls</th>
                      <th className="py-1.5 px-2 text-right font-bold">Strike Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {bowlerEntries.map((b, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/50">
                        <td className="py-2 px-2 font-bold text-slate-200">{cleanPlayerName(b.bowlerName)}</td>
                        <td className="py-2 px-2 text-center font-black text-emerald-400">{b.runs}</td>
                        <td className="py-2 px-2 text-center text-slate-400">{b.balls}</td>
                        <td className="py-2 px-2 text-right font-extrabold text-slate-300">{b.sr.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Ball-by-Ball Timeline */}
          {player.ballLog && player.ballLog.length > 0 && (
            <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-extrabold text-slate-400 tracking-wider">
                  Deliveries Faced ({player.ballLog.length})
                </span>
                <span className="text-xs text-slate-500">Chronological</span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1 bg-slate-950/40 rounded-lg">
                {player.ballLog.map((token, idx) => (
                  <div
                    key={idx}
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border ${getBallCircleStyle(
                      token
                    )} shadow-xs`}
                    title={`Ball ${idx + 1}: ${token}`}
                  >
                    {token === '0' ? '•' : token}
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
