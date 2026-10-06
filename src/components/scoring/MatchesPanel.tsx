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
    <div className="w-full max-w-4xl mx-auto space-y-6 sm:space-y-8 pb-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      {/* ── STICKY TOP REVERSIBLE NAVIGATION BAR ── */}
      <div className="sticky top-0 z-30 -mx-2 sm:-mx-4 px-3 sm:px-5 py-3 bg-[var(--card)]/70 backdrop-blur-xl border-b border-[var(--border)]/50 flex items-center justify-between gap-4 shadow-sm rounded-b-2xl sm:rounded-2xl transition-all duration-300">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-900/20 active:scale-[0.98] transition-all duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
          title="Return to live scoring cockpit"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
          <span className="hidden sm:inline">Back to Live Scoring</span>
          <span className="sm:hidden">Back</span>
        </button>

        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-emerald-500/10 rounded-lg hidden sm:flex items-center justify-center">
            <History className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="font-extrabold text-base sm:text-lg text-[var(--foreground)] tracking-tight truncate">
            Matches &amp; Archive
          </h2>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-xl bg-[var(--muted)]/50 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] active:scale-[0.95] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border)]"
          title="Close Matches panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── FILTER TABS & SEARCH ── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 px-1">
        <div className="flex rounded-xl bg-[var(--muted)]/50 p-1.5 text-xs sm:text-xs font-bold overflow-x-auto no-scrollbar border border-[var(--border)]/30 backdrop-blur-sm">
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

        <div className="relative flex-1 md:max-w-xs group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)] group-focus-within:text-emerald-500 transition-colors duration-200" />
          <input
            type="text"
            placeholder="Search teams or venue..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--card)]/50 border border-[var(--border)] text-sm placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all duration-200 ease-in-out backdrop-blur-sm shadow-sm hover:border-[var(--border)]/80"
          />
        </div>
      </div>

      {/* ── MATCHES LIST ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-16 space-y-4">
          <div className="w-10 h-10 border-4 border-[var(--muted)] border-t-emerald-500 rounded-full animate-spin" />
          <p className="text-sm font-medium text-[var(--muted-foreground)] animate-pulse">Loading matches...</p>
        </div>
      ) : filteredMatches.length === 0 ? (
        <div className="p-10 sm:p-16 text-center rounded-3xl bg-[var(--card)]/40 border border-[var(--border)]/50 space-y-3 backdrop-blur-sm shadow-sm animate-in fade-in zoom-in-95 duration-300">
          <div className="w-16 h-16 mx-auto bg-[var(--muted)] rounded-2xl flex items-center justify-center mb-4">
            <History className="w-8 h-8 text-[var(--muted-foreground)] opacity-70" />
          </div>
          <h4 className="font-bold text-base sm:text-lg text-[var(--foreground)]">No matches found</h4>
          <p className="text-sm text-[var(--muted-foreground)] max-w-sm mx-auto">
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
                className={`group relative p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-[var(--card)] border transition-all duration-300 ease-out hover:-translate-y-1 ${
                  isCurrent
                    ? 'border-emerald-500 ring-4 ring-emerald-500/10 shadow-lg shadow-emerald-900/5'
                    : 'border-[var(--border)]/60 hover:border-emerald-500/30 hover:shadow-xl hover:shadow-black/5 dark:hover:shadow-black/20'
                }`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6">
                  <div className="min-w-0 flex-1 space-y-2.5">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {isCurrent ? (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-500 text-white dark:text-emerald-950 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                          Currently Scoring
                        </span>
                      ) : m.status === 'ONGOING' ? (
                        <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          Ongoing
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                          <CheckCircle2 className="w-3 h-3" />
                          Completed
                        </span>
                      )}
                      <span className="text-xs font-medium text-[var(--muted-foreground)] flex items-center gap-1.5">
                        <span>{m.venue || 'Unknown Venue'}</span>
                        <span className="w-1 h-1 rounded-full bg-[var(--muted-foreground)]/50" />
                        <span>{m.totalOvers} Overs</span>
                      </span>
                    </div>

                    <h3 className="font-extrabold text-base sm:text-lg tracking-tight text-[var(--foreground)] truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors duration-200">
                      {m.teamA} <span className="text-[var(--muted-foreground)] font-medium mx-1">vs</span> {m.teamB}
                    </h3>

                    {/* Scores preview */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm num-font font-bold text-[var(--muted-foreground)] bg-[var(--muted)]/30 rounded-xl px-3 py-2 max-w-full border border-[var(--border)]/30">
                      {m.firstInnings && (
                        <span className="flex items-center gap-1.5 flex-wrap min-w-0">
                          <span className="text-[var(--foreground)] font-bold">{m.firstInnings.team}</span>
                          <span className="text-emerald-600 dark:text-emerald-400">{m.firstInnings.totalRuns}/{m.firstInnings.totalWickets}</span>
                          <span className="text-xs font-medium opacity-70">({m.firstInnings.oversString} ov)</span>
                        </span>
                      )}
                      {m.secondInnings && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-[var(--border)] hidden xs:block" />
                          <span className="flex items-center gap-1.5 flex-wrap min-w-0">
                            <span className="text-[var(--foreground)] font-bold">{m.secondInnings.team}</span>
                            <span className="text-emerald-600 dark:text-emerald-400">{m.secondInnings.totalRuns}/{m.secondInnings.totalWickets}</span>
                            <span className="text-xs font-medium opacity-70">({m.secondInnings.oversString} ov)</span>
                          </span>
                        </>
                      )}
                      {!m.firstInnings && !m.secondInnings && (
                        <span className="text-xs font-medium opacity-70 italic">Match hasn&apos;t started yet</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0 pt-4 sm:pt-0 border-t sm:border-t-0 border-[var(--border)]/50">
                    {isCurrent ? (
                      <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm min-h-[44px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all duration-200 shadow-md shadow-emerald-900/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>Resume Scoring</span>
                      </button>
                    ) : m.status === 'ONGOING' ? (
                      <button
                        type="button"
                        onClick={() => {
                          router.push(`/matches/score/${m.id}`);
                          onClose();
                        }}
                        className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm min-h-[44px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all duration-200 shadow-md shadow-amber-900/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>Switch &amp; Score</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => router.push(`/matches/center/${m.id}`)}
                        className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-[var(--muted)]/50 hover:bg-[var(--muted)] border border-[var(--border)]/50 hover:border-[var(--border)] font-bold text-sm min-h-[44px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border)] group/btn"
                      >
                        <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400 group-hover/btn:scale-110 transition-transform duration-200" />
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

