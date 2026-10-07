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
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Reversible Navigation Bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center font-semibold hover:text-[var(--foreground)] active:scale-95 transition-transform gap-1.5 text-xs min-h-[38px] p-1"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <Link
          href="/matches/new"
          className="flex items-center bg-emerald-600 hover:bg-emerald-500 font-bold shadow-xs gap-1.5 px-3.5 rounded-xl text-xs min-h-[38px] py-2"
        >
          <PlusCircle className="w-4 h-4" />
          <span>New Match</span>
        </Link>
      </div>

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
                Live Match In Progress
              </span>
              <p className="font-extrabold truncate text-sm">
                {ongoingMatch.teamA} vs {ongoingMatch.teamB}
              </p>
            </div>
          </div>
          <Link
            href={`/matches/score/${ongoingMatch.id}`}
            className="bg-emerald-500 hover:bg-emerald-400 font-black flex items-center justify-center shrink-0 active:scale-95 transition-transform shadow-xs px-3.5 rounded-xl text-xs min-h-[40px] gap-1.5 py-2"
          >
            <Play className="fill-current w-3.5 h-3.5" />
            <span>Return to Scoring</span>
          </Link>
        </div>
      )}

      {/* Title & Stats */}
      <div className="flex justify-between flex-wrap items-center gap-4">
        <div>
          <h1 className="font-black tracking-tight flex items-center text-2xl gap-2">
            <History className="text-emerald-600 w-6 h-6" />
            <span>Match Archive</span>
          </h1>
          <p className="text-xs">
            Total {matches.length} matches recorded ({matches.filter((m) => m.status === 'COMPLETED').length} completed)
          </p>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex items-stretch sm:items-center justify-between flex-wrap gap-3">
        <div className="flex bg-[var(--muted)] font-bold overflow-x-auto no-scrollbar rounded-xl p-1 text-xs">
          {(['ALL', 'COMPLETED', 'ONGOING'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`flex-1 sm:flex-initial px-3 sm:px-4 py-2 rounded-lg whitespace-nowrap min-h-[36px] transition-colors ${
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] w-4 h-4" />
          <input
            type="text"
            placeholder="Search teams or venue..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-[var(--card)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded-xl min-h-[38px] w-64 pl-9 pr-3 py-2 text-xs"
          />
        </div>
      </div>

      {/* Batch Actions Bar */}
      {filteredMatches.length > 0 && (
        <div className="flex items-center justify-between bg-[var(--card)] border border-[var(--border)] font-semibold rounded-xl min-h-[40px] px-3 py-2 text-xs">
          <button
            onClick={toggleSelectAll}
            className="flex items-center hover:text-[var(--foreground)] text-[var(--muted-foreground)] min-h-[32px] gap-2"
          >
            {selectedIds.size === filteredMatches.length ? (
              <CheckSquare className="text-emerald-600 w-4 h-4" />
            ) : (
              <Square className="w-4 h-4" />
            )}
            <span>Select All ({selectedIds.size})</span>
          </button>

          {selectedIds.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="flex items-center hover:text-red-600 font-bold gap-1.5 text-red-500 min-h-[32px]"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete Selected</span>
            </button>
          )}
        </div>
      )}

      {/* Matches List */}
      {filteredMatches.length === 0 ? (
        <div className="bg-[var(--card)] border border-[var(--border)] border-dashed text-center rounded-2xl p-10 space-y-2">
          <History className="opacity-50 text-[var(--muted-foreground)] mx-auto w-8 h-8" />
          <h4 className="font-bold text-base">No matches found</h4>
          <p className="text-xs">Try adjusting your filters or search query.</p>
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
                <div className="flex items-start gap-3 min-w-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(m.id);
                    }}
                    className="hover:bg-[var(--muted)] shrink-0 flex items-center justify-center mt-0.5 rounded-lg min-h-[32px] min-w-[32px] p-1"
                    aria-label="Select match"
                  >
                    {isSelected ? (
                      <CheckSquare className="text-emerald-600 w-5 h-5" />
                    ) : (
                      <Square className="text-[var(--muted-foreground)] w-5 h-5" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center flex-wrap gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] sm:text-xs font-extrabold uppercase ${
                          m.status === 'ONGOING'
                            ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                            : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
                        }`}
                      >
                        {m.status}
                      </span>
                      <span className="font-medium text-xs">
                        {dateStr} • {m.totalOvers} Overs • {m.venue || 'Standard Ground'}
                      </span>
                    </div>

                    <h3 className="font-extrabold tracking-tight truncate text-lg">
                      {m.teamA} vs {m.teamB}
                    </h3>

                    {/* Innings score chips */}
                    <div className="flex flex-wrap font-semibold gap-2 text-xs">
                      {m.firstInnings && (
                        <span className="rounded bg-[var(--muted)] num-font py-0.5 px-2">
                          {m.firstInnings.team}: <b>{m.firstInnings.totalRuns}/{m.firstInnings.totalWickets}</b> ({m.firstInnings.oversString} ov)
                        </span>
                      )}
                      {m.secondInnings && (
                        <span className="rounded bg-[var(--muted)] num-font py-0.5 px-2">
                          {m.secondInnings.team}: <b>{m.secondInnings.totalRuns}/{m.secondInnings.totalWickets}</b> ({m.secondInnings.oversString} ov)
                        </span>
                      )}
                    </div>

                    <p className="font-medium text-xs pt-0.5">
                      {m.result || (m.status === 'ONGOING' ? 'Match In Progress' : 'Completed')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center shrink-0 border-t md:border-t-0 border-[var(--border)] gap-2 pt-0">
                  {m.status === 'ONGOING' ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/matches/score/${m.id}`);
                      }}
                      className="flex-1 md:flex-initial flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 font-bold active:scale-[0.98] transition-all gap-1.5 px-3.5 rounded-xl text-xs min-h-[40px] py-2"
                    >
                      <Play className="fill-current w-3.5 h-3.5" />
                      <span>Resume</span>
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/matches/center/${m.id}`);
                        }}
                        className="flex-1 md:flex-initial bg-[var(--muted)] hover:bg-[var(--border)] font-bold flex items-center justify-center active:scale-[0.98] transition-all px-3.5 rounded-xl min-h-[40px] py-2 text-xs"
                      >
                        Scorecard
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          ScorecardPdfGenerator.downloadPdf(m);
                        }}
                        className="bg-[var(--muted)] hover:bg-[var(--border)] flex items-center justify-center p-card rounded-xl text-emerald-600 min-h-[40px] min-w-[40px]"
                        title="Download PDF Scorecard"
                      >
                        <FileText className="w-4 h-4" />
                      </button>
                    </>
                  )}

                  <button
                    onClick={(e) => handleDeleteSingle(m.id, e)}
                    className="hover:bg-red-500/10 transition-colors flex items-center justify-center p-card rounded-xl text-red-500 min-h-[40px] min-w-[40px]"
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
