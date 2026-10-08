'use client';

import React, { useEffect } from 'react';
import { Player, Partnership, FallOfWicket } from '@/domain/cricket/types';
import { cleanPlayerName, strikeRate } from '@/domain/cricket/formatters';
import { DotBallAnalytics } from '@/domain/cricket/analytics/DotBallAnalytics';
import { X, Target, Zap, Shield, Flame, Activity, TrendingUp, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MODAL_VARIANTS, BACKDROP_VARIANTS } from '@/lib/animations';

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

 return (
  <AnimatePresence>
    {isOpen && player && (
      <BatsmanProfileModalContent 
        player={player} 
        onClose={onClose} 
        isStriker={isStriker}
        isNonStriker={isNonStriker}
        battingPosition={battingPosition}
        partnerships={partnerships}
        fallOfWickets={fallOfWickets}
      />
    )}
  </AnimatePresence>
 );
}

function BatsmanProfileModalContent({
 player,
 onClose,
 isStriker,
 isNonStriker,
 battingPosition,
 partnerships,
 fallOfWickets,
}: any) {
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
 (f: FallOfWicket) => cleanPlayerName(f.player).toLowerCase() === name.toLowerCase()
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
 <motion.div
 role="dialog"
 aria-modal="true"
 variants={BACKDROP_VARIANTS}
 initial="hidden"
 animate="visible"
 exit="exit"
 className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-4"
 onClick={onClose}
 >
 <motion.div
 variants={MODAL_VARIANTS}
 className="bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-w-xl lg:max-w-2xl max-h-[88vh] rounded-2xl text-slate-100 w-full"
 onClick={(e) => e.stopPropagation()}
 >
 {/* Header Bar */}
 <div className="border-b border-slate-800 flex items-start justify-between bg-slate-950/40 p-5">
 <div className="flex items-center gap-3 min-w-0">
 <div className="bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 border border-emerald-400/30 overflow-hidden relative shrink-0 rounded-2xl text-white w-13 h-13">
 <img
 src={
 isStriker
 ? '/assets/illustrations/strike_batsman.png'
 : isNonStriker
 ? '/assets/illustrations/non_strike_batsman.png'
 : '/assets/illustrations/st_bat.png'
 }
 alt={name}
 className="object-contain drop-shadow w-10 h-10"
 />
 </div>
 <div className="min-w-0">
 <div className="flex items-center flex-wrap gap-2">
 <h2 className="font-extrabold tracking-tight truncate text-h3 max-w-none">{name}</h2>
 {battingPosition && (
 <span className="bg-slate-800 font-bold border border-slate-700 text-slate-400 px-2 py-0.5 rounded-md">
 #{battingPosition}
 </span>
)}
 {isStriker && (
 <span className="bg-emerald-500/20 font-extrabold border border-emerald-500/30 animate-pulse text-emerald-400 py-0.5 rounded-full px-2">
 ★ STRIKER
 </span>
)}
 {isNonStriker && (
 <span className="bg-blue-500/20 font-bold border border-blue-500/30 text-blue-400 py-0.5 rounded-full px-2">
 NON-STRIKER
 </span>
)}
 </div>
 <div className="flex items-center gap-2 text-caption mt-0.5">
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
 className="bg-slate-800/80 hover:bg-slate-700 hover:text-white transition-colors flex items-center justify-center shrink-0 rounded-xl text-slate-400 min-h-[40px] min-w-[40px] p-2 ml-2"
 aria-label="Close"
 >
 <X className="w-5 h-5" />
 </button>
 </div>

 {/* Scrollable Content */}
 <div className="overflow-y-auto flex-1 p-5 space-y-5">
 {/* Batting Intent Banner */}
 <div className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl border ${intentConfig.bg} ${intentConfig.border} flex items-center justify-between relative overflow-hidden gap-2`}>
 <div className="flex items-center relative z-10 gap-3 min-w-0">
 <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-900/60 flex items-center justify-center ${intentConfig.text} shrink-0`}>
 <IntentIcon className="w-5 h-5" />
 </div>
 <div className="min-w-0">
 <div className="flex items-center flex-wrap gap-2">
 <span className="uppercase font-extrabold tracking-wider text-caption">
 Batting Intent
 </span>
 <span className={`text-caption px-2 py-0.5 rounded-full font-black uppercase ${intentConfig.text} bg-slate-900/80`}>
 {intent}
 </span>
 </div>
 <p className="line-clamp-2 sm:line-clamp-none text-caption mt-0.5">
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
 className="hidden xs:block object-contain opacity-80 drop-shadow shrink-0 relative z-10 w-16 h-16 ml-1"
 />
 </div>

 {/* Key Match Numbers (2x2 on Mobile, 4-col on Tablet/Desktop) */}
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
 <div className="bg-slate-800/60 border border-slate-700/60 p-3 rounded-xl text-center">
 <span className="uppercase font-bold text-slate-400">Runs</span>
 <p className="font-black text-h2 mt-0.5">{runs}</p>
 <span className="font-medium text-slate-500">({balls} balls)</span>
 </div>
 <div className="bg-slate-800/60 border border-slate-700/60 p-3 rounded-xl text-center">
 <span className="uppercase font-bold text-slate-400">Strike Rate</span>
 <p className="font-black text-h2 mt-0.5">{sr.toFixed(1)}</p>
 <span className="font-medium text-slate-500">runs/100b</span>
 </div>
 <div className="bg-slate-800/60 border border-slate-700/60 p-3 rounded-xl text-center">
 <span className="uppercase font-bold text-slate-400">Fours (4s)</span>
 <p className="font-black text-h2 mt-0.5">{fours}</p>
 <span className="font-medium text-slate-500">{fours * 4} runs</span>
 </div>
 <div className="bg-slate-800/60 border border-slate-700/60 p-3 rounded-xl text-center">
 <span className="uppercase font-bold text-slate-400">Sixes (6s)</span>
 <p className="font-black text-h2 mt-0.5">{sixes}</p>
 <span className="font-medium text-slate-500">{sixes * 6} runs</span>
 </div>
 </div>

 {/* Runs Source Distribution: Boundary vs Running */}
 <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl space-y-3 p-4">
 <div className="flex items-center justify-between font-bold text-caption">
 <span>Run Production Sources</span>
 <span className="text-slate-400">{runs} Total Runs</span>
 </div>

 {/* Stacked Progress Bar */}
 <div className="bg-slate-800 overflow-hidden flex rounded-full h-3 w-full">
 <div
 style={{ width: `${boundaryRunsPct}%` }}
 className="bg-emerald-500 transition-all duration-500 h-full"
 title={`Boundaries: ${runsByBoundary} (${boundaryRunsPct.toFixed(0)}%)`}
 />
 <div
 style={{ width: `${runningRunsPct}%` }}
 className="bg-blue-500 transition-all duration-500 h-full"
 title={`Running: ${runsByRunning} (${runningRunsPct.toFixed(0)}%)`}
 />
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-caption pt-1">
 <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2">
 <div className="flex items-center gap-2">
 <img
 src="/assets/illustrations/boundary_percentage.png"
 alt="Boundaries"
 className="object-contain shrink-0 w-4 h-4"
 />
 <span className="text-slate-300">Boundaries</span>
 </div>
 <span className="font-extrabold text-emerald-400">
 {runsByBoundary}r ({boundaryRunsPct.toFixed(0)}%)
 </span>
 </div>
 <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/20 rounded-lg p-2">
 <div className="flex items-center gap-2">
 <img
 src="/assets/illustrations/running.png"
 alt="Running"
 className="object-contain shrink-0 w-4 h-4"
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
 <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl space-y-2 p-4">
 <span className="uppercase font-extrabold tracking-wider text-caption">
 Dot Ball &amp; Control Analytics
 </span>
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-1">
 <div className="bg-slate-900/60 border border-slate-800 p-2 rounded-lg">
 <span className="uppercase font-semibold text-slate-400">Dot Balls</span>
 <p className="font-black text-card-title mt-0.5">{dotBalls}</p>
 <span className="text-slate-500">{dotBallPercent.toFixed(0)}% of balls</span>
 </div>
 <div className="bg-slate-900/60 border border-slate-800 p-2 rounded-lg">
 <span className="uppercase font-semibold text-slate-400">Scoring Balls</span>
 <p className="font-black text-card-title mt-0.5">{scoringBalls}</p>
 <span className="text-slate-500">{(100 - dotBallPercent).toFixed(0)}% score rate</span>
 </div>
 <div className="bg-slate-900/60 border border-slate-800 p-2 rounded-lg">
 <span className="uppercase font-semibold text-slate-400">Shot Control</span>
 <p className="font-black text-card-title mt-0.5">{shotControl.toFixed(0)}%</p>
 <span className="text-slate-500">non-dot ratio</span>
 </div>
 <div className="bg-slate-900/60 border border-slate-800 p-2 rounded-lg">
 <span className="uppercase font-semibold text-slate-400">Max Dot Streak</span>
 <p className="font-black text-card-title mt-0.5">{longestStreak}</p>
 <span className="text-slate-500">consecutive</span>
 </div>
 </div>
 </div>

 {/* Head-to-Head vs Bowlers */}
 {bowlerEntries.length > 0 && (
 <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl space-y-2 p-4">
 <div className="flex items-center justify-between">
 <span className="uppercase font-extrabold tracking-wider text-caption">
 Encounter vs Bowlers
 </span>
 <span className="text-slate-500">Sorted by runs scored</span>
 </div>
 <div className="overflow-x-auto no-scrollbar table-scroll-container">
 <table className="whitespace-nowrap min-w-[320px] text-caption w-full">
 <thead className="uppercase border-b border-slate-700 text-slate-400">
 <tr>
 <th className="font-bold py-2 px-2">Bowler</th>
 <th className="font-bold py-2 text-center px-2">Runs</th>
 <th className="font-bold py-2 text-center px-2">Balls</th>
 <th className="font-bold py-2 text-right px-2">Strike Rate</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-800/80">
 {bowlerEntries.map((b, idx) => (
 <tr key={idx} className="hover:bg-slate-800/50">
 <td className="font-bold text-slate-200 py-2 px-2">{cleanPlayerName(b.bowlerName)}</td>
 <td className="font-black text-emerald-400 py-2 px-2">{b.runs}</td>
 <td className="text-slate-400 py-2 px-2">{b.balls}</td>
 <td className="font-extrabold text-slate-300 py-2 px-2">{b.sr.toFixed(1)}</td>
 </tr>
))}
 </tbody>
 </table>
 </div>
 </div>
)}

 {/* Ball-by-Ball Timeline */}
 {player.ballLog && player.ballLog.length > 0 && (
 <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl space-y-2.5 p-4">
 <div className="flex items-center justify-between">
 <span className="uppercase font-extrabold tracking-wider text-caption">
 Deliveries Faced ({player.ballLog.length})
 </span>
 <span className="text-slate-500">Chronological</span>
 </div>
 <div className="flex flex-wrap overflow-y-auto bg-slate-950/40 gap-1.5 max-h-36 rounded-lg p-1">
 {player.ballLog.map((token: string, idx: number) => (
 <div
 key={idx}
 className={`w-7 h-7 rounded-full flex items-center justify-center text-caption font-bold border ${getBallCircleStyle(
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
 <div className="border-t border-slate-800 bg-slate-950/40 flex justify-end p-4">
 <button
 onClick={onClose}
 className="bg-slate-800 hover:bg-slate-700 font-bold transition-colors flex items-center justify-center py-2.5 rounded-xl text-caption min-h-btn px-5"
 >
 Close Profile
 </button>
 </div>
 </motion.div>
 </motion.div>
);
}
