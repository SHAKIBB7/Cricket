'use client';

import { teamDisplayName } from '@/lib/teamDisplayName';
import React, { useState, useEffect, useMemo, useRef, startTransition } from 'react';
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
  X,
} from 'lucide-react';
import { MatchRepository, MatchSummary } from '@/infrastructure/storage/MatchRepository';
import { MatchScorecard, CricketGround } from '@/domain/cricket/types';
import { GroundRepository } from '@/infrastructure/storage/GroundRepository';
import { MatchCardSkeleton, Skeleton } from '@/components/common/Skeleton';
import { usePdfDownload } from '@/features/scoring/pdf/usePdfDownload';
import { ConfirmationDialog } from '@/components/overlay/ConfirmationDialog';
import { useLanguage } from '@/context/LanguageContext';
import { useLoadReveal } from '@/hooks/useLoadReveal';
import { RevealGroup, RevealItem } from '@/components/motion/Reveal';

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
 items: MatchSummary[];
}

export default function MatchHistoryPage() {
 const { t } = useLanguage();
 const router = useRouter();

 const [matches, setMatches] = useState<MatchSummary[]>([]);
 const [filter, setFilter] = useState<'ALL' | 'COMPLETED' | 'ONGOING'>('ALL');
 const [deleteTarget, setDeleteTarget] = useState<{ type: 'single'; id: string } | { type: 'selected' } | null>(null);
 const [search, setSearch] = useState('');
 const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
 const [selectMode, setSelectMode] = useState(false);
 const [searchOpen, setSearchOpen] = useState(false);
 const [loading, setLoading] = useState(true);
 // Motion system (TAIMUR, 2026-11-11): the skeleton shows only
 // past the 150ms gate, and `reveal` arms the one-shot staggered
 // scale-in for the first batch of day groups.
 const { showSkeleton, reveal } = useLoadReveal(loading);
 // Only the FIRST batch of day groups takes part in the reveal;
 // its size is captured when the reveal arms (effect below).
 // Groups appended later by the scroll sentinel render plainly.
 const firstBatchRef = useRef(0);
 const [loadError, setLoadError] = useState(false);
 // F1: incremental render window — day groups are appended as the
 // sentinel scrolls into view instead of one full-archive commit.
 const [visibleGroupCount, setVisibleGroupCount] = useState(4);
 const sentinelRef = useRef<HTMLDivElement | null>(null);
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
 // C2: a rejected Dexie read must not spin the skeleton forever —
 // surface an error state with a retry instead.
 try {
 // F1: load the light archive projection, not full scorecards.
 const list = await MatchRepository.getMatchSummaries();
 setLoadError(false);
 // F1: the archive swap is a large commit; keep it in the
 // transition lane so it cannot starve the page slide.
 startTransition(() => {
 setMatches(list);
 });
 } catch (err) {
 console.error('[MatchHistory] Failed to load matches:', err);
 setLoadError(true);
 } finally {
 setLoading(false);
 }
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

 const filteredMatches = useMemo(() => {
 const list = matches.filter((m) => {
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
 // C4: the repository orders by updatedAt, so a recently-opened old
 // match would otherwise pull its whole day group above newer days.
 // Sort by createdAt desc so the timeline is truly chronological.
 return list.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
 }, [matches, filter, search, filterGroundId, filterGround]);

 // C1: count by explicit status — PENDING and ABANDONED matches are
 // not "ongoing", so the tab badge must not fold them in.
 const completedCount = matches.filter((m) => m.status === 'COMPLETED').length;
 const ongoingCount = matches.filter((m) => m.status === 'ONGOING').length;

 /** "Thunder Storm need 86 runs from 33 balls" for a live chase. */
 const chaseEquation = (m: MatchSummary): string | null =>
 chaseEquationFor(m as MatchScorecard, {
 template: t('history_chase_equation', '{team} need {runs} from {balls}'),
 runWord: t('history_run_word', 'run'),
 runsWord: t('history_runs_word', 'runs'),
 ballWord: t('history_ball_word', 'ball'),
 ballsWord: t('history_balls_word', 'balls'),
 });

 /** Group the visible matches into timeline days, newest day first. */
 const dayGroups = useMemo<MatchDayGroup[]>(() => {
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
 }, [filteredMatches, t]);

 // F1: only the first window of day groups is mounted initially;
 // the sentinel below appends more as the user scrolls.
 const visibleDayGroups = dayGroups.slice(0, visibleGroupCount);
 const hasMoreGroups = visibleGroupCount < dayGroups.length;
 const canObserve = typeof IntersectionObserver !== 'undefined';

 // Restart the render window whenever the visible set changes.
 useEffect(() => {
 setVisibleGroupCount(4);
 }, [filter, search, filterGroundId]);

 // Motion system: capture the first-batch size the moment the
 // reveal arms — groups beyond it (sentinel-appended) stay plain.
 useEffect(() => {
 if (reveal && firstBatchRef.current === 0) {
 firstBatchRef.current = visibleDayGroups.length;
 }
 }, [reveal, visibleDayGroups.length]);

 useEffect(() => {
 const el = sentinelRef.current;
 if (!el || !hasMoreGroups || typeof IntersectionObserver === 'undefined') return;
 const obs = new IntersectionObserver(
 (entries) => {
 if (entries.some((e) => e.isIntersecting)) {
 setVisibleGroupCount((c) => c + 4);
 }
 },
 { rootMargin: '400px' }
 );
 obs.observe(el);
 return () => obs.disconnect();
 }, [hasMoreGroups, visibleGroupCount, loading]);

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

 {/* Title & Stats */}
 <div>
 <div className="flex items-center gap-3">
 <span className="flex items-center justify-center w-11 h-11 rounded-full bg-[#181868] shrink-0">
 <History className="text-[#e8b850] w-5 h-5" />
 </span>
 <div className="min-w-0 flex-1">
 <h1 className="font-black tracking-tight text-h2 text-[#181868] dark:text-white">
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
 <div className="h-[3px] rounded-full bg-[#e8b850] mt-3" />
 </div>

 {/* Filter Tabs & Search — TAIMUR (2026-11-10): the permanent search
     box is deleted. A lone search icon sits at the right of the tabs
     row, shifted off the edge with a small safe-area gap; tapping it
     expands the row into a full-width field. X clears the text first,
     then closes; Escape closes keeping the query, and the icon shows
     an emerald dot while a query is active. */}
 {searchOpen ? (
 <div className="flex items-center gap-2.5">
 <div className="relative flex-1 min-w-0">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] w-4 h-4" />
 <input
 autoFocus
 type="text"
 placeholder={t('history_search_placeholder', 'Search teams or venue...')}
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 onKeyDown={(e) => {
 if (e.key === 'Escape') setSearchOpen(false);
 }}
 className="bg-[var(--card)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-inset focus:shadow-elev1 rounded-xl min-h-[44px] w-full pl-9 pr-3 py-2 text-caption"
 />
 </div>
 <button
 type="button"
 aria-label={t('history_search_close', 'Close search')}
 onClick={() => {
 if (search) setSearch('');
 else setSearchOpen(false);
 }}
 className="shrink-0 h-11 w-11 mr-2 rounded-full bg-[var(--card)] border border-[var(--border)] flex items-center justify-center active:scale-95 transition-transform"
 >
 <X className="w-5 h-5" />
 </button>
 </div>
 ) : (
 <div className="flex items-center gap-2.5">
 <div className="flex flex-1 min-w-0 bg-[var(--muted)] font-bold overflow-x-auto no-scrollbar rounded-xl p-1 text-caption">
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

 <button
 type="button"
 aria-label={t('history_search_placeholder', 'Search teams or venue...')}
 onClick={() => setSearchOpen(true)}
 className="relative shrink-0 h-11 w-11 mr-2 rounded-full bg-[var(--card)] border border-[var(--border)] shadow-elev1 flex items-center justify-center active:scale-95 transition-transform"
 >
 <Search className="w-5 h-5" />
 {search.trim() !== '' && (
 <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-[var(--background)]" />
 )}
 </button>
 </div>
 )}

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
 {showSkeleton ? (
 /* Skeleton mirrors ONE Season-Timeline day group — rail, day-node
 header and two card slots at the real cards' height (h-[190px]) —
 so the loaded timeline replaces it without growing the page. */
 <div className="relative" data-testid="match-history-skeleton-container">
 <div
 aria-hidden
 className="absolute left-4 top-3 bottom-3 w-px -translate-x-1/2"
 style={{
 background:
 'linear-gradient(to bottom, var(--border) 0%, var(--border) 88%, transparent 100%)',
 }}
 />
 <div className="relative mb-5">
 <div className="flex items-center gap-3 mb-2 relative">
 <span aria-hidden className="relative shrink-0 h-8 w-8 rounded-full bg-[var(--muted)] animate-shimmer ring-4 ring-[var(--background)]" />
 <Skeleton className="w-24 h-4" />
 </div>
 <div className="relative space-y-2 pl-11 sm:pl-12">
 <span aria-hidden className="absolute left-4 top-[26px] h-px w-7 sm:w-8 bg-[var(--border)]" />
 <div className="h-[190px] [&>div]:h-full">
 <MatchCardSkeleton />
 </div>
 <div className="h-[190px] [&>div]:h-full">
 <MatchCardSkeleton />
 </div>
 </div>
 </div>
 </div>
 ) : loading ? (
 // Motion system gate: before the 150ms gate trips, the timeline
 // area stays empty under the page chrome — data arriving this
 // fast renders plainly (no skeleton flash, no reveal).
 // showSkeleton is checked BEFORE `loading` because
 // useLoadReveal holds the skeleton up after `loading` flips
 // false (data in before the 290ms reveal floor) so the swap
 // is skeleton -> reveal, never skeleton -> plain -> reveal.
 <div className="relative" aria-hidden="true" />
 ) : loadError ? (
 <div className="bg-[var(--card)] border border-[var(--border)] border-dashed text-center rounded-2xl p-10 space-y-2">
 <History className="opacity-50 text-[var(--muted-foreground)] mx-auto w-8 h-8" />
 <h4 className="font-bold text-body">{t('history_load_error', 'Could not load your matches')}</h4>
 <p className="text-caption">{t('history_load_error_desc', 'Something went wrong while reading the archive from this device.')}</p>
 <button
 type="button"
 onClick={() => {
 setLoading(true);
 loadMatches();
 }}
 className="px-4 rounded-xl text-caption font-bold min-h-[40px] py-2 bg-[#181868] text-white active:scale-[0.98] transition-all"
 >
 {t('history_retry', 'Retry')}
 </button>
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
 <RevealGroup active={reveal}>
 {visibleDayGroups.map((group, groupIndex) => {
 // Motion system: only the first batch of day groups (count
 // captured in firstBatchRef when the reveal armed) staggers
 // in; sentinel-appended groups render plainly.
 const groupContent = (
 <>
 {/* Day node + label */}
 <div className="flex items-center gap-3 mb-2 relative">
 {group.hasLive ? (
 <span className="relative flex shrink-0 h-8 w-8 items-center justify-center">
 <span className="animate-ping absolute inline-flex h-5 w-5 rounded-full bg-emerald-400 opacity-60" />
 <span className="relative inline-flex h-8 w-8 rounded-full bg-emerald-500 ring-4 ring-[var(--background)] items-center justify-center">
 <span className="h-2.5 w-2.5 rounded-full bg-white" />
 </span>
 </span>
 ) : group.dayNum !== null ? (
 <span className="relative shrink-0 h-8 w-8 rounded-full bg-[#181868] ring-4 ring-[var(--background)] flex items-center justify-center text-[13px] font-extrabold text-white num-font">
 {group.dayNum}
 </span>
 ) : (
 <span className="relative shrink-0 h-8 w-8 rounded-full bg-[#181868] ring-4 ring-[var(--background)] flex items-center justify-center">
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
 <div className="relative space-y-2 pl-11 sm:pl-12">
 {/* Connector tick from the rail to the first card (Polish B) */}
 <span aria-hidden className="absolute left-4 top-[26px] h-px w-7 sm:w-8 bg-[var(--border)]" />
 {group.items.map((m) => {
 const isSelected = selectedIds.has(m.id);
 const winner = winnerTeamOf(m as MatchScorecard);
 const equation = chaseEquation(m);
 const inningsRows = [m.firstInnings, m.secondInnings].filter(
 (x): x is NonNullable<typeof x> => !!x,
 );

 return (
 <div
 key={m.id}
 onClick={() => {
 if (selectMode) {
 toggleSelect(m.id);
 return;
 }
 if (m.status === 'ONGOING' || m.status === 'PENDING') router.push(`/matches/score/${m.id}`);
 else router.push(`/matches/center/${m.id}`);
 }}
 className={`px-3 py-2.5 sm:p-3.5 rounded-2xl bg-[var(--card)] border transition-all cursor-pointer hover:border-emerald-500/50 shadow-elev1 ${
 isSelected ? 'border-emerald-500 bg-emerald-500/5' : m.status === 'ONGOING' ? 'border-emerald-500/40' : 'border-[var(--border)]'
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
 : m.status === 'PENDING'
 ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
 : m.status === 'ABANDONED'
 ? 'bg-[var(--muted)] text-[var(--muted-foreground)] border border-[var(--border)]'
 : 'bg-[#181868]/10 text-[#181868] dark:bg-white/10 dark:text-slate-200'
 }`}
 >
 {m.status === 'ONGOING'
 ? t('history_live', 'LIVE')
 : m.status === 'PENDING'
 ? t('history_not_started', 'Not Started')
 : m.status === 'ABANDONED'
 ? t('history_abandoned', 'Abandoned')
 : t('history_completed', 'Completed')}
 </span>
 <span className="ml-auto font-medium text-caption text-[var(--muted-foreground)]">
 {m.totalOvers} {t('overs', 'Overs')}
 </span>
 </div>

 {/* Innings rows — team left, score right; winner carries the trophy */}
 <div className="mt-1.5 space-y-0.5">
 {inningsRows.map((inn, innIdx) => {
 const isWinner = winner !== null && inn.team === winner;
 const isChasing = m.status === 'ONGOING' && !!m.secondInnings && inn === m.secondInnings;
 return (
 <div key={innIdx} className={`flex items-baseline justify-between gap-3 min-w-0 rounded-md px-1.5 -mx-1.5 ${isWinner ? 'bg-amber-400/10' : ''}`}>
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

 {/* Verdict line — C1: ABANDONED and PENDING get their own
     wording instead of masquerading as a completed result. */}
 <p
 className={`font-semibold text-caption pt-1 ${
 m.status === 'ABANDONED'
 ? 'text-[var(--muted-foreground)]'
 : 'text-emerald-700 dark:text-emerald-400'
 }`}
 >
 {m.status === 'ONGOING'
 ? equation || t('history_in_progress', 'Match In Progress')
 : m.status === 'PENDING'
 ? t('history_not_started', 'Match Not Started')
 : m.status === 'ABANDONED'
 ? t('history_abandoned', 'Abandoned')
 : m.result || t('history_completed', 'Completed')}
 </p>

 {/* Venue pill */}
 {m.venue && (
 <div className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-lg bg-[var(--muted)] px-2.5 py-1 text-caption font-medium text-[var(--muted-foreground)]">
 <MapPin className="w-3.5 h-3.5 shrink-0 text-amber-600" />
 <span className="truncate">{m.venue}</span>
 </div>
 )}

 {/* Actions — hidden in select mode, where the whole card toggles */}
 {!selectMode && (
 <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[var(--border)]">
 {m.status === 'ONGOING' || m.status === 'PENDING' ? (
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
 className="flex items-center justify-center bg-[#181868]/10 hover:bg-[#181868]/15 text-[#181868] dark:bg-white/10 dark:hover:bg-white/15 dark:text-slate-100 font-bold active:scale-[0.98] transition-all gap-1.5 px-3.5 rounded-xl min-h-[40px] py-2 text-caption"
 >
 <ClipboardList className="w-4 h-4 text-[#181868] dark:text-slate-100" />
 {t('history_scorecard', 'Scorecard')}
 </button>
 {/* PDF sits beside Scorecard (TAIMUR, 2026-11-10); Delete stays at the far right */}
 <button
  disabled={isExportingPdf}
  onClick={async (e) => {
    e.stopPropagation();
    // F1: the list holds summaries — the PDF needs the full
    // scorecard, so fetch the complete record on demand.
    const full = await MatchRepository.getMatch(m.id);
    if (full) await downloadPdf(full);
  }}
  className="bg-[#181868]/10 hover:bg-[#181868]/15 disabled:opacity-50 flex items-center justify-center p-2.5 rounded-xl text-[#181868] dark:bg-white/10 dark:hover:bg-white/15 dark:text-slate-100 min-h-[40px] min-w-[40px] active:scale-95 transition-transform"
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
 );
 })}
 </div>
 </>
 );
 return groupIndex < firstBatchRef.current ? (
 <RevealItem key={group.key} index={groupIndex} className="relative mb-5 last:mb-0">
 {groupContent}
 </RevealItem>
 ) : (
 <div key={group.key} className="relative mb-5 last:mb-0">
 {groupContent}
 </div>
 );
 })}
 </RevealGroup>
 {/* F1: scroll sentinel appends the next window of day groups;
     without IntersectionObserver a Show-more button does the job. */}
 {hasMoreGroups && <div ref={sentinelRef} aria-hidden className="h-1" />}
 {hasMoreGroups && !canObserve && (
 <div className="pt-2 text-center">
 <button
 type="button"
 onClick={() => setVisibleGroupCount((c) => c + 4)}
 className="px-4 rounded-xl text-caption font-bold min-h-[40px] py-2 bg-[var(--card)] border border-[var(--border)] active:scale-[0.98] transition-all"
 >
 {t('history_show_more', 'Show more')}
 </button>
 </div>
 )}
 </div>
)}
 </div>
);
}
