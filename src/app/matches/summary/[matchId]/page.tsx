'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
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
import { cleanPlayerName, strikeRate, economyRate, isMatchTie } from '@/domain/cricket/formatters';
import { ManOfTheMatchEngine } from '@/domain/cricket/analytics/ManOfTheMatchEngine';
import { TeamBadgeIcon } from '@/components/common/TeamBadgeIcon';

const BatsmanProfileModal = dynamic(
  () => import('@/components/modals/BatsmanProfileModal').then((mod) => mod.BatsmanProfileModal),
  { ssr: false }
);
const BowlerProfileModal = dynamic(
  () => import('@/components/modals/BowlerProfileModal').then((mod) => mod.BowlerProfileModal),
  { ssr: false }
);

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

        // Confetti celebration (dynamically loaded)
        import('canvas-confetti').then((confettiModule) => {
          const confetti = confettiModule.default || confettiModule;
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 },
          });
        });
      }
      setLoading(false);
    }
    load();
  }, [matchId]);

  const { topScorer, topBowler, mom, isTie } = useMemo(() => {
    if (!match) return { topScorer: null, topBowler: null, mom: null, isTie: false };

    // Find Top Scorer
    let scorer: { player: Player; team: string } | null = null;
    const allBatters: { player: Player; team: string }[] = [];
    if (match.firstInnings) {
      match.firstInnings.players.forEach((p) => allBatters.push({ player: p, team: match.firstInnings!.team }));
    }
    if (match.secondInnings) {
      match.secondInnings.players.forEach((p) => allBatters.push({ player: p, team: match.secondInnings!.team }));
    }
    allBatters.sort((a, b) => b.player.runs - a.player.runs);
    if (allBatters.length > 0 && allBatters[0].player.runs > 0) {
      scorer = allBatters[0];
    }

    // Find Top Bowler
    let bowler: { bowler: Bowler; team: string } | null = null;
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
      bowler = allBowlers[0];
    }

    const momResult = ManOfTheMatchEngine.calculateForMatch(
      match.firstInnings,
      match.secondInnings,
      {
        totalOvers: match.totalOvers,
        winner: match.winner,
        loser: match.loser,
        result: match.result,
        match,
      }
    );
    const tie = isMatchTie(match);

    return { topScorer: scorer, topBowler: bowler, mom: momResult, isTie: tie };
  }, [match]);

  const handleDownloadPdf = async () => {
    if (!match) return;
    const { ScorecardPdfGenerator } = await import('@/features/scoring/pdf/ScorecardPdfGenerator');
    ScorecardPdfGenerator.downloadPdf(match);
  };

  if (loading || !match) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="border-4 border-emerald-600 border-t-transparent animate-spin rounded-full w-10 h-10" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto text-center flex flex-col gap-4 sm:gap-5 py-4 sm:py-6 px-screen-x w-full min-w-0">
      {/* Trophy Circle */}
      <div className="relative inline-flex items-center justify-center">
        <div className="bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-300 shadow-2xl shadow-amber-500/30 flex items-center justify-center animate-bounce rounded-full w-22 h-22 p-1">
          <Trophy className="text-slate-950 w-11 h-11" />
        </div>
      </div>

      {/* Winner Title */}
      <div className="flex flex-col items-center justify-center gap-1">
        <h2 className="font-black tracking-tight text-display leading-tight">
          {isTie ? 'Match Tied!' : 'Congratulations!'}
        </h2>
        {!isTie && match.winner && (
          <p className="font-black dark:text-emerald-400 text-h2 leading-snug">
            {match.winner}
          </p>
        )}
        <p className="font-semibold text-body-small leading-normal">
          {match.result || (isTie ? 'Match Tied' : 'Match Completed')}
        </p>
        {!isTie && match.loser && (
          <p className="text-caption text-[var(--muted-foreground)] leading-normal">
            Defeated {match.loser}
          </p>
        )}
      </div>

      {/* Innings Score Comparison Card (Side-by-Side Teams on Mobile & Desktop) */}
      <div className="floating-card grid p-4 sm:p-5 rounded-2xl grid-cols-2 gap-3 sm:gap-6 items-stretch min-w-0">
        {match.firstInnings && (
          <div className="flex flex-col items-center justify-between gap-1.5 h-full min-w-0 border-r border-[var(--border)] pr-2 sm:pr-4">
            <div className="flex items-center justify-center font-semibold gap-1.5 text-caption min-h-[24px] min-w-0 max-w-full">
              <TeamBadgeIcon type={match.firstInnings.team === match.teamA ? 'home' : 'away'} size="xs" />
              <span className="truncate leading-none">{match.firstInnings.team}</span>
            </div>
            {match.advancedSettings?.matchType === 'CHASE' ? (
              <span className="inline-flex items-center justify-center bg-amber-500/15 text-amber-600 dark:text-amber-400 font-black uppercase tracking-wider py-0.5 rounded-full text-caption px-2 leading-none shrink-0 truncate max-w-full">
                Target: {match.targetScore}
              </span>
            ) : (
              <span className="inline-block py-0.5 text-caption invisible select-none leading-none" aria-hidden="true">
                Spacer
              </span>
            )}
            <div className="font-black num-font inline-flex items-baseline justify-center leading-none">
              <span className="text-2xl xs:text-3xl sm:text-h2 font-black leading-none">{match.firstInnings.totalRuns}</span>
              <span className="text-sm font-light text-[var(--muted-foreground)] px-0.5 leading-none">/</span>
              <span className="text-base font-bold text-[var(--muted-foreground)] leading-none">{match.firstInnings.totalWickets}</span>
            </div>
            <span className="text-caption leading-none text-[var(--muted-foreground)] truncate max-w-full">({match.firstInnings.oversString} ov)</span>
          </div>
        )}

        {match.secondInnings && (
          <div className="flex flex-col items-center justify-between gap-1.5 h-full min-w-0 pl-1 sm:pl-2">
            <div className="flex items-center justify-center font-semibold gap-1.5 text-caption min-h-[24px] min-w-0 max-w-full">
              <TeamBadgeIcon type={match.secondInnings.team === match.teamA ? 'home' : 'away'} size="xs" />
              <span className="truncate leading-none">{match.secondInnings.team}</span>
            </div>
            {match.advancedSettings?.matchType === 'CHASE' ? (
              <span className="inline-flex items-center justify-center bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-black uppercase tracking-wider py-0.5 rounded-full text-caption px-2 leading-none shrink-0 truncate max-w-full">
                Chasing
              </span>
            ) : (
              <span className="inline-block py-0.5 text-caption invisible select-none leading-none" aria-hidden="true">
                Spacer
              </span>
            )}
            <div className="font-black num-font inline-flex items-baseline justify-center leading-none">
              <span className="text-2xl xs:text-3xl sm:text-h2 font-black leading-none">{match.secondInnings.totalRuns}</span>
              <span className="text-sm font-light text-[var(--muted-foreground)] px-0.5 leading-none">/</span>
              <span className="text-base font-bold text-[var(--muted-foreground)] leading-none">{match.secondInnings.totalWickets}</span>
            </div>
            <span className="text-caption leading-none text-[var(--muted-foreground)] truncate max-w-full">({match.secondInnings.oversString} ov)</span>
          </div>
        )}
      </div>

      {/* ── KEY MATCH PERFORMERS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 text-left items-stretch">
        {topScorer && (
          <div
            onClick={() => setSelectedBatsman(topScorer.player)}
            className="floating-card cursor-pointer hover:border-emerald-500/50 active:scale-[0.99] transition-all group p-2.5 sm:p-3 rounded-xl flex flex-col justify-between gap-2 h-full"
            title="Click to view batsman profile"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <img
                  src="/assets/illustrations/st_bat.png"
                  alt="Top Batter"
                  className="object-contain w-5 h-5 shrink-0"
                />
                <span className="font-bold uppercase tracking-wider text-caption leading-none dark:text-emerald-400 text-emerald-600">
                  Top Batter
                </span>
              </div>
              <span className="opacity-70 group-hover:opacity-100 transition-opacity font-bold text-emerald-500 text-caption leading-none">
                Profile ↗
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <h4 className="font-extrabold group-hover:text-emerald-400 transition-colors truncate text-body leading-snug flex-1 min-w-0">
                  {cleanPlayerName(topScorer.player.name)}
                </h4>
                <div className="font-black num-font text-h3 leading-none shrink-0 text-right text-emerald-600 dark:text-emerald-400">
                  {topScorer.player.runs}
                </div>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="block truncate text-caption leading-tight text-[var(--muted-foreground)] flex-1 min-w-0">
                  {topScorer.team}
                </span>
                <span className="block text-caption leading-tight text-[var(--muted-foreground)] shrink-0 text-right">
                  {topScorer.player.balls}b ({topScorer.player.fours}x4, {topScorer.player.sixes}x6)
                </span>
              </div>
            </div>
          </div>
        )}

        {topBowler && (
          <div
            onClick={() => setSelectedBowler(topBowler.bowler)}
            className="floating-card cursor-pointer hover:border-blue-500/50 active:scale-[0.99] transition-all group p-2.5 sm:p-3 rounded-xl flex flex-col justify-between gap-2 h-full"
            title="Click to view bowler profile"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <img
                  src="/assets/illustrations/opening_bowler.png"
                  alt="Top Bowler"
                  className="object-contain w-5 h-5 shrink-0"
                />
                <span className="font-bold uppercase tracking-wider text-caption leading-none dark:text-blue-400 text-blue-600">
                  Top Bowler
                </span>
              </div>
              <span className="opacity-70 group-hover:opacity-100 transition-opacity font-bold text-blue-500 text-caption leading-none">
                Profile ↗
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <h4 className="font-extrabold group-hover:text-blue-400 transition-colors truncate text-body leading-snug flex-1 min-w-0">
                  {cleanPlayerName(topBowler.bowler.name)}
                </h4>
                <div className="font-black num-font text-h3 leading-none shrink-0 text-right text-blue-600 dark:text-blue-400">
                  {topBowler.bowler.wickets}-{topBowler.bowler.runs}
                </div>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="block truncate text-caption leading-tight text-[var(--muted-foreground)] flex-1 min-w-0">
                  {topBowler.team}
                </span>
                <span className="block text-caption leading-tight text-[var(--muted-foreground)] shrink-0 text-right">
                  {Math.floor(topBowler.bowler.ballsBowled / 6)}.{topBowler.bowler.ballsBowled % 6} ov
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Man of the Match Hero Card */}
      {mom && (
        <div className="bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border border-amber-500/30 flex flex-col relative overflow-hidden p-4 sm:p-5 rounded-2xl text-left gap-3.5 shadow-floating">
          <div className="flex items-center justify-between gap-4 w-full">
            <div className="flex items-center relative z-10 min-w-0 gap-3.5 flex-1">
              <div className="bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shadow-lg shadow-amber-500/10 shrink-0 rounded-2xl w-14 h-14 p-1">
                <img
                  src="/assets/illustrations/man_of_match.png"
                  alt="Man of the Match"
                  className="object-contain drop-shadow w-full h-full"
                />
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold uppercase dark:text-amber-400 text-amber-600 tracking-wider text-caption leading-none block">
                    Man of the Match
                  </span>
                  {mom.confidence !== undefined && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 leading-none">
                      {Math.round(mom.confidence * 100)}% Conf
                    </span>
                  )}
                </div>
                <h3 className="font-black truncate text-card-title leading-snug">
                  {mom.name} ({mom.role})
                </h3>
                <p className="truncate text-caption leading-none text-[var(--muted-foreground)]">
                  {mom.balls > 0 ? `${mom.runs} (${mom.balls}b)` : ''}
                  {mom.balls > 0 && mom.ballsBowled > 0 ? ' • ' : ''}
                  {mom.ballsBowled > 0 ? `${mom.wickets}/${mom.bowlingRuns} (${(mom.ballsBowled / 6).toFixed(1)} ov)` : ''}
                  {mom.balls === 0 && mom.ballsBowled === 0 ? 'Match Impact Player' : ''}
                </p>
              </div>
            </div>
            <div className="relative z-10 shrink-0 text-right flex flex-col justify-center space-y-0.5">
              <span className="text-caption leading-none text-[var(--muted-foreground)] font-semibold block">
                Points
              </span>
              <div className="font-black num-font text-h2 leading-tight text-amber-500">
                {mom.finalScore !== undefined ? mom.finalScore : mom.totalPoints}
              </div>
            </div>
          </div>

          {/* Impact Breakdown */}
          {mom.breakdown && (
            <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-5 gap-1.5 pt-2 border-t border-amber-500/20 text-[11px]">
              <div className="bg-amber-500/10 rounded-lg p-1.5 text-center">
                <span className="block text-[var(--muted-foreground)] font-medium text-[10px]">Batting</span>
                <span className="font-black text-amber-600 dark:text-amber-400">{mom.breakdown.battingImpact}</span>
              </div>
              <div className="bg-amber-500/10 rounded-lg p-1.5 text-center">
                <span className="block text-[var(--muted-foreground)] font-medium text-[10px]">Bowling</span>
                <span className="font-black text-amber-600 dark:text-amber-400">{mom.breakdown.bowlingImpact}</span>
              </div>
              <div className="bg-amber-500/10 rounded-lg p-1.5 text-center">
                <span className="block text-[var(--muted-foreground)] font-medium text-[10px]">Fielding</span>
                <span className="font-black text-amber-600 dark:text-amber-400">{mom.breakdown.fieldingImpact}</span>
              </div>
              <div className="bg-amber-500/10 rounded-lg p-1.5 text-center">
                <span className="block text-[var(--muted-foreground)] font-medium text-[10px]">Pressure</span>
                <span className="font-black text-amber-600 dark:text-amber-400">{mom.breakdown.pressureImpact}</span>
              </div>
              <div className="bg-amber-500/10 rounded-lg p-1.5 text-center">
                <span className="block text-[var(--muted-foreground)] font-medium text-[10px]">Result</span>
                <span className="font-black text-amber-600 dark:text-amber-400">{mom.breakdown.resultImpact}</span>
              </div>
            </div>
          )}

          {/* AI Reasoning Narrative */}
          {mom.reason && (
            <div className="bg-amber-500/5 rounded-xl p-2.5 border border-amber-500/20 text-caption leading-relaxed text-[var(--foreground)]">
              <p className="line-clamp-3">
                <span className="font-bold text-amber-600 dark:text-amber-400">AI Context: </span>
                {mom.reason}
              </p>
            </div>
          )}

          {/* Runner Up Mention */}
          {mom.runnerUp && (
            <div className="text-[11px] text-[var(--muted-foreground)] flex items-center justify-between pt-0.5">
              <span>Runner-up: <b className="text-[var(--foreground)]">{mom.runnerUp.playerName}</b></span>
              <span className="font-bold text-amber-500">{mom.runnerUp.finalScore} pts</span>
            </div>
          )}
        </div>
      )}

      {/* Navigation & Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 items-center">
        <Link
          href={`/matches/center/${match.id}`}
          className="w-full bg-emerald-600 hover:bg-emerald-500 font-bold shadow-lg shadow-emerald-600/30 inline-flex items-center justify-center active:scale-[0.99] transition-all py-3 rounded-xl text-body-small min-h-btn gap-2 text-white"
        >
          <FileText className="w-4 h-4 shrink-0" />
          <span className="leading-none">View Full Scoreboard</span>
        </Link>

        <button
          onClick={handleDownloadPdf}
          className="w-full bg-[var(--card)] hover:bg-[var(--muted)] border border-[var(--border)] font-bold inline-flex items-center justify-center active:scale-[0.99] transition-all py-3 rounded-xl min-h-btn text-body-small gap-2 text-[var(--foreground)]"
        >
          <FileText className="text-emerald-600 w-4 h-4 shrink-0" />
          <span className="leading-none">Download PDF Scorecard</span>
        </button>

        <Link
          href="/"
          className="w-full bg-[var(--muted)] hover:bg-[var(--border)] font-bold inline-flex items-center justify-center active:scale-[0.99] transition-all py-3 rounded-xl min-h-btn px-5 text-body-small gap-2 text-[var(--foreground)]"
        >
          <Home className="w-4 h-4 shrink-0" />
          <span className="leading-none">Home</span>
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
