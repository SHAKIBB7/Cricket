'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Player, Partnership, FallOfWicket } from '@/domain/cricket/types';
import { cleanPlayerName, strikeRate } from '@/domain/cricket/formatters';
import { DotBallAnalytics } from '@/domain/cricket/analytics/DotBallAnalytics';
import { matchupBreakdown } from '@/domain/cricket/analytics/bowlerMatchup';
import { X, Target, Zap, Shield, Flame, Activity, TrendingUp, Info, Pencil, Check, Share2, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MODAL_VARIANTS, BACKDROP_VARIANTS } from '@/lib/animations';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { MotionNumber } from '@/components/common/MotionNumber';
import { BackButton } from '@/components/navigation';
import { shareProfileCardImage, type BatsmanCardInput } from '@/features/scoring/share/ProfileShareCard';

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
 /** L3: stable playerId -> display name for this match's bowlers, so
  * id-keyed matchup rows resolve to names. */
 bowlerNamesById?: Record<string, string>;
 onRenamePlayer?: (playerId: string, newName: string) => Promise<boolean | void> | boolean | void;
 /** Optional match context line printed on the share card. */
 matchContext?: string;
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
 bowlerNamesById,
 onRenamePlayer,
 matchContext,
}: BatsmanProfileModalProps) {
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
    {isOpen && player && (
      <BatsmanProfileModalContent 
        key={player.id || player.name}
        player={player} 
        onClose={onClose} 
        isStriker={isStriker}
        isNonStriker={isNonStriker}
        battingPosition={battingPosition}
        matchContext={matchContext}
        partnerships={partnerships}
        fallOfWickets={fallOfWickets}
        bowlerNamesById={bowlerNamesById}
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

function BatsmanProfileModalContent({
 player,
 onClose,
 isStriker,
 isNonStriker,
 battingPosition,
 partnerships,
 fallOfWickets,
 bowlerNamesById,
 onRenamePlayer,
 matchContext,
}: any) {
 // Focus trap (Phase 2D): bespoke dark shell kept by design; the trap
 // completes its accessibility set (portal + dialog + Escape + lock).
 const trapRef = useFocusTrap<HTMLDivElement>(true);
 const initialName = cleanPlayerName(player.name);
 const [currentName, setCurrentName] = React.useState(initialName);
 const [isEditing, setIsEditing] = React.useState(false);
 const [editNameValue, setEditNameValue] = React.useState(initialName);
 const [isSaving, setIsSaving] = React.useState(false);
 const [validationError, setValidationError] = React.useState<string | null>(null);

 React.useEffect(() => {
   const n = cleanPlayerName(player.name);
   setCurrentName(n);
   setEditNameValue(n);
 }, [player.name]);

 // Name editing is a crease-only affordance (TAIMUR, 2026-11-10):
 // only the two batters currently batting may be renamed. For
 // dismissed or yet-to-bat players — and from the scoreboard,
 // centre or summary views — the name is read-only, so a recorded
 // card is never rewritten from a profile view.
 const canEditName = !!(isStriker || isNonStriker);
 React.useEffect(() => {
   if (!canEditName && isEditing) {
     setIsEditing(false);
     setValidationError(null);
   }
 }, [canEditName, isEditing]);

 const handleSaveRename = async () => {
   const trimmed = cleanPlayerName(editNameValue).trim().replace(/\s+/g, ' ');
   if (!trimmed) {
     setValidationError('Player name cannot be empty.');
     return;
   }
   if (trimmed.length > 50) {
     setValidationError('Player name cannot exceed 50 characters.');
     return;
   }
   if (!/[a-zA-Z0-9\u0980-\u09FF]/.test(trimmed)) {
     setValidationError('Player name must contain valid letters or numbers.');
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
       await onRenamePlayer(player.id, trimmed);
     }
     setCurrentName(trimmed);
     setIsEditing(false);
     setValidationError(null);
   } catch (err: any) {
     setValidationError(err?.message || 'Failed to rename player.');
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
 const runs = player.runs || 0;
 const balls = player.balls || 0;
 const fours = player.fours || 0;
 const sixes = player.sixes || 0;
 const sr = strikeRate(runs, balls);

 // Audit 2026-11-10: clamp the dot count to the balls faced — a
 // stored counter from imported/restored data can exceed it and
 // would otherwise print >100% / negative percentages below.
 const dotBalls = Math.min(
 DotBallAnalytics.countBatsmanDotBalls(player.dotBalls || 0, player.ballLog || []),
 balls
 );
 const scoringBalls = Math.max(0, balls - dotBalls);
 const dotBallPercent = DotBallAnalytics.calculateDotBallPercentage(dotBalls, balls);
 const shotControl = Math.max(0, 100 - dotBallPercent);
 const longestStreak = DotBallAnalytics.longestDotStreak(player.ballLog || []);

 const runsByBoundary = fours * 4 + sixes * 6;
 const runsByRunning = Math.max(0, runs - runsByBoundary);
 const boundaryRunsPct = runs > 0 ? Math.min(100, (runsByBoundary / runs) * 100) : 0;
 const runningRunsPct = runs > 0 ? (runsByRunning / runs) * 100 : 0;
 const boundaryBallPct = balls > 0 ? Math.min(100, ((fours + sixes) / balls) * 100) : 0;

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
 const fow = (fallOfWickets || []).find(
  (f: FallOfWicket) =>
    Boolean(
      f && (
        (f.playerId && player.id && f.playerId === player.id) ||
        (name && cleanPlayerName(f.player).toLowerCase() === name.toLowerCase())
      )
    )
 );

 // Bowler dominance breakdown (L3: understands id-keyed and legacy
 // name-keyed matchup maps; id keys resolve to names via the prop)
 const bowlerEntries = matchupBreakdown(player, bowlerNamesById || {}).map((row) => ({
 bowlerName: row.label,
 balls: row.balls,
 runs: row.runs,
 sr: strikeRate(row.runs, row.balls),
 econ: row.balls > 0 ? (row.runs / row.balls) * 6 : 0,
 }));

 // Share card (TAIMUR, 2026-11-10): one tap renders the whole
 // profile to a single PNG via ProfileShareCard and shares/saves it.
 const [isSharing, setIsSharing] = React.useState(false);
 const [shareFailed, setShareFailed] = React.useState(false);
 const handleShareProfile = async () => {
   if (isSharing) return;
   setIsSharing(true);
   try {
     const intentDescriptions: Record<string, string> = {
       Finisher: 'High-velocity boundary hitting with elevated strike rate',
       Attacking: 'Dominant strokeplay putting regular pressure on bowlers',
       Anchor: 'Steadies the innings with disciplined strike rotation',
       Balanced: 'Controlled tempo with balanced dot control and boundaries',
       Defensive: 'Careful risk aversion and wicket preservation mode',
     };
     const intentGradients: Record<string, [string, string]> = {
       Finisher: ['#92400e', '#b45309'],
       Attacking: ['#7f1d2d', '#9f1239'],
       Anchor: ['#065f46', '#047857'],
       Balanced: ['#1e3a8a', '#1d4ed8'],
       Defensive: ['#334155', '#475569'],
     };
     const statusText = player.isDismissed
       ? player.dismissalText || fow?.dismissal || 'Dismissed'
       : player.dismissalType === 'Retire Hurt' || player.dismissalType === 'Retired Hurt'
         ? 'Retired Hurt (Not Out)'
         : balls > 0 || runs > 0 || isStriker || isNonStriker
           ? 'Not Out*'
           : 'Yet to bat';
     const input: BatsmanCardInput = {
       name,
       hand: player.battingHand || 'Right-hand Batsman',
       status: statusText,
       statusColor: player.isDismissed ? '#f87171' : '#34d399',
       crease: isStriker
         ? { text: '★ STRIKER', color: '#34d399' }
         : isNonStriker
           ? { text: 'NON-STRIKER', color: '#60a5fa' }
           : undefined,
       position: battingPosition,
       context: matchContext,
       intent,
       intentDescription: intentDescriptions[intent] || intentDescriptions.Balanced,
       intentGradient: intentGradients[intent] || intentGradients.Balanced,
       runs,
       balls,
       strikeRate: sr.toFixed(1),
       fours,
       sixes,
       boundaryRuns: runsByBoundary,
       boundaryPct: boundaryRunsPct,
       runningRuns: runsByRunning,
       runningPct: runningRunsPct,
       dotBalls,
       dotPct: dotBallPercent.toFixed(0),
       scoringBalls,
       scoringPct: balls > 0 ? ((scoringBalls / balls) * 100).toFixed(0) : '0',
       shotControl: shotControl.toFixed(0),
       maxDotStreak: longestStreak,
       encounters: bowlerEntries.map((e: any) => ({
         bowler: e.bowlerName,
         runs: e.runs,
         balls: e.balls,
         econ: e.econ.toFixed(2),
         sr: e.sr.toFixed(1),
       })),
       ballLog: player.ballLog || [],
     };
     const outcome = await shareProfileCardImage('batsman', input);
     if (outcome === 'failed') {
       // Audit 2026-11-10: a failed render used to be silent — the
       // spinner just stopped. Show a brief failure state instead.
       setShareFailed(true);
       setTimeout(() => setShareFailed(false), 2500);
     }
   } finally {
     setIsSharing(false);
   }
 };


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
 {/* iOS-Style Modal Top Navigation Bar */}
 <div className="flex items-center justify-between px-3 sm:px-4 py-2 border-b border-slate-800 bg-slate-950/70 shrink-0">
   <div className="flex items-center gap-2.5 min-w-0">
     <BackButton
       onClick={onClose}
       showLabel={false}
       size="sm"
       variant="tinted"
       title="Close Player Profile"
       className="w-9 h-9 p-0 rounded-full bg-slate-800/70 border border-slate-700/60 hover:bg-slate-700/70 shrink-0"
     />
     <span className="font-extrabold text-sm text-slate-100 truncate tracking-tight">
       Player Profile
     </span>
   </div>
   <button
     type="button"
     onClick={handleShareProfile}
     disabled={isSharing}
     aria-label="Share profile as image"
     title="Share profile as image"
     className="w-9 h-9 rounded-full bg-slate-800/70 border border-slate-700/60 hover:bg-slate-700/70 flex items-center justify-center shrink-0 text-slate-200 disabled:opacity-60 transition-colors"
   >
     {isSharing ? <Loader2 className="w-4 h-4 animate-spin" /> : shareFailed ? <X className="w-4 h-4 text-red-400" /> : <Share2 className="w-4 h-4" />}
   </button>
   {/* Clean app bar (TAIMUR, 2026-11-10): the drag-handle pill and
       the Done button are gone — the profile is a full page, not a
       sheet, and the circular back button is the only control. */}
 </div>
 {/* Header Bar */}
 <div className="border-b border-slate-800 flex items-start bg-slate-950/40 px-4 py-3">
 <div className="flex items-center gap-3 min-w-0">
 <div className="relative shrink-0">
 <div className="bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 border border-emerald-400/30 overflow-hidden relative rounded-2xl text-white w-11 h-11">
 <img
 src={
 isStriker
 ? '/assets/illustrations/strike_batsman.png'
 : isNonStriker
 ? '/assets/illustrations/non_strike_batsman.png'
 : '/assets/illustrations/st_bat.png'
 }
 alt=""
 aria-hidden="true"
 className="object-contain drop-shadow w-8 h-8"
 />
 </div>
 {/* At-crease dot (approved header design 2026-11-10): a small
     emerald badge on the avatar corner while the player is batting;
     it pulses for the striker. */}
 {(isStriker || isNonStriker) && (
 <span
 aria-hidden="true"
 className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-slate-950 z-10 ${isStriker ? 'animate-pulse' : ''}`}
 />
 )}
 </div>
 <div className="min-w-0">
 <div className="flex items-center flex-wrap gap-2">
 {!isEditing || !canEditName ? (
   canEditName ? (
   <div className="flex items-center gap-1.5 min-w-0 group cursor-pointer" onClick={() => setIsEditing(true)}>
     <h2
       className="font-extrabold tracking-tight truncate text-h3 max-w-none group-hover:text-emerald-400 transition-colors"
       title="Click to edit player name"
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
       title="Edit player name"
       aria-label="Edit player name"
     >
       <Pencil className="w-4 h-4 text-slate-400 group-hover:text-emerald-400" />
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
         placeholder="Player name"
         autoFocus
         maxLength={50}
         className="bg-slate-800/90 border border-emerald-500/70 focus:border-emerald-400 rounded-lg px-2.5 py-1 text-sm font-bold text-white outline-none ring-1 ring-emerald-500/30 flex-1 min-w-0"
       />
       <button
         type="button"
         onClick={handleSaveRename}
         disabled={isSaving}
         className="bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold px-2.5 py-1 rounded-lg text-xs flex items-center gap-1 shadow-sm shrink-0 transition-transform cursor-pointer"
         title="Save player name"
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
 {battingPosition && (
 <span className="bg-slate-800 font-bold border border-slate-700 text-slate-400 px-2 py-0.5 rounded-md">
 #{battingPosition}
 </span>
)}
 </div>
 <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption mt-0.5">
 <span>{player.battingHand || 'Right-hand Batsman'}</span>
 <span>•</span>
 <span className={`min-w-0 break-words ${player.isDismissed ? 'text-red-400 font-medium' : 'text-emerald-400 font-semibold'}`}>
 {player.isDismissed
 ? player.dismissalText || fow?.dismissal || 'Dismissed'
 : player.dismissalType === 'Retire Hurt' || player.dismissalType === 'Retired Hurt'
 ? 'Retired Hurt (Not Out)'
 : balls > 0 || runs > 0 || isStriker || isNonStriker
 ? 'Not Out*'
 : 'Yet to bat'}
 </span>
 {(isStriker || isNonStriker) && (
 <>
 <span>•</span>
 <span className={`font-bold tracking-wide ${isStriker ? 'text-emerald-400' : 'text-blue-400'}`}>
 {isStriker ? '★ STRIKER' : 'NON-STRIKER'}
 </span>
 </>
)}
 </div>
 </div>
 </div>

 </div>

 {/* Scrollable Content */}
 <div
   className="overflow-y-auto overscroll-contain flex-1 p-3 sm:p-4 pb-safe space-y-3 sm:space-y-4 touch-pan-y"
   style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorY: 'contain' }}
 >
 {balls > 0 && (<>
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
 alt=""
 aria-hidden="true"
 className="hidden xs:block object-contain opacity-80 drop-shadow shrink-0 relative z-10 w-16 h-16 ml-1"
 />
 </div>

 </>)}

 {/* Primary batting statistics — compact strip (redesign approved
 by TAIMUR 2026-11-10): the five separate cards became ONE
 hairline-divided card so far more of the profile fits above the
 fold. Filler subtexts that duplicated a neighbouring cell
 ('(N balls)', 'deliveries', 'runs/100b') were dropped; the 4s/6s
 run values stay — they appear nowhere else. */}
 <div className="grid grid-cols-[0.9fr_1.1fr_1.3fr_0.75fr_0.75fr] gap-px bg-slate-700/60 border border-slate-700/60 rounded-xl overflow-hidden text-center">
 <div className="bg-slate-800/60 py-4 px-1 flex flex-col justify-center items-center min-w-0">
 <span className="text-caption font-medium text-slate-400 uppercase tracking-wider block">
 Runs
 </span>
 <p className="font-extrabold num-font text-xl sm:text-2xl text-slate-100 my-1 leading-none">
 <MotionNumber value={runs} />
 </p>
 <span aria-hidden="true" className="text-caption text-slate-500 font-normal block select-none">{'\u00A0'}</span>
 </div>
 <div className="bg-slate-800/60 py-4 px-1 flex flex-col justify-center items-center min-w-0">
 <span className="text-caption font-medium text-slate-400 uppercase tracking-wider block">
 Balls Faced
 </span>
 <p className="font-extrabold num-font text-xl sm:text-2xl text-slate-100 my-1 leading-none">
 <MotionNumber value={balls} />
 </p>
 <span aria-hidden="true" className="text-caption text-slate-500 font-normal block select-none">{'\u00A0'}</span>
 </div>
 <div className="bg-slate-800/60 py-4 px-1 flex flex-col justify-center items-center min-w-0">
 <span className="text-caption font-medium text-slate-400 uppercase tracking-wider block">
 Strike Rate
 </span>
 <p className="font-extrabold num-font text-xl sm:text-2xl text-slate-100 my-1 leading-none">
 <MotionNumber value={sr.toFixed(1)} mode="decimal" />
 </p>
 <span aria-hidden="true" className="text-caption text-slate-500 font-normal block select-none">{'\u00A0'}</span>
 </div>
 <div className="bg-slate-800/60 py-4 px-1 flex flex-col justify-center items-center min-w-0">
 <span className="text-caption font-medium text-slate-400 uppercase tracking-wider block">
 4s
 </span>
 <p className="font-extrabold num-font text-xl sm:text-2xl text-emerald-400 my-1 leading-none">
 <MotionNumber value={fours} />
 </p>
 <span className="text-caption text-slate-500 font-normal block">
 {fours * 4} runs
 </span>
 </div>
 <div className="bg-slate-800/60 py-4 px-1 flex flex-col justify-center items-center min-w-0">
 <span className="text-caption font-medium text-slate-400 uppercase tracking-wider block">
 6s
 </span>
 <p className="font-extrabold num-font text-xl sm:text-2xl text-teal-300 my-1 leading-none">
 <MotionNumber value={sixes} />
 </p>
 <span className="text-caption text-slate-500 font-normal block">
 {sixes * 6} runs
 </span>
 </div>
 </div>

 {/* Runs Source Distribution: Boundary vs Running */}
 <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl space-y-3 p-4">
 <div className="flex items-center justify-between min-h-[22px] font-bold text-caption leading-none">
 <span className="flex items-center leading-none">Run Production Sources</span>
 <span className="text-slate-400">{runs} Total Runs</span>
 </div>

 {/* Stacked Progress Bar */}
 <div
  className="bg-slate-800 overflow-hidden flex rounded-full h-3 w-full"
  role="progressbar"
  aria-label="Run Production Sources Distribution"
  aria-valuenow={Math.round(boundaryRunsPct)}
  aria-valuemin={0}
  aria-valuemax={100}
 >
 <div
 style={{ width: `${boundaryRunsPct}%` }}
 className="bg-emerald-500 transition-all duration-500 h-full"

 />
 <div
 style={{ width: `${runningRunsPct}%` }}
 className="bg-blue-500 transition-all duration-500 h-full"

 />
 </div>

 {/* One line (TAIMUR, 2026-11-10): Boundaries left, Running right. */}
 <div className="flex gap-2 text-caption pt-1">
 <div className="flex-1 min-w-0 flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2 py-1.5">
 <div className="flex items-center gap-2 min-w-0">
 <img
 src="/assets/illustrations/boundary_percentage.png"
 alt=""
 aria-hidden="true"
 className="object-contain shrink-0 w-4 h-4"
 />
 <span className="text-slate-300 truncate">Boundaries</span>
 </div>
 <span className="font-extrabold text-emerald-400">
 {runsByBoundary}r ({boundaryRunsPct.toFixed(0)}%)
 </span>
 </div>
 <div className="flex-1 min-w-0 flex items-center justify-between bg-blue-500/10 border border-blue-500/20 rounded-lg px-2 py-1.5">
 <div className="flex items-center gap-2 min-w-0">
 <img
 src="/assets/illustrations/running.png"
 alt=""
 aria-hidden="true"
 className="object-contain shrink-0 w-4 h-4"
 />
 <span className="text-slate-300 truncate">Running</span>
 </div>
 <span className="font-extrabold text-blue-400">
 {runsByRunning}r ({runningRunsPct.toFixed(0)}%)
 </span>
 </div>
 </div>
 </div>

 {balls > 0 && (<>
 {/* Dot Ball & Shot Control Analysis */}
 <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl space-y-2 p-3">
 <div className="flex items-center justify-between min-h-[22px] text-caption leading-none">
 <span className="uppercase font-semibold tracking-wider text-caption text-slate-300 flex items-center leading-none">
 Dot Ball &amp; Shot Control Analysis
 </span>
 </div>
 <div className="-mx-3 grid grid-cols-4 gap-px bg-slate-800 border-y border-slate-800 text-center">
 <div className="bg-slate-900/60 py-3 px-0.5 flex flex-col justify-center items-center min-w-0">
 <span className="text-caption font-medium text-slate-400 uppercase tracking-wide block">
 Dot Balls
 </span>
 <p className="font-extrabold num-font text-xl sm:text-2xl text-slate-100 my-1 leading-none">
 {dotBalls}
 </p>
 <span className="text-caption text-slate-500 font-normal block">
 {dotBallPercent.toFixed(0)}% of balls
 </span>
 </div>
 <div className="bg-slate-900/60 py-3 px-0.5 flex flex-col justify-center items-center min-w-0">
 <span className="text-caption font-medium text-slate-400 uppercase tracking-wide block">
 Scoring Balls
 </span>
 <p className="font-extrabold num-font text-xl sm:text-2xl text-slate-100 my-1 leading-none">
 {scoringBalls}
 </p>
 <span className="text-caption text-slate-500 font-normal block">
 {(100 - dotBallPercent).toFixed(0)}% score rate
 </span>
 </div>
 <div className="bg-slate-900/60 py-3 px-0.5 flex flex-col justify-center items-center min-w-0">
 <span className="text-caption font-medium text-slate-400 uppercase tracking-wide block">
 Shot Control
 </span>
 <p className="font-extrabold num-font text-xl sm:text-2xl text-slate-100 my-1 leading-none">
 {shotControl.toFixed(0)}%
 </p>
 <span className="text-caption text-slate-500 font-normal block">
 non-dot ratio
 </span>
 </div>
 <div className="bg-slate-900/60 py-3 px-0.5 flex flex-col justify-center items-center min-w-0">
 <span className="text-caption font-medium text-slate-400 uppercase tracking-wide block">
 Max Dot Streak
 </span>
 <p className="font-extrabold num-font text-xl sm:text-2xl text-slate-100 my-1 leading-none">
 {longestStreak}
 </p>
 <span className="text-caption text-slate-500 font-normal block">
 balls in a row
 </span>
 </div>
 </div>
 </div>

 </>)}

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
 <div role="columnheader" className="col-span-4 flex items-center justify-start text-left">
 Bowler
 </div>
 <div role="columnheader" className="col-span-2 flex items-center justify-center text-center">
 Runs
 </div>
 <div role="columnheader" className="col-span-2 flex items-center justify-center text-center">
 Balls
 </div>
 <div role="columnheader" className="col-span-2 flex items-center justify-center text-center">
 Econ
 </div>
 <div role="columnheader" className="col-span-2 flex items-center justify-end text-right">
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
 <div role="cell" className="col-span-4 flex items-center justify-start text-left font-bold text-slate-200 leading-tight pr-1">
 {cleanPlayerName(b.bowlerName)}
 </div>
 <div role="cell" className="col-span-2 flex items-center justify-center text-center font-black num-font text-emerald-400 leading-none">
 {b.runs}
 </div>
 <div role="cell" className="col-span-2 flex items-center justify-center text-center text-slate-400 num-font font-medium leading-none">
 {b.balls}
 </div>
 <div role="cell" className="col-span-2 flex items-center justify-center text-center num-font font-medium text-slate-300 leading-none">
 {b.econ.toFixed(2)}
 </div>
 <div role="cell" className="col-span-2 flex items-center justify-end text-right font-extrabold num-font text-slate-300 leading-none">
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
 {token === '0' ? '0' : token}
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

export default BatsmanProfileModal;

