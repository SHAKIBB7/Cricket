'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bowler, FallOfWicket, AdvancedSettings } from '@/domain/cricket/types';
import { cleanPlayerName, economyRate, oversString } from '@/domain/cricket/formatters';
import { DotBallAnalytics } from '@/domain/cricket/analytics/DotBallAnalytics';
import { X, Award, Pencil, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MODAL_VARIANTS, BACKDROP_VARIANTS } from '@/lib/animations';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { MotionNumber } from '@/components/common/MotionNumber';
import { BackButton } from '@/components/navigation';

interface BowlerProfileModalProps {
 bowler: Bowler | null;
 isOpen: boolean;
 onClose: () => void;
 isCurrentlyBowling?: boolean;
 ongoingOverLog?: string[];
 ongoingMatchOver?: number;
 fallOfWickets?: FallOfWicket[];
 advancedSettings?: AdvancedSettings;
 onRenamePlayer?: (bowlerId: string, newName: string) => Promise<boolean | void> | boolean | void;
}

export function BowlerProfileModal({
 bowler,
 isOpen,
 onClose,
 isCurrentlyBowling = false,
 ongoingOverLog = [],
 ongoingMatchOver = 1,
 fallOfWickets = [],
 onRenamePlayer,
}: BowlerProfileModalProps) {
 const [mounted, setMounted] = useState(false);

 useEffect(() => {
   setMounted(true);
 }, []);

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

 const modalContent = (
  <AnimatePresence>
    {isOpen && bowler && (
      <BowlerProfileModalContent
        key={bowler.id || bowler.name}
        bowler={bowler}
        onClose={onClose}
        isCurrentlyBowling={isCurrentlyBowling}
        ongoingOverLog={ongoingOverLog}
        ongoingMatchOver={ongoingMatchOver}
        fallOfWickets={fallOfWickets}
        onRenamePlayer={onRenamePlayer}
      />
    )}
  </AnimatePresence>
 );

 if (mounted && typeof document !== 'undefined') {
   return createPortal(modalContent, document.body);
 }
 return modalContent;
}

