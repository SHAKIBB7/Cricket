'use client';

import React, { useState, useEffect } from 'react';
import {
 BarChart2,
 ArrowLeft,
 X,
 Target,
 Shield,
 Activity,
 Zap,
 TrendingUp,
} from 'lucide-react';
import { EventSourcedMatchEngine } from '@/domain/cricket/match-engine/EventSourcedMatchEngine';
import { DotBallAnalytics } from '@/domain/cricket/analytics/DotBallAnalytics';
import { strikeRate, economyRate, cleanPlayerName } from '@/domain/cricket/formatters';
import { Player, Bowler } from '@/domain/cricket/types';

interface AdvancedAnalyticsPanelProps {
 engine: EventSourcedMatchEngine;
 onClose: () => void;
}

export function AdvancedAnalyticsPanel({ engine, onClose }: AdvancedAnalyticsPanelProps) {
 const inn = engine.currentInnings;
 const striker = inn.players[inn.strikerIdx];
 const nonStriker = inn.players[inn.nonStrikerIdx];
 const currentBowler = inn.bowlers[inn.currentBowlerIdx];

 const allBatters: Player[] = [
 ...(engine.firstInnings?.players || []),
 ...(engine.secondInnings?.players || []),
 ];

 const allBowlers: Bowler[] = [
 ...(engine.firstInnings?.bowlers || []),
 ...(engine.secondInnings?.bowlers || []),
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
 <button
 type="button"
 onClick={onClose}
 className="flex items-center bg-emerald-600 hover:bg-emerald-500 font-bold shadow-xs active:scale-95 transition-transform shrink-0 gap-1.5 px-4 py-2 rounded-xl text-caption min-h-btn"
 title="Return to live scoring cockpit"
 >
 <ArrowLeft className="shrink-0 w-4 h-4" />
 <span className="hidden xs:inline">Back to Live Scoring</span>
 <span className="xs:hidden">Back</span>
 </button>

 <div className="flex items-center min-w-0 gap-2">
 <BarChart2 className="hidden sm:block shrink-0 text-emerald-600 w-4 h-4" />
 <h2 className="font-extrabold truncate text-body">
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

 {/* ── LIVE MATCH CREASE INTENT OVERVIEW ── */}
 <div className="bg-[var(--card)] border border-[var(--border)] shadow-xs p-card rounded-card flex flex-col gap-card-gap">
 <div className="flex items-center justify-between">
 <span className="font-bold uppercase tracking-wider dark:text-emerald-400 flex items-center text-caption gap-1.5">
 <Zap className="w-3.5 h-3.5" />
 Active Crease Dynamics
 </span>
 <span className="num-font text-[var(--muted-foreground)]">
 Inn {engine.currentInningsNumber} • {inn.totalRuns} - {inn.totalWickets} ({inn.oversString} ov)
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
 <span className="font-black text-caption">{striker?.runs || 0}</span>
 <span className="block uppercase text-[var(--muted-foreground)]">Runs ({striker?.balls || 0}b)</span>
 </div>
 <div className="rounded bg-[var(--card)] border border-[var(--border)] p-1.5">
 <span className="font-black text-caption">{strikeRate(striker?.runs || 0, striker?.balls || 0).toFixed(1)}</span>
 <span className="block uppercase text-[var(--muted-foreground)]">Strike Rate</span>
 </div>
 <div className="rounded bg-[var(--card)] border border-[var(--border)] p-1.5">
 <span className="font-black text-caption">{dotPct.toFixed(0)}%</span>
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
 Spell: {currentBowler?.wickets || 0}-{currentBowler?.runs || 0}
 </span>
 </div>
 <div className="grid num-font text-center grid-cols-3 gap-2">
 <div className="rounded bg-[var(--card)] border border-[var(--border)] p-1.5">
 <span className="font-black text-caption">{Math.floor((currentBowler?.ballsBowled || 0) / 6)}.{(currentBowler?.ballsBowled || 0) % 6}</span>
 <span className="block uppercase text-[var(--muted-foreground)]">Overs</span>
 </div>
 <div className="rounded bg-[var(--card)] border border-[var(--border)] p-1.5">
 <span className="font-black text-caption">{economyRate(currentBowler?.runs || 0, currentBowler?.ballsBowled || 0).toFixed(2)}</span>
 <span className="block uppercase text-[var(--muted-foreground)]">Economy</span>
 </div>
 <div className="rounded bg-[var(--card)] border border-[var(--border)] p-1.5">
 <span className="font-black text-caption">{currentBowler?.maidens || 0}</span>
 <span className="block uppercase text-[var(--muted-foreground)]">Maidens</span>
 </div>
 </div>
 </div>
 </div>
 </div>

 {/* ── DEEP BATTER METRICS DRILL-DOWN ── */}
 <div className="bg-[var(--card)] border border-[var(--border)] shadow-xs p-card rounded-card flex flex-col gap-card-gap">
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
 <select
 value={selectedBatterName}
 onChange={(e) => setSelectedBatterName(e.target.value)}
 className="bg-[var(--muted)] border border-[var(--border)] font-bold focus:outline-none focus:border-emerald-500 py-2 rounded-xl text-caption min-h-[38px] px-3"
 >
 {allBatters.map((p, idx) => (
 <option key={idx} value={p.name}>
 {cleanPlayerName(p.name)} ({p.runs} runs, {p.balls}b)
 </option>
))}
 </select>
)}
 </div>

 {/* 4 Metric Cards */}
 <div className="grid num-font gap-2.5 sm:gap-3 text-center grid-cols-2 sm:grid-cols-4">
 <div className="bg-[var(--muted)]/50 border border-[var(--border)] rounded-xl p-3 flex flex-col gap-1">
 <span className="font-black text-h2">{controlPct.toFixed(0)}%</span>
 <span className="block font-extrabold uppercase tracking-wide text-[var(--muted-foreground)]">
 Control Pct
 </span>
 </div>

 <div className="bg-[var(--muted)]/50 border border-[var(--border)] rounded-xl p-3 flex flex-col gap-1">
 <span className="font-black text-h2">{dotPct.toFixed(0)}%</span>
 <span className="block font-extrabold uppercase tracking-wide text-[var(--muted-foreground)]">
 Dot Ball Pct
 </span>
 </div>

 <div className="bg-[var(--muted)]/50 border border-[var(--border)] rounded-xl p-3 flex flex-col gap-1">
 <span className="font-black text-h2">{boundaryPct.toFixed(0)}%</span>
 <span className="block font-extrabold uppercase tracking-wide text-[var(--muted-foreground)]">
 Boundaries ({boundaryRuns}r)
 </span>
 </div>

 <div className="bg-[var(--muted)]/50 border border-[var(--border)] rounded-xl p-3 flex flex-col gap-1">
 <span className="font-black text-h2">
 {batterRuns > 0 ? ((runningRuns / batterRuns) * 100).toFixed(0) : '0'}%
 </span>
 <span className="block font-extrabold uppercase tracking-wide text-[var(--muted-foreground)]">
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
 <div className="bg-[var(--muted)] overflow-hidden flex rounded-full w-full h-3">
 <div
 style={{ width: `${Math.min(100, boundaryPct)}%` }}
 className="bg-blue-600 transition-all duration-300"
 title={`Boundaries: ${boundaryPct.toFixed(0)}%`}
 />
 <div
 style={{ width: `${Math.max(0, 100 - boundaryPct)}%` }}
 className="bg-purple-600 transition-all duration-300"
 title={`Running: ${(100 - boundaryPct).toFixed(0)}%`}
 />
 </div>
 </div>
 </div>

 {/* ── HEAD TO HEAD ENCOUNTERS ── */}
 {selectedBatter?.runsVsBowler && Object.keys(selectedBatter.runsVsBowler).length > 0 && (
 <div className="bg-[var(--card)] border border-[var(--border)] shadow-xs p-card rounded-card flex flex-col gap-card-gap">
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
 </div>
)}
 </div>
);
}
