'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import confetti from 'canvas-confetti';
import {
  Trophy,
  Award,
  FileText,
  Home,
  CheckCircle,
  Share2,
  TrendingUp,
} from 'lucide-react';
import { MatchRepository } from '@/infrastructure/storage/MatchRepository';
import { MatchScorecard, Player, Bowler } from '@/domain/cricket/types';
import { cleanPlayerName, strikeRate, economyRate } from '@/domain/cricket/formatters';
import { ManOfTheMatchEngine } from '@/domain/cricket/analytics/ManOfTheMatchEngine';
import { ScorecardPdfGenerator } from '@/features/scoring/pdf/ScorecardPdfGenerator';
import { BatsmanProfileModal } from '@/components/modals/BatsmanProfileModal';
import { BowlerProfileModal } from '@/components/modals/BowlerProfileModal';
import { TeamBadgeIcon } from '@/components/common/TeamBadgeIcon';

export default function MatchSummaryPage() {
  const params = useParams();
  const router = useRouter();
  const matchId = params.matchId as string;

  const [match, setMatch] = useState<MatchScorecard | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedBatsman, setSelectedBatsman] = useState<Player | null>(null);
  const [selectedBowler, setSelectedBowler] = useState<Bowler | null>(null);

  useEffect(() => {
    async function load() {
      if (!matchId) return;
      const data = await MatchRepository.getMatch(matchId);
      if (data) {
        setMatch(data);

        // Confetti celebration
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      }
      setLoading(false);
    }
    load();
  }, [matchId]);

  if (loading || !match) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Find Top Scorer
  let topScorer: { player: Player; team: string } | null = null;
  const allBatters: { player: Player; team: string }[] = [];
  if (match.firstInnings) {
    match.firstInnings.players.forEach((p) => allBatters.push({ player: p, team: match.firstInnings!.team }));
  }
  if (match.secondInnings) {
    match.secondInnings.players.forEach((p) => allBatters.push({ player: p, team: match.secondInnings!.team }));
  }
  allBatters.sort((a, b) => b.player.runs - a.player.runs);
  if (allBatters.length > 0 && allBatters[0].player.runs > 0) {
    topScorer = allBatters[0];
  }

  // Find Top Bowler
  let topBowler: { bowler: Bowler; team: string } | null = null;
  const allBowlers: { bowler: Bowler; team: string }[] = [];
  if (match.firstInnings) {
    match.firstInnings.bowlers.forEach((b) => allBowlers.push({ bowler: b, team: match.firstInnings!.bowlingTeam }));
  }
  if (match.secondInnings) {
    match.secondInnings.bowlers.forEach((b) => allBowlers.push({ bowler: b, team: match.secondInnings!.bowlingTeam }));
  }
  allBowlers.sort((a, b) => {
    if (b.bowler.wickets !== a.bowler.wickets) return b.bowler.wickets - a.bowler.wickets;
    return a.bowler.runs - b.bowler.runs;
  });
  if (allBowlers.length > 0 && (allBowlers[0].bowler.wickets > 0 || allBowlers[0].bowler.ballsBowled > 0)) {
    topBowler = allBowlers[0];
  }

  const mom = ManOfTheMatchEngine.calculateForMatch(match.firstInnings, match.secondInnings);
  const isTie = match.winner === 'Both Teams' || !match.winner;

  return (
    <div className="max-w-2xl mx-auto space-y-4 sm:space-y-6 text-center">
      {/* Trophy Circle */}
      <div className="relative inline-flex items-center justify-center">
        <div className="w-18 h-18 sm:w-22 sm:h-22 rounded-full bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-300 p-1 shadow-2xl shadow-amber-500/30 flex items-center justify-center animate-bounce">
          <Trophy className="w-9 h-9 sm:w-11 sm:h-11 text-slate-950" />
        </div>
      </div>

      {/* Winner Title */}
      <div className="space-y-1">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight text-[var(--foreground)]">
          {isTie ? 'Match Tied!' : 'Congratulations!'}
        </h2>
        {!isTie && (
          <p className="text-lg sm:text-xl md:text-2xl font-black text-emerald-600 dark:text-emerald-400">
            {match.winner}
          </p>
        )}
        <p className="text-xs sm:text-sm font-semibold text-[var(--muted-foreground)]">
          {match.result || 'Match Completed'}
        </p>
      </div>

      {/* Innings Score Comparison Card */}
      <div className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-xs grid grid-cols-2 gap-2 sm:gap-4">
        {match.firstInnings && (
          <div className="space-y-1">
            <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-[var(--muted-foreground)]">
              <TeamBadgeIcon type={match.firstInnings.team === match.teamA ? 'home' : 'away'} size="xs" />
              <span className="truncate max-w-[120px] sm:max-w-none">{match.firstInnings.team}</span>
            </div>
            {match.advancedSettings?.matchType === 'CHASE' && (
              <span className="inline-block px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 text-[9px] sm:text-[10px] font-black uppercase tracking-wider">
                Target: {match.targetScore}
              </span>
            )}
            <div className="text-xl sm:text-2xl font-black num-font">
              {match.firstInnings.totalRuns}/{match.firstInnings.totalWickets}
            </div>
            <span className="text-[11px] sm:text-xs text-[var(--muted-foreground)]">({match.firstInnings.oversString} ov)</span>
          </div>
        )}

        {match.secondInnings && (
          <div className="space-y-1">
            <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-[var(--muted-foreground)]">
              <TeamBadgeIcon type={match.secondInnings.team === match.teamA ? 'home' : 'away'} size="xs" />
              <span className="truncate max-w-[120px] sm:max-w-none">{match.secondInnings.team}</span>
            </div>
            {match.advancedSettings?.matchType === 'CHASE' && (
              <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 text-[9px] sm:text-[10px] font-black uppercase tracking-wider">
                Chasing
              </span>
            )}
            <div className="text-xl sm:text-2xl font-black num-font">
              {match.secondInnings.totalRuns}/{match.secondInnings.totalWickets}
            </div>
            <span className="text-[11px] sm:text-xs text-[var(--muted-foreground)]">({match.secondInnings.oversString} ov)</span>
          </div>
        )}
      </div>

      {/* ── KEY MATCH PERFORMERS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-left">
        {topScorer && (
          <div
            onClick={() => setSelectedBatsman(topScorer.player)}
            className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-xs space-y-1.5 sm:space-y-2 cursor-pointer hover:border-emerald-500/50 hover:bg-[var(--muted)]/40 active:scale-[0.99] transition-all group"
            title="Click to view batsman profile"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <img
                  src="/assets/illustrations/st_bat.png"
                  alt="Top Batter"
                  className="w-4 h-4 sm:w-5 sm:h-5 object-contain"
                />
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Top Batter
                </span>
              </div>
              <span className="text-[10px] text-emerald-500 opacity-70 group-hover:opacity-100 transition-opacity font-bold">
                Profile ↗
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h4 className="font-extrabold text-sm sm:text-base group-hover:text-emerald-400 transition-colors truncate">
                  {cleanPlayerName(topScorer.player.name)}
                </h4>
                <span className="text-[11px] sm:text-xs text-[var(--muted-foreground)] block truncate">{topScorer.team}</span>
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg sm:text-xl font-black num-font text-emerald-600">{topScorer.player.runs}</div>
                <span className="text-[11px] sm:text-xs text-[var(--muted-foreground)] block">
                  {topScorer.player.balls}b ({topScorer.player.fours}x4, {topScorer.player.sixes}x6)
                </span>
              </div>
            </div>
          </div>
        )}

        {topBowler && (
          <div
            onClick={() => setSelectedBowler(topBowler.bowler)}
            className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-xs space-y-1.5 sm:space-y-2 cursor-pointer hover:border-blue-500/50 hover:bg-[var(--muted)]/40 active:scale-[0.99] transition-all group"
            title="Click to view bowler profile"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <img
                  src="/assets/illustrations/opening_bowler.png"
                  alt="Top Bowler"
                  className="w-4 h-4 sm:w-5 sm:h-5 object-contain"
                />
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  Top Bowler
                </span>
              </div>
              <span className="text-[10px] text-blue-500 opacity-70 group-hover:opacity-100 transition-opacity font-bold">
                Profile ↗
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h4 className="font-extrabold text-sm sm:text-base group-hover:text-blue-400 transition-colors truncate">
                  {cleanPlayerName(topBowler.bowler.name)}
                </h4>
                <span className="text-[11px] sm:text-xs text-[var(--muted-foreground)] block truncate">{topBowler.team}</span>
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg sm:text-xl font-black num-font text-blue-600">
                  {topBowler.bowler.wickets}-{topBowler.bowler.runs}
                </div>
                <span className="text-[11px] sm:text-xs text-[var(--muted-foreground)] block">
                  {Math.floor(topBowler.bowler.ballsBowled / 6)}.{topBowler.bowler.ballsBowled % 6} ov
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Man of the Match Hero Card */}
      {mom && (
        <div className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border border-amber-500/30 flex items-center justify-between text-left relative overflow-hidden gap-3">
          <div className="flex items-center gap-3 sm:gap-4 relative z-10 min-w-0">
            <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center p-1 shadow-lg shadow-amber-500/10 shrink-0">
              <img
                src="/assets/illustrations/man_of_match.png"
                alt="Man of the Match"
                className="w-full h-full object-contain drop-shadow"
              />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] sm:text-xs font-bold uppercase text-amber-600 dark:text-amber-400 tracking-wider">
                Man of the Match
              </span>
              <h3 className="font-black text-sm sm:text-lg truncate">{mom.name} ({mom.role})</h3>
              <p className="text-[11px] sm:text-xs text-[var(--muted-foreground)] truncate">
                {mom.balls > 0 ? `${mom.runs} (${mom.balls}b)` : ''}
                {mom.balls > 0 && mom.ballsBowled > 0 ? ' • ' : ''}
                {mom.ballsBowled > 0 ? `${mom.wickets}/${mom.bowlingRuns} (${(mom.ballsBowled / 6).toFixed(1)} ov)` : ''}
              </p>
            </div>
          </div>
          <div className="text-right relative z-10 shrink-0">
            <span className="text-[10px] sm:text-xs text-[var(--muted-foreground)]">Points</span>
            <div className="text-xl sm:text-2xl font-black text-amber-500 num-font">{mom.totalPoints}</div>
          </div>
        </div>
      )}

      {/* Navigation & Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 pt-2 sm:pt-4">
        <Link
          href={`/matches/center/${match.id}`}
          className="flex-1 py-3 sm:py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm min-h-[46px] shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
        >
          <FileText className="w-4 h-4" />
          <span>View Full Scoreboard</span>
        </Link>

        <button
          onClick={() => ScorecardPdfGenerator.downloadPdf(match)}
          className="flex-1 py-3 sm:py-3.5 rounded-xl bg-[var(--card)] hover:bg-[var(--muted)] border border-[var(--border)] font-bold text-xs sm:text-sm min-h-[46px] flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
        >
          <FileText className="w-4 h-4 text-emerald-600" />
          <span>Download PDF Scorecard</span>
        </button>

        <Link
          href="/"
          className="py-3 sm:py-3.5 px-5 rounded-xl bg-[var(--muted)] hover:bg-[var(--border)] font-bold text-xs sm:text-sm min-h-[46px] flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
        >
          <Home className="w-4 h-4" />
          <span>Home</span>
        </Link>
      </div>

      {/* ── BATSMAN & BOWLER PROFILE MODALS ── */}
      <BatsmanProfileModal
        player={selectedBatsman}
        isOpen={!!selectedBatsman}
        onClose={() => setSelectedBatsman(null)}
        partnerships={match.firstInnings?.pastPartnerships}
        fallOfWickets={match.firstInnings?.fallOfWickets}
      />

      <BowlerProfileModal
        bowler={selectedBowler}
        isOpen={!!selectedBowler}
        onClose={() => setSelectedBowler(null)}
        fallOfWickets={match.firstInnings?.fallOfWickets}
        advancedSettings={match.advancedSettings}
      />
    </div>
  );
}