function BowlerProfileModalContent({
 bowler,
 onClose,
 isCurrentlyBowling,
 ongoingOverLog,
 ongoingMatchOver,
 fallOfWickets,
 onRenamePlayer,
}: any) {
 // Focus trap (Phase 2D): bespoke dark shell kept by design; the trap
 // completes its accessibility set (portal + dialog + Escape + lock).
 const trapRef = useFocusTrap<HTMLDivElement>(true);
 const initialName = cleanPlayerName(bowler.name);
 const [currentName, setCurrentName] = React.useState(initialName);
 const [isEditing, setIsEditing] = React.useState(false);
 const [editNameValue, setEditNameValue] = React.useState(initialName);
 const [isSaving, setIsSaving] = React.useState(false);
 const [validationError, setValidationError] = React.useState<string | null>(null);

 React.useEffect(() => {
   const n = cleanPlayerName(bowler.name);
   setCurrentName(n);
   setEditNameValue(n);
 }, [bowler.name]);

 // Name editing follows the same rule as the batsman profile
 // (TAIMUR, 2026-11-10): only the bowler who is bowling right now
 // may be renamed; every other profile view is read-only.
 const canEditName = !!isCurrentlyBowling;
 React.useEffect(() => {
   if (!canEditName && isEditing) {
     setIsEditing(false);
     setValidationError(null);
   }
 }, [canEditName, isEditing]);

 const handleSaveRename = async () => {
   const trimmed = cleanPlayerName(editNameValue).trim().replace(/\s+/g, ' ');
   if (!trimmed) {
     setValidationError('Bowler name cannot be empty.');
     return;
   }
   if (trimmed.length > 50) {
     setValidationError('Bowler name cannot exceed 50 characters.');
     return;
   }
   if (!/[a-zA-Z0-9\u0980-\u09FF]/.test(trimmed)) {
     setValidationError('Bowler name must contain valid letters or numbers.');
     return;
   }
   if (trimmed.toLowerCase() === currentName.toLowerCase()) {
     setIsEditing(false);
     setValidationError(null);
     return;
   }
   setIsSaving(true);
   try {
     if (onRenamePlayer) {
       await onRenamePlayer(bowler.id, trimmed);
     }
     setCurrentName(trimmed);
     setIsEditing(false);
     setValidationError(null);
   } catch (err: any) {
     setValidationError(err?.message || 'Failed to rename bowler.');
   } finally {
     setIsSaving(false);
   }
 };

 const handleCancelRename = () => {
   setEditNameValue(currentName);
   setIsEditing(false);
   setValidationError(null);
 };

 const name = currentName;
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
 const totalBallsConsidered = ballsBowled;
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
 return 'bg-amber-600/30 text-amber-300 border-amber-500 text-caption';
 }
 if (t.startsWith('B') || t.startsWith('LB')) {
 return 'bg-blue-900/30 text-blue-300 border-blue-600 text-caption';
 }
 return 'bg-slate-700 text-slate-100 border-slate-600';
 };

 // Find wickets that belong to an over
 const getWicketsForOver = (overNumber: number) => {
 return (fallOfWickets || []).filter((w: FallOfWicket) => {
 if (!w || !w.over) return false;
 try {
 const parts = String(w.over).split('.');
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
 <motion.div
 ref={trapRef}
 role="dialog"
 aria-modal="true"
 variants={BACKDROP_VARIANTS}
 initial="hidden"
 animate="visible"
 exit="exit"
        className="fixed inset-0 !m-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4"
 onClick={(e) => {
   if (e.target === e.currentTarget) {
     onClose();
   }
 }}
 >
 <motion.div
 variants={MODAL_VARIANTS}
 className="bg-slate-900 border-t sm:border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-w-xl lg:max-w-2xl max-h-[calc(100dvh-1rem)] sm:max-h-[85vh] rounded-t-2xl sm:rounded-2xl text-slate-100 w-full"
 onClick={(e) => e.stopPropagation()}
 >
 {/* Clean app bar (TAIMUR, 2026-11-10 — Bowler Master B): mirrors
 the batsman profile — the drag-handle pill and the Done button
 are gone; the circular back button is the only control. */}
 <div className="flex items-center px-3 py-2 border-b border-slate-800 bg-slate-950/70 shrink-0">
 <div className="flex items-center gap-2 min-w-0">
 <BackButton
 onClick={onClose}
 showLabel={false}
 size="sm"
 variant="tinted"
 title="Close Bowler Profile"
 className="w-9 h-9 p-0 rounded-full bg-slate-800/70 border border-slate-700/60 hover:bg-slate-700/70 shrink-0"
 />
 <span className="font-extrabold text-sm text-slate-100 truncate tracking-tight">
 Bowler Profile
 </span>
 </div>
 </div>
 {/* Header (TAIMUR, 2026-11-10 — Bowler Master B): slimmed to the
 batsman profile's shape — smaller avatar with a live dot badge
 while bowling, status on the meta line, no header X. */}
 <div className="border-b border-slate-800 bg-slate-950/40 px-4 py-3">
 <div className="flex items-center gap-3 min-w-0">
 <div className="relative shrink-0">
 <div className="bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20 border border-blue-400/30 overflow-hidden rounded-2xl text-white w-11 h-11">
 <img
 src="/assets/illustrations/opening_bowler.png"
 alt=""
 aria-hidden="true"
 className="object-contain drop-shadow w-8 h-8"
 />
 </div>
 {isCurrentlyBowling && (
 <span
 aria-hidden="true"
 className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-blue-400 border-2 border-slate-950 z-10 animate-pulse"
 />
 )}
 </div>
 <div className="min-w-0">
 <div className="flex items-center flex-wrap gap-2">
 {!isEditing || !canEditName ? (
   canEditName ? (
   <div className="flex items-center gap-1.5 min-w-0 group cursor-pointer" onClick={() => setIsEditing(true)}>
     <h2
       className="font-extrabold tracking-tight truncate text-h3 max-w-none group-hover:text-blue-400 transition-colors"
       title="Click to edit bowler name"
     >
       {name}
     </h2>
     <button
       type="button"
       onClick={(e) => {
         e.stopPropagation();
         setIsEditing(true);
       }}
       className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
       title="Edit bowler name"
       aria-label="Edit bowler name"
     >
       <Pencil className="w-4 h-4 text-slate-400 group-hover:text-blue-400" />
     </button>
   </div>
   ) : (
     <h2 className="font-extrabold tracking-tight truncate text-h3 max-w-none">{name}</h2>
   )
 ) : (
   <div className="flex flex-col gap-1 w-full max-w-xs sm:max-w-sm mt-0.5" onClick={(e) => e.stopPropagation()}>
     <div className="flex items-center gap-1.5">
       <input
         type="text"
         value={editNameValue}
         onChange={(e) => {
           setEditNameValue(e.target.value);
           if (validationError) setValidationError(null);
         }}
         onKeyDown={(e) => {
           if (e.key === 'Enter') handleSaveRename();
           if (e.key === 'Escape') handleCancelRename();
         }}
         placeholder="Bowler name"
         autoFocus
         maxLength={50}
         className="bg-slate-800/90 border border-blue-500/70 focus:border-blue-400 rounded-lg px-2.5 py-1 text-sm font-bold text-white outline-none ring-1 ring-blue-500/30 flex-1 min-w-0"
       />
       <button
         type="button"
         onClick={handleSaveRename}
         disabled={isSaving}
         className="bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold px-2.5 py-1 rounded-lg text-xs flex items-center gap-1 shadow-sm shrink-0 transition-transform cursor-pointer"
         title="Save bowler name"
       >
         <Check className="w-3.5 h-3.5" />
         <span>Save</span>
       </button>
       <button
         type="button"
         onClick={handleCancelRename}
         disabled={isSaving}
         className="bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 font-bold px-2 py-1 rounded-lg text-xs flex items-center gap-1 shrink-0 transition-transform cursor-pointer"
         title="Cancel"
       >
         <X className="w-3.5 h-3.5" />
         <span>Cancel</span>
       </button>
     </div>
     {validationError && (
       <span className="text-[11px] font-semibold text-rose-400">
         {validationError}
       </span>
     )}
   </div>
 )}
 </div>
 <div className="flex items-center gap-2 text-caption mt-0.5">
 <span className="font-semibold text-slate-300">
 {oversString(ballsBowled)} Overs
 </span>
 <span>•</span>
 <span className={`font-black ${getEconomyColor(er)}`}>
 Econ {er.toFixed(2)}
 </span>
 {isCurrentlyBowling && (
 <>
 <span>•</span>
 <span className="text-blue-400 font-bold tracking-wide">CURRENT BOWLER</span>
 </>
 )}
 </div>
 </div>
 </div>

 </div>

 {/* Scrollable Content */}
 <div
   className="overflow-y-auto overscroll-contain flex-1 p-4 sm:p-5 space-y-3 sm:space-y-4 touch-pan-y pb-safe"
   style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorY: 'contain' }}
 >
 {/* Primary Bowling Statistics — Single Unified Row */}
 <div className="grid grid-cols-4 gap-px bg-slate-700/40 border border-slate-700/50 rounded-xl overflow-hidden text-center shadow-xs">
 <div className="bg-slate-800/60 px-1 py-3 flex flex-col items-center justify-center min-w-0">
 <span className="uppercase font-bold text-slate-400 text-caption tracking-wider truncate">Overs</span>
 <p className="font-black text-stat sm:text-h3 text-slate-100 mt-0.5 truncate"><MotionNumber value={oversString(ballsBowled)} mode="cricket-overs" /></p>
 </div>
 <div className="bg-slate-800/60 px-1 py-3 flex flex-col items-center justify-center min-w-0">
 <span className="uppercase font-bold text-slate-400 text-caption tracking-wider truncate">Maidens</span>
 <p className="font-black text-stat sm:text-h3 text-slate-100 mt-0.5 truncate"><MotionNumber value={maidens} /></p>
 </div>
 <div className="bg-slate-800/60 px-1 py-3 flex flex-col items-center justify-center min-w-0">
 <span className="uppercase font-bold text-slate-400 text-caption tracking-wider truncate">Runs</span>
 <p className="font-black text-stat sm:text-h3 text-slate-100 mt-0.5 truncate"><MotionNumber value={runs} /></p>
 </div>
 <div className="bg-slate-800/60 px-1 py-3 flex flex-col items-center justify-center min-w-0">
 <span className="uppercase font-bold text-slate-400 text-caption tracking-wider truncate">Wickets</span>
 <p className="font-black text-stat sm:text-h3 text-slate-100 mt-0.5 truncate"><MotionNumber value={wickets} /></p>
 </div>
 </div>

 {/* Pressure & Discipline (TAIMUR, 2026-11-10 — Bowler Master B):
 one four-across hairline strip, mirroring the batsman profile's
 Dot Ball strip — icons dropped, extras shown as their split. */}
 <div
 role="region"
 aria-label="Pressure & Discipline"
 className="grid grid-cols-4 gap-px bg-slate-700/40 border border-slate-700/50 rounded-xl overflow-hidden text-center shadow-xs"
 >
 <div className="bg-slate-800/60 px-1 py-3 flex flex-col items-center justify-center min-w-0">
 <span className="uppercase font-bold text-slate-400 text-caption tracking-wider truncate">Dot Balls</span>
 <p className="font-black text-stat sm:text-h3 text-slate-100 mt-0.5 truncate">{dotBalls}</p>
 </div>
 <div className="bg-slate-800/60 px-1 py-3 flex flex-col items-center justify-center min-w-0">
 <span className="uppercase font-bold text-slate-400 text-caption tracking-wider truncate">Dot %</span>
 <p className="font-black text-stat sm:text-h3 text-slate-100 mt-0.5 truncate">{dotPercentage.toFixed(0)}%</p>
 </div>
 <div className="bg-slate-800/60 px-1 py-3 flex flex-col items-center justify-center min-w-0">
 <span className="uppercase font-bold text-slate-400 text-caption tracking-wider truncate">Wides</span>
 <p className="font-black text-stat sm:text-h3 text-slate-100 mt-0.5 truncate">{wides}</p>
 </div>
 <div className="bg-slate-800/60 px-1 py-3 flex flex-col items-center justify-center min-w-0">
 <span className="uppercase font-bold text-slate-400 text-caption tracking-wider truncate">No Balls</span>
 <p className="font-black text-stat sm:text-h3 text-slate-100 mt-0.5 truncate">{noBalls}</p>
 </div>
 </div>

 {/* Over-by-Over Breakdown */}
 <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl space-y-3 p-4">
 <div className="flex items-center justify-between">
 <span className="uppercase font-extrabold tracking-wider text-caption">
 Over-by-Over Deliveries ({allOvers.length})
 </span>
 <span className="flex items-baseline gap-1.5">
 <span className="text-slate-500 text-caption font-semibold uppercase tracking-wider">Econ</span>
 <span className={`font-black ${getEconomyColor(er)}`}>{er.toFixed(2)}</span>
 </span>
 </div>

 {allOvers.length === 0 ? (
 <div className="text-caption py-6">
 No overs completed yet in this spell.
 </div>
) : (
 <div className="divide-y divide-slate-800/80">
 {allOvers.map((ov, idx) => {
 const overRuns = calculateOverRuns(ov.log);
 const overWickets = getWicketsForOver(ov.overNumber);

 return (
 <div
 key={idx}
 className={`space-y-2 ${
 ov.isOngoing
 ? 'mt-2 p-3 rounded-xl border border-blue-600/30 bg-blue-950/25'
 : 'py-3 first:pt-0 last:pb-0'
 }`}
 >
 <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
 <span
 className={`text-caption font-black px-2 py-0.5 rounded-md border ${
 ov.isOngoing
 ? 'bg-blue-500/15 border-blue-500/30 text-blue-300'
 : 'bg-slate-800 border-slate-700/60 text-slate-200'
 }`}
 >
 {ov.isOngoing ? 'Cur Over' : `Over ${ov.overNumber}`}
 </span>
 {ov.isOngoing && (
 <span className="rounded bg-blue-500/20 font-bold text-blue-400 px-2 py-0.5">
 LIVE
 </span>
 )}
 <span aria-hidden="true" className="w-px h-4 bg-slate-700/70" />
 <div className="flex flex-wrap items-center gap-1">
 {ov.log.map((token, ballIdx) => (
 <div
 key={ballIdx}
 className={`w-6 h-6 rounded-full flex items-center justify-center text-caption font-bold border ${getBallCircleStyle(
 token
)} shadow-xs`}
 title={`Ball ${ballIdx + 1}: ${token}`}
 >
 {token === '0' ? '0' : token}
 </div>
 ))}
 </div>
 <span aria-hidden="true" className="text-slate-500 font-black">=</span>
 {overRuns === 0 ? (
 <span className="text-caption font-black text-emerald-400 whitespace-nowrap">MAIDEN</span>
 ) : (
 <span className="text-caption font-extrabold text-slate-100 whitespace-nowrap">{overRuns} runs</span>
 )}
 </div>

 {/* Fall of wickets during this over */}
 {overWickets.length > 0 && (
 <div className="border-t border-slate-800/80 pt-2 space-y-1">
 {overWickets.map((w: FallOfWicket, wIdx: number) => (
 <div
 key={wIdx}
 className="flex items-center bg-red-950/40 border border-red-900/40 p-1.5 rounded-lg text-caption gap-2"
 >
 <span className="bg-red-600 flex items-center justify-center font-black rounded-full text-caption w-4 h-4">
 W
 </span>
 <span className="font-extrabold text-white">
 {cleanPlayerName(w.player)}
 </span>
 <span className="text-caption">
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
 <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl space-y-2.5 p-4">
 <div className="flex items-center uppercase font-extrabold gap-1.5 text-caption">
 <Award className="w-4 h-4" />
 <span>Wickets Taken in Match ({wickets})</span>
 </div>
 <div className="space-y-1.5">
 { (fallOfWickets || [])
 .filter((w: FallOfWicket) => Boolean(w && ((w.bowlerId && bowler.id && w.bowlerId === bowler.id) || (name && w.dismissal?.toLowerCase().includes(name.toLowerCase())))))
 .map((w: FallOfWicket, wIdx: number) => (
 <div
 key={wIdx}
 className="bg-slate-900/60 border border-slate-800 flex items-center justify-between p-card rounded-lg text-caption"
 >
 <div className="flex items-center flex-1 min-w-0 gap-2">
 <span className="bg-red-500/20 font-black flex items-center justify-center shrink-0 rounded-md text-caption w-5 h-5">
 W{wIdx + 1}
 </span>
 <span className="font-bold truncate text-slate-100">{cleanPlayerName(w.player)}</span>
 </div>
 <span className="shrink-0 text-caption ml-2">
 {w.wicket}-{w.score} ({w.over} ov)
 </span>
 </div>
))}
 </div>
 </div>
)}
 </div>

 </motion.div>
 </motion.div>
);
}

export default BowlerProfileModal;

