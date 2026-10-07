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
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Reversible Navigation Bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center font-semibold hover:text-[var(--foreground)] active:scale-95 transition-transform gap-1.5 text-xs min-h-[38px] p-1"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        {ongoingMatch && (
          <Link
            href={`/matches/score/${ongoingMatch.id}`}
            className="flex items-center bg-emerald-600 hover:bg-emerald-500 font-bold shadow-xs gap-1.5 py-2 rounded-xl text-xs min-h-[36px] px-3"
          >
            <Play className="fill-current w-3.5 h-3.5" />
            <span>Return to Live Match</span>
          </Link>
        )}
      </div>

      {/* Header */}
      <div>
        <h1 className="font-black tracking-tight flex items-center text-2xl gap-2">
          <BarChart2 className="text-emerald-600 w-6 h-6" />
          <span>Advanced Cricket Analytics</span>
        </h1>
        <p className="text-xs">
          Batting intent classification, bowler discipline metrics &amp; head-to-head match-up engine
        </p>
      </div>

      {allBatters.size === 0 ? (
        <div className="bg-[var(--card)] border border-[var(--border)] border-dashed text-center rounded-2xl p-12 space-y-2">
          <BarChart2 className="opacity-50 text-[var(--muted-foreground)] mx-auto w-8 h-8" />
          <h3 className="font-bold text-base">No Analytics Data Available</h3>
          <p className="text-xs">
            Score matches to automatically generate rich batsman profiles and head-to-head statistics.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── BATSMAN PROFILE & INTENT ENGINE ── */}
          <div className="bg-[var(--card)] border border-[var(--border)] shadow-xs p-6 rounded-2xl space-y-5">
            <div className="flex justify-between flex-wrap items-center gap-3">
              <div>
                <span className="uppercase font-bold tracking-wider text-emerald-600">
                  Batting Analytics
                </span>
                <h3 className="font-black text-lg">{selectedPlayerName || 'Select Batter'}</h3>
              </div>

              <select
                value={selectedPlayerName}
                onChange={(e) => setSelectedPlayerName(e.target.value)}
                className="bg-[var(--muted)] border border-[var(--border)] font-bold p-2 rounded-xl min-h-[40px] text-xs"
              >
                {Array.from(allBatters).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {/* Metrics Strip */}
            <div className="grid num-font grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-3">
              <div className="bg-[var(--muted)]/50 border border-[var(--border)] p-3.5 rounded-xl">
                <span className="font-medium text-xs">Career Runs</span>
                <p className="font-black text-2xl mt-0.5">{totalRuns}</p>
                <span className="font-medium text-[var(--muted-foreground)]">({totalBalls} balls)</span>
              </div>

              <div className="bg-[var(--muted)]/50 border border-[var(--border)] p-3.5 rounded-xl">
                <span className="font-medium text-xs">Strike Rate</span>
                <p className="font-black text-2xl mt-0.5">{overallSr.toFixed(1)}</p>
                <span className="font-medium text-[var(--muted-foreground)]">runs / 100 balls</span>
              </div>

              <div className="bg-[var(--muted)]/50 border border-[var(--border)] p-3.5 rounded-xl">
                <div className="flex items-center gap-1.5">
                  <img
                    src="/assets/illustrations/boundary_percentage.png"
                    alt="Boundaries"
                    className="object-contain shrink-0 w-4 h-4"
                  />
                  <span className="font-medium text-xs">Boundaries</span>
                </div>
                <p className="font-black text-2xl mt-0.5">{totalFours + totalSixes}</p>
                <span className="font-medium truncate block text-[var(--muted-foreground)]">
                  {totalFours}x4 • {totalSixes}x6
                </span>
              </div>

              <div className="bg-[var(--muted)]/50 border border-[var(--border)] p-3.5 rounded-xl">
                <span className="font-medium text-xs">Shot Control</span>
                <p className="font-black text-2xl mt-0.5">{shotControl.toFixed(0)}%</p>
                <span className="font-medium text-[var(--muted-foreground)]">
                  {totalDots} dot balls
                </span>
              </div>
            </div>

            {/* Intent Badge */}
            <div className="bg-gradient-to-r from-emerald-500/15 via-emerald-500/5 to-transparent border border-emerald-500/30 flex items-center justify-between relative overflow-hidden p-4 rounded-xl gap-3">
              <div className="flex items-center relative z-10 gap-3 min-w-0">
                <div className="bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 rounded-xl p-1.5 w-12 h-12">
                  <img
                    src="/assets/illustrations/batting_intent.png"
                    alt="Batting Intent"
                    className="object-contain drop-shadow w-full h-full"
                  />
                </div>
                <div className="min-w-0">
                  <span className="font-medium block text-xs">Batting Style Classification</span>
                  <h4 className="font-black dark:text-emerald-400 truncate text-base mt-0.5">
                    {battingIntent} Intent
                  </h4>
                </div>
              </div>
              <span className="hidden sm:block relative z-10 text-xs max-w-xs">
                Evaluated from strike-rate ({overallSr.toFixed(0)}), boundary conversion ({boundaryRunsPct.toFixed(0)}%), and control ({shotControl.toFixed(0)}%).
              </span>
            </div>
          </div>

          {/* ── HEAD-TO-HEAD MATCHUP ENGINE ── */}
          <div className="bg-[var(--card)] border border-[var(--border)] shadow-xs p-6 rounded-2xl space-y-5">
            <div className="space-y-1">
              <span className="uppercase font-bold tracking-wider text-blue-600">
                Head-to-Head Encounter
              </span>
              <h3 className="font-black text-lg">Batter vs Bowler Matchup</h3>
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-4">
              <div className="space-y-1">
                <label className="font-semibold text-xs">Select Batter</label>
                <select
                  value={selectedPlayerName}
                  onChange={(e) => setSelectedPlayerName(e.target.value)}
                  className="bg-[var(--muted)] border border-[var(--border)] font-bold p-card rounded-xl min-h-[40px] w-full text-xs"
                >
                  {Array.from(allBatters).map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-xs">Select Bowler</label>
                <select
                  value={selectedBowlerName}
                  onChange={(e) => setSelectedBowlerName(e.target.value)}
                  className="bg-[var(--muted)] border border-[var(--border)] font-bold p-card rounded-xl min-h-[40px] w-full text-xs"
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
            <div className="bg-[var(--muted)]/40 border border-[var(--border)] flex items-center justify-between flex-wrap p-5 rounded-2xl gap-4 text-left">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex items-center -space-x-2 shrink-0">
                  <div className="bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center bg-slate-900 rounded-xl w-10 h-10 p-1">
                    <img
                      src="/assets/illustrations/strike_batsman.png"
                      alt="Batter"
                      className="object-contain w-full h-full"
                    />
                  </div>
                  <div className="bg-blue-500/20 border border-blue-500/40 flex items-center justify-center bg-slate-900 rounded-xl w-10 h-10 p-1">
                    <img
                      src="/assets/illustrations/opening_bowler.png"
                      alt="Bowler"
                      className="object-contain w-full h-full"
                    />
                  </div>
                </div>
                <div className="min-w-0 text-left">
                  <h4 className="font-extrabold truncate text-base">
                    {selectedPlayerName} <span className="text-xs">vs</span> {selectedBowlerName}
                  </h4>
                  <p className="truncate text-xs mt-0.5">
                    Across all recorded innings
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-around num-font border-t sm:border-t-0 border-[var(--border)] gap-4 pt-0">
                <div className="text-right">
                  <span className="text-xs">Runs</span>
                  <div className="font-black text-2xl">{h2hRuns}</div>
                </div>

                <div className="bg-[var(--border)] w-px h-7" />

                <div className="text-right">
                  <span className="text-xs">Balls</span>
                  <div className="font-black text-2xl">{h2hBalls}</div>
                </div>

                <div className="bg-[var(--border)] w-px h-7" />

                <div className="text-right">
                  <span className="text-xs">SR</span>
                  <div className="font-black text-2xl">
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
