'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BarChart2,
  TrendingUp,
  User,
  Shield,
  Zap,
  Target,
  Clock,
  Award,
  ArrowLeft,
  Play,
} from 'lucide-react';
import { MatchRepository } from '@/infrastructure/storage/MatchRepository';
import { MatchScorecard, Player, Bowler } from '@/domain/cricket/types';
import {
  strikeRate,
  economyRate,
  cleanPlayerName,
} from '@/domain/cricket/formatters';
import { DotBallAnalytics } from '@/domain/cricket/analytics/DotBallAnalytics';

export default function AnalyticsPage() {
  const router = useRouter();
  const [matches, setMatches] = useState<MatchScorecard[]>([]);
  const [selectedPlayerName, setSelectedPlayerName] = useState<string>('');
  const [selectedBowlerName, setSelectedBowlerName] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const all = await MatchRepository.getAllMatches();
      setMatches(all);

      // Default selections
      if (all.length > 0) {
        const first = all[0];
        if (first.firstInnings?.players?.[0]) {
          setSelectedPlayerName(cleanPlayerName(first.firstInnings.players[0].name));
        }
        if (first.firstInnings?.bowlers?.[0]) {
          setSelectedBowlerName(cleanPlayerName(first.firstInnings.bowlers[0].name));
        }
      }
      setLoading(false);
    }
    load();
  }, []);

  // Aggregate all unique batters and bowlers
  const allBatters = new Set<string>();
  const allBowlers = new Set<string>();

  for (const m of matches) {
    m.firstInnings?.players?.forEach((p) => allBatters.add(cleanPlayerName(p.name)));
    m.secondInnings?.players?.forEach((p) => allBatters.add(cleanPlayerName(p.name)));
    m.firstInnings?.bowlers?.forEach((b) => allBowlers.add(cleanPlayerName(b.name)));
    m.secondInnings?.bowlers?.forEach((b) => allBowlers.add(cleanPlayerName(b.name)));
  }

  // Aggregate Selected Batter Stats
  let totalRuns = 0;
  let totalBalls = 0;
  let totalFours = 0;
  let totalSixes = 0;
  let totalDots = 0;
  let matchesBatted = 0;

  for (const m of matches) {
    const findAndSum = (players?: Player[]) => {
      const p = players?.find((item) => cleanPlayerName(item.name) === selectedPlayerName);
      if (p && (p.runs > 0 || p.balls > 0)) {
        totalRuns += p.runs;
        totalBalls += p.balls;
        totalFours += p.fours;
        totalSixes += p.sixes;
        totalDots += p.dotBalls || 0;
        matchesBatted += 1;
      }
    };
    findAndSum(m.firstInnings?.players);
    findAndSum(m.secondInnings?.players);
  }

  const overallSr = strikeRate(totalRuns, totalBalls);
  const boundaryRunsPct = totalRuns > 0 ? ((totalFours * 4 + totalSixes * 6) / totalRuns) * 100 : 0;
  const shotControl = totalBalls > 0 ? Math.max(0, 100 - (totalDots / totalBalls) * 100) : 100;
  const battingIntent = DotBallAnalytics.classifyBattingIntent(boundaryRunsPct, shotControl, overallSr, totalBalls);

  // Head-to-Head: Selected Batter vs Selected Bowler
  let h2hBalls = 0;
  let h2hRuns = 0;

  for (const m of matches) {
    const checkH2H = (players?: Player[]) => {
      const p = players?.find((item) => cleanPlayerName(item.name) === selectedPlayerName);
      if (p) {
        for (const [bName, ballsFaced] of Object.entries(p.bowlersFaced || {})) {
          if (cleanPlayerName(bName) === selectedBowlerName) {
            h2hBalls += ballsFaced;
            h2hRuns += p.runsVsBowler?.[bName] || 0;
          }
        }
      }
    };
    checkH2H(m.firstInnings?.players);
    checkH2H(m.secondInnings?.players);
  }

  const ongoingMatch = matches.find((m) => m.status === 'ONGOING');

  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
      {/* Top Reversible Navigation Bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] min-h-[38px] p-1 active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        {ongoingMatch && (
          <Link
            href={`/matches/score/${ongoingMatch.id}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs min-h-[36px]"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Return to Live Match</span>
          </Link>
        )}
      </div>

      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
          <BarChart2 className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" />
          <span>Advanced Cricket Analytics</span>
        </h1>
        <p className="text-[11px] sm:text-xs text-[var(--muted-foreground)]">
          Batting intent classification, bowler discipline metrics &amp; head-to-head match-up engine
        </p>
      </div>

      {allBatters.size === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-[var(--card)] border border-[var(--border)] border-dashed space-y-2">
          <BarChart2 className="w-8 h-8 text-[var(--muted-foreground)] mx-auto opacity-50" />
          <h3 className="font-bold text-base">No Analytics Data Available</h3>
          <p className="text-xs text-[var(--muted-foreground)]">
            Score matches to automatically generate rich batsman profiles and head-to-head statistics.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── BATSMAN PROFILE & INTENT ENGINE ── */}
          <div className="p-3.5 sm:p-6 rounded-xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] space-y-4 sm:space-y-5 shadow-xs">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">
                  Batting Analytics
                </span>
                <h3 className="text-base sm:text-lg font-black">{selectedPlayerName || 'Select Batter'}</h3>
              </div>

              <select
                value={selectedPlayerName}
                onChange={(e) => setSelectedPlayerName(e.target.value)}
                className="w-full sm:w-auto p-2 sm:p-2.5 rounded-xl bg-[var(--muted)] border border-[var(--border)] text-xs font-bold min-h-[40px]"
              >
                {Array.from(allBatters).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {/* Metrics Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 num-font">
              <div className="p-2.5 sm:p-3.5 rounded-xl bg-[var(--muted)]/50 border border-[var(--border)]">
                <span className="text-[11px] sm:text-xs text-[var(--muted-foreground)] font-medium">Career Runs</span>
                <p className="text-xl sm:text-2xl font-black text-emerald-600 mt-0.5">{totalRuns}</p>
                <span className="text-[10px] text-[var(--muted-foreground)] font-medium">({totalBalls} balls)</span>
              </div>

              <div className="p-2.5 sm:p-3.5 rounded-xl bg-[var(--muted)]/50 border border-[var(--border)]">
                <span className="text-[11px] sm:text-xs text-[var(--muted-foreground)] font-medium">Strike Rate</span>
                <p className="text-xl sm:text-2xl font-black text-[var(--foreground)] mt-0.5">{overallSr.toFixed(1)}</p>
                <span className="text-[10px] text-[var(--muted-foreground)] font-medium">runs / 100 balls</span>
              </div>

              <div className="p-2.5 sm:p-3.5 rounded-xl bg-[var(--muted)]/50 border border-[var(--border)]">
                <div className="flex items-center gap-1.5">
                  <img
                    src="/assets/illustrations/boundary_percentage.png"
                    alt="Boundaries"
                    className="w-4 h-4 object-contain shrink-0"
                  />
                  <span className="text-[11px] sm:text-xs text-[var(--muted-foreground)] font-medium">Boundaries</span>
                </div>
                <p className="text-xl sm:text-2xl font-black text-blue-600 mt-0.5">{totalFours + totalSixes}</p>
                <span className="text-[10px] text-[var(--muted-foreground)] font-medium truncate block">
                  {totalFours}x4 • {totalSixes}x6
                </span>
              </div>

              <div className="p-2.5 sm:p-3.5 rounded-xl bg-[var(--muted)]/50 border border-[var(--border)]">
                <span className="text-[11px] sm:text-xs text-[var(--muted-foreground)] font-medium">Shot Control</span>
                <p className="text-xl sm:text-2xl font-black text-purple-600 mt-0.5">{shotControl.toFixed(0)}%</p>
                <span className="text-[10px] text-[var(--muted-foreground)] font-medium">
                  {totalDots} dot balls
                </span>
              </div>
            </div>

            {/* Intent Badge */}
            <div className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-r from-emerald-500/15 via-emerald-500/5 to-transparent border border-emerald-500/30 flex items-center justify-between relative overflow-hidden gap-3">
              <div className="flex items-center gap-3 sm:gap-3.5 relative z-10 min-w-0">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center p-1.5 shrink-0">
                  <img
                    src="/assets/illustrations/batting_intent.png"
                    alt="Batting Intent"
                    className="w-full h-full object-contain drop-shadow"
                  />
                </div>
                <div className="min-w-0">
                  <span className="text-[11px] sm:text-xs text-[var(--muted-foreground)] font-medium block">Batting Style Classification</span>
                  <h4 className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
                    {battingIntent} Intent
                  </h4>
                </div>
              </div>
              <span className="text-xs text-[var(--muted-foreground)] max-w-xs text-right hidden sm:block relative z-10">
                Evaluated from strike-rate ({overallSr.toFixed(0)}), boundary conversion ({boundaryRunsPct.toFixed(0)}%), and control ({shotControl.toFixed(0)}%).
              </span>
            </div>
          </div>

          {/* ── HEAD-TO-HEAD MATCHUP ENGINE ── */}
          <div className="p-3.5 sm:p-6 rounded-xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] space-y-4 sm:space-y-5 shadow-xs">
            <div className="space-y-0.5 sm:space-y-1">
              <span className="text-[10px] uppercase font-bold text-blue-600 tracking-wider">
                Head-to-Head Encounter
              </span>
              <h3 className="text-base sm:text-lg font-black">Batter vs Bowler Matchup</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--muted-foreground)]">Select Batter</label>
                <select
                  value={selectedPlayerName}
                  onChange={(e) => setSelectedPlayerName(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-[var(--muted)] border border-[var(--border)] text-xs font-bold min-h-[40px]"
                >
                  {Array.from(allBatters).map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--muted-foreground)]">Select Bowler</label>
                <select
                  value={selectedBowlerName}
                  onChange={(e) => setSelectedBowlerName(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-[var(--muted)] border border-[var(--border)] text-xs font-bold min-h-[40px]"
                >
                  {Array.from(allBowlers).map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* H2H Result Box */}
            <div className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl bg-[var(--muted)]/40 border border-[var(--border)] flex flex-col sm:flex-row items-center justify-between gap-3.5 sm:gap-4 text-center sm:text-left">
              <div className="flex items-center gap-3 sm:gap-3.5 min-w-0 w-full sm:w-auto">
                <div className="flex items-center -space-x-2 shrink-0">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center p-1 bg-slate-900">
                    <img
                      src="/assets/illustrations/strike_batsman.png"
                      alt="Batter"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center p-1 bg-slate-900">
                    <img
                      src="/assets/illustrations/opening_bowler.png"
                      alt="Bowler"
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
                <div className="min-w-0 text-left">
                  <h4 className="font-extrabold text-sm sm:text-base truncate">
                    {selectedPlayerName} <span className="text-xs text-[var(--muted-foreground)]">vs</span> {selectedBowlerName}
                  </h4>
                  <p className="text-[11px] sm:text-xs text-[var(--muted-foreground)] mt-0.5 truncate">
                    Across all recorded innings
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-around w-full sm:w-auto gap-2 sm:gap-4 num-font pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--border)]">
                <div className="text-center sm:text-right">
                  <span className="text-[10px] sm:text-xs text-[var(--muted-foreground)]">Runs</span>
                  <div className="text-xl sm:text-2xl font-black text-emerald-600">{h2hRuns}</div>
                </div>

                <div className="h-7 w-px bg-[var(--border)]" />

                <div className="text-center sm:text-right">
                  <span className="text-[10px] sm:text-xs text-[var(--muted-foreground)]">Balls</span>
                  <div className="text-xl sm:text-2xl font-black text-[var(--foreground)]">{h2hBalls}</div>
                </div>

                <div className="h-7 w-px bg-[var(--border)]" />

                <div className="text-center sm:text-right">
                  <span className="text-[10px] sm:text-xs text-[var(--muted-foreground)]">SR</span>
                  <div className="text-xl sm:text-2xl font-black text-blue-600">
                    {strikeRate(h2hRuns, h2hBalls).toFixed(1)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
