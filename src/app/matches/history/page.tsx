'use client';

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
  PlusCircle,
  Clock,
  ArrowLeft,
} from 'lucide-react';
import { MatchRepository } from '@/infrastructure/storage/MatchRepository';
import { MatchScorecard } from '@/domain/cricket/types';
import { ScorecardPdfGenerator } from '@/features/scoring/pdf/ScorecardPdfGenerator';

export default function MatchHistoryPage() {
  const router = useRouter();

  const [matches, setMatches] = useState<MatchScorecard[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'COMPLETED' | 'ONGOING'>('ALL');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMatches();
  }, []);

  async function loadMatches() {
    const list = await MatchRepository.getAllMatches();
    setMatches(list);
    setLoading(false);
  }

  const handleDeleteSingle = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this match record?')) return;
    await MatchRepository.deleteMatch(id);
    loadMatches();
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected matches?`)) return;
    await MatchRepository.deleteMatches(Array.from(selectedIds));
    setSelectedIds(new Set());
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

  const ongoingMatch = matches.find((m) => m.status === 'ONGOING');

  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
      {/* Top Reversible Navigation Bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] min-h-[38px] p-1 active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <Link
          href="/matches/new"
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs min-h-[38px]"
        >
          <PlusCircle className="w-4 h-4" />
          <span>New Match</span>
        </Link>
      </div>

      {/* Active Match Return Banner */}
      {ongoingMatch && (
        <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 border border-emerald-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2.5 min-w-0 w-full sm:w-auto">
            <span className="flex h-2.5 w-2.5 relative shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold uppercase text-emerald-400 tracking-wider block">
                Live Match In Progress
              </span>
              <p className="text-xs sm:text-sm font-extrabold text-white truncate">
                {ongoingMatch.teamA} vs {ongoingMatch.teamB}
              </p>
            </div>
          </div>
          <Link
            href={`/matches/score/${ongoingMatch.id}`}
            className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs min-h-[40px] flex items-center justify-center gap-1.5 shrink-0 active:scale-95 transition-transform shadow-xs"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Return to Scoring</span>
          </Link>
        </div>
      )}

      {/* Title & Stats */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
            <History className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" />
            <span>Match Archive</span>
          </h1>
          <p className="text-[11px] sm:text-xs text-[var(--muted-foreground)]">
            Total {matches.length} matches recorded ({matches.filter((m) => m.status === 'COMPLETED').length} completed)
          </p>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3">
        <div className="flex rounded-xl bg-[var(--muted)] p-1 text-[11px] sm:text-xs font-bold overflow-x-auto no-scrollbar">
          {(['ALL', 'COMPLETED', 'ONGOING'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`flex-1 sm:flex-initial px-3 sm:px-4 py-1.5 rounded-lg whitespace-nowrap min-h-[36px] transition-colors ${
                filter === tab
                  ? 'bg-[var(--card)] text-[var(--foreground)] shadow-xs'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              {tab === 'ALL' ? 'All Matches' : tab === 'COMPLETED' ? 'Completed' : 'Ongoing / Live'}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-[var(--muted-foreground)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search teams or venue..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64 pl-9 pr-3 py-2 rounded-xl bg-[var(--card)] border border-[var(--border)] text-xs min-h-[38px] focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Batch Actions Bar */}
      {filteredMatches.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--card)] border border-[var(--border)] text-xs font-semibold min-h-[40px]">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] min-h-[32px]"
          >
            {selectedIds.size === filteredMatches.length ? (
              <CheckSquare className="w-4 h-4 text-emerald-600" />
            ) : (
              <Square className="w-4 h-4" />
            )}
            <span>Select All ({selectedIds.size})</span>
          </button>

          {selectedIds.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="flex items-center gap-1.5 text-red-500 hover:text-red-600 font-bold min-h-[32px]"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete Selected</span>
            </button>
          )}
        </div>
      )}

      {/* Matches List */}
      {filteredMatches.length === 0 ? (
        <div className="p-10 text-center rounded-2xl bg-[var(--card)] border border-[var(--border)] border-dashed space-y-2">
          <History className="w-8 h-8 text-[var(--muted-foreground)] mx-auto opacity-50" />
          <h4 className="font-bold text-base">No matches found</h4>
          <p className="text-xs text-[var(--muted-foreground)]">Try adjusting your filters or search query.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMatches.map((m) => {
            const isSelected = selectedIds.has(m.id);
            const dateStr = m.createdAt
              ? new Date(m.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'Recent';

            return (
              <div
                key={m.id}
                onClick={() => {
                  if (m.status === 'ONGOING') router.push(`/matches/score/${m.id}`);
                  else router.push(`/matches/center/${m.id}`);
                }}
                className={`p-3.5 sm:p-4 md:p-5 rounded-xl sm:rounded-2xl bg-[var(--card)] border transition-all cursor-pointer hover:border-emerald-500/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4 shadow-xs ${
                  isSelected ? 'border-emerald-500 bg-emerald-500/5' : 'border-[var(--border)]'
                }`}
              >
                <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 w-full md:w-auto">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(m.id);
                    }}
                    className="mt-0.5 p-1 rounded-lg hover:bg-[var(--muted)] shrink-0 min-h-[32px] min-w-[32px] flex items-center justify-center"
                    aria-label="Select match"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
                    ) : (
                      <Square className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--muted-foreground)]" />
                    )}
                  </button>

                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-extrabold uppercase ${
                          m.status === 'ONGOING'
                            ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                            : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
                        }`}
                      >
                        {m.status}
                      </span>
                      <span className="text-[11px] sm:text-xs text-[var(--muted-foreground)] font-medium">
                        {dateStr} • {m.totalOvers} Overs • {m.venue || 'Standard Ground'}
                      </span>
                    </div>

                    <h3 className="font-extrabold text-sm sm:text-base md:text-lg tracking-tight truncate">
                      {m.teamA} vs {m.teamB}
                    </h3>

                    {/* Innings score chips */}
                    <div className="flex flex-wrap gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-semibold">
                      {m.firstInnings && (
                        <span className="px-2 py-0.5 rounded bg-[var(--muted)] num-font">
                          {m.firstInnings.team}: <b>{m.firstInnings.totalRuns}/{m.firstInnings.totalWickets}</b> ({m.firstInnings.oversString} ov)
                        </span>
                      )}
                      {m.secondInnings && (
                        <span className="px-2 py-0.5 rounded bg-[var(--muted)] num-font">
                          {m.secondInnings.team}: <b>{m.secondInnings.totalRuns}/{m.secondInnings.totalWickets}</b> ({m.secondInnings.oversString} ov)
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] sm:text-xs text-[var(--muted-foreground)] font-medium pt-0.5">
                      {m.result || (m.status === 'ONGOING' ? 'Match In Progress' : 'Completed')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-[var(--border)]">
                  {m.status === 'ONGOING' ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/matches/score/${m.id}`);
                      }}
                      className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs min-h-[40px] active:scale-[0.98] transition-all"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Resume</span>
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/matches/center/${m.id}`);
                        }}
                        className="flex-1 md:flex-initial px-3.5 py-2 rounded-xl bg-[var(--muted)] hover:bg-[var(--border)] font-bold text-xs min-h-[40px] flex items-center justify-center active:scale-[0.98] transition-all"
                      >
                        Scorecard
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          ScorecardPdfGenerator.downloadPdf(m);
                        }}
                        className="p-2.5 rounded-xl bg-[var(--muted)] hover:bg-[var(--border)] text-emerald-600 min-h-[40px] min-w-[40px] flex items-center justify-center"
                        title="Download PDF Scorecard"
                      >
                        <FileText className="w-4 h-4" />
                      </button>
                    </>
                  )}

                  <button
                    onClick={(e) => handleDeleteSingle(m.id, e)}
                    className="p-2.5 rounded-xl hover:bg-red-500/10 text-red-500 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
                    title="Delete Match"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
