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
 className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4"
 onClick={onClose}
 >
 <motion.div
 variants={MODAL_VARIANTS}
 drag="y"
 dragConstraints={{ top: 0, bottom: 0 }}
 dragElastic={{ top: 0, bottom: 0.5 }}
 onDragEnd={(_, info) => {
   if (info.offset.y > 80 || info.velocity.y > 400) {
     onClose();
   }
 }}
 className="bg-slate-900 border-t sm:border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-w-xl lg:max-w-2xl max-h-[90vh] sm:max-h-[85vh] rounded-t-2xl sm:rounded-2xl text-slate-100 w-full"
 onClick={(e) => e.stopPropagation()}
 >
 {/* Mobile Drag Indicator Bar */}
 <div className="w-12 h-1.5 bg-slate-700/80 rounded-full mx-auto mt-2.5 mb-1 sm:hidden shrink-0 cursor-grab active:cursor-grabbing" />
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
 <div onPointerDown={(e) => e.stopPropagation()} className="overflow-y-auto flex-1 p-3.5 sm:p-5 space-y-3 sm:space-y-4">
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

 {/* Primary Batting Statistics: 5 Key Metrics (Runs | Balls Faced | Strike Rate | 4s | 6s) */}
 <div className="space-y-2 sm:space-y-0 sm:grid sm:grid-cols-5 sm:gap-2.5">
 {/* Mobile Row 1 (Runs & Balls Faced) / Desktop Cols 1 & 2 */}
 <div className="grid grid-cols-2 gap-2 sm:contents">
 <div className="bg-slate-800/60 border border-slate-700/60 py-2.5 px-2 sm:py-3 sm:px-2 rounded-xl text-center flex flex-col justify-center items-center min-w-0">
 <span className="text-caption font-medium text-slate-400 uppercase tracking-wider block">
 Runs
 </span>
 <p className="font-extrabold num-font text-xl sm:text-2xl text-slate-100 my-0.5 leading-none">
 {runs}
 </p>
 <span className="text-caption text-slate-500 font-normal block">
 ({balls} {balls === 1 ? 'ball' : 'balls'})
 </span>
 </div>
 <div className="bg-slate-800/60 border border-slate-700/60 py-2.5 px-2 sm:py-3 sm:px-2 rounded-xl text-center flex flex-col justify-center items-center min-w-0">
 <span className="text-caption font-medium text-slate-400 uppercase tracking-wider block">
 Balls Faced
 </span>
 <p className="font-extrabold num-font text-xl sm:text-2xl text-slate-100 my-0.5 leading-none">
 {balls}
 </p>
 <span className="text-caption text-slate-500 font-normal block">
 deliveries
 </span>
 </div>
 </div>

 {/* Mobile Row 2 (SR, 4s, 6s) / Desktop Cols 3, 4, 5 */}
 <div className="grid grid-cols-3 gap-2 sm:contents">
 <div className="bg-slate-800/60 border border-slate-700/60 py-2.5 px-2 sm:py-3 sm:px-2 rounded-xl text-center flex flex-col justify-center items-center min-w-0">
 <span className="text-caption font-medium text-slate-400 uppercase tracking-wider block">
 Strike Rate
 </span>
 <p className="font-extrabold num-font text-xl sm:text-2xl text-slate-100 my-0.5 leading-none">
 {sr.toFixed(1)}
 </p>
 <span className="text-caption text-slate-500 font-normal block">
 runs/100b
 </span>
 </div>
 <div className="bg-slate-800/60 border border-slate-700/60 py-2.5 px-2 sm:py-3 sm:px-2 rounded-xl text-center flex flex-col justify-center items-center min-w-0">
 <span className="text-caption font-medium text-slate-400 uppercase tracking-wider block">
 4s
 </span>
 <p className="font-extrabold num-font text-xl sm:text-2xl text-emerald-400 my-0.5 leading-none">
 {fours}
 </p>
 <span className="text-caption text-slate-500 font-normal block">
 {fours * 4} runs
 </span>
 </div>
 <div className="bg-slate-800/60 border border-slate-700/60 py-2.5 px-2 sm:py-3 sm:px-2 rounded-xl text-center flex flex-col justify-center items-center min-w-0">
 <span className="text-caption font-medium text-slate-400 uppercase tracking-wider block">
 6s
 </span>
 <p className="font-extrabold num-font text-xl sm:text-2xl text-teal-300 my-0.5 leading-none">
 {sixes}
 </p>
 <span className="text-caption text-slate-500 font-normal block">
 {sixes * 6} runs
 </span>
 </div>
 </div>
 </div>

 {/* Runs Source Distribution: Boundary vs Running */}
 <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl space-y-2 p-3 sm:p-3.5">
 <div className="flex items-center justify-between min-h-[22px] font-bold text-caption leading-none">
 <span className="flex items-center leading-none">Run Production Sources</span>
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

 {/* Dot Ball & Shot Control Analysis */}
 <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl space-y-2 p-3 sm:p-3.5">
 <div className="flex items-center justify-between min-h-[22px] text-caption leading-none">
 <span className="uppercase font-semibold tracking-wider text-caption text-slate-300 flex items-center leading-none">
 Dot Ball &amp; Shot Control Analysis
 </span>
 </div>
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5 text-center">
 <div className="bg-slate-900/60 border border-slate-800 py-2.5 px-2 rounded-xl flex flex-col justify-center items-center min-w-0">
 <span className="text-caption font-medium text-slate-400 uppercase tracking-wider block">
 Dot Balls
 </span>
 <p className="font-extrabold num-font text-lg sm:text-xl text-slate-100 my-0.5 leading-none">
 {dotBalls}
 </p>
 <span className="text-caption text-slate-500 font-normal block">
 {dotBallPercent.toFixed(0)}% of balls
 </span>
 </div>
 <div className="bg-slate-900/60 border border-slate-800 py-2.5 px-2 rounded-xl flex flex-col justify-center items-center min-w-0">
 <span className="text-caption font-medium text-slate-400 uppercase tracking-wider block">
 Scoring Balls
 </span>
 <p className="font-extrabold num-font text-lg sm:text-xl text-slate-100 my-0.5 leading-none">
 {scoringBalls}
 </p>
 <span className="text-caption text-slate-500 font-normal block">
 {(100 - dotBallPercent).toFixed(0)}% score rate
 </span>
 </div>
 <div className="bg-slate-900/60 border border-slate-800 py-2.5 px-2 rounded-xl flex flex-col justify-center items-center min-w-0">
 <span className="text-caption font-medium text-slate-400 uppercase tracking-wider block">
 Shot Control
 </span>
 <p className="font-extrabold num-font text-lg sm:text-xl text-slate-100 my-0.5 leading-none">
 {shotControl.toFixed(0)}%
 </p>
 <span className="text-caption text-slate-500 font-normal block">
 non-dot ratio
 </span>
 </div>
 <div className="bg-slate-900/60 border border-slate-800 py-2.5 px-2 rounded-xl flex flex-col justify-center items-center min-w-0">
 <span className="text-caption font-medium text-slate-400 uppercase tracking-wider block">
 Max Dot Streak
 </span>
 <p className="font-extrabold num-font text-lg sm:text-xl text-slate-100 my-0.5 leading-none">
 {longestStreak}
 </p>
 <span className="text-caption text-slate-500 font-normal block">
 consecutive balls
 </span>
 </div>
 </div>
 </div>

 {/* Head-to-Head vs Bowlers */}
 {bowlerEntries.length > 0 && (
 <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3 sm:p-3.5 space-y-2.5">
 {/* Box Header: Vertically centered on baseline & line-height */}
 <div className="flex items-center justify-between min-h-[22px] text-caption leading-none">
 <span className="uppercase font-extrabold tracking-wider text-slate-300 flex items-center leading-none">
 Encounter vs Bowlers
 </span>
 <span className="text-slate-500 font-medium flex items-center text-caption leading-none">
 Sorted by runs scored
 </span>
 </div>

 {/* Head-to-Head Bowlers Grid */}
 <div className="overflow-x-auto no-scrollbar table-scroll-container">
 <div role="table" aria-label="Encounter vs Bowlers" className="min-w-[320px] text-caption flex flex-col w-full">
 {/* Header Row */}
 <div
 role="row"
 className="grid grid-cols-12 items-center border-b border-slate-700/80 text-slate-400 uppercase font-bold py-2 px-2 min-h-[32px] leading-none select-none"
 >
 <div role="columnheader" className="col-span-5 flex items-center justify-start text-left">
 Bowler
 </div>
 <div role="columnheader" className="col-span-2 flex items-center justify-center text-center">
 Runs
 </div>
 <div role="columnheader" className="col-span-2 flex items-center justify-center text-center">
 Balls
 </div>
 <div role="columnheader" className="col-span-3 flex items-center justify-end text-right">
 Strike Rate
 </div>
 </div>

 {/* Bowler Entries */}
 <div role="rowgroup" className="divide-y divide-slate-800/80">
 {bowlerEntries.map((b, idx) => (
 <div
 key={idx}
 role="row"
 className="grid grid-cols-12 items-center hover:bg-slate-800/50 py-2.5 px-2 min-h-[36px] transition-colors"
 >
 <div role="cell" className="col-span-5 flex items-center justify-start text-left font-bold text-slate-200 leading-tight pr-1">
 {cleanPlayerName(b.bowlerName)}
 </div>
 <div role="cell" className="col-span-2 flex items-center justify-center text-center font-black num-font text-emerald-400 leading-none">
 {b.runs}
 </div>
 <div role="cell" className="col-span-2 flex items-center justify-center text-center text-slate-400 num-font font-medium leading-none">
 {b.balls}
 </div>
 <div role="cell" className="col-span-3 flex items-center justify-end text-right font-extrabold num-font text-slate-300 leading-none">
 {b.sr.toFixed(1)}
 </div>
 </div>
 ))}
 </div>
 </div>
 </div>
 </div>
 )}

 {/* Ball-by-Ball Timeline */}
 {player.ballLog && player.ballLog.length > 0 && (
 <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl space-y-2.5 p-3 sm:p-3.5">
 <div className="flex items-center justify-between min-h-[22px] text-caption leading-none">
 <span className="uppercase font-extrabold tracking-wider text-slate-300 flex items-center leading-none">
 Deliveries Faced ({player.ballLog.length})
 </span>
 <span className="text-slate-500 font-medium flex items-center text-caption leading-none">Chronological</span>
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

 {/* Modal Footer (Minimal Compact Close Area) */}
 <div className="border-t border-slate-800/80 bg-slate-950/60 px-4 py-2.5 sm:py-3 flex items-center justify-end shrink-0 pb-safe">
 <button
 type="button"
 onClick={onClose}
 className="bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 font-bold transition-all flex items-center justify-center py-2 px-5 rounded-full text-caption shadow-xs"
 >
 <X className="w-3.5 h-3.5 mr-1.5 opacity-70" />
 Close Profile
 </button>
 </div>
 </motion.div>
 </motion.div>
);
}
