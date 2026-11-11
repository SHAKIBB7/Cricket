'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
 Trophy,
 Calendar,
 Award,
 Layers,
 BarChart2,
 CheckCircle2,
 CloudRain,
 Crown,
 Play,
 Share2,
 Download,
} from 'lucide-react';
import { FeatureHubRepository } from '@/infrastructure/storage/FeatureHubRepository';
import { MatchRepository } from '@/infrastructure/storage/MatchRepository';
import { Tournament, TournamentFixture } from '@/domain/tournament/types';
import { TournamentEngine } from '@/domain/tournament/TournamentEngine';
import { NetRunRateEngine } from '@/domain/tournament/NetRunRateEngine';
import { MatchScorecard } from '@/domain/cricket/types';
import { BowlingLimiter } from '@/domain/cricket/bowling-limiter/BowlingLimiter';
import { TeamBadgeIcon } from '@/components/common/TeamBadgeIcon';
import { ConfirmationDialog } from '@/components/overlay/ConfirmationDialog';
import {
  generateRoundRobinFixtures,
  generateKnockoutFixtures,
  resolveSchedule,
  isPlaceholderTeam,
  type ScheduleFixture,
  type TournamentWithSchedule,
} from '@/features/tournaments/fixtures';
import { Skeleton } from '@/components/common/Skeleton';
import { BackButton } from '@/components/navigation';
import { tournamentToCsv, downloadCsv, tournamentCsvFilename } from '@/features/scoring/share/csvExport';
import { showAppToast } from '@/components/common/AppToast';
import { HoldResultButton } from '@/features/tournaments/HoldResultButton';
import { useLanguage } from '@/context/LanguageContext';

