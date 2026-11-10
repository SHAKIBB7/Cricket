'use client';

import { teamDisplayName } from '@/lib/teamDisplayName';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  History,
  Trash2,
  FileText,
  Play,
  CheckSquare,
  Square,
  Search,
  MapPin,
  Trophy,
  ClipboardList,
} from 'lucide-react';
import { MatchRepository } from '@/infrastructure/storage/MatchRepository';
import { MatchScorecard, CricketGround } from '@/domain/cricket/types';
import { GroundRepository } from '@/infrastructure/storage/GroundRepository';
import { MatchCardSkeleton } from '@/components/common/Skeleton';
import { FadeInUp } from '@/components/common/FadeInUp';
import { usePdfDownload } from '@/features/scoring/pdf/usePdfDownload';
import { ConfirmationDialog } from '@/components/overlay/ConfirmationDialog';
import { useLanguage } from '@/context/LanguageContext';

import {
 dayKeyOf,
 winnerTeamOf,
 chaseEquationFor,
} from '@/domain/cricket/analytics/archiveTimeline';

interface MatchDayGroup {
 key: string;
 label: string;
 /** Day-of-month shown inside the timeline node (Polish B); null for undated. */
 dayNum: number | null;
 hasLive: boolean;
 items: MatchScorecard[];
}

