'use client';

import React, { useState } from 'react';
import {
  X,
  Zap,
} from 'lucide-react';
import { EventSourcedMatchEngine } from '@/domain/cricket/match-engine/EventSourcedMatchEngine';
import { DotBallAnalytics } from '@/domain/cricket/analytics/DotBallAnalytics';
import { strikeRate, economyRate, cleanPlayerName } from '@/domain/cricket/formatters';
import { motion } from 'framer-motion';
import { STAGGER_CONTAINER, FADE_UP_ITEM } from '@/lib/animations';
import { Player } from '@/domain/cricket/types';
import { MotionNumber } from '@/components/common/MotionNumber';
import { BackButton } from '@/components/navigation';
import { CompactDropdown } from '@/components/common/CompactDropdown';

interface AdvancedAnalyticsPanelProps {
 engine: EventSourcedMatchEngine;
 onClose: () => void;
}

export function AdvancedAnalyticsPanel({ engine, onClose }: AdvancedAnalyticsPanelProps) {
 const inn = engine.currentInnings;
 const striker = inn.players[inn.strikerIdx];
 const currentBowler = inn.bowlers[inn.currentBowlerIdx];

 const allBatters: Player[] = [
 ...(engine.firstInnings?.players || []),
 ...(engine.secondInnings?.players || []),
 ];

 const [selectedBatterName, setSelectedBatterName] = useState<string>(
 striker?.name || allBatters[0]?.name || ''
);

 const selectedBatter = allBatters.find((b) => b.name === selectedBatterName) || striker;

 // Selected Batter Metrics
 const batterRuns = selectedBatter?.runs || 0;
 const batterBalls = selectedBatter?.balls || 0;
 const batterFours = selectedBatter?.fours || 0;
 const batterSixes = selectedBatter?.sixes || 0;
 const batterDots = selectedBatter
 ? DotBallAnalytics.countBatsmanDotBalls(selectedBatter.dotBalls, selectedBatter.ballLog)
 : 0;
 const boundaryRuns = batterFours * 4 + batterSixes * 6;
 const runningRuns = Math.max(0, batterRuns - boundaryRuns);
 const boundaryPct = batterRuns > 0 ? (boundaryRuns / batterRuns) * 100 : 0;
 const dotPct = selectedBatter
 ? DotBallAnalytics.calculateDotBallPercentage(batterDots, batterBalls)
 : 0;
 const controlPct = batterBalls > 0 ? Math.max(0, 100 - (batterDots / batterBalls) * 100) : 100;
 const sr = strikeRate(batterRuns, batterBalls);
 const intent = selectedBatter
 ? DotBallAnalytics.classifyBattingIntent(boundaryPct, controlPct, sr, batterBalls)
 : 'Balanced';

 return (
 <div className="animate-in fade-in duration-200 max-w-4xl mx-auto w-full flex flex-col gap-section pb-section">
 {/* ── STICKY TOP REVERSIBLE NAVIGATION BAR ── */}
 <div className="sticky top-0 z-20 -mx-2 sm:-mx-4 bg-[var(--card)]/95 backdrop-blur-md border-b border-[var(--border)] flex items-center justify-between shadow-xs py-2.5 rounded-b-card px-screen-x gap-3">
   <div className="flex items-center gap-2 min-w-0">
     <BackButton
       onClick={onClose}
       showLabel={false}
       title="Return to live scoring cockpit"
       size="sm"
     />
     <h2 className="font-extrabold tracking-tight truncate text-base sm:text-lg text-[var(--foreground)] leading-none">
       Advanced Analytics
     </h2>
   </div>

 <button
 type="button"
 onClick={onClose}
 className="bg-[var(--muted)] hover:text-[var(--foreground)] active:scale-90 transition-transform shrink-0 flex items-center justify-center p-2 rounded-lg text-[var(--muted-foreground)] min-h-[36px] min-w-[36px]"
 title="Close Analytics panel"
 >
 <X className="w-4 h-4" />
 </button>
 </div>

      <motion.div variants={STAGGER_CONTAINER} initial="hidden" animate="visible" className="flex flex-col gap-section">
      {/* ── LIVE MATCH CREASE INTENT OVERVIEW ── */}
      <motion.div variants={FADE_UP_ITEM} className="bg-[var(--card)] border border-[var(--border)] shadow-xs p-card rounded-card flex flex-col gap-card-gap">
        <div className="flex items-center justify-between">
          <span className="font-bold uppercase tracking-wider dark:text-emerald-400 flex items-center text-caption gap-1.5">
            <Zap className="w-3.5 h-3.5" />
            Active Crease Dynamics
          </span>
 <span className="num-font text-[var(--muted-foreground)]">
 Inn {engine.currentInningsNumber} • <MotionNumber value={inn.totalRuns} /> - <MotionNumber value={inn.totalWickets} /> (<MotionNumber value={inn.oversString} mode="cricket-overs" /> ov)
 </span>
 </div>

 <div className="grid gap-card-gap grid-cols-1 sm:grid-cols-2">
 {/* Striker Card */}
 <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex flex-col gap-2">
 <div className="flex items-center justify-between">
 <span className="font-extrabold dark:text-emerald-300 text-body-small">
 {cleanPlayerName(striker?.name)} * (Striker)
 </span>
 <span className="rounded bg-emerald-600 font-black uppercase py-0.5 text-[9px] px-2">
 {intent}
 </span>
 </div>
 <div className="grid num-font text-center grid-cols-3 gap-2">
 <div className="rounded bg-[var(--card)] border border-[var(--border)] p-1.5">
 <span className="font-black text-caption"><MotionNumber value={striker?.runs || 0} /></span>
 <span className="block uppercase text-[var(--muted-foreground)]">Runs (<MotionNumber value={striker?.balls || 0} />b)</span>
 </div>
 <div className="rounded bg-[var(--card)] border border-[var(--border)] p-1.5">
 <span className="font-black text-caption"><MotionNumber value={strikeRate(striker?.runs || 0, striker?.balls || 0).toFixed(1)} mode="decimal" /></span>
 <span className="block uppercase text-[var(--muted-foreground)]">Strike Rate</span>
 </div>
 <div className="rounded bg-[var(--card)] border border-[var(--border)] p-1.5">
 <span className="font-black text-caption"><MotionNumber value={dotPct.toFixed(0)} />%</span>
 <span className="block uppercase text-[var(--muted-foreground)]">Dot Ball %</span>
 </div>
 </div>
 </div>

 {/* Current Bowler Card */}
 <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 flex flex-col gap-2">
 <div className="flex items-center justify-between">
 <span className="font-extrabold dark:text-blue-300 text-body-small">
 {cleanPlayerName(currentBowler?.name)} (Bowler)
 </span>
 <span className="rounded bg-blue-600 font-black uppercase py-0.5 text-[9px] px-2">
 Spell: <MotionNumber value={currentBowler?.wickets || 0} />-<MotionNumber value={currentBowler?.runs || 0} />
 </span>
 </div>
 <div className="grid num-font text-center grid-cols-3 gap-2">
 <div className="rounded bg-[var(--card)] border border-[var(--border)] p-1.5">
 <span className="font-black text-caption"><MotionNumber value={`${Math.floor((currentBowler?.ballsBowled || 0) / 6)}.${(currentBowler?.ballsBowled || 0) % 6}`} mode="cricket-overs" /></span>
 <span className="block uppercase text-[var(--muted-foreground)]">Overs</span>
 </div>
 <div className="rounded bg-[var(--card)] border border-[var(--border)] p-1.5">
 <span className="font-black text-caption"><MotionNumber value={economyRate(currentBowler?.runs || 0, currentBowler?.ballsBowled || 0).toFixed(2)} mode="decimal" /></span>
 <span className="block uppercase text-[var(--muted-foreground)]">Economy</span>
 </div>
 <div className="rounded bg-[var(--card)] border border-[var(--border)] p-1.5">
 <span className="font-black text-caption"><MotionNumber value={currentBowler?.maidens || 0} /></span>
 <span className="block uppercase text-[var(--muted-foreground)]">Maidens</span>
 </div>
 </div>
 </div>
 </div>
      </motion.div>

      {/* ── DEEP BATTER METRICS DRILL-DOWN ── */}
      <motion.div variants={FADE_UP_ITEM} className="bg-[var(--card)] border border-[var(--border)] shadow-xs p-card rounded-card flex flex-col gap-card-gap">
        <div className="flex sm:items-center justify-between flex-wrap gap-card-gap">
 <div>
 <span className="font-bold uppercase tracking-wider text-caption">
 Batting Style &amp; Production Matrix
 </span>
 <h3 className="font-black text-body">
 {cleanPlayerName(selectedBatter?.name)}
 </h3>
 </div>

 {/* Player select dropdown */}
 {allBatters.length > 1 && (
 <div className="w-52 sm:w-64">
 <CompactDropdown
 value={selectedBatterName}
 onChange={setSelectedBatterName}
 options={allBatters.map((p) => ({
 label: `${cleanPlayerName(p.name)} (${p.runs}r, ${p.balls}b)`,
 value: p.name,
 }))}
 placeholder="Select Batter"
 searchable
 />
 </div>
)}
 </div>

 {/* 4 Metric Cards */}
 <div className="grid num-font gap-2.5 sm:gap-3 text-center grid-cols-2 sm:grid-cols-4">
 <div className="bg-[var(--muted)]/50 border border-[var(--border)] rounded-xl p-3 flex flex-col gap-1">
 <span className="font-black text-h2">{controlPct.toFixed(0)}%</span>
 <span className="block font-extrabold uppercase tracking-wide text-[var(--muted-foreground)] text-caption">
 Control Pct
 </span>
 </div>

 <div className="bg-[var(--muted)]/50 border border-[var(--border)] rounded-xl p-3 flex flex-col gap-1">
 <span className="font-black text-h2">{dotPct.toFixed(0)}%</span>
 <span className="block font-extrabold uppercase tracking-wide text-[var(--muted-foreground)] text-caption">
 Dot Ball Pct
 </span>
 </div>

 <div className="bg-[var(--muted)]/50 border border-[var(--border)] rounded-xl p-3 flex flex-col gap-1">
 <span className="font-black text-h2">{boundaryPct.toFixed(0)}%</span>
 <span className="block font-extrabold uppercase tracking-wide text-[var(--muted-foreground)] text-caption">
 Boundaries ({boundaryRuns}r)
 </span>
 </div>

 <div className="bg-[var(--muted)]/50 border border-[var(--border)] rounded-xl p-3 flex flex-col gap-1">
 <span className="font-black text-h2">
 {batterRuns > 0 ? ((runningRuns / batterRuns) * 100).toFixed(0) : '0'}%
 </span>
 <span className="block font-extrabold uppercase tracking-wide text-[var(--muted-foreground)] text-caption">
 Running ({runningRuns}r)
 </span>
 </div>
 </div>

 {/* Visual Progress Bars */}
 <div className="border-t border-[var(--border)] flex flex-col gap-2 pt-2">
 <div className="flex flex-col xs:flex-row xs:items-center justify-between font-bold text-caption gap-1">
 <span className="shrink-0 text-[var(--muted-foreground)]">Scoring Distribution:</span>
 <span className="num-font break-words-safe text-[var(--foreground)]">
 Boundaries: {boundaryRuns}r ({batterFours}x4, {batterSixes}x6) • Running: {runningRuns}r
 </span>
 </div>
 <div
  className="bg-[var(--muted)] overflow-hidden flex rounded-full w-full h-3"
  role="progressbar"
  aria-label="Scoring Distribution"
  aria-valuenow={Math.round(boundaryPct)}
  aria-valuemin={0}
  aria-valuemax={100}
 >
 <div
 style={{ width: `${Math.min(100, boundaryPct)}%` }}
 className="bg-blue-600 transition-all duration-300"

 />
 <div
 style={{ width: `${Math.max(0, 100 - boundaryPct)}%` }}
 className="bg-purple-600 transition-all duration-300"

 />
 </div>
 </div>
      </motion.div>

      {/* ── HEAD TO HEAD ENCOUNTERS ── */}
      {selectedBatter?.runsVsBowler && Object.keys(selectedBatter.runsVsBowler).length > 0 && (
        <motion.div variants={FADE_UP_ITEM} className="bg-[var(--card)] border border-[var(--border)] shadow-xs p-card rounded-card flex flex-col gap-card-gap">
          <span className="font-bold uppercase tracking-wider text-caption">
 Head-to-Head vs Bowlers (This Match)
 </span>

 <div className="overflow-x-auto table-scroll-container">
 <table className="min-w-[340px] text-caption w-full">
 <thead className="bg-[var(--muted)]/60 font-bold uppercase border-b border-[var(--border)] text-[var(--muted-foreground)]">
 <tr>
 <th className="py-2 px-3">Opponent Bowler</th>
 <th className="text-right py-2 px-3">Runs Scored</th>
 <th className="text-right py-2 px-3">Status</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-[var(--border)]">
 {Object.entries(selectedBatter.runsVsBowler || {}).map(([bName, runs], i) => (
 <tr key={i} className="hover:bg-[var(--muted)]/30">
 <td className="font-extrabold text-[var(--foreground)] py-2 px-3">{cleanPlayerName(bName)}</td>
 <td className="font-black num-font text-emerald-600 py-2 px-3">{Number(runs)} runs</td>
 <td className="text-[var(--muted-foreground)] py-2 px-3">
 {selectedBatter.dismissalText?.includes(bName) ? (
 <span className="font-bold text-red-500">Dismissed by {cleanPlayerName(bName)}</span>
) : (
 <span>Not out against</span>
)}
 </td>
 </tr>
))}
 </tbody>
          </table>
        </div>
      </motion.div>
      )}
      </motion.div>
    </div>
  );
}
