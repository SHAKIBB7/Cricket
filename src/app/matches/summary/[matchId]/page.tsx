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
        <div className="border-4 border-emerald-600 border-t-transparent animate-spin rounded-full w-10 h-10" />
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
    <div className="max-w-3xl mx-auto text-center flex flex-col gap-section py-section px-screen-x w-full">
      {/* Trophy Circle */}
      <div className="relative inline-flex items-center justify-center">
        <div className="bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-300 shadow-2xl shadow-amber-500/30 flex items-center justify-center animate-bounce rounded-full w-22 h-22 p-1">
          <Trophy className="text-slate-950 w-11 h-11" />
        </div>
      </div>

      {/* Winner Title */}
      <div className="space-y-1">
        <h2 className="font-black tracking-tight text-4xl">
          {isTie ? 'Match Tied!' : 'Congratulations!'}
        </h2>
        {!isTie && (
          <p className="font-black dark:text-emerald-400 text-2xl">
            {match.winner}
          </p>
        )}
        <p className="font-semibold text-sm">
          {match.result || 'Match Completed'}
        </p>
      </div>

      {/* Innings Score Comparison Card */}
      <div className="bg-[var(--card)] border border-[var(--border)] shadow-xs grid p-card rounded-card grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-card-gap">
        {match.firstInnings && (
          <div className="flex flex-col gap-1 items-center">
            <div className="flex items-center justify-center font-semibold gap-1.5 text-xs">
              <TeamBadgeIcon type={match.firstInnings.team === match.teamA ? 'home' : 'away'} size="xs" />
              <span className="truncate max-w-none">{match.firstInnings.team}</span>
            </div>
            {match.advancedSettings?.matchType === 'CHASE' && (
              <span className="inline-block bg-amber-500/15 font-black uppercase tracking-wider py-0.5 rounded-full text-xs px-2">
                Target: {match.targetScore}
              </span>
            )}
            <div className="font-black num-font text-2xl">
              {match.firstInnings.totalRuns}/{match.firstInnings.totalWickets}
            </div>
            <span className="text-xs">({match.firstInnings.oversString} ov)</span>
          </div>
        )}

        {match.secondInnings && (
          <div className="flex flex-col gap-1 items-center">
            <div className="flex items-center justify-center font-semibold gap-1.5 text-xs">
              <TeamBadgeIcon type={match.secondInnings.team === match.teamA ? 'home' : 'away'} size="xs" />
              <span className="truncate max-w-none">{match.secondInnings.team}</span>
            </div>
            {match.advancedSettings?.matchType === 'CHASE' && (
              <span className="inline-block bg-emerald-500/15 font-black uppercase tracking-wider py-0.5 rounded-full text-xs px-2">
                Chasing
              </span>
            )}
            <div className="font-black num-font text-2xl">
              {match.secondInnings.totalRuns}/{match.secondInnings.totalWickets}
            </div>
            <span className="text-xs">({match.secondInnings.oversString} ov)</span>
          </div>
        )}
      </div>

      {/* ── KEY MATCH PERFORMERS ── */}
      <div className="grid text-left grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-card-gap">
        {topScorer && (
          <div
            onClick={() => setSelectedBatsman(topScorer.player)}
            className="bg-[var(--card)] border border-[var(--border)] shadow-xs cursor-pointer hover:border-emerald-500/50 hover:bg-[var(--muted)]/40 active:scale-[0.99] transition-all group p-card rounded-card flex flex-col gap-2"
            title="Click to view batsman profile"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <img
                  src="/assets/illustrations/st_bat.png"
                  alt="Top Batter"
                  className="object-contain w-5 h-5"
                />
                <span className="font-bold uppercase tracking-wider dark:text-emerald-400 text-emerald-600">
                  Top Batter
                </span>
              </div>
              <span className="opacity-70 group-hover:opacity-100 transition-opacity font-bold text-emerald-500">
                Profile ↗
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h4 className="font-extrabold group-hover:text-emerald-400 transition-colors truncate text-base">
                  {cleanPlayerName(topScorer.player.name)}
                </h4>
                <span className="block truncate text-xs">{topScorer.team}</span>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-black num-font text-xl">{topScorer.player.runs}</div>
                <span className="block text-xs">
                  {topScorer.player.balls}b ({topScorer.player.fours}x4, {topScorer.player.sixes}x6)
                </span>
              </div>
            </div>
          </div>
        )}

        {topBowler && (
          <div
            onClick={() => setSelectedBowler(topBowler.bowler)}
            className="bg-[var(--card)] border border-[var(--border)] shadow-xs cursor-pointer hover:border-blue-500/50 hover:bg-[var(--muted)]/40 active:scale-[0.99] transition-all group p-card rounded-card flex flex-col gap-2"
            title="Click to view bowler profile"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <img
                  src="/assets/illustrations/opening_bowler.png"
                  alt="Top Bowler"
                  className="object-contain w-5 h-5"
                />
                <span className="font-bold uppercase tracking-wider dark:text-blue-400 text-blue-600">
                  Top Bowler
                </span>
              </div>
              <span className="opacity-70 group-hover:opacity-100 transition-opacity font-bold text-blue-500">
                Profile ↗
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h4 className="font-extrabold group-hover:text-blue-400 transition-colors truncate text-base">
                  {cleanPlayerName(topBowler.bowler.name)}
                </h4>
                <span className="block truncate text-xs">{topBowler.team}</span>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-black num-font text-xl">
                  {topBowler.bowler.wickets}-{topBowler.bowler.runs}
                </div>
                <span className="block text-xs">
                  {Math.floor(topBowler.bowler.ballsBowled / 6)}.{topBowler.bowler.ballsBowled % 6} ov
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Man of the Match Hero Card */}
      {mom && (
        <div className="bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border border-amber-500/30 flex items-center justify-between relative overflow-hidden p-card rounded-card text-left gap-3">
          <div className="flex items-center relative z-10 min-w-0 gap-4">
            <div className="bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shadow-lg shadow-amber-500/10 shrink-0 rounded-2xl w-14 h-14 p-1">
              <img
                src="/assets/illustrations/man_of_match.png"
                alt="Man of the Match"
                className="object-contain drop-shadow w-full h-full"
              />
            </div>
            <div className="min-w-0">
              <span className="font-bold uppercase dark:text-amber-400 tracking-wider text-xs">
                Man of the Match
              </span>
              <h3 className="font-black truncate text-lg">{mom.name} ({mom.role})</h3>
              <p className="truncate text-xs">
                {mom.balls > 0 ? `${mom.runs} (${mom.balls}b)` : ''}
                {mom.balls > 0 && mom.ballsBowled > 0 ? ' • ' : ''}
                {mom.ballsBowled > 0 ? `${mom.wickets}/${mom.bowlingRuns} (${(mom.ballsBowled / 6).toFixed(1)} ov)` : ''}
              </p>
            </div>
          </div>
          <div className="relative z-10 shrink-0 text-right">
            <span className="text-xs">Points</span>
            <div className="font-black num-font text-2xl">{mom.totalPoints}</div>
          </div>
        </div>
      )}

      {/* Navigation & Action Buttons */}
      <div className="flex flex-wrap gap-3 pt-4">
        <Link
          href={`/matches/center/${match.id}`}
          className="flex-1 bg-emerald-600 hover:bg-emerald-500 font-bold shadow-lg shadow-emerald-600/30 flex items-center justify-center active:scale-[0.99] transition-all py-3 rounded-xl text-sm min-h-btn gap-2"
        >
          <FileText className="w-4 h-4" />
          <span>View Full Scoreboard</span>
        </Link>

        <button
          onClick={() => ScorecardPdfGenerator.downloadPdf(match)}
          className="flex-1 bg-[var(--card)] hover:bg-[var(--muted)] border border-[var(--border)] font-bold flex items-center justify-center active:scale-[0.99] transition-all py-3 rounded-xl min-h-btn text-sm gap-2"
        >
          <FileText className="text-emerald-600 w-4 h-4" />
          <span>Download PDF Scorecard</span>
        </button>

        <Link
          href="/"
          className="bg-[var(--muted)] hover:bg-[var(--border)] font-bold flex items-center justify-center active:scale-[0.99] transition-all py-3 rounded-xl min-h-btn px-5 text-sm gap-2"
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