export default function MatchHistoryPage() {
 const { t } = useLanguage();
 const router = useRouter();

 const [matches, setMatches] = useState<MatchScorecard[]>([]);
 const [filter, setFilter] = useState<'ALL' | 'COMPLETED' | 'ONGOING'>('ALL');
 const [deleteTarget, setDeleteTarget] = useState<{ type: 'single'; id: string } | { type: 'selected' } | null>(null);
 const [search, setSearch] = useState('');
 const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
 const [selectMode, setSelectMode] = useState(false);
 const [loading, setLoading] = useState(true);
 const [filterGroundId, setFilterGroundId] = useState<string | null>(null);
 const [filterGround, setFilterGround] = useState<CricketGround | null>(null);

 const {
  isGenerating: isExportingPdf,
  downloadPdf,
 } = usePdfDownload();

 useEffect(() => {
 loadMatches();

 if (typeof window !== 'undefined') {
 const params = new URLSearchParams(window.location.search);
 const gid = params.get('groundId');
 if (gid) {
 setFilterGroundId(gid);
 GroundRepository.getGround(gid).then((g) => {
 if (g) setFilterGround(g);
 });
 }
 }
 }, []);

 async function loadMatches() {
 const list = await MatchRepository.getAllMatches();
 setMatches(list);
 setLoading(false);
 }

 const handleDeleteSingle = (id: string, e: React.MouseEvent) => {
 e.stopPropagation();
 setDeleteTarget({ type: 'single', id });
 };

 const handleDeleteSelected = () => {
 if (selectedIds.size === 0) return;
 setDeleteTarget({ type: 'selected' });
 };

 const executeDelete = async () => {
 if (!deleteTarget) return;
 if (deleteTarget.type === 'single') {
 await MatchRepository.deleteMatch(deleteTarget.id);
 } else {
 await MatchRepository.deleteMatches(Array.from(selectedIds));
 setSelectedIds(new Set());
 }
 setDeleteTarget(null);
 loadMatches();
 };

 const toggleSelect = (id: string) => {
 const next = new Set(selectedIds);
 if (next.has(id)) next.delete(id);
 else next.add(id);
 setSelectedIds(next);
 };

 const toggleSelectAll = () => {
 if (selectedIds.size === filteredMatches.length) {
 setSelectedIds(new Set());
 } else {
 setSelectedIds(new Set(filteredMatches.map((m) => m.id)));
 }
 };

 const exitSelectMode = () => {
 setSelectMode(false);
 setSelectedIds(new Set());
 };

 const filteredMatches = matches.filter((m) => {
 if (filter === 'COMPLETED' && m.status !== 'COMPLETED') return false;
 if (filter === 'ONGOING' && m.status !== 'ONGOING') return false;
 if (filterGroundId) {
 const isDirect = m.groundId === filterGroundId;
 const isName = filterGround && m.venue && m.venue.trim().toLowerCase() === filterGround.name.trim().toLowerCase();
 if (!isDirect && !isName) return false;
 }
 if (search.trim()) {
 const q = search.toLowerCase();
 const matchText = `${m.teamA} ${m.teamB} ${m.venue || ''}`.toLowerCase();
 return matchText.includes(q);
 }
 return true;
 });

 const ongoingMatch = matches.find((m) => m.status === 'ONGOING');
 const completedCount = matches.filter((m) => m.status === 'COMPLETED').length;
 const ongoingCount = matches.length - completedCount;

 /** "Thunder Storm need 86 runs from 33 balls" for a live chase. */
 const chaseEquation = (m: MatchScorecard): string | null =>
 chaseEquationFor(m, {
 template: t('history_chase_equation', '{team} need {runs} from {balls}'),
 runWord: t('history_run_word', 'run'),
 runsWord: t('history_runs_word', 'runs'),
 ballWord: t('history_ball_word', 'ball'),
 ballsWord: t('history_balls_word', 'balls'),
 });

 /** Group the visible matches into timeline days, newest first-seen first. */
 const dayGroups: MatchDayGroup[] = (() => {
 const now = new Date();
 const todayKey = dayKeyOf(now.getTime());
 const yesterdayKey = dayKeyOf(now.getTime() - 24 * 60 * 60 * 1000);
 const groups: MatchDayGroup[] = [];
 const byKey = new Map<string, MatchDayGroup>();
 for (const m of filteredMatches) {
 const key = dayKeyOf(m.createdAt);
 let g = byKey.get(key);
 if (!g) {
 let label: string;
 if (key === 'none') label = t('history_recent', 'Recent');
 else if (key === todayKey) label = t('history_today', 'Today');
 else if (key === yesterdayKey) label = t('history_yesterday', 'Yesterday');
 else {
 const d = new Date(m.createdAt as string);
 label = d.toLocaleDateString(undefined, {
 month: 'short',
 day: 'numeric',
 ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}),
 });
 }
 g = {
 key,
 label,
 dayNum: key === 'none' ? null : new Date(m.createdAt as string).getDate(),
 hasLive: false,
 items: [],
 };
 byKey.set(key, g);
 groups.push(g);
 }
 if (m.status === 'ONGOING') g.hasLive = true;
 g.items.push(m);
 }
 return groups;
 })();

 return (
 <div className="max-w-5xl xl:max-w-6xl mx-auto space-y-4 sm:space-y-5 w-full pb-safe pb-8">
 <ConfirmationDialog
 open={!!deleteTarget}
 destructive
 title={deleteTarget?.type === 'selected' ? `${t('history_delete_selected_title', 'Delete selected matches?')} (${selectedIds.size})` : t('history_delete_title', 'Delete this match record?')}
 description={t('history_delete_desc', 'This cannot be undone.')}
 confirmLabel={t('history_delete', 'Delete')}
 onConfirm={executeDelete}
 onCancel={() => setDeleteTarget(null)}
 />
 {/* Active Ground Filter Chip Banner */}
 {filterGround && (
 <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-caption font-semibold">
 <div className="flex items-center gap-2 min-w-0">
 <MapPin className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
 <span className="truncate">
 {t('history_filtered_by_ground', 'Filtered by Ground:')} <strong>{filterGround.name}</strong> ({filteredMatches.length} {filteredMatches.length === 1 ? t('history_match_one', 'match') : t('history_matches_many', 'matches')})
 </span>
 </div>
 <button
 type="button"
 onClick={() => {
 setFilterGroundId(null);
 setFilterGround(null);
 router.replace('/matches/history');
 }}
 className="text-caption font-bold hover:underline shrink-0 text-red-500"
 >
 {t('history_clear_filter', 'Clear Filter')}
 </button>
 </div>
 )}

 {/* Active Match Return Banner */}
 {ongoingMatch && (
 <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 border border-emerald-500/40 flex justify-between shadow-md flex-wrap items-center rounded-2xl p-4 gap-3">
 <div className="flex items-center gap-card min-w-0">
 <span className="flex relative shrink-0 h-2.5 w-2.5">
 <span className="animate-ping absolute inline-flex bg-emerald-400 opacity-75 rounded-full h-full w-full" />
 <span className="relative inline-flex bg-emerald-500 rounded-full h-2.5 w-2.5" />
 </span>
 <div className="flex-1 min-w-0">
 <span className="font-bold uppercase tracking-wider block text-emerald-400">
 {t('history_live_in_progress', 'Live Match In Progress')}
 </span>
 <p className="font-extrabold truncate text-body-small text-white">
 {teamDisplayName(ongoingMatch.teamA, 'Team A')} vs {teamDisplayName(ongoingMatch.teamB, 'Team B')}
 </p>
 </div>
 </div>
 <Link
 href={`/matches/score/${ongoingMatch.id}`}
 className="bg-emerald-500 hover:bg-emerald-400 font-black flex items-center justify-center shrink-0 active:scale-95 transition-transform shadow-elev2 px-3.5 rounded-xl text-caption min-h-[40px] gap-1.5 py-2"
 >
 <Play className="fill-current w-3.5 h-3.5" />
 <span>{t('history_return_scoring', 'Return to Scoring')}</span>
 </Link>
 </div>
)}

 {/* Title & Stats */}
 <div className="flex justify-between flex-wrap items-center gap-4">
 <div>
 <h1 className="font-black tracking-tight flex items-center text-h2 gap-2">
 <History className="text-emerald-600 w-6 h-6" />
 <span>{t('history_title', 'Match Archive')}</span>
 </h1>
 <p className="text-caption">
 {t('history_total_prefix', 'Total')} {matches.length} {t('history_matches_recorded', 'matches recorded')} ({completedCount} {t('history_completed_suffix', 'completed')})
 </p>
 </div>
 {filteredMatches.length > 0 && !loading && (
 <button
 type="button"
 onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
 className={`shrink-0 px-3.5 rounded-xl text-caption font-bold min-h-[40px] border transition-colors active:scale-95 ${
 selectMode
 ? 'bg-emerald-600 border-emerald-600 text-white'
 : 'bg-[var(--card)] border-[var(--border)] hover:border-emerald-500/50'
 }`}
 >
 {selectMode ? t('history_done', 'Done') : t('history_select_mode', 'Select')}
 </button>
 )}
 </div>

 {/* Filter Tabs & Search */}
 <div className="flex items-stretch sm:items-center justify-between flex-wrap gap-3">
 <div className="flex bg-[var(--muted)] font-bold overflow-x-auto no-scrollbar rounded-xl p-1 text-caption">
 {(['ALL', 'COMPLETED', 'ONGOING'] as const).map((tab) => (
 <button
 key={tab}
 onClick={() => setFilter(tab)}
 className={`flex-1 sm:flex-initial px-3 sm:px-4 py-2 rounded-lg whitespace-nowrap min-h-[44px] transition-colors ${
 filter === tab
 ? 'bg-[var(--card)] text-[var(--foreground)] shadow-elev2'
 : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
 }`}
 >
 {tab === 'ALL' ? t('home_all_matches', 'All Matches') : tab === 'COMPLETED' ? t('history_completed', 'Completed') : t('history_ongoing_live', 'Ongoing / Live')}
 {' '}
 <span className="opacity-60 font-extrabold">
 {tab === 'ALL' ? matches.length : tab === 'COMPLETED' ? completedCount : ongoingCount}
 </span>
 </button>
))}
 </div>

 <div className="relative">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] w-4 h-4" />
 <input
 type="text"
 placeholder={t('history_search_placeholder', 'Search teams or venue...')}
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 className="bg-[var(--card)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-inset focus:shadow-elev1 rounded-xl min-h-[38px] w-64 pl-9 pr-3 py-2 text-caption"
 />
 </div>
 </div>

 {/* Batch Actions Bar — select mode only */}
 {selectMode && filteredMatches.length > 0 && (
 <div className="flex items-center justify-between floating-card shadow-elev1 font-semibold min-h-[40px] px-3 py-2 text-caption">
 <button
 onClick={toggleSelectAll}
 className="flex items-center hover:text-[var(--foreground)] text-[var(--muted-foreground)] min-h-[32px] gap-2"
 >
 {selectedIds.size === filteredMatches.length ? (
 <CheckSquare className="text-emerald-600 w-4 h-4" />
) : (
 <Square className="w-4 h-4" />
)}
 <span>{t('history_select_all', 'Select All')} ({selectedIds.size})</span>
 </button>

 {selectedIds.size > 0 && (
 <button
 onClick={handleDeleteSelected}
 className="flex items-center hover:text-red-600 font-bold gap-1.5 text-red-500 min-h-[32px]"
 >
 <Trash2 className="w-4 h-4" />
 <span>{t('history_delete_selected', 'Delete Selected')}</span>
 </button>
)}
 </div>
)}

 {/* Matches Timeline */}
 {loading ? (
 <div className="space-y-3" data-testid="match-history-skeleton-container">
 <MatchCardSkeleton />
 <MatchCardSkeleton />
 <MatchCardSkeleton />
 </div>
 ) : filteredMatches.length === 0 ? (
 <div className="bg-[var(--card)] border border-[var(--border)] border-dashed text-center rounded-2xl p-10 space-y-2">
 <History className="opacity-50 text-[var(--muted-foreground)] mx-auto w-8 h-8" />
 <h4 className="font-bold text-body">{t('history_no_matches', 'No matches found')}</h4>
 <p className="text-caption">{t('history_no_matches_desc', 'Try adjusting your filters or search query.')}</p>
 </div>
) : (
 <div className="relative">
 {/* Timeline rail — fades out below the last node (Polish B) */}
 <div
 aria-hidden
 className="absolute left-4 top-3 bottom-3 w-px -translate-x-1/2"
 style={{
 background:
 'linear-gradient(to bottom, var(--border) 0%, var(--border) 88%, transparent 100%)',
 }}
 />
 {dayGroups.map((group) => (
 <div key={group.key} className="relative mb-6 last:mb-0">
 {/* Day node + label */}
 <div className="flex items-center gap-3 mb-3 relative">
 {group.hasLive ? (
 <span className="relative flex shrink-0 h-8 w-8 items-center justify-center">
 <span className="animate-ping absolute inline-flex h-5 w-5 rounded-full bg-emerald-400 opacity-60" />
 <span className="relative inline-flex h-8 w-8 rounded-full bg-emerald-500 ring-4 ring-[var(--background)] items-center justify-center">
 <span className="h-2.5 w-2.5 rounded-full bg-white" />
 </span>
 </span>
 ) : group.dayNum !== null ? (
 <span className="relative shrink-0 h-8 w-8 rounded-full bg-slate-400 dark:bg-slate-600 ring-4 ring-[var(--background)] flex items-center justify-center text-[13px] font-extrabold text-white num-font">
 {group.dayNum}
 </span>
 ) : (
 <span className="relative shrink-0 h-8 w-8 rounded-full bg-slate-400 dark:bg-slate-600 ring-4 ring-[var(--background)] flex items-center justify-center">
 <span className="h-2 w-2 rounded-full bg-white/85" />
 </span>
 )}
 <span className="font-bold uppercase tracking-wider text-caption text-[var(--muted-foreground)]">{group.label}</span>
 {group.hasLive && (
 <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
 {t('history_live', 'LIVE')}
 </span>
 )}
 </div>

 {/* Day's match cards */}
 <div className="relative space-y-3 pl-11 sm:pl-12">
 {/* Connector tick from the rail to the first card (Polish B) */}
 <span aria-hidden className="absolute left-4 top-[26px] h-px w-7 sm:w-8 bg-[var(--border)]" />
 {group.items.map((m) => {
 const isSelected = selectedIds.has(m.id);
 const winner = winnerTeamOf(m);
 const equation = chaseEquation(m);
 const inningsRows = [m.firstInnings, m.secondInnings].filter(
 (x): x is NonNullable<typeof x> => !!x,
 );

 return (
 <FadeInUp key={m.id}>
 <div
 onClick={() => {
 if (selectMode) {
 toggleSelect(m.id);
 return;
 }
 if (m.status === 'ONGOING') router.push(`/matches/score/${m.id}`);
 else router.push(`/matches/center/${m.id}`);
 }}
 className={`p-3.5 sm:p-4 rounded-2xl bg-[var(--card)] border transition-all cursor-pointer hover:border-emerald-500/50 shadow-elev1 ${
 isSelected ? 'border-emerald-500 bg-emerald-500/5' : 'border-[var(--border)]'
 }`}
 >
 {/* Status row */}
 <div className="flex items-center gap-2.5">
 {selectMode && (
 <button
 onClick={(e) => {
 e.stopPropagation();
 toggleSelect(m.id);
 }}
 className="hover:bg-[var(--muted)] shrink-0 flex items-center justify-center rounded-lg min-h-[32px] min-w-[32px] -ml-1.5"
 aria-label={t('history_select_match', 'Select match')}
 >
 {isSelected ? (
 <CheckSquare className="text-emerald-600 w-5 h-5" />
) : (
 <Square className="text-[var(--muted-foreground)] w-5 h-5" />
)}
 </button>
 )}
 <span
 className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${
 m.status === 'ONGOING'
 ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
 : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
 }`}
 >
 {m.status === 'ONGOING' ? t('history_live', 'LIVE') : t('history_completed', 'Completed')}
 </span>
 <span className="ml-auto font-medium text-caption text-[var(--muted-foreground)]">
 {m.totalOvers} {t('overs', 'Overs')}
 </span>
 </div>

 {/* Innings rows — team left, score right; winner carries the trophy */}
 <div className="mt-2.5 space-y-1">
 {inningsRows.map((inn, innIdx) => {
 const isWinner = winner !== null && inn.team === winner;
 const isChasing = m.status === 'ONGOING' && !!m.secondInnings && inn === m.secondInnings;
 return (
 <div key={innIdx} className="flex items-baseline justify-between gap-3 min-w-0">
 <span className={`flex items-center gap-1.5 min-w-0 truncate text-body-small ${isWinner || isChasing ? 'font-extrabold' : 'font-semibold'}`}>
 <span className="truncate">{inn.team}</span>
 {isWinner && <Trophy className="w-3.5 h-3.5 shrink-0 text-amber-500" />}
 </span>
 <span className="num-font shrink-0 text-body-small">
 <b className={isWinner || isChasing ? 'font-extrabold' : 'font-bold'}>
 {inn.totalRuns}/{inn.totalWickets}
 </b>{' '}
 <span className="text-[var(--muted-foreground)] font-medium">({inn.oversString} ov)</span>
 </span>
 </div>
 );
 })}
 {inningsRows.length === 0 && (
 <h3 className="font-extrabold tracking-tight truncate text-card-title">
 {m.teamA} vs {m.teamB}
 </h3>
 )}
 </div>

 {/* Verdict line */}
 <p className="font-semibold text-caption pt-1.5 text-emerald-700 dark:text-emerald-400">
 {m.status === 'ONGOING'
 ? equation || t('history_in_progress', 'Match In Progress')
 : m.result || t('history_completed', 'Completed')}
 </p>

 {/* Venue pill */}
 {m.venue && (
 <div className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-lg bg-[var(--muted)] px-2.5 py-1.5 text-caption font-medium text-[var(--muted-foreground)]">
 <MapPin className="w-3.5 h-3.5 shrink-0" />
 <span className="truncate">{m.venue}</span>
 </div>
 )}

 {/* Actions — hidden in select mode, where the whole card toggles */}
 {!selectMode && (
 <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--border)]">
 {m.status === 'ONGOING' ? (
 <>
 <button
 onClick={(e) => {
 e.stopPropagation();
 router.push(`/matches/score/${m.id}`);
 }}
 className="flex-1 flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 font-bold shadow-elev2 active:scale-[0.98] transition-all gap-1.5 px-3.5 rounded-xl text-caption min-h-[40px] py-2 text-white"
 >
 <Play className="fill-current w-3.5 h-3.5" />
 <span>{t('history_resume', 'Resume')}</span>
 </button>
 <button
 onClick={(e) => handleDeleteSingle(m.id, e)}
 className="hover:bg-red-500/10 hover:text-red-500 transition-colors flex items-center justify-center p-2.5 rounded-xl text-red-500 min-h-[40px] min-w-[40px] active:scale-95 shrink-0"
 title={t('history_delete_match', 'Delete Match')}
 >
 <Trash2 className="w-4 h-4" />
 </button>
 </>
) : (
 <>
 <button
 onClick={(e) => {
 e.stopPropagation();
 router.push(`/matches/center/${m.id}`);
 }}
 className="flex items-center justify-center bg-[var(--muted)] hover:bg-[var(--border)] font-bold active:scale-[0.98] transition-all gap-1.5 px-3.5 rounded-xl min-h-[40px] py-2 text-caption"
 >
 <ClipboardList className="w-4 h-4 text-emerald-600" />
 {t('history_scorecard', 'Scorecard')}
 </button>
 {/* PDF sits beside Scorecard (TAIMUR, 2026-11-10); Delete stays at the far right */}
 <button
  disabled={isExportingPdf}
  onClick={async (e) => {
    e.stopPropagation();
    await downloadPdf(m);
  }}
  className="bg-[var(--muted)] hover:bg-[var(--border)] disabled:opacity-50 flex items-center justify-center p-2.5 rounded-xl text-emerald-600 min-h-[40px] min-w-[40px] active:scale-95 transition-transform"
  title={t('download_pdf', 'Download PDF Scorecard')}
 >
  <FileText className="w-4 h-4" />
 </button>
 <span className="flex-1" />
 <button
 onClick={(e) => handleDeleteSingle(m.id, e)}
 className="hover:bg-red-500/10 hover:text-red-500 transition-colors flex items-center justify-center p-2.5 rounded-xl text-red-500 min-h-[40px] min-w-[40px] active:scale-95"
 title={t('history_delete_match', 'Delete Match')}
 >
 <Trash2 className="w-4 h-4" />
 </button>
 </>
)}
 </div>
 )}
 </div>
 </FadeInUp>
 );
 })}
 </div>
 </div>
 ))}
 </div>
)}
 </div>
);
}
