'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  Trophy,
  Award,
  FileText,
  Home,
  Share2,
  Loader2,
  Zap,
  Sparkles,
  Copy,
  Image as ImageIcon,
  Download,
} from 'lucide-react';
import { MatchRepository } from '@/infrastructure/storage/MatchRepository';
import { MatchScorecard, Player, Bowler } from '@/domain/cricket/types';
import { cleanPlayerName, strikeRate, economyRate, isMatchTie } from '@/domain/cricket/formatters';
import { ManOfTheMatchEngine } from '@/domain/cricket/analytics/ManOfTheMatchEngine';
import { bowlerNamesById } from '@/domain/cricket/analytics/bowlerMatchup';
import { MatchNarrativeEngine, MatchNarrative } from '@/domain/cricket/analytics/MatchNarrativeEngine';
import { useLanguage } from '@/context/LanguageContext';
import { TeamBadgeIcon } from '@/components/common/TeamBadgeIcon';
import { ScoreboardSkeleton } from '@/components/common/Skeleton';
import { usePdfDownload } from '@/features/scoring/pdf/usePdfDownload';
import { shareMatchCenterLink, shareToastMessage } from '@/features/scoring/share/shareLink';
import { scorecardToCsv, downloadCsv, scorecardCsvFilename } from '@/features/scoring/share/csvExport';
import { shareScoreCardImage } from '@/features/scoring/share/ScoreShareCard';
import { showAppToast } from '@/components/common/AppToast';
import { BackButton } from '@/components/navigation';

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
  const [superOverMatch, setSuperOverMatch] = useState<MatchScorecard | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedBatsman, setSelectedBatsman] = useState<Player | null>(null);
  const [selectedBowler, setSelectedBowler] = useState<Bowler | null>(null);
  const [syncedTournament, setSyncedTournament] = useState<{ id: string; name: string } | null>(null);

  const { language, t } = useLanguage();
  const narrativeLang: 'bn' | 'en' = language === 'bn' ? 'bn' : 'en';

  const isGeneratingRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    async function load() {
      if (!matchId) return;
      // F4-04: a rejected load (Dexie failure, blocked upgrade) must end
      // the loading state and surface an error — never a perpetual
      // skeleton with an unhandled rejection.
      try {
        const data = await MatchRepository.getMatch(matchId);
        if (data) {
          setMatch(data);

        // F9-α: load the linked super-over match so MoM can credit
        // super-over performances (the parent stores only its id).
        if (data.superOverMatchId) {
          try {
            const soMatch = await MatchRepository.getMatch(data.superOverMatchId);
            if (soMatch) setSuperOverMatch(soMatch);
          } catch {
            // Super-over MoM enrichment is best-effort.
          }
        }

        // Auto-link and sync tournament fixture result if tournamentId & fixtureId are present
        if (data.advancedSettings?.tournamentId && data.advancedSettings?.fixtureId && (data.status === 'COMPLETED' || data.status === 'ABANDONED')) {
          try {
            const { FeatureHubRepository } = await import('@/infrastructure/storage/FeatureHubRepository');
            const { TournamentEngine } = await import('@/domain/tournament/TournamentEngine');
            const tourney = await FeatureHubRepository.getTournament(data.advancedSettings.tournamentId);
            if (tourney) {
              const targetFix = tourney.fixtures.find((f) => f.id === data.advancedSettings.fixtureId);
              if (targetFix && !targetFix.winner && !targetFix.isTie && targetFix.resultType !== 'NO_RESULT') {
                let updated = tourney;
                if (data.winner) {
                  updated = TournamentEngine.recordWinner({
                    tournament: tourney,
                    fixtureId: targetFix.id,
                    winner: data.winner,
                  });
                } else if (data.status === 'ABANDONED' || data.resultType === 'NO_RESULT') {
                  updated = TournamentEngine.recordNoResult({
                    tournament: tourney,
                    fixtureId: targetFix.id,
                  });
                } else if (data.resultType === 'TIE') {
                  updated = TournamentEngine.recordTie({
                    tournament: tourney,
                    fixtureId: targetFix.id,
                  });
                }
                updated.fixtures = updated.fixtures.map((f) =>
                  f.id === targetFix.id ? { ...f, matchId: data.id } : f
                );
                await FeatureHubRepository.saveTournament(updated);
                setSyncedTournament({ id: updated.id, name: updated.name });
              } else if (targetFix?.matchId === data.id || targetFix?.winner) {
                setSyncedTournament({ id: tourney.id, name: tourney.name });
              }
            }
          } catch (syncErr) {
            console.warn('[Summary] Tournament auto-sync error:', syncErr);
          }
        }

        // Confetti celebration (dynamically loaded) — BV-1: only a
        // completed match is a celebration; an in-progress match
        // landing here must not be greeted as a finished one.
        if (data.status === 'COMPLETED') {
          import('canvas-confetti').then((confettiModule) => {
            const confetti = confettiModule.default || confettiModule;
            confetti({
              particleCount: 80,
              spread: 70,
              origin: { y: 0.6 },
            });
          });
        }
        }
      } catch (err) {
        console.error('[Summary] Failed to load match:', err);
        setLoadError(true);
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

    // BV-1: Player of the Match exists only once the match is
    // completed. Resolving one mid-match produced a blank/awarded
    // MoM card on a live match's summary.
    const momResult =
      match.status === 'COMPLETED'
        ? ManOfTheMatchEngine.resolveForMatch(
            match,
            superOverMatch
              ? {
                  superOver: {
                    innings1: superOverMatch.firstInnings,
                    innings2: superOverMatch.secondInnings,
                    winner: match.superOverResult?.winner,
                  },
                }
              : undefined
          )
        : null;
    const tie = isMatchTie(match);

    return { topScorer: scorer, topBowler: bowler, mom: momResult, isTie: tie };
  }, [match, superOverMatch]);

  const narrative = useMemo<MatchNarrative | null>(() => {
    if (!match) return null;
    // BV-1: the editorial narrative is a post-match report (it names a
    // Player of the Match and describes decisive performances). Never
    // generate it for a match that is still in progress.
    if (match.status !== 'COMPLETED') return null;
    try {
      const generated = MatchNarrativeEngine.generateNarrative(match);
      // BV-1 guard: never print zero-value claims. When no bowler in
      // the match has taken a wicket (e.g. every dismissal was a run
      // out), the generator still crowns a "chief destroyer, scalping
      // 0 wickets". Swap that sentence for the generator's own neutral
      // fallback in every field that embeds it.
      if (generated.bowlingHighlightsEn.includes('scalping 0 wickets')) {
        const NEUTRAL_BOWLING_EN = 'Bowlers maintained disciplined lines throughout the contest.';
        const NEUTRAL_BOWLING_BN = 'বোলাররা ইনিংসজুড়ে নিয়ন্ত্রিত লাইন ও লেন্থ বজায় রাখেন।';
        const swap = (text: string) =>
          text
            .split(generated.bowlingHighlightsEn).join(NEUTRAL_BOWLING_EN)
            .split(generated.bowlingHighlightsBn).join(NEUTRAL_BOWLING_BN);
        return {
          ...generated,
          bowlingHighlightsEn: NEUTRAL_BOWLING_EN,
          bowlingHighlightsBn: NEUTRAL_BOWLING_BN,
          summaryEn: swap(generated.summaryEn),
          summaryBn: swap(generated.summaryBn),
          fullReportEn: swap(generated.fullReportEn),
          fullReportBn: swap(generated.fullReportBn),
        };
      }
      return generated;
    } catch (e) {
      console.warn('[MatchSummaryPage] Narrative generation error:', e);
      return null;
    }
  }, [match]);

  const handleCopyNarrative = async () => {
    if (!narrative) return;
    const text = narrativeLang === 'bn' ? narrative.fullReportBn : narrative.fullReportEn;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        showAppToast(
          narrativeLang === 'bn' ? 'ম্যাচ প্রতিবেদন ক্লিপবোর্ডে কপি হয়েছে!' : 'Match report copied to clipboard!',
          { variant: 'success' }
        );
      }
    } catch {
      showAppToast('Could not copy report', { variant: 'error' });
    }
  };

  const {
    isGenerating: isGeneratingPdf,
    error: pdfError,
    downloadPdf,
    close: closePdfModal,
  } = usePdfDownload();

  // F4-16: the PDF error now surfaces through the shared AppToast
  // system. Dismissing the toast (click or auto-dismiss) still
  // resets the PDF state via closePdfModal, exactly as the old
  // bespoke toast's close button did.
  const shownPdfErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pdfError) {
      shownPdfErrorRef.current = null;
      return;
    }
    if (shownPdfErrorRef.current === pdfError) return;
    shownPdfErrorRef.current = pdfError;
    showAppToast(pdfError, {
      variant: 'error',
      onDismiss: () => closePdfModal(),
    });
  }, [pdfError, closePdfModal]);

  const handleDownloadPdf = async () => {
    if (!match) return;
    await downloadPdf(match);
  };

  // Sharing & exports (improvement run): the canonical share
  // target is the match CENTER link (not this summary URL), so
  // recipients land on the live scorecard. Private matches warn
  // the sharer — the link stays owner-only, access rules are
  // unchanged.
  const handleShare = async () => {
    if (!match) return;
    const result = await shareMatchCenterLink(match);
    const message = shareToastMessage(result, t);
    if (message) showAppToast(message);
  };

  // Audit 2026-11-10: resolve which innings a summary selection
  // belongs to (the top scorer/bowler routinely come from the
  // second innings). Ids are innings-scoped in engine data; the
  // first innings wins ties and remains the default.
  const summaryInningsOfPlayer = (id?: string) => {
    if (id && match?.firstInnings?.players.some((p) => p.id === id)) return match.firstInnings;
    if (id && match?.secondInnings?.players.some((p) => p.id === id)) return match.secondInnings;
    return match?.firstInnings;
  };
  const summaryInningsOfBowler = (id?: string) => {
    if (id && match?.firstInnings?.bowlers.some((b) => b.id === id)) return match.firstInnings;
    if (id && match?.secondInnings?.bowlers.some((b) => b.id === id)) return match.secondInnings;
    return match?.firstInnings;
  };
  const summaryBatsmanInnings = summaryInningsOfPlayer(selectedBatsman?.id);
  const summaryBowlerInnings = summaryInningsOfBowler(selectedBowler?.id);

  const [isSharingImage, setIsSharingImage] = useState(false);

  const handleShareImage = async () => {
    if (!match || isSharingImage) return;
    setIsSharingImage(true);
    try {
      // Prefer the live-resolved MoM name when the stored
      // scorecard predates its computation.
      const cardMatch: MatchScorecard = {
        ...match,
        mom: match.mom ?? mom?.name,
      };
      const outcome = await shareScoreCardImage(cardMatch, superOverMatch);
      if (outcome === 'downloaded') {
        showAppToast(t('share_image_downloaded', 'Score card image downloaded.'));
      } else if (outcome === 'failed') {
        showAppToast(t('share_image_failed', 'Could not create the share image.'));
      }
    } finally {
      setIsSharingImage(false);
    }
  };

  const handleExportCsv = () => {
    if (!match) return;
    downloadCsv(scorecardCsvFilename(match), scorecardToCsv(match));
    showAppToast(t('share_csv_downloaded', 'Scorecard downloaded as CSV.'));
  };

  const handleStartSuperOver = async () => {
    if (!match) return;
    try {
      const { EventSourcedMatchEngine } = await import('@/domain/cricket/match-engine/EventSourcedMatchEngine');
      const superEngine = EventSourcedMatchEngine.createSuperOverMatch({
        parentMatch: match,
      });
      await MatchRepository.saveMatchWithEvents(superEngine.toScorecard(), superEngine.events, 0);

      const updatedParent: MatchScorecard = {
        ...match,
        superOverMatchId: superEngine.id,
        advancedSettings: {
          ...match.advancedSettings,
          superOverMatchId: superEngine.id,
        },
      };
      await MatchRepository.updateMatch(updatedParent);

      router.push(`/matches/score/${superEngine.id}`);
    } catch (err: any) {
      console.error('Failed to start Super Over:', err);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-4 sm:py-6 px-screen-x w-full animate-fade-in select-none">
        <ScoreboardSkeleton />
      </div>
    );
  }

  // F4-02: a finished load with no match is a dead end, not a loading
  // state — mirror the match center page's not-found treatment.
  if (loadError) {
    return (
      <div className="text-center p-12 space-y-3">
        <h2 className="font-bold text-h3">{t('center_load_error', 'Could Not Load This Match')}</h2>
        <p className="text-caption text-[var(--muted-foreground)]">
          {t('summary_load_error_desc', 'Something went wrong while reading the match from this device.')}
        </p>
        <Link href="/matches/history" className="font-bold hover:underline text-emerald-600">
          {t('summary_back_matches', 'Back to Matches')}
        </Link>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="text-center p-12 space-y-3">
        <h2 className="font-bold text-h3">{t('center_not_found', 'Match Not Found')}</h2>
        <p className="text-caption text-[var(--muted-foreground)]">
          {t('summary_not_found_desc', 'This match is not stored on this device.')}
        </p>
        <Link href="/matches/history" className="font-bold hover:underline text-emerald-600">
          {t('summary_back_matches', 'Back to Matches')}
        </Link>
      </div>
    );
  }

  // BV-1: everything celebratory below (trophy block, MoM, narrative)
  // is gated on the match actually being completed.
  const isCompleted = match.status === 'COMPLETED';

  return (
    <div className="max-w-4xl mx-auto text-center flex flex-col gap-4 sm:gap-5 py-4 sm:py-6 px-screen-x w-full min-w-0 pb-safe pb-8">
      {/* ── COMPACT INLINE iOS HEADER ── */}
      <div className="flex items-center justify-between gap-2 min-w-0 text-left py-0.5">
        <div className="flex items-center gap-2 min-w-0">
          <BackButton
            fallbackUrl="/matches/history"
            showLabel={false}
            title={t('center_back_history', 'Back to Match History')}
            size="sm"
          />
          <h1 className="font-extrabold text-base sm:text-lg text-[var(--foreground)] tracking-tight truncate leading-none">
            {t('summary_title', 'Match Summary')}
          </h1>
        </div>

        <button
          type="button"
          onClick={handleShare}
          className="inline-flex items-center font-semibold text-emerald-600 dark:text-emerald-400 gap-1 text-xs hover:opacity-75 transition-opacity py-1.5 px-2.5 rounded-lg cursor-pointer bg-muted/50 hover:bg-[var(--muted)] border border-border/40"
          title={t('summary_share_match', 'Share Match')}
        >
          <Share2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t('center_share', 'Share')}</span>
        </button>
      </div>
      {/* Tournament Auto-Sync Notification Banner */}
      {syncedTournament && (
        <div className="flex items-center justify-between p-3 sm:p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-left shadow-elev1">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
              <Trophy className="w-4 h-4 text-amber-500" />
            </div>
            <div className="min-w-0">
              <span className="font-extrabold text-xs sm:text-sm block truncate">{t('summary_tournament_recorded', 'Tournament Result Auto-Recorded')}</span>
              <span className="text-[11px] opacity-80 block truncate">{t('summary_points_updated', 'Points Table & NRR updated for')} {syncedTournament.name}</span>
            </div>
          </div>
          <Link
            href={`/tournaments/${syncedTournament.id}`}
            className="shrink-0 text-xs px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 transition-all shadow-xs active:scale-95"
          >
            {t('summary_view_standings', 'View Standings')}
          </Link>
        </div>
      )}

      {/* Super Over Result Banner (If already played) */}
      {match.superOverResult && (
        <div className="bg-purple-600/15 border border-purple-500/30 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-left w-full shadow-elev1">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-purple-600 text-white p-2 rounded-xl shrink-0">
              <Zap className="w-5 h-5 fill-white" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] uppercase font-black text-purple-600 dark:text-purple-400 tracking-wider block">
                {t('summary_super_over_completed', 'Super Over Completed')}
              </span>
              <h4 className="font-extrabold text-sm truncate text-[var(--foreground)]">
                {match.superOverResult.winner} {t('summary_won_super_over', 'won via Super Over')}
              </h4>
              <p className="text-xs text-[var(--muted-foreground)]">
                {match.superOverResult.resultText} {match.superOverResult.teamAScore ? `(${match.superOverResult.teamAScore} vs ${match.superOverResult.teamBScore})` : ''}
              </p>
            </div>
          </div>
          <Link
            href={`/matches/center/${match.superOverMatchId}`}
            className="shrink-0 text-xs px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold transition-all shadow-xs active:scale-95 flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{t('summary_super_over_scorecard', 'Super Over Scorecard')}</span>
          </Link>
        </div>
      )}

      {/* Super Over Tie-Breaker Launcher (When match is tied and super over not started yet) */}
      {isCompleted && isTie && !match.superOverMatchId && (
        <div className="bg-gradient-to-r from-purple-600/15 via-purple-600/5 to-transparent border border-purple-500/30 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-left w-full shadow-elev1">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-purple-600 text-white p-2.5 rounded-xl shrink-0 shadow-sm shadow-purple-600/30">
              <Zap className="w-5 h-5 fill-white" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] uppercase font-black text-purple-600 dark:text-purple-400 tracking-wider block">
                {t('summary_tiebreaker', 'Tie-Breaker Available')}
              </span>
              <h4 className="font-extrabold text-sm text-[var(--foreground)]">
                {t('summary_start_super_over', 'Start Super Over')}
              </h4>
              <p className="text-xs text-[var(--muted-foreground)]">
                {t('summary_super_over_desc', '1 over per side, max 2 wickets. Settle the tie with a dramatic 1-over finish!')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleStartSuperOver}
            className="shrink-0 text-xs px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold transition-all shadow-md shadow-purple-600/30 active:scale-95 flex items-center gap-1.5 cursor-pointer"
          >
            <Zap className="w-4 h-4 fill-white" />
            <span>{t('summary_start_super_over_btn', 'Start Super Over')} ⚡</span>
          </button>
        </div>
      )}

      {isCompleted ? (
        <>
          {/* Trophy Circle */}
          <div className="relative inline-flex items-center justify-center">
            <div className="bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-300 shadow-2xl shadow-amber-500/30 flex items-center justify-center animate-bounce rounded-full w-22 h-22 p-1">
              <Trophy className="text-slate-950 w-11 h-11" />
            </div>
          </div>

          {/* Winner Title */}
          <div className="flex flex-col items-center justify-center gap-1">
            <h2 className="font-black tracking-tight text-display leading-tight">
              {isTie ? t('summary_match_tied', 'Match Tied!') : t('summary_congratulations', 'Congratulations!')}
            </h2>
            {!isTie && match.winner && (
              <p className="font-black dark:text-emerald-400 text-h2 leading-snug">
                {match.winner}
              </p>
            )}
            <p className="font-semibold text-body-small leading-normal">
              {match.result || (isTie ? t('summary_tied', 'Match Tied') : t('summary_completed', 'Match Completed'))}
            </p>
            {!isTie && match.loser && (
              <p className="text-caption text-[var(--muted-foreground)] leading-normal">
                {t('summary_defeated', 'Defeated')} {match.loser}
              </p>
            )}
          </div>
        </>
      ) : (
        /* BV-1: in-progress summary state — the match is NOT finished,
           so present the live state and the way back to the action
           instead of a result celebration. */
        <div className="floating-card p-4 sm:p-5 rounded-2xl flex flex-col items-center gap-2.5 w-full shadow-elev1">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            {match.status === 'ABANDONED'
              ? t('summary_abandoned', 'Match Abandoned')
              : match.status === 'PENDING'
                ? t('summary_not_started', 'Match Not Started')
                : t('center_in_progress', 'Match in Progress')}
          </span>
          <h2 className="font-black tracking-tight text-h2 leading-tight">
            {match.teamA} vs {match.teamB}
          </h2>
          <p className="text-body-small text-[var(--muted-foreground)] leading-normal">
            {match.firstInnings
              ? `${match.firstInnings.team} ${match.firstInnings.totalRuns}/${match.firstInnings.totalWickets} (${match.firstInnings.oversString} ov)${
                  match.secondInnings
                    ? ` · ${match.secondInnings.team} ${match.secondInnings.totalRuns}/${match.secondInnings.totalWickets} (${match.secondInnings.oversString} ov)`
                    : ` · ${match.firstInnings.team === match.teamA ? match.teamB : match.teamA} ${t('summary_yet_to_bat', 'yet to bat')}`
                }`
              : t('summary_no_innings', 'No innings have been scored yet.')}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {match.status !== 'ABANDONED' && (
              <Link
                href={`/matches/score/${match.id}`}
                className="inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-elev2 py-2.5 px-4 rounded-xl text-body-small min-h-btn active:scale-[0.99] transition-all"
              >
                {t('center_resume_scorer', 'Continue Scoring')}
              </Link>
            )}
            <Link
              href={`/matches/center/${match.id}`}
              className="inline-flex items-center justify-center bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--muted)] font-bold py-2.5 px-4 rounded-xl text-body-small min-h-btn active:scale-[0.99] transition-all text-[var(--foreground)]"
            >
              {t('summary_live_center', 'Live Match Center')}
            </Link>
          </div>
        </div>
      )}

      {/* Innings Score Comparison Card (Side-by-Side Teams on Mobile & Desktop) */}
      <div className="floating-card shadow-elev1 grid p-4 sm:p-5 rounded-2xl grid-cols-2 gap-3 sm:gap-6 items-stretch min-w-0">
        {match.firstInnings && (
          <div className="flex flex-col items-center justify-between gap-1.5 h-full min-w-0 border-r border-[var(--border)] pr-2 sm:pr-4">
            <div className="flex items-center justify-center font-semibold gap-1.5 text-caption min-h-[24px] min-w-0 max-w-full">
              <TeamBadgeIcon type={match.firstInnings.team === match.teamA ? 'home' : 'away'} size="xs" />
              <span className="truncate leading-none">{match.firstInnings.team}</span>
            </div>
            {match.advancedSettings?.matchType === 'CHASE' ? (
              <span className="inline-flex items-center justify-center bg-amber-500/15 text-amber-600 dark:text-amber-400 font-black uppercase tracking-wider py-0.5 rounded-full text-caption px-2 leading-none shrink-0 truncate max-w-full">
                {t('target', 'Target')}: {match.targetScore}
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
                {t('summary_chasing', 'Chasing')}
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
            className="floating-card shadow-elev1 cursor-pointer hover:border-emerald-500/50 active:scale-[0.99] transition-all group p-2.5 sm:p-3 rounded-xl flex flex-col justify-between gap-2 h-full"
            title={t('summary_view_batsman', 'Click to view batsman profile')}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <img
                  src="/assets/illustrations/st_bat.png"
                  alt=""
                  aria-hidden="true"
                  className="object-contain w-5 h-5 shrink-0"
                />
                <span className="font-bold uppercase tracking-wider text-caption leading-none dark:text-emerald-400 text-emerald-600">
                  {t('summary_top_batter', 'Top Batter')}
                </span>
              </div>
              <span className="opacity-70 group-hover:opacity-100 transition-opacity font-bold text-emerald-500 text-caption leading-none">
                {t('summary_profile', 'Profile')} ↗
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
            className="floating-card shadow-elev1 cursor-pointer hover:border-blue-500/50 active:scale-[0.99] transition-all group p-2.5 sm:p-3 rounded-xl flex flex-col justify-between gap-2 h-full"
            title={t('summary_view_bowler', 'Click to view bowler profile')}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <img
                  src="/assets/illustrations/opening_bowler.png"
                  alt=""
                  aria-hidden="true"
                  className="object-contain w-5 h-5 shrink-0"
                />
                <span className="font-bold uppercase tracking-wider text-caption leading-none dark:text-blue-400 text-blue-600">
                  {t('summary_top_bowler', 'Top Bowler')}
                </span>
              </div>
              <span className="opacity-70 group-hover:opacity-100 transition-opacity font-bold text-blue-500 text-caption leading-none">
                {t('summary_profile', 'Profile')} ↗
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
                  alt=""
                  aria-hidden="true"
                  className="object-contain drop-shadow w-full h-full"
                />
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold uppercase dark:text-amber-400 text-amber-600 tracking-wider text-caption leading-none block">
                    {t('center_mom', 'Man of the Match')}
                  </span>
                  {mom.confidence !== undefined && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 leading-none">
                      {Math.round(mom.confidence * 100)}% {t('center_conf', 'Conf')}
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
                  {mom.balls === 0 && mom.ballsBowled === 0 ? t('center_impact_player', 'Match Impact Player') : ''}
                </p>
              </div>
            </div>
            <div className="relative z-10 shrink-0 text-right flex flex-col justify-center space-y-0.5">
              <span className="text-caption leading-none text-[var(--muted-foreground)] font-semibold block">
                {t('summary_points', 'Points')}
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
                <span className="block text-[var(--muted-foreground)] font-medium text-[10px]">{t('batting', 'Batting')}</span>
                <span className="font-black text-amber-600 dark:text-amber-400">{mom.breakdown.battingImpact}</span>
              </div>
              <div className="bg-amber-500/10 rounded-lg p-1.5 text-center">
                <span className="block text-[var(--muted-foreground)] font-medium text-[10px]">{t('bowling', 'Bowling')}</span>
                <span className="font-black text-amber-600 dark:text-amber-400">{mom.breakdown.bowlingImpact}</span>
              </div>
              <div className="bg-amber-500/10 rounded-lg p-1.5 text-center">
                <span className="block text-[var(--muted-foreground)] font-medium text-[10px]">{t('center_fielding', 'Fielding')}</span>
                <span className="font-black text-amber-600 dark:text-amber-400">{mom.breakdown.fieldingImpact}</span>
              </div>
              <div className="bg-amber-500/10 rounded-lg p-1.5 text-center">
                <span className="block text-[var(--muted-foreground)] font-medium text-[10px]">{t('center_pressure', 'Pressure')}</span>
                <span className="font-black text-amber-600 dark:text-amber-400">{mom.breakdown.pressureImpact}</span>
              </div>
              <div className="bg-amber-500/10 rounded-lg p-1.5 text-center">
                <span className="block text-[var(--muted-foreground)] font-medium text-[10px]">{t('center_result', 'Result')}</span>
                <span className="font-black text-amber-600 dark:text-amber-400">{mom.breakdown.resultImpact}</span>
              </div>
            </div>
          )}

          {/* AI Reasoning Narrative */}
          {mom.reason && (
            <div className="bg-amber-500/5 rounded-xl p-2.5 border border-amber-500/20 text-caption leading-relaxed text-[var(--foreground)]">
              <p className="line-clamp-3">
                <span className="font-bold text-amber-600 dark:text-amber-400">{t('summary_ai_context', 'AI Context:')} </span>
                {mom.reason}
              </p>
            </div>
          )}

          {/* Runner Up Mention */}
          {mom.runnerUp && (
            <div className="text-[11px] text-[var(--muted-foreground)] flex items-center justify-between pt-0.5">
              <span>{t('summary_runner_up', 'Runner-up:')} <b className="text-[var(--foreground)]">{mom.runnerUp.playerName}</b></span>
              <span className="font-bold text-amber-500">{mom.runnerUp.finalScore} {t('center_pts', 'pts')}</span>
            </div>
          )}
        </div>
      )}

      {/* ── AI & EDITORIAL MATCH REPORT CARD ── */}
      {narrative && (
        <div className="floating-card p-4 sm:p-5 rounded-2xl text-left flex flex-col gap-3.5 border border-[var(--border)] shadow-elev1">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0 text-emerald-600 dark:text-emerald-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block leading-none">
                  {narrativeLang === 'bn' ? 'সম্পাদকীয় ম্যাচ রিভিউ' : 'Editorial Match Review'}
                </span>
                <h3 className="font-extrabold text-sm sm:text-base truncate text-[var(--foreground)] mt-0.5">
                  {narrativeLang === 'bn' ? 'ম্যাচ প্রতিবেদন ও বিশ্লেষণ' : 'Match Narrative & Insights'}
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Copy Report Button */}
              <button
                type="button"
                onClick={handleCopyNarrative}
                className="btn-secondary !p-2 !rounded-xl text-xs gap-1 hover:!border-emerald-500/40"
                title={narrativeLang === 'bn' ? 'প্রতিবেদন কপি করুন' : 'Copy Report'}
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Headline & Summary */}
          <div className="space-y-2">
            <h4 className="font-extrabold text-sm sm:text-base leading-snug text-[var(--foreground)]">
              {narrativeLang === 'bn' ? narrative.headlineBn : narrative.headlineEn}
            </h4>
            <p className="text-xs sm:text-sm text-[var(--muted-foreground)] leading-relaxed">
              {narrativeLang === 'bn' ? narrative.summaryBn : narrative.summaryEn}
            </p>
          </div>

          {/* Key Match Highlights Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-xs">
            <div className="bg-muted/50 border border-[var(--border)] rounded-xl p-3 flex flex-col gap-1">
              <span className="font-extrabold text-emerald-600 dark:text-emerald-400 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                🏏 {narrativeLang === 'bn' ? 'ব্যাটিং চিত্র' : 'Batting Highlights'}
              </span>
              <p className="text-[var(--muted-foreground)] leading-relaxed">
                {narrativeLang === 'bn' ? narrative.battingHighlightsBn : narrative.battingHighlightsEn}
              </p>
            </div>

            <div className="bg-muted/50 border border-[var(--border)] rounded-xl p-3 flex flex-col gap-1">
              <span className="font-extrabold text-blue-600 dark:text-blue-400 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                🎯 {narrativeLang === 'bn' ? 'বোলিং পারফরম্যান্স' : 'Bowling Highlights'}
              </span>
              <p className="text-[var(--muted-foreground)] leading-relaxed">
                {narrativeLang === 'bn' ? narrative.bowlingHighlightsBn : narrative.bowlingHighlightsEn}
              </p>
            </div>
          </div>

          {/* MoTM Highlight */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5 sm:p-3 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Award className="w-4 h-4 text-amber-500 shrink-0" />
              <p className="text-[var(--foreground)] truncate">
                <span className="font-bold text-amber-600 dark:text-amber-400">
                  {narrativeLang === 'bn' ? 'সেরা খেলোয়াড়: ' : 'Player of the Match: '}
                </span>
                {narrativeLang === 'bn' ? narrative.motmHighlightBn : narrative.motmHighlightEn}
              </p>
            </div>
          </div>
        </div>
      )}


      {/* Navigation & Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-2 items-center">
        <Link
          href={`/matches/center/${match.id}`}
          className="w-full bg-emerald-600 hover:bg-emerald-500 font-bold shadow-elev2 inline-flex items-center justify-center active:scale-[0.99] transition-all py-3 rounded-xl text-body-small min-h-btn gap-2 text-white"
        >
          <FileText className="w-4 h-4 shrink-0" />
          <span className="leading-none">{t('summary_view_scoreboard', 'View Full Scoreboard')}</span>
        </Link>

        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={isGeneratingPdf}
          aria-busy={isGeneratingPdf}
          aria-label={isGeneratingPdf ? t('summary_generating_pdf_label', 'Generating PDF Scorecard...') : t('summary_download_pdf', 'Download PDF Scorecard')}
          className={`w-full bg-[var(--card)] border border-[var(--border)] font-bold inline-flex items-center justify-center transition-all py-3 rounded-xl min-h-btn text-body-small gap-2 text-[var(--foreground)] ${
            isGeneratingPdf
              ? 'opacity-70 cursor-not-allowed pointer-events-none'
              : 'hover:bg-[var(--muted)] active:scale-[0.99]'
          }`}
        >
          {isGeneratingPdf ? (
            <>
              <Loader2 className="text-emerald-600 dark:text-emerald-400 w-4 h-4 shrink-0 animate-spin motion-reduce:animate-none" />
              <span className="leading-none">{t('summary_generating_pdf', 'Generating PDF...')}</span>
            </>
          ) : (
            <>
              <FileText className="text-emerald-600 w-4 h-4 shrink-0" />
              <span className="leading-none">{t('summary_download_pdf', 'Download PDF Scorecard')}</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleShare}
          className="w-full bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--muted)] font-bold inline-flex items-center justify-center active:scale-[0.99] transition-all py-3 rounded-xl min-h-btn text-body-small gap-2 text-[var(--foreground)]"
        >
          <Share2 className="text-emerald-600 w-4 h-4 shrink-0" />
          <span className="leading-none">{t('summary_share_match', 'Share Match')}</span>
        </button>

        <button
          type="button"
          onClick={handleShareImage}
          disabled={isSharingImage}
          aria-busy={isSharingImage}
          className={`w-full bg-[var(--card)] border border-[var(--border)] font-bold inline-flex items-center justify-center transition-all py-3 rounded-xl min-h-btn text-body-small gap-2 text-[var(--foreground)] ${
            isSharingImage
              ? 'opacity-70 cursor-not-allowed'
              : 'hover:bg-[var(--muted)] active:scale-[0.99]'
          }`}
        >
          {isSharingImage ? (
            <Loader2 className="text-pink-500 w-4 h-4 shrink-0 animate-spin motion-reduce:animate-none" />
          ) : (
            <ImageIcon className="text-pink-500 w-4 h-4 shrink-0" />
          )}
          <span className="leading-none">
            {isCompleted ? t('share_image', 'Share Image') : t('share_live_image', 'Share Live Image')}
          </span>
        </button>

        <button
          type="button"
          onClick={handleExportCsv}
          className="w-full bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--muted)] font-bold inline-flex items-center justify-center active:scale-[0.99] transition-all py-3 rounded-xl min-h-btn text-body-small gap-2 text-[var(--foreground)]"
        >
          <Download className="text-amber-500 w-4 h-4 shrink-0" />
          <span className="leading-none">{t('export_csv', 'Export CSV')}</span>
        </button>

        <Link
          href="/"
          className="w-full bg-[var(--muted)] hover:bg-[var(--border)] font-bold inline-flex items-center justify-center active:scale-[0.99] transition-all py-3 rounded-xl min-h-btn px-5 text-body-small gap-2 text-[var(--foreground)]"
        >
          <Home className="w-4 h-4 shrink-0" />
          <span className="leading-none">{t('home', 'Home')}</span>
        </Link>
      </div>


      {/* ── BATSMAN & BOWLER PROFILE MODALS ── */}
      {/* Audit 2026-11-10: the modals must receive the SELECTED
          player's own innings data — this page used to pass
          first-innings FoW/partnerships unconditionally, so a
          second-innings top scorer/bowler got the wrong (or an
          empty) dismissal and wickets record. */}
      <BatsmanProfileModal
        player={selectedBatsman}
        isOpen={!!selectedBatsman}
        onClose={() => setSelectedBatsman(null)}
        partnerships={summaryBatsmanInnings?.pastPartnerships}
        fallOfWickets={summaryBatsmanInnings?.fallOfWickets}
        bowlerNamesById={bowlerNamesById([match.firstInnings, match.secondInnings])}
      />

      <BowlerProfileModal
        bowler={selectedBowler}
        isOpen={!!selectedBowler}
        onClose={() => setSelectedBowler(null)}
        fallOfWickets={summaryBowlerInnings?.fallOfWickets}
        advancedSettings={match.advancedSettings}
      />
    </div>
  );
}