export default function TournamentDetailPage() {
 const { t } = useLanguage();
 const params = useParams();
 const router = useRouter();
 const tournamentId = params.id as string;

 const [tournament, setTournament] = useState<Tournament | null>(null);
 const [activeTab, setActiveTab] = useState<'fixtures' | 'schedule' | 'standings' | 'playoffs' | 'leaders'>('fixtures');
 const [confirmAction, setConfirmAction] = useState<'league' | 'knockout' | null>(null);
 const [matches, setMatches] = useState<MatchScorecard[]>([]);
 const [loading, setLoading] = useState(true);
 const [loadError, setLoadError] = useState(false);

 const loadTournament = useCallback(async () => {
 if (!tournamentId) return;
 // F4-03/F4-04: a rejected load must still end the loading state so
 // the page can show its not-found/error state instead of spinning.
 try {
 const [tourney, allMatches] = await Promise.all([
 FeatureHubRepository.getTournament(tournamentId),
 MatchRepository.getAllMatches(),
 ]);
 setMatches(allMatches);
 if (tourney) {
 const withSchedule = tourney as TournamentWithSchedule;
 if (withSchedule.schedule && withSchedule.schedule.length > 0) {
 const resolved = resolveSchedule(withSchedule.schedule, allMatches, tourney.id);
 if (JSON.stringify(resolved) !== JSON.stringify(withSchedule.schedule)) {
 const updated = { ...tourney, schedule: resolved };
 await FeatureHubRepository.saveTournament(updated as Tournament);
 setTournament(updated as Tournament);
 } else {
 setTournament(tourney);
 }
 } else {
 setTournament(tourney);
 }
 } else {
 setTournament(null);
 }
 } catch (err) {
 console.error('[TournamentDetail] Failed to load tournament:', err);
 setLoadError(true);
 }
 setLoading(false);
 }, [tournamentId]);

 useEffect(() => {
 loadTournament();
 }, [loadTournament]);

 const standings = useMemo(() => {
 if (!tournament) return [];
 return TournamentEngine.standings(tournament, matches);
 }, [tournament, matches]);

 const { battingLeaders, bowlingLeaders } = useMemo(() => {
 if (!tournament) return { battingLeaders: [], bowlingLeaders: [] };
 return NetRunRateEngine.generateLeaderboard(tournament.id, matches);
 }, [tournament, matches]);

 // CSV export (improvement run): standings + leaderboards from
 // the same engine read paths this page renders.
 const handleExportCsv = () => {
 if (!tournament) return;
 downloadCsv(tournamentCsvFilename(tournament), tournamentToCsv(tournament, matches));
 showAppToast(t('share_csv_downloaded', 'Tournament data downloaded as CSV.'));
 };

 if (loading) {
   return (
     <div className="max-w-5xl xl:max-w-6xl mx-auto space-y-4 sm:space-y-5 w-full pb-safe pb-8 p-4 sm:p-6 animate-fade-in select-none">
       <div className="flex items-center justify-between">
         <Skeleton className="w-28 h-7 rounded-lg" />
         <Skeleton className="w-24 h-6 rounded-full" />
       </div>
       <Skeleton className="w-full h-44 rounded-3xl" />
       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
         <Skeleton className="w-full h-64 rounded-2xl" />
         <Skeleton className="w-full h-64 rounded-2xl" />
       </div>
     </div>
   );
 }

 // F4-03: a finished load with no tournament is a dead end, not a
 // loading state — give it the same not-found treatment as matches.
 if (!tournament) {
   return (
     <div className="text-center p-12 space-y-3">
       <h2 className="font-bold text-h3">{loadError ? t('tournaments_id_load_error', 'Could Not Load This Tournament') : t('tournaments_id_not_found', 'Tournament Not Found')}</h2>
       {loadError && (
         <p className="text-caption text-[var(--muted-foreground)]">
           {t('tournaments_id_load_error_desc', 'Something went wrong while reading the tournament from this device.')}
         </p>
       )}
       <Link href="/tournaments" className="font-bold hover:underline text-emerald-600">
         {t('tournaments_id_back', 'Back to Tournaments')}
       </Link>
     </div>
   );
 }

 const handleRecordWinner = async (fixtureId: string, winner: string) => {
 const updated = TournamentEngine.recordWinner({
 tournament,
 fixtureId,
 winner,
 matches,
 });
 await FeatureHubRepository.saveTournament(updated);
 setTournament(updated);
 };

 const handleRecordTie = async (fixtureId: string) => {
 const updated = TournamentEngine.recordTie({
 tournament,
 fixtureId,
 matches,
 });
 await FeatureHubRepository.saveTournament(updated);
 setTournament(updated);
 };

 const handleClearResult = async (fixtureId: string) => {
 const updated = TournamentEngine.clearResult({
 tournament,
 fixtureId,
 matches,
 });
 await FeatureHubRepository.saveTournament(updated);
 setTournament(updated);
 };

 const handleRecordNoResult = async (fixtureId: string) => {
 const updated = TournamentEngine.recordNoResult({
 tournament,
 fixtureId,
 matches,
 });
 await FeatureHubRepository.saveTournament(updated);
 setTournament(updated);
 };

 const handleLaunchMatch = (fixture: TournamentFixture) => {
 const setupData = {
 teamA: fixture.homeTeam,
 teamB: fixture.awayTeam || '',
 overs: tournament.matchOvers,
 tossWinner: fixture.homeTeam,
 tossDecision: 'Batting',
 venue: '',
  advancedSettings: {
   tournamentId: tournament.id,
   fixtureId: fixture.id,
   players: 11,
   wideBall: true,
   wideReball: true,
   wideRun: 1,
   noBall: true,
   noBallReball: true,
   noBallRun: 1,
   isManualLimitEnabled: false,
   manualOverLimit: BowlingLimiter.calculateMaxOvers(tournament.matchOvers),
   bowlingLimitMode: BowlingLimiter.resolveMode(tournament.matchOvers),
   maxOversPerBowler: BowlingLimiter.calculateMaxOvers(tournament.matchOvers),
  },
 };

 sessionStorage.setItem('pending_match_setup', JSON.stringify(setupData));
 router.push('/matches/opening-players');
 };

 // ── Schedule (feature layer): round-robin + top-4 bracket ──
 const schedule: ScheduleFixture[] =
 (tournament as TournamentWithSchedule).schedule ?? [];
 const leagueSchedule = schedule.filter((f) => f.stage === 'LEAGUE');
 const semiSchedule = schedule.filter((f) => f.stage === 'SEMI');
 const finalSchedule = schedule.filter((f) => f.stage === 'FINAL');
 const matchById = new Map(matches.map((m) => [m.id, m]));

 const persistSchedule = async (next: ScheduleFixture[]) => {
 const updated = { ...tournament, schedule: next };
 await FeatureHubRepository.saveTournament(updated as Tournament);
 setTournament(updated as Tournament);
 };

 const buildLeagueSchedule = async () => {
 const fresh = generateRoundRobinFixtures(tournament.teams, {
 idPrefix: `sched-${tournament.id}`,
 meetings: tournament.leagueMeetings,
 });
 await persistSchedule([
 ...fresh,
 ...schedule.filter((f) => f.stage !== 'LEAGUE'),
 ]);
 };

 const buildKnockoutSchedule = async () => {
 const topFour = standings.slice(0, 4).map((row) => row.team);
 const maxLeagueRound = leagueSchedule.reduce(
 (max, f) => Math.max(max, f.round),
 0
 );
 const fresh = generateKnockoutFixtures(topFour, {
 idPrefix: `sched-${tournament.id}`,
 startRound: maxLeagueRound + 1,
 });
 await persistSchedule([
 ...schedule.filter((f) => f.stage === 'LEAGUE'),
 ...fresh,
 ]);
 };

 const handleGenerateLeague = () => {
 if (leagueSchedule.length > 0) setConfirmAction('league');
 else void buildLeagueSchedule();
 };

 const handleGenerateKnockout = () => {
 if (semiSchedule.length > 0 || finalSchedule.length > 0) {
 setConfirmAction('knockout');
 } else {
 void buildKnockoutSchedule();
 }
 };

 const fixtureScoreLine = (fixture: ScheduleFixture): string | null => {
 if (!fixture.matchId) return null;
 const m = matchById.get(fixture.matchId);
 if (!m) return null;
 if (m.status === 'COMPLETED') return fixture.resultText || m.result || 'Completed';
 const inn1 = m.firstInnings;
 const inn2 = m.secondInnings;
 if (!inn1) return 'Match in progress';
 const line1 = `${inn1.team} ${inn1.totalRuns}/${inn1.totalWickets}`;
 return inn2
 ? `${line1} \u2022 ${inn2.team} ${inn2.totalRuns}/${inn2.totalWickets}`
 : `${line1} \u2022 innings break`;
 };

 const playoffFixtures = tournament.fixtures.filter((f) => f.stage !== 'league' && f.stage !== 'knockout');

 return (
 <div className="max-w-5xl xl:max-w-6xl mx-auto space-y-4 sm:space-y-5 w-full pb-safe pb-8">
 {/* ── COMPACT INLINE iOS HEADER ── */}
 <div className="flex items-center justify-between gap-2 min-w-0 py-0.5">
 <div className="flex items-center gap-2 min-w-0">
 <BackButton
 fallbackUrl="/tournaments"
 showLabel={false}
 className="[&_svg]:text-[#181868] dark:[&_svg]:text-white"
 title={t('tournaments_id_back', 'Back to Tournaments')}
 size="sm"
 />
 <h2 className="font-extrabold text-base sm:text-lg text-[#181868] dark:text-white tracking-tight truncate leading-none">
 {t('tournaments_id_details', 'Tournament Details')}
 </h2>
 </div>

 <div className="flex items-center gap-2 shrink-0">
 <button
 type="button"
 onClick={handleExportCsv}
 className="inline-flex items-center gap-1.5 bg-transparent text-[#181868] dark:text-white font-bold uppercase tracking-wider px-3 py-1 rounded-full text-caption border border-[#181868]/30 dark:border-white/30 hover:bg-[#181868]/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
 >
 <Download className="w-3.5 h-3.5" />
 {t('export_csv', 'Export CSV')}
 </button>
 <span className="bg-[#e8b850] text-[#181868] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full text-caption">
 {tournament.format}
 </span>
 </div>
 </div>

 {/* Hero Banner */}
 <div className="relative overflow-hidden bg-[#181868] shadow-elev3 rounded-3xl text-white space-y-3 p-6 sm:p-8">
 <div className="relative flex md:items-center justify-between flex-wrap gap-4">
 <div className="flex items-center gap-3.5 min-w-0">
 <div className="w-11 h-11 rounded-full border-2 border-[#e8b850]/70 flex items-center justify-center shrink-0">
 <Trophy className="w-5 h-5 text-[#e8b850]" />
 </div>
 <div className="min-w-0">
 <div className="flex items-center font-bold uppercase tracking-widest flex-wrap text-caption gap-2 mb-1 text-[#e8b850]">
 <span>{tournament.teams.length} {t('tournaments_teams_suffix', 'Teams')}</span>
 <span>•</span>
 <span>{tournament.matchOvers} {t('overs', 'Overs')}</span>
 <span>•</span>
 <span>{tournament.fixtures.length} {t('tournaments_id_fixtures', 'Fixtures')}</span>
 </div>
 <h1 className="font-black tracking-tight text-h1">{tournament.name}</h1>
 </div>
 </div>

 {tournament.champion && (
 <div className="bg-[#e8b850]/15 border border-[#e8b850]/40 flex items-center p-3 rounded-2xl gap-3">
 <Award className="shrink-0 text-[#e8b850] w-8 h-8" />
 <div>
 <span className="uppercase font-bold text-[#e8b850]">{t('tournaments_id_champion', 'Tournament Champion')}</span>
 <p className="font-black text-card-title">{tournament.champion}</p>
 </div>
 </div>
)}
 </div>
 </div>

 {/* Tabs */}
 <div className="flex border-b border-[var(--border)] font-bold overflow-x-auto no-scrollbar gap-6 text-body-small">
 <button
 onClick={() => setActiveTab('fixtures')}
 className={`pb-2.5 sm:pb-3 border-b-2 transition-colors shrink-0 whitespace-nowrap min-h-[40px] ${
 activeTab === 'fixtures'
 ? 'border-[#e8b850] text-[#181868] dark:text-white'
 : 'border-transparent text-[var(--muted-foreground)]'
 }`}
 >
 {t('tournaments_id_fixtures', 'Fixtures')} ({tournament.fixtures.length})
 </button>

 <button
 onClick={() => setActiveTab('schedule')}
 className={`pb-2.5 sm:pb-3 border-b-2 transition-colors shrink-0 whitespace-nowrap min-h-[40px] ${
 activeTab === 'schedule'
 ? 'border-[#e8b850] text-[#181868] dark:text-white'
 : 'border-transparent text-[var(--muted-foreground)]'
 }`}
 >
 {t('tournaments_id_schedule', 'Schedule & Bracket')}
 </button>

 {tournament.format === 'league' && (
 <button
 onClick={() => setActiveTab('standings')}
 className={`pb-2.5 sm:pb-3 border-b-2 transition-colors shrink-0 whitespace-nowrap min-h-[40px] ${
 activeTab === 'standings'
 ? 'border-[#e8b850] text-[#181868] dark:text-white'
 : 'border-transparent text-[var(--muted-foreground)]'
 }`}
 >
 {t('tournaments_id_points_table', 'Points Table')}
 </button>
)}

 {tournament.format === 'league' && tournament.teams.length >= 4 && (
 <button
 onClick={() => setActiveTab('playoffs')}
 className={`pb-2.5 sm:pb-3 border-b-2 transition-colors shrink-0 whitespace-nowrap min-h-[40px] ${
 activeTab === 'playoffs'
 ? 'border-[#e8b850] text-[#181868] dark:text-white'
 : 'border-transparent text-[var(--muted-foreground)]'
 }`}
 >
 {t('tournaments_id_playoffs', 'IPL Playoffs')}
 </button>
)}

 <button
 onClick={() => setActiveTab('leaders')}
 className={`pb-2.5 sm:pb-3 border-b-2 transition-colors shrink-0 whitespace-nowrap min-h-[40px] ${
 activeTab === 'leaders'
 ? 'border-[#e8b850] text-[#181868] dark:text-white'
 : 'border-transparent text-[var(--muted-foreground)]'
 }`}
 >
 {t('tournaments_id_leaderboards', 'Leaderboards')}
 </button>
 </div>

 {/* Tab 1: Fixtures */}
 {activeTab === 'fixtures' && (
 <div className="space-y-3">
 {tournament.fixtures.map((fixture, idx) => {
 const isBye = !fixture.awayTeam;
 const isNoResult = fixture.resultType === 'NO_RESULT';
 const isComplete = !!fixture.winner || fixture.isTie || isNoResult;

 return (
 <div
 key={fixture.id}
 className="bg-[var(--card)] border border-[var(--border)] shadow-elev1 rounded-2xl overflow-hidden"
 >
 {/* Matchday Navy strip — TAIMUR picked style (1), 2026-11-11 */}
 <div className="bg-[#181868] px-4 py-2 flex items-center justify-between gap-2 border-b-[3px] border-[#e8b850]">
 <span className="font-bold uppercase tracking-wider text-[11px] text-[#e8b850]">
 {t('tournaments_id_match', 'Match')} {idx + 1} • {t('tournaments_id_round', 'Round')} {fixture.round} • {fixture.stage}
 </span>
 {fixture.isTie && (
 <span className="bg-[#e8b850] text-[#181868] font-extrabold py-0.5 rounded-full text-caption px-2 shrink-0">
 {t('tournaments_id_tied', 'TIED')}
 </span>
)}
 {isNoResult && (
 <span className="bg-white/15 text-white font-extrabold py-0.5 rounded-full text-caption px-2 shrink-0">
 {t('tournaments_id_no_result', 'No Result')}
 </span>
)}
 </div>

 <div className="flex flex-col md:flex-row md:items-center gap-4 p-4">
 <div className="min-w-0 flex-1 space-y-1">

 <div className="flex items-center flex-wrap gap-2">
 <div className="flex items-center font-extrabold tracking-tight gap-1.5 text-card-title">
 <TeamBadgeIcon type="home" size="xs" />
 <span>{fixture.homeTeam}</span>
 </div>
 <span className="font-bold text-caption">{t('analytics_vs', 'vs')}</span>
 <div className="flex items-center font-extrabold tracking-tight gap-1.5 text-card-title">
 <TeamBadgeIcon type="away" size="xs" />
 <span>{fixture.awayTeam || t('tournaments_id_bye', 'BYE')}</span>
 </div>
 </div>

 {fixture.winner && (
 <p className="flex items-center gap-1.5 font-bold text-caption text-[#181868] dark:text-white pt-1">
 <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />
 <span>{t('tournaments_id_winner', 'Winner:')} {fixture.winner}</span>
 </p>
)}
 </div>

 {!isBye && (
 <div className="flex flex-col shrink-0 w-full md:w-[340px] gap-2">
 {/* Launch Live Match — only while the fixture is undecided.
     Once a result stands (winner or tie), the CTA gives way to
     a completed status: a decided match is not launched again.
     Clearing the result below restores Score Match. */}
 {isComplete ? (
 <div className="flex items-center justify-center gap-1.5 min-h-[40px] py-2 px-3.5 rounded-xl bg-[var(--muted)] border border-[var(--border)] text-[var(--muted-foreground)] font-bold text-caption w-full">
 {isNoResult ? (
 <>
 <CloudRain className="w-4 h-4 shrink-0" />
 <span>{t('tournaments_id_no_result', 'No Result')}</span>
 </>
 ) : (
 <>
 <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
 <span>{t('tournaments_id_match_completed', 'Match Completed')}</span>
 </>
 )}
 </div>
 ) : (
 <button
 onClick={() => handleLaunchMatch(fixture)}
 className="bg-[#181868] hover:bg-[#101048] text-white font-bold flex items-center justify-center active:scale-[0.98] transition-all px-3.5 rounded-xl text-caption gap-1.5 min-h-[40px] py-2 shadow-[0_10px_24px_-10px_rgba(24,24,104,0.55)] w-full dark:ring-1 dark:ring-white/20"
 >
 <Play className="fill-current shrink-0 w-3.5 h-3.5" />
 <span>{t('tournaments_id_score_match', 'Score Match')}</span>
 </button>
 )}

 {/* Manual result — hold to confirm (TAIMUR, 2026-11-11).
     The old tap-to-set row overflowed the card (Tie hung
     outside it) and a stray tap locked a result in with no
     way back. Now a tap does nothing: hold 3s to set, hold
     the set result 5s to clear it; a round timer ring on
     the button shows the hold filling. */}
 <div className="grid gap-1.5 grid-cols-[1fr_1fr_64px] w-full">
 <HoldResultButton
 duration={fixture.winner === fixture.homeTeam ? 5000 : 3000}
 onComplete={() =>
 fixture.winner === fixture.homeTeam
 ? handleClearResult(fixture.id)
 : handleRecordWinner(fixture.id, fixture.homeTeam)
 }
 tone={fixture.winner === fixture.homeTeam ? 'red' : 'gold'}
 className={`px-2 py-2 rounded-lg border text-[11px] font-bold min-h-[44px] transition-colors text-center ${
 fixture.winner === fixture.homeTeam
 ? 'bg-[#181868] text-white border-[#181868] shadow-elev2'
 : 'bg-[var(--card)] text-[#181868] dark:text-slate-100 border-[#181868]/25 hover:border-[#181868]/60 shadow-elev1'
 }`}
 title={`${fixture.homeTeam} ${t('tournaments_id_won', 'Won')}`}
 >
 {fixture.homeTeam} {t('tournaments_id_won', 'Won')}
 </HoldResultButton>

 {fixture.awayTeam ? (
 <HoldResultButton
 duration={fixture.winner === fixture.awayTeam ? 5000 : 3000}
 onComplete={() =>
 fixture.winner === fixture.awayTeam
 ? handleClearResult(fixture.id)
 : handleRecordWinner(fixture.id, fixture.awayTeam!)
 }
 tone={fixture.winner === fixture.awayTeam ? 'red' : 'gold'}
 className={`px-2 py-2 rounded-lg border text-[11px] font-bold min-h-[44px] transition-colors text-center ${
 fixture.winner === fixture.awayTeam
 ? 'bg-[#181868] text-white border-[#181868] shadow-elev2'
 : 'bg-[var(--card)] text-[#181868] dark:text-slate-100 border-[#181868]/25 hover:border-[#181868]/60 shadow-elev1'
 }`}
 title={`${fixture.awayTeam} ${t('tournaments_id_won', 'Won')}`}
 >
 {fixture.awayTeam} {t('tournaments_id_won', 'Won')}
 </HoldResultButton>
) : (
 <div />
)}

 <HoldResultButton
 duration={fixture.isTie ? 5000 : 3000}
 onComplete={() =>
 fixture.isTie
 ? handleClearResult(fixture.id)
 : handleRecordTie(fixture.id)
 }
 tone={fixture.isTie ? 'red' : 'gold'}
 className={`px-2 py-2 rounded-lg border text-[11px] font-bold min-h-[44px] transition-colors text-center ${
 fixture.isTie
 ? 'bg-[#e8b850] text-[#181868] border-[#e8b850] shadow-elev2'
 : 'bg-[var(--card)] text-[#181868] dark:text-amber-200 border-[#e8b850]/70 hover:border-[#e8b850] shadow-elev1'
 }`}
 title={t('tournaments_id_tie', 'Tie')}
 >
 {t('tournaments_id_tie', 'Tie')}
 </HoldResultButton>
 </div>
 <p className="text-[11px] leading-tight text-center text-[var(--muted-foreground)]">
 {t('tournaments_id_hold_hint', 'Hold 3s to set a result · hold the set result 5s to clear it')}
 </p>
 <HoldResultButton
 duration={isNoResult ? 5000 : 3000}
 onComplete={() =>
 isNoResult
 ? handleClearResult(fixture.id)
 : handleRecordNoResult(fixture.id)
 }
 tone={isNoResult ? 'red' : 'gold'}
 className={`w-full px-2 py-1.5 rounded-lg border border-dashed text-[11px] font-bold min-h-[36px] transition-colors text-center ${
 isNoResult
 ? 'bg-[var(--muted)] text-[var(--foreground)] border-[var(--border)]'
 : 'bg-transparent text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]'
 }`}
 title={t('tournaments_id_no_result', 'No Result')}
 >
 {t('tournaments_id_no_result', 'No Result')}
 </HoldResultButton>
 {fixture.isTie && (tournament.format === 'knockout' || fixture.stage !== 'league') && (
 <p className="text-[11px] leading-tight text-center font-semibold text-amber-600 dark:text-amber-400">
 {t('tournaments_id_tie_blocks', 'A tie blocks the bracket — clear it (hold Tie 5s), then set a winner.')}
 </p>
 )}
 </div>
)}
 </div>
 </div>
);
 })}
 </div>
)}

 {/* Tab: Schedule & Bracket (feature fixtures) */}
 {activeTab === 'schedule' && (
 <div className="space-y-5">
 <div className="flex flex-wrap items-center gap-2">
 <button
 onClick={handleGenerateLeague}
 className="bg-[#181868] hover:bg-[#101048] text-white font-bold px-4 rounded-xl text-caption min-h-[40px] py-2 active:scale-[0.98] transition-all shadow-[0_10px_24px_-10px_rgba(24,24,104,0.55)]"
 >
 {leagueSchedule.length > 0 ? 'Regenerate Round-Robin' : 'Generate Round-Robin Fixtures'}
 </button>
 {tournament.format !== 'league' && (
 <button
 onClick={handleGenerateKnockout}
 disabled={standings.length < 4}
 className="bg-[var(--card)] border border-[#181868]/30 dark:border-white/30 text-[#181868] dark:text-white hover:bg-[#181868]/5 dark:hover:bg-white/10 font-bold px-4 rounded-xl text-caption min-h-[40px] py-2 disabled:opacity-50 active:scale-[0.98] transition-all shadow-elev1"
 >
 Generate Knockout Bracket (Top 4)
 </button>
 )}
 {tournament.format !== 'league' && standings.length < 4 && (
 <span className="text-caption text-[var(--muted-foreground)]">
 Knockout bracket needs at least 4 teams.
 </span>
 )}
 </div>

 {tournament.format === 'league' && (
 <p className="text-caption text-[var(--muted-foreground)]">
 The knockout stage of this league is the IPL Playoffs — see the IPL Playoffs tab.
 </p>
 )}
 {schedule.length === 0 && (
 <p className="italic text-[var(--muted-foreground)] text-body-small">
 No schedule generated yet. Generate round-robin fixtures to plan every
 league match by round, and a top-4 knockout bracket when you are ready.
 Played matches are linked automatically when their pairing matches.
 </p>
 )}

 {leagueSchedule.length > 0 && (
 <div className="space-y-4">
 {Array.from(new Set(leagueSchedule.map((f) => f.round)))
 .sort((a, b) => a - b)
 .map((round) => (
 <div key={round} className="space-y-2">
 <div className="flex items-center gap-2">
 <span className="w-6 h-[3px] rounded-full bg-[#e8b850] shrink-0" />
 <h3 className="font-black uppercase tracking-wider text-caption text-[#181868] dark:text-white">
 Round {round}
 </h3>
 </div>
 {leagueSchedule
 .filter((f) => f.round === round)
 .map((fixture) => {
 const scoreLine = fixtureScoreLine(fixture);
 return (
 <div
 key={fixture.id}
 className="bg-[var(--card)] border border-[var(--border)] shadow-elev1 flex justify-between flex-wrap items-center p-4 rounded-2xl gap-3"
 >
 <div className="min-w-0 space-y-0.5">
 <p className="font-extrabold tracking-tight text-body-small">
 {fixture.homeTeam}
 <span className="font-bold text-caption text-[var(--muted-foreground)]"> vs </span>
 {fixture.awayTeam || 'BYE'}
 </p>
 {scoreLine && (
 <p className="text-caption text-[var(--muted-foreground)]">{scoreLine}</p>
 )}
 {fixture.winner && (
 <p className="flex items-center gap-1.5 font-bold text-caption text-[#181868] dark:text-white">
 <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />
 <span>Winner: {fixture.winner}</span>
 </p>
 )}
 </div>
 <div className="flex items-center gap-2 shrink-0">
 {fixture.awayTeam && (
 <span
 className={`font-extrabold uppercase py-0.5 rounded-full text-caption px-2 ${
 fixture.status === 'COMPLETED'
 ? 'bg-[#181868]/10 text-[#181868] dark:bg-white/10 dark:text-slate-200'
 : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
 }`}
 >
 {fixture.status === 'COMPLETED' ? 'Completed' : 'Scheduled'}
 </span>
 )}
 {fixture.matchId && (
 <Link
 href={`/matches/center/${fixture.matchId}`}
 className="font-bold text-[#181868] dark:text-white hover:underline text-caption"
 >
 View Match
 </Link>
 )}
 </div>
 </div>
 );
 })}
 </div>
 ))}
 </div>
 )}

 {tournament.format !== 'league' && (semiSchedule.length > 0 || finalSchedule.length > 0) && (
 <div className="space-y-3">
 <div className="flex items-center gap-2">
 <span className="w-6 h-[3px] rounded-full bg-[#e8b850] shrink-0" />
 <h3 className="font-black uppercase tracking-wider text-caption text-[#181868] dark:text-white">
 Knockout Bracket
 </h3>
 </div>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div className="space-y-3">
 <p className="font-bold text-caption uppercase tracking-wider text-[#181868] dark:text-white">Semi-Finals</p>
 {semiSchedule.map((fixture, i) => {
 const scoreLine = fixtureScoreLine(fixture);
 return (
 <div key={fixture.id} className="bg-[var(--card)] border border-[var(--border)] shadow-elev1 rounded-2xl overflow-hidden">
 <div className="bg-[#181868] px-4 py-1.5 border-b-[3px] border-[#e8b850]">
 <span className="text-[11px] font-bold uppercase tracking-wider text-[#e8b850]">
 Semi-Final {i + 1}
 </span>
 </div>
 <div className="p-4 space-y-1">
 <p className="font-black text-body-small">
 {fixture.homeTeam} vs {fixture.awayTeam || 'TBD'}
 </p>
 {scoreLine && <p className="text-caption text-[var(--muted-foreground)]">{scoreLine}</p>}
 {fixture.winner && (
 <p className="flex items-center gap-1.5 font-bold text-caption text-[#181868] dark:text-white">
 <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />
 <span>Winner: {fixture.winner}</span>
 </p>
 )}
 {fixture.matchId && (
 <Link href={`/matches/center/${fixture.matchId}`} className="font-bold text-[#181868] dark:text-white hover:underline text-caption">
 View Match
 </Link>
 )}
 </div>
 </div>
 );
 })}
 </div>
 <div className="space-y-3">
 <p className="font-bold text-caption uppercase tracking-wider text-[#181868] dark:text-white">Final</p>
 {finalSchedule.map((fixture) => {
 const scoreLine = fixtureScoreLine(fixture);
 const undecided = isPlaceholderTeam(fixture.homeTeam) || isPlaceholderTeam(fixture.awayTeam);
 return (
 <div key={fixture.id} className="bg-[var(--card)] border border-[#e8b850]/60 shadow-elev1 rounded-2xl overflow-hidden">
 <div className="bg-[#e8b850] px-4 py-1.5 flex items-center gap-1.5">
 <Trophy className="w-3.5 h-3.5 text-[#181868]" />
 <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#181868]">
 Final
 </span>
 </div>
 <div className="p-4 space-y-1">
 <p className="font-black text-body-small">
 <span className={undecided && isPlaceholderTeam(fixture.homeTeam) ? 'italic text-[var(--muted-foreground)]' : ''}>
 {fixture.homeTeam}
 </span>
 {' vs '}
 <span className={undecided && isPlaceholderTeam(fixture.awayTeam) ? 'italic text-[var(--muted-foreground)]' : ''}>
 {fixture.awayTeam || 'TBD'}
 </span>
 </p>
 {scoreLine && <p className="text-caption text-[var(--muted-foreground)]">{scoreLine}</p>}
 {fixture.winner && (
 <p className="font-black text-[#181868] dark:text-white text-caption flex items-center gap-1.5">
 <Trophy className="w-3.5 h-3.5 text-amber-500" /> Champion: {fixture.winner}
 </p>
 )}
 {fixture.matchId && (
 <Link href={`/matches/center/${fixture.matchId}`} className="font-bold text-[#181868] dark:text-white hover:underline text-caption">
 View Match
 </Link>
 )}
 </div>
 </div>
 );
 })}
 </div>
 </div>
 </div>
 )}
 </div>
 )}

 {/* Tab 2: Standings / Points Table */}
 {activeTab === 'standings' && (
 <div className="floating-card shadow-elev1 overflow-hidden">
 <div className="grid grid-cols-[24px_1fr_26px_26px_26px_26px_52px_32px] items-center gap-1 px-4 py-2.5 bg-[var(--muted)] border-b border-[var(--border)] text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted-foreground)]">
 <span className="leading-none">#</span>
 <span className="leading-none">{t('tournaments_id_team', 'Team')}</span>
 <span className="text-center leading-none">P</span>
 <span className="text-center leading-none">W</span>
 <span className="text-center leading-none">T</span>
 <span className="text-center leading-none">L</span>
 <span className="text-right leading-none">NRR</span>
 <span className="text-right leading-none">Pts</span>
 </div>
 <div className="divide-y divide-[var(--border)] num-font">
 {standings.map((s, idx) => (
 <div
 key={s.team}
 className={`grid grid-cols-[24px_1fr_26px_26px_26px_26px_52px_32px] items-center gap-1 px-4 py-3 hover:bg-muted/40 ${
 tournament?.format === 'league' && standings.length > 4 && idx === 3
 ? 'border-b-2 border-b-emerald-500/60'
 : ''
 }`}
 >
 <span className="font-bold text-[var(--muted-foreground)] leading-none">{idx + 1}</span>
 <span className="font-black truncate text-body-small leading-none">{s.team}</span>
 <span className="font-semibold text-center leading-none">{s.played}</span>
 <span className="font-bold text-center text-emerald-600 leading-none">{s.wins}</span>
 <span className="text-center text-amber-500 leading-none">{s.ties}</span>
 <span className="text-center text-red-500 leading-none">{s.losses}</span>
 <span
 className={`font-semibold text-right text-caption leading-none ${
 s.netRunRate > 0
 ? 'text-emerald-600 dark:text-emerald-400 font-bold'
 : s.netRunRate < 0
 ? 'text-red-500 font-medium'
 : 'text-[var(--muted-foreground)]'
 }`}
 >
 {s.netRunRate > 0 ? `+${s.netRunRate.toFixed(3)}` : s.netRunRate.toFixed(3)}
 </span>
 <span className="font-black text-right text-body leading-none">{s.points}</span>
 </div>
 ))}
 </div>
 </div>
)}

 {/* Tab 3: IPL Playoffs */}
 {activeTab === 'playoffs' && (
 <div className="space-y-4">
 <div className="bg-blue-500/10 border border-blue-500/20 font-semibold dark:text-blue-400 rounded-xl text-caption p-4">
 {t('tournaments_id_playoff_desc', 'IPL-Style Playoff Bracket: Qualifier 1 (Top 2), Eliminator (3rd vs 4th), Qualifier 2, and Final!')}
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {playoffFixtures.map((fix) => (
 <div
 key={fix.id}
 className="bg-[var(--card)] border border-[var(--border)] shadow-elev1 rounded-2xl p-5 space-y-3"
 >
 <div className="flex items-center justify-between">
 <span className="bg-emerald-500/10 font-extrabold uppercase py-0.5 rounded-full text-caption px-2">
 {fix.stage}
 </span>
 {fix.winner && (
 <span className="font-bold text-caption">
 {t('tournaments_id_winner', 'Winner:')} {fix.winner}
 </span>
)}
 </div>

 <h3 className="font-black text-card-title">
 {fix.homeTeam} {t('analytics_vs', 'vs')} {fix.awayTeam || t('tournaments_id_tbd', 'TBD')}
 </h3>

 {fix.awayTeam && !fix.winner && (
 <div className="grid border-t border-[var(--border)] grid-cols-2 gap-2 pt-2">
 <button
 onClick={() => handleRecordWinner(fix.id, fix.homeTeam)}
 className="bg-[var(--muted)] hover:bg-emerald-600 hover:text-white font-bold transition-colors truncate px-4 rounded-lg min-h-[40px] w-full py-2 text-caption"
 title={`${fix.homeTeam} ${t('tournaments_id_won', 'Won')}`}
 >
 <span className="truncate block">{fix.homeTeam} {t('tournaments_id_won', 'Won')}</span>
 </button>
 <button
 onClick={() => handleRecordWinner(fix.id, fix.awayTeam!)}
 className="bg-[var(--muted)] hover:bg-emerald-600 hover:text-white font-bold transition-colors truncate px-4 rounded-lg min-h-[40px] w-full py-2 text-caption"
 title={`${fix.awayTeam} ${t('tournaments_id_won', 'Won')}`}
 >
 <span className="truncate block">{fix.awayTeam} {t('tournaments_id_won', 'Won')}</span>
 </button>
 </div>
)}
 </div>
))}
 </div>
 </div>
)}

 {/* Tab 4: Leaderboards (Orange Cap & Purple Cap) */}
 {activeTab === 'leaders' && (
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 {/* Orange Cap (Batting) */}
 <div className="floating-card shadow-elev1 overflow-hidden">
 <div className="bg-gradient-to-r from-orange-600 to-amber-500 flex items-center gap-2.5 px-4 py-3.5">
 <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
 <Crown className="w-[18px] h-[18px] text-white" />
 </span>
 <span className="font-black text-white uppercase tracking-wider text-body-small">
 {t('tournaments_id_orange_cap', 'Orange Cap — Most Runs')}
 </span>
 </div>

 {battingLeaders.length > 0 && (
 <div className="grid grid-cols-[28px_1fr_46px_54px_54px] items-center gap-2 px-4 py-2 bg-[var(--muted)] border-b border-[var(--border)] text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted-foreground)]">
 <span />
 <span className="leading-none">{t('tournaments_id_col_batsman', 'Batsman')}</span>
 <span className="text-right leading-none">{t('tournaments_id_col_runs', 'Runs')}</span>
 <span className="text-right leading-none">{t('tournaments_id_col_sr', 'SR')}</span>
 <span className="text-right leading-none">{t('tournaments_id_col_avg', 'Avg')}</span>
 </div>
 )}

 <div className="divide-y divide-[var(--border)] text-caption">
 {battingLeaders.length === 0 ? (
 <p className="italic text-[var(--muted-foreground)] p-6">
 {t('tournaments_id_no_batting_data', 'No match data recorded for this tournament yet.')}
 </p>
) : (
 battingLeaders.slice(0, 10).map((b, i) => (
 <div key={i} className={`grid grid-cols-[28px_1fr_46px_54px_54px] items-center gap-2 px-4 py-3 hover:bg-muted/30 ${i === 0 ? 'bg-orange-500/[0.07] dark:bg-orange-500/10' : ''}`}>
 <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-extrabold shrink-0 ${
 i === 0
 ? 'bg-orange-600 text-white'
 : i < 3
 ? 'bg-orange-500/15 text-orange-700 dark:text-orange-300'
 : 'text-[var(--muted-foreground)]'
 }`}>
 {i + 1}
 </span>
 <div className="flex-1 min-w-0">
 <span className="font-bold text-body-small inline-flex items-center gap-1.5">
 {b.name}
 {i === 0 && <Crown className="w-4 h-4 text-orange-500 shrink-0" />}
 </span>
 <p className="text-[var(--muted-foreground)] truncate">{b.team} • {b.innings} {t('tournaments_id_innings', 'innings')}</p>
 </div>
 <span className={`num-font text-right font-black text-body leading-none ${i === 0 ? 'text-orange-600 dark:text-orange-400' : ''}`}>{b.runs}</span>
 <span className="num-font text-right font-semibold text-body-small leading-none">{b.strikeRate.toFixed(1)}</span>
 <span className="num-font text-right font-semibold text-body-small leading-none">{b.average.toFixed(1)}</span>
 </div>
))
)}
 </div>
 </div>

 {/* Purple Cap (Bowling) */}
 <div className="floating-card shadow-elev1 overflow-hidden">
 <div className="bg-gradient-to-r from-purple-700 to-violet-500 flex items-center gap-2.5 px-4 py-3.5">
 <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
 <Crown className="w-[18px] h-[18px] text-white" />
 </span>
 <span className="font-black text-white uppercase tracking-wider text-body-small">
 {t('tournaments_id_purple_cap', 'Purple Cap — Most Wickets')}
 </span>
 </div>

 {bowlingLeaders.length > 0 && (
 <div className="grid grid-cols-[28px_1fr_54px_54px_46px] items-center gap-2 px-4 py-2 bg-[var(--muted)] border-b border-[var(--border)] text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted-foreground)]">
 <span />
 <span className="leading-none">{t('tournaments_id_col_bowler', 'Bowler')}</span>
 <span className="text-right leading-none">{t('tournaments_id_col_wkts', 'Wkts')}</span>
 <span className="text-right leading-none">{t('tournaments_id_col_econ', 'Econ')}</span>
 <span className="text-right leading-none">{t('tournaments_id_col_best', 'Best')}</span>
 </div>
 )}

 <div className="divide-y divide-[var(--border)] text-caption">
 {bowlingLeaders.length === 0 ? (
 <p className="italic text-[var(--muted-foreground)] p-6">
 {t('tournaments_id_no_bowling_data', 'No bowling data recorded for this tournament yet.')}
 </p>
) : (
 bowlingLeaders.slice(0, 10).map((b, i) => (
 <div key={i} className={`grid grid-cols-[28px_1fr_54px_54px_46px] items-center gap-2 px-4 py-3 hover:bg-muted/30 ${i === 0 ? 'bg-purple-500/[0.07] dark:bg-purple-500/10' : ''}`}>
 <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-extrabold shrink-0 ${
 i === 0
 ? 'bg-purple-600 text-white'
 : i < 3
 ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300'
 : 'text-[var(--muted-foreground)]'
 }`}>
 {i + 1}
 </span>
 <div className="flex-1 min-w-0">
 <span className="font-bold text-body-small inline-flex items-center gap-1.5">
 {b.name}
 {i === 0 && <Crown className="w-4 h-4 text-purple-500 shrink-0" />}
 </span>
 <p className="text-[var(--muted-foreground)] truncate">{b.team} • {b.innings} {t('tournaments_id_innings', 'innings')}</p>
 </div>
 <span className={`num-font text-right font-black text-body leading-none ${i === 0 ? 'text-purple-600 dark:text-purple-400' : ''}`}>{b.wickets}</span>
 <span className="num-font text-right font-semibold text-body-small leading-none">{b.economy.toFixed(2)}</span>
 <span className="num-font text-right font-semibold text-body-small leading-none">{b.bestFigures}</span>
 </div>
))
)}
 </div>
 </div>
 </div>
)}
 <ConfirmationDialog
 open={confirmAction !== null}
 title={confirmAction === 'league' ? 'Regenerate round-robin fixtures?' : 'Regenerate knockout bracket?'}
 description={
 confirmAction === 'league'
 ? 'This replaces the current league schedule. Linked results on replaced fixtures will be re-matched at next load, but manual changes to the schedule are lost.'
 : 'This replaces the current semi-final and final fixtures with a fresh bracket from the current standings.'
 }
 confirmLabel="Regenerate"
 destructive
 onConfirm={() => {
 const action = confirmAction;
 setConfirmAction(null);
 if (action === 'league') void buildLeagueSchedule();
 else if (action === 'knockout') void buildKnockoutSchedule();
 }}
 onCancel={() => setConfirmAction(null)}
 />

 </div>
);
}
