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
    <div className="w-full max-w-4xl mx-auto space-y-4 sm:space-y-6 pb-6 animate-in fade-in duration-200">
      {/* ── STICKY TOP REVERSIBLE NAVIGATION BAR ── */}
      <div className="sticky top-0 z-20 -mx-2 sm:-mx-4 px-2 sm:px-4 py-2.5 bg-[var(--card)]/95 backdrop-blur-md border-b border-[var(--border)] flex items-center justify-between gap-2 sm:gap-3 shadow-xs rounded-xl">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs active:scale-95 transition-transform shrink-0 min-h-[38px]"
          title="Return to live scoring cockpit"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          <span className="hidden xs:inline">Back to Live Scoring</span>
          <span className="xs:hidden">Back</span>
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <BarChart2 className="w-4 h-4 text-emerald-600 hidden sm:block shrink-0" />
          <h2 className="font-extrabold text-sm sm:text-base text-[var(--foreground)] truncate">
            Advanced Analytics
          </h2>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] active:scale-90 transition-transform shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center"
          title="Close Analytics panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── LIVE MATCH CREASE INTENT OVERVIEW ── */}
      <div className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] space-y-3.5 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs sm:text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" />
            Active Crease Dynamics
          </span>
          <span className="text-xs text-[var(--muted-foreground)] num-font">
            Inn {engine.currentInningsNumber} • {inn.totalRuns}/{inn.totalWickets} ({inn.oversString} ov)
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
          {/* Striker Card */}
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-xs sm:text-sm text-emerald-700 dark:text-emerald-300">
                {cleanPlayerName(striker?.name)} * (Striker)
              </span>
              <span className="px-2 py-0.5 rounded bg-emerald-600 text-white text-xs font-black uppercase">
                {intent}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center num-font">
              <div className="p-1.5 rounded bg-[var(--card)] border border-[var(--border)]">
                <span className="text-xs font-black">{striker?.runs || 0}</span>
                <span className="block text-xs text-[var(--muted-foreground)] uppercase">Runs ({striker?.balls || 0}b)</span>
              </div>
              <div className="p-1.5 rounded bg-[var(--card)] border border-[var(--border)]">
                <span className="text-xs font-black text-emerald-600">{strikeRate(striker?.runs || 0, striker?.balls || 0).toFixed(1)}</span>
                <span className="block text-xs text-[var(--muted-foreground)] uppercase">Strike Rate</span>
              </div>
              <div className="p-1.5 rounded bg-[var(--card)] border border-[var(--border)]">
                <span className="text-xs font-black text-amber-500">{dotPct.toFixed(0)}%</span>
                <span className="block text-xs text-[var(--muted-foreground)] uppercase">Dot Ball %</span>
              </div>
            </div>
          </div>

          {/* Current Bowler Card */}
          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-xs sm:text-sm text-blue-700 dark:text-blue-300">
                {cleanPlayerName(currentBowler?.name)} (Bowler)
              </span>
              <span className="px-2 py-0.5 rounded bg-blue-600 text-white text-xs font-black uppercase">
                Spell: {currentBowler?.wickets || 0}-{currentBowler?.runs || 0}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center num-font">
              <div className="p-1.5 rounded bg-[var(--card)] border border-[var(--border)]">
                <span className="text-xs font-black">{Math.floor((currentBowler?.ballsBowled || 0) / 6)}.{(currentBowler?.ballsBowled || 0) % 6}</span>
                <span className="block text-xs text-[var(--muted-foreground)] uppercase">Overs</span>
              </div>
              <div className="p-1.5 rounded bg-[var(--card)] border border-[var(--border)]">
                <span className="text-xs font-black text-blue-600">{economyRate(currentBowler?.runs || 0, currentBowler?.ballsBowled || 0).toFixed(2)}</span>
                <span className="block text-xs text-[var(--muted-foreground)] uppercase">Economy</span>
              </div>
              <div className="p-1.5 rounded bg-[var(--card)] border border-[var(--border)]">
                <span className="text-xs font-black text-emerald-600">{currentBowler?.maidens || 0}</span>
                <span className="block text-xs text-[var(--muted-foreground)] uppercase">Maidens</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── DEEP BATTER METRICS DRILL-DOWN ── */}
      <div className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <span className="text-xs sm:text-xs font-bold uppercase tracking-wider text-emerald-600">
              Batting Style &amp; Production Matrix
            </span>
            <h3 className="text-sm sm:text-base font-black text-[var(--foreground)]">
              {cleanPlayerName(selectedBatter?.name)}
            </h3>
          </div>

          {/* Player select dropdown */}
          {allBatters.length > 1 && (
            <select
              value={selectedBatterName}
              onChange={(e) => setSelectedBatterName(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-[var(--muted)] border border-[var(--border)] text-xs font-bold text-[var(--foreground)] focus:outline-none focus:border-emerald-500 min-h-[38px]"
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 text-center num-font">
          <div className="p-3 rounded-xl bg-[var(--muted)]/50 border border-[var(--border)] space-y-1">
            <span className="text-lg sm:text-2xl font-black text-[var(--foreground)]">{controlPct.toFixed(0)}%</span>
            <span className="block text-xs font-extrabold uppercase text-[var(--muted-foreground)] tracking-wide">
              Control Pct
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[var(--muted)]/50 border border-[var(--border)] space-y-1">
            <span className="text-lg sm:text-2xl font-black text-amber-500">{dotPct.toFixed(0)}%</span>
            <span className="block text-xs font-extrabold uppercase text-[var(--muted-foreground)] tracking-wide">
              Dot Ball Pct
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[var(--muted)]/50 border border-[var(--border)] space-y-1">
            <span className="text-lg sm:text-2xl font-black text-blue-500">{boundaryPct.toFixed(0)}%</span>
            <span className="block text-xs font-extrabold uppercase text-[var(--muted-foreground)] tracking-wide">
              Boundaries ({boundaryRuns}r)
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[var(--muted)]/50 border border-[var(--border)] space-y-1">
            <span className="text-lg sm:text-2xl font-black text-purple-500">
              {batterRuns > 0 ? ((runningRuns / batterRuns) * 100).toFixed(0) : '0'}%
            </span>
            <span className="block text-xs font-extrabold uppercase text-[var(--muted-foreground)] tracking-wide">
              Running ({runningRuns}r)
            </span>
          </div>
        </div>

        {/* Visual Progress Bars */}
        <div className="space-y-2 pt-2 border-t border-[var(--border)]">
          <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-1 text-xs font-bold">
            <span className="text-[var(--muted-foreground)] shrink-0">Scoring Distribution:</span>
            <span className="num-font text-[var(--foreground)] break-words-safe">
              Boundaries: {boundaryRuns}r ({batterFours}x4, {batterSixes}x6) • Running: {runningRuns}r
            </span>
          </div>
          <div className="w-full h-3 rounded-full bg-[var(--muted)] overflow-hidden flex">
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
        <div className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] space-y-3 shadow-xs">
          <span className="text-xs sm:text-xs font-bold uppercase tracking-wider text-emerald-600">
            Head-to-Head vs Bowlers (This Match)
          </span>

          <div className="overflow-x-auto table-scroll-container">
            <table className="w-full min-w-[340px] text-xs text-left">
              <thead className="bg-[var(--muted)]/60 text-[var(--muted-foreground)] font-bold uppercase border-b border-[var(--border)]">
                <tr>
                  <th className="py-2 px-3">Opponent Bowler</th>
                  <th className="py-2 px-3 text-right">Runs Scored</th>
                  <th className="py-2 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {Object.entries(selectedBatter.runsVsBowler || {}).map(([bName, runs], i) => (
                  <tr key={i} className="hover:bg-[var(--muted)]/30">
                    <td className="py-2 px-3 font-extrabold text-[var(--foreground)]">{cleanPlayerName(bName)}</td>
                    <td className="py-2 px-3 text-right font-black num-font text-emerald-600">{Number(runs)} runs</td>
                    <td className="py-2 px-3 text-right text-[var(--muted-foreground)]">
                      {selectedBatter.dismissalText?.includes(bName) ? (
                        <span className="text-red-500 font-bold">Dismissed by {cleanPlayerName(bName)}</span>
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
