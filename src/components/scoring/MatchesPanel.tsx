'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
 History,
 ArrowLeft,
 X,
 Play,
 Search,
 FileText,
 Clock,
 CheckCircle2,
} from 'lucide-react';
import { MatchRepository } from '@/infrastructure/storage/MatchRepository';
import { MatchScorecard } from '@/domain/cricket/types';
import { ScorecardPdfGenerator } from '@/features/scoring/pdf/ScorecardPdfGenerator';

interface MatchesPanelProps {
 currentMatchId: string;
 onClose: () => void;
}

export function MatchesPanel({ currentMatchId, onClose }: MatchesPanelProps) {
 const router = useRouter();
 const [matches, setMatches] = useState<MatchScorecard[]>([]);
 const [filter, setFilter] = useState<'ALL' | 'COMPLETED' | 'ONGOING'>('ALL');
 const [search, setSearch] = useState('');
 const [loading, setLoading] = useState(true);

 useEffect(() => {
 async function load() {
 const list = await MatchRepository.getAllMatches();
 setMatches(list);
 setLoading(false);
 }
 load();
 }, []);

 const filteredMatches = matches.filter((m) => {
 if (filter === 'COMPLETED' && m.status !== 'COMPLETED') return false;
 if (filter === 'ONGOING' && m.status !== 'ONGOING') return false;
 if (search.trim()) {
 const q = search.toLowerCase();
 const matchText = `${m.teamA} ${m.teamB} ${m.venue || ''}`.toLowerCase();
 return matchText.includes(q);
 }
 return true;
 });

 return (
 <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out max-w-4xl mx-auto w-full flex flex-col gap-section pb-section">
 {/* ── STICKY TOP REVERSIBLE NAVIGATION BAR ── */}
 <div className="sticky top-0 z-30 -mx-2 sm:-mx-4 bg-[var(--card)]/70 backdrop-blur-xl border-b border-[var(--border)]/50 flex items-center justify-between shadow-sm transition-all duration-300 rounded-b-card px-screen-x py-3 gap-4">
 <button
 type="button"
 onClick={onClose}
 className="flex items-center bg-emerald-600 hover:bg-emerald-500 font-bold shadow-md shadow-emerald-900/20 active:scale-[0.98] transition-all duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] rounded-xl text-caption gap-2 px-4 py-2"
 title="Return to live scoring cockpit"
 >
 <ArrowLeft className="transition-transform group-hover:-translate-x-0.5 w-4 h-4" />
 <span className="hidden sm:inline">Back to Live Scoring</span>
 <span className="sm:hidden">Back</span>
 </button>

 <div className="flex items-center gap-card">
 <div className="bg-emerald-500/10 hidden sm:flex items-center justify-center p-1.5 rounded-lg">
 <History className="dark:text-emerald-400 text-emerald-600 w-4 h-4" />
 </div>
 <h2 className="font-extrabold tracking-tight truncate text-card-title">
 Matches &amp; Archive
 </h2>
 </div>

 <button
 type="button"
 onClick={onClose}
 className="bg-[var(--muted)]/50 hover:text-[var(--foreground)] hover:bg-[var(--muted)] active:scale-[0.95] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border)] rounded-xl text-[var(--muted-foreground)] p-2"
 title="Close Matches panel"
 >
 <X className="w-4 h-4" />
 </button>
 </div>

 {/* ── FILTER TABS & SEARCH ── */}
 <div className="flex items-stretch md:items-center justify-between flex-wrap gap-4 px-screen-x">
 <div className="flex bg-[var(--muted)]/50 font-bold overflow-x-auto no-scrollbar border border-[var(--border)]/30 backdrop-blur-sm rounded-xl p-1.5 text-caption">
 {(['ALL', 'COMPLETED', 'ONGOING'] as const).map((tab) => (
 <button
 key={tab}
 type="button"
 onClick={() => setFilter(tab)}
 className={`flex-1 md:flex-initial px-4 sm:px-5 py-2 rounded-lg whitespace-nowrap min-h-[36px] transition-all duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${
 filter === tab
 ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm scale-100'
 : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] scale-95 hover:scale-100'
 }`}
 >
 {tab === 'ALL' ? 'All Matches' : tab === 'COMPLETED' ? 'Completed' : 'Ongoing'}
 </button>
))}
 </div>

 <div className="relative flex-1 group max-w-xs">
 <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 group-focus-within:text-emerald-500 transition-colors duration-200 text-[var(--muted-foreground)] w-4 h-4" />
 <input
 type="text"
 placeholder="Search teams or venue..."
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 className="bg-[var(--card)]/50 border border-[var(--border)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all duration-200 ease-in-out backdrop-blur-sm shadow-sm hover:border-[var(--border)]/80 py-2.5 rounded-xl w-full pl-10 pr-4 text-body-small"
 />
 </div>
 </div>

 {/* ── MATCHES LIST ── */}
 {loading ? (
 <div className="flex flex-col items-center justify-center p-16 space-y-4">
 <div className="border-4 border-[var(--muted)] border-t-emerald-500 animate-spin rounded-full w-10 h-10" />
 <p className="font-medium animate-pulse text-body-small">Loading matches...</p>
 </div>
) : filteredMatches.length === 0 ? (
 <div className="bg-[var(--card)]/40 border border-[var(--border)]/50 backdrop-blur-sm shadow-sm animate-in fade-in zoom-in-95 duration-300 text-center rounded-3xl p-16 space-y-3">
 <div className="bg-[var(--muted)] flex items-center justify-center mx-auto rounded-2xl w-16 h-16 mb-4">
 <History className="opacity-70 text-[var(--muted-foreground)] w-8 h-8" />
 </div>
 <h4 className="font-bold text-card-title">No matches found</h4>
 <p className="text-body-small max-w-sm mx-auto">
 {search ? 'We couldn\'t find any matches matching your search. Try adjusting your keywords.' : 'There are no recorded matches in this filter category yet.'}
 </p>
 </div>
) : (
 <div className="space-y-4">
 {filteredMatches.map((m, index) => {
 const isCurrent = m.id === currentMatchId;
 return (
 <div
 key={m.id}
 className={`group relative p-card rounded-card bg-[var(--card)] border transition-all duration-300 ease-out hover:-translate-y-1 ${
 isCurrent
 ? 'border-emerald-500 ring-4 ring-emerald-500/10 shadow-lg shadow-emerald-900/5'
 : 'border-[var(--border)]/60 hover:border-emerald-500/30 hover:shadow-xl hover:shadow-black/5 dark:hover:shadow-black/20'
 }`}
 style={{ animationDelay: `${index * 50}ms` }}
 >
 <div className="flex justify-between flex-wrap items-center gap-card-gap">
 <div className="flex-1 min-w-0 space-y-2.5">
 <div className="flex items-center flex-wrap gap-card">
 {isCurrent ? (
 <span className="bg-emerald-500 dark:text-emerald-950 font-black uppercase tracking-wider flex items-center shadow-sm px-4 rounded-full text-caption gap-1.5 py-1">
 <span className="bg-current animate-pulse w-1.5 h-1.5 rounded-full" />
 Currently Scoring
 </span>
) : m.status === 'ONGOING' ? (
 <span className="bg-amber-500/10 dark:text-amber-400 border border-amber-500/20 font-bold uppercase tracking-wider flex items-center px-4 rounded-full text-caption gap-1.5 py-1">
 <Clock className="w-3 h-3" />
 Ongoing
 </span>
) : (
 <span className="bg-blue-500/10 dark:text-blue-400 border border-blue-500/20 font-bold uppercase tracking-wider flex items-center px-4 rounded-full text-caption gap-1.5 py-1">
 <CheckCircle2 className="w-3 h-3" />
 Completed
 </span>
)}
 <span className="font-medium flex items-center text-[var(--muted-foreground)] gap-1.5">
 <span>{m.venue || 'Unknown Venue'}</span>
 <span className="bg-[var(--muted-foreground)]/50 rounded-full w-1 h-1" />
 <span>{m.totalOvers} Overs</span>
 </span>
 </div>

 <h3 className="font-extrabold tracking-tight truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors duration-200 text-card-title">
 {m.teamA} <span className="font-medium text-[var(--muted-foreground)] mx-1">vs</span> {m.teamB}
 </h3>

 {/* Scores preview */}
 <div className="flex flex-wrap items-center num-font font-bold bg-[var(--muted)]/30 border border-[var(--border)]/30 text-body-small rounded-xl max-w-full gap-y-2 px-3 py-2">
 {m.firstInnings && (
 <span className="flex items-center flex-wrap gap-1.5 min-w-0">
 <span className="font-bold text-[var(--foreground)]">{m.firstInnings.team}</span>
 <span className="dark:text-emerald-400 text-emerald-600">{m.firstInnings.totalRuns} - {m.firstInnings.totalWickets}</span>
 <span className="font-medium opacity-70 text-caption">({m.firstInnings.oversString} ov)</span>
 </span>
)}
 {m.secondInnings && (
 <>
 <span className="bg-[var(--border)] hidden xs:block rounded-full w-1 h-1" />
 <span className="flex items-center flex-wrap gap-1.5 min-w-0">
 <span className="font-bold text-[var(--foreground)]">{m.secondInnings.team}</span>
 <span className="dark:text-emerald-400 text-emerald-600">{m.secondInnings.totalRuns} - {m.secondInnings.totalWickets}</span>
 <span className="font-medium opacity-70 text-caption">({m.secondInnings.oversString} ov)</span>
 </span>
 </>
)}
 {!m.firstInnings && !m.secondInnings && (
 <span className="font-medium opacity-70 italic text-caption">Match hasn&apos;t started yet</span>
)}
 </div>
 </div>

 {/* Actions */}
 <div className="flex items-stretch sm:items-center shrink-0 border-t sm:border-t-0 border-[var(--border)]/50 flex-wrap gap-2 pt-0">
 {isCurrent ? (
 <button
 type="button"
 onClick={onClose}
 className="flex-1 sm:flex-initial bg-emerald-600 hover:bg-emerald-500 font-bold flex items-center justify-center active:scale-[0.98] transition-all duration-200 shadow-md shadow-emerald-900/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 py-2.5 rounded-xl text-body-small min-h-btn px-5 gap-2"
 >
 <Play className="fill-current w-4 h-4" />
 <span>Resume Scoring</span>
 </button>
) : m.status === 'ONGOING' ? (
 <button
 type="button"
 onClick={() => {
 router.push(`/matches/score/${m.id}`);
 onClose();
 }}
 className="flex-1 sm:flex-initial bg-amber-500 hover:bg-amber-400 font-bold flex items-center justify-center active:scale-[0.98] transition-all duration-200 shadow-md shadow-amber-900/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 py-2.5 rounded-xl text-body-small min-h-btn px-5 gap-2"
 >
 <Play className="fill-current w-4 h-4" />
 <span>Switch &amp; Score</span>
 </button>
) : (
 <button
 type="button"
 onClick={() => router.push(`/matches/center/${m.id}`)}
 className="flex-1 sm:flex-initial bg-[var(--muted)]/50 hover:bg-[var(--muted)] border border-[var(--border)]/50 hover:border-[var(--border)] font-bold flex items-center justify-center active:scale-[0.98] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border)] group/btn py-2.5 rounded-xl min-h-btn px-5 text-body-small gap-2"
 >
 <FileText className="dark:text-emerald-400 group-hover/btn:scale-110 transition-transform duration-200 text-emerald-600 w-4 h-4" />
 <span>View Scorecard</span>
 </button>
)}
 </div>
 </div>
 </div>
);
 })}
 </div>
)}
 </div>
);
}

