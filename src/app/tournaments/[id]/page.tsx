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
 title={t('tournaments_id_back', 'Back to Tournaments')}
 size="sm"
 />
 <h2 className="font-extrabold text-base sm:text-lg text-[var(--foreground)] tracking-tight truncate leading-none">
 {t('tournaments_id_details', 'Tournament Details')}
 </h2>
 </div>

 <div className="flex items-center gap-2 shrink-0">
 <button
 type="button"
 onClick={handleExportCsv}
 className="inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider px-3 py-1 rounded-full text-caption border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors cursor-pointer"
 >
 <Download className="w-3.5 h-3.5" />
 {t('export_csv', 'Export CSV')}
 </button>
 <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider px-3 py-1 rounded-full text-caption border border-amber-500/20">
 {tournament.format}
 </span>
 </div>
 </div>

 {/* Hero Banner */}
 <div className="bg-gradient-to-r from-amber-950 via-slate-900 to-emerald-950 shadow-elev3 border border-white/10 rounded-3xl text-white space-y-3 p-8">
 <div className="flex md:items-center justify-between flex-wrap gap-4">
 <div>
 <div className="flex items-center font-bold uppercase tracking-widest flex-wrap text-caption gap-2 mb-1">
 <span>{tournament.teams.length} {t('tournaments_teams_suffix', 'Teams')}</span>
 <span>•</span>
 <span>{tournament.matchOvers} {t('overs', 'Overs')}</span>
 <span>•</span>
 <span>{tournament.fixtures.length} {t('tournaments_id_fixtures', 'Fixtures')}</span>
 </div>
 <h1 className="font-black tracking-tight text-h1">{tournament.name}</h1>
 </div>

 {tournament.champion && (
 <div className="bg-amber-500/20 border border-amber-500/40 flex items-center p-3 rounded-2xl gap-3">
 <Award className="shrink-0 text-amber-400 w-8 h-8" />
 <div>
 <span className="uppercase font-bold text-amber-300">{t('tournaments_id_champion', 'Tournament Champion')}</span>
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
 ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
 : 'border-transparent text-[var(--muted-foreground)]'
 }`}
 >
 {t('tournaments_id_fixtures', 'Fixtures')} ({tournament.fixtures.length})
 </button>

 <button
 onClick={() => setActiveTab('schedule')}
 className={`pb-2.5 sm:pb-3 border-b-2 transition-colors shrink-0 whitespace-nowrap min-h-[40px] ${
 activeTab === 'schedule'
 ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
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
 ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
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
 ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
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
 ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
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
 const isComplete = !!fixture.winner || fixture.isTie;

 return (
 <div
 key={fixture.id}
 className="bg-[var(--card)] border border-[var(--border)] shadow-elev1 flex justify-between flex-wrap items-center p-5 rounded-2xl gap-4"
 >
 <div className="min-w-0 space-y-1">
 <div className="flex items-center gap-2">
 <span className="font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
 {t('tournaments_id_match', 'Match')} {idx + 1} • {t('tournaments_id_round', 'Round')} {fixture.round} • {fixture.stage}
 </span>
 {fixture.isTie && (
 <span className="bg-amber-500/10 font-extrabold py-0.5 rounded-full text-caption px-2">
 {t('tournaments_id_tied', 'TIED')}
 </span>
)}
 </div>

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
 <p className="font-semibold dark:text-emerald-400 text-caption">
 {t('tournaments_id_winner', 'Winner:')} {fixture.winner}
 </p>
)}
 </div>

 {!isBye && (
 <div className="flex items-stretch sm:items-center shrink-0 border-t md:border-t-0 border-[var(--border)] flex-wrap gap-2 pt-0">
 {/* Launch Live Match */}
 <button
 onClick={() => handleLaunchMatch(fixture)}
 className="bg-emerald-600 hover:bg-emerald-500 font-bold flex items-center justify-center active:scale-[0.98] transition-all px-3.5 rounded-xl text-caption gap-1.5 min-h-[40px] py-2 shadow-elev2"
 >
 <Play className="fill-current shrink-0 w-3.5 h-3.5" />
 <span>{t('tournaments_id_score_match', 'Score Match')}</span>
 </button>

 {/* Manual Quick Record Options */}
 <div className="grid gap-1.5 grid-cols-3">
 <button
 onClick={() => handleRecordWinner(fixture.id, fixture.homeTeam)}
 className={`px-2 py-2 rounded-lg border text-caption font-bold min-h-[40px] transition-colors truncate text-center ${
 fixture.winner === fixture.homeTeam
 ? 'bg-emerald-600 text-white border-emerald-600 shadow-elev2'
 : 'bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)] hover:border-emerald-500/40 shadow-elev1'
 }`}
 title={`${fixture.homeTeam} ${t('tournaments_id_won', 'Won')}`}
 >
 <span className="truncate block">{fixture.homeTeam} {t('tournaments_id_won', 'Won')}</span>
 </button>

 {fixture.awayTeam ? (
 <button
 onClick={() => handleRecordWinner(fixture.id, fixture.awayTeam!)}
 className={`px-2 py-2 rounded-lg border text-caption font-bold min-h-[40px] transition-colors truncate text-center ${
 fixture.winner === fixture.awayTeam
 ? 'bg-emerald-600 text-white border-emerald-600 shadow-elev2'
 : 'bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)] hover:border-emerald-500/40 shadow-elev1'
 }`}
 title={`${fixture.awayTeam} ${t('tournaments_id_won', 'Won')}`}
 >
 <span className="truncate block">{fixture.awayTeam} {t('tournaments_id_won', 'Won')}</span>
 </button>
) : (
 <div />
)}

 <button
 onClick={() => handleRecordTie(fixture.id)}
 className={`px-2 py-2 rounded-lg border text-caption font-bold min-h-[40px] transition-colors flex items-center justify-center ${
 fixture.isTie
 ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-elev2'
 : 'bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)] shadow-elev1'
 }`}
 >
 {t('tournaments_id_tie', 'Tie')}
 </button>
 </div>
 </div>
)}
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
 className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 rounded-xl text-caption min-h-[40px] py-2 active:scale-[0.98] transition-all shadow-elev2"
 >
 {leagueSchedule.length > 0 ? 'Regenerate Round-Robin' : 'Generate Round-Robin Fixtures'}
 </button>
 <button
 onClick={handleGenerateKnockout}
 disabled={standings.length < 4}
 className="bg-[var(--card)] border border-[var(--border)] font-bold px-4 rounded-xl text-caption min-h-[40px] py-2 disabled:opacity-50 active:scale-[0.98] transition-all shadow-elev1"
 >
 Generate Knockout Bracket (Top 4)
 </button>
 {standings.length < 4 && (
 <span className="text-caption text-[var(--muted-foreground)]">
 Knockout bracket needs at least 4 teams.
 </span>
 )}
 </div>

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
 <h3 className="font-black uppercase tracking-wider text-caption text-[var(--muted-foreground)]">
 Round {round}
 </h3>
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
 <p className="font-semibold text-emerald-600 dark:text-emerald-400 text-caption">
 Winner: {fixture.winner}
 </p>
 )}
 </div>
 <div className="flex items-center gap-2 shrink-0">
 {fixture.awayTeam && (
 <span
 className={`font-extrabold uppercase py-0.5 rounded-full text-caption px-2 ${
 fixture.status === 'COMPLETED'
 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
 : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
 }`}
 >
 {fixture.status === 'COMPLETED' ? 'Completed' : 'Scheduled'}
 </span>
 )}
 {fixture.matchId && (
 <Link
 href={`/matches/center/${fixture.matchId}`}
 className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline text-caption"
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

 {(semiSchedule.length > 0 || finalSchedule.length > 0) && (
 <div className="space-y-3">
 <h3 className="font-black uppercase tracking-wider text-caption text-[var(--muted-foreground)]">
 Knockout Bracket
 </h3>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div className="space-y-3">
 <p className="font-bold text-caption uppercase tracking-wider">Semi-Finals</p>
 {semiSchedule.map((fixture, i) => {
 const scoreLine = fixtureScoreLine(fixture);
 return (
 <div key={fixture.id} className="bg-[var(--card)] border border-[var(--border)] shadow-elev1 rounded-2xl p-4 space-y-1">
 <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 font-extrabold uppercase py-0.5 rounded-full text-caption px-2">
 Semi-Final {i + 1}
 </span>
 <p className="font-black text-body-small pt-1">
 {fixture.homeTeam} vs {fixture.awayTeam || 'TBD'}
 </p>
 {scoreLine && <p className="text-caption text-[var(--muted-foreground)]">{scoreLine}</p>}
 {fixture.winner && (
 <p className="font-semibold text-emerald-600 dark:text-emerald-400 text-caption">
 Winner: {fixture.winner}
 </p>
 )}
 {fixture.matchId && (
 <Link href={`/matches/center/${fixture.matchId}`} className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline text-caption">
 View Match
 </Link>
 )}
 </div>
 );
 })}
 </div>
 <div className="space-y-3">
 <p className="font-bold text-caption uppercase tracking-wider">Final</p>
 {finalSchedule.map((fixture) => {
 const scoreLine = fixtureScoreLine(fixture);
 const undecided = isPlaceholderTeam(fixture.homeTeam) || isPlaceholderTeam(fixture.awayTeam);
 return (
 <div key={fixture.id} className="bg-[var(--card)] border border-amber-500/30 shadow-elev1 rounded-2xl p-4 space-y-1">
 <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 font-extrabold uppercase py-0.5 rounded-full text-caption px-2">
 Final
 </span>
 <p className="font-black text-body-small pt-1">
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
 <p className="font-black text-amber-600 dark:text-amber-400 text-caption flex items-center gap-1.5">
 <Trophy className="w-3.5 h-3.5" /> Champion: {fixture.winner}
 </p>
 )}
 {fixture.matchId && (
 <Link href={`/matches/center/${fixture.matchId}`} className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline text-caption">
 View Match
 </Link>
 )}
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
 <div className="overflow-x-auto table-scroll-container">
 <table className="text-caption min-w-[420px] w-full">
 <thead className="bg-[var(--muted)] font-bold uppercase border-b border-[var(--border)] text-[var(--muted-foreground)]">
 <tr>
 <th className="py-3 px-4">{t('tournaments_id_pos', 'Pos')}</th>
 <th className="py-3 px-4">{t('tournaments_id_team', 'Team')}</th>
 <th className="py-3 px-3 text-center">
 <span className="sm:hidden">P</span>
 <span className="hidden sm:inline">{t('tournaments_id_played', 'Played')}</span>
 </th>
 <th className="py-3 px-3 text-center">
 <span className="sm:hidden">W</span>
 <span className="hidden sm:inline">{t('tournaments_id_won_col', 'Won')}</span>
 </th>
 <th className="py-3 px-3 text-center">
 <span className="sm:hidden">T</span>
 <span className="hidden sm:inline">{t('tournaments_id_tied_col', 'Tied')}</span>
 </th>
 <th className="py-3 px-3 text-center">
 <span className="sm:hidden">L</span>
 <span className="hidden sm:inline">{t('tournaments_id_lost', 'Lost')}</span>
 </th>
 <th className="py-3 px-3 text-center">
 <span className="sm:hidden">NRR</span>
 <span className="hidden sm:inline">{t('tournaments_id_nrr', 'Net Run Rate')}</span>
 </th>
 <th className="font-black py-3 px-4 text-emerald-600">
 <span className="sm:hidden">Pts</span>
 <span className="hidden sm:inline">{t('tournaments_id_points', 'Points')}</span>
 </th>
 </tr>
 </thead>
 <tbody className="divide-y divide-[var(--border)] num-font">
 {standings.map((s, idx) => (
 <tr key={s.team} className="hover:bg-muted/40">
 <td className="font-bold py-3 text-[var(--muted-foreground)] px-4">
 {idx + 1}
 </td>
 <td className="font-black truncate py-3 px-4 text-body-small max-w-[150px]">
 {s.team}
 </td>
 <td className="font-semibold py-3 px-3 text-center">{s.played}</td>
 <td className="font-bold py-3 px-3 text-emerald-600">{s.wins}</td>
 <td className="py-3 px-3 text-amber-500">{s.ties}</td>
 <td className="py-3 px-3 text-red-500">{s.losses}</td>
 <td className="font-semibold py-3 px-3 text-center text-caption">
 <span
 className={
 s.netRunRate > 0
 ? 'text-emerald-600 dark:text-emerald-400 font-bold'
 : s.netRunRate < 0
 ? 'text-red-500 font-medium'
 : 'text-[var(--muted-foreground)]'
 }
 >
 {s.netRunRate > 0 ? `+${s.netRunRate.toFixed(3)}` : s.netRunRate.toFixed(3)}
 </span>
 </td>
 <td className="font-black py-3 px-4 text-body">
 {s.points}
 </td>
 </tr>
))}
 </tbody>
 </table>
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
 <div className="floating-card shadow-elev1 overflow-hidden space-y-2">
 <div className="bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between p-4">
 <span className="font-black dark:text-amber-400 uppercase tracking-wider text-body-small">
 {t('tournaments_id_orange_cap', 'Orange Cap — Most Runs')}
 </span>
 </div>

 <div className="divide-y divide-[var(--border)] text-caption">
 {battingLeaders.length === 0 ? (
 <p className="italic text-[var(--muted-foreground)] p-6">
 {t('tournaments_id_no_batting_data', 'No match data recorded for this tournament yet.')}
 </p>
) : (
 battingLeaders.slice(0, 10).map((b, i) => (
 <div key={i} className="flex items-center justify-between hover:bg-muted/30 p-3">
 <div>
 <span className="font-bold text-body-small">{b.name}</span>
 <p className="text-[var(--muted-foreground)]">{b.team} • {b.innings} {t('tournaments_id_innings', 'innings')}</p>
 </div>
 <div className="num-font text-right">
 <span className="font-black text-body">{b.runs}</span>
 <p className="text-[var(--muted-foreground)]">{t('tournaments_id_sr', 'SR:')} {b.strikeRate.toFixed(1)} | {t('tournaments_id_avg', 'Avg:')} {b.average.toFixed(1)}</p>
 </div>
 </div>
))
)}
 </div>
 </div>

 {/* Purple Cap (Bowling) */}
 <div className="floating-card shadow-elev1 overflow-hidden space-y-2">
 <div className="bg-purple-500/10 border-b border-purple-500/20 flex items-center justify-between p-4">
 <span className="font-black dark:text-purple-400 uppercase tracking-wider text-body-small">
 {t('tournaments_id_purple_cap', 'Purple Cap — Most Wickets')}
 </span>
 </div>

 <div className="divide-y divide-[var(--border)] text-caption">
 {bowlingLeaders.length === 0 ? (
 <p className="italic text-[var(--muted-foreground)] p-6">
 {t('tournaments_id_no_bowling_data', 'No bowling data recorded for this tournament yet.')}
 </p>
) : (
 bowlingLeaders.slice(0, 10).map((b, i) => (
 <div key={i} className="flex items-center justify-between hover:bg-muted/30 p-3">
 <div>
 <span className="font-bold text-body-small">{b.name}</span>
 <p className="text-[var(--muted-foreground)]">{b.team} • {b.innings} {t('tournaments_id_innings', 'innings')}</p>
 </div>
 <div className="num-font text-right">
 <span className="font-black text-body">{b.wickets} {t('tournaments_id_wkts', 'wkts')}</span>
 <p className="text-[var(--muted-foreground)]">{t('tournaments_id_econ', 'Econ:')} {b.economy.toFixed(2)} | {t('tournaments_id_best', 'Best:')} {b.bestFigures}</p>
 </div>
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
