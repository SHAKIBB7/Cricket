'use client';

import React from 'react';
import Link from 'next/link';
import { WifiOff, Home, PlusCircle, History, Trophy, Users, RefreshCw } from 'lucide-react';

export default function OfflineFallbackPage() {
  const handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center">
      <div className="max-w-md w-full bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 sm:p-8 shadow-floating space-y-6">
        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
          <WifiOff className="w-8 h-8 sm:w-10 sm:h-10" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[var(--foreground)]">
            Offline Mode Active
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
            You are currently working offline. All match scoring, history, teams, and tournament features continue to work locally and will synchronize automatically when your connection returns.
          </p>
        </div>

        <div className="space-y-2.5 pt-2">
          <Link
            href="/"
            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-sm shadow-emerald-600/30 transition-all active:scale-[0.98]"
          >
            <Home className="w-4 h-4" />
            <span>Go to Dashboard</span>
          </Link>

          <Link
            href="/matches/new"
            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--foreground)] rounded-xl font-semibold text-sm transition-all active:scale-[0.98]"
          >
            <PlusCircle className="w-4 h-4 text-emerald-500" />
            <span>Start New Match</span>
          </Link>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <Link
              href="/matches/history"
              className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-[var(--muted)]/50 hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-xs font-semibold transition-colors"
            >
              <History className="w-4 h-4 mb-1 text-emerald-500" />
              <span>Matches</span>
            </Link>

            <Link
              href="/tournaments"
              className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-[var(--muted)]/50 hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-xs font-semibold transition-colors"
            >
              <Trophy className="w-4 h-4 mb-1 text-amber-500" />
              <span>Tourneys</span>
            </Link>

            <Link
              href="/teams"
              className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-[var(--muted)]/50 hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-xs font-semibold transition-colors"
            >
              <Users className="w-4 h-4 mb-1 text-blue-500" />
              <span>Teams</span>
            </Link>
          </div>
        </div>

        <button
          type="button"
          onClick={handleReload}
          className="inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] hover:text-emerald-500 transition-colors pt-2 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Try Reconnecting</span>
        </button>
      </div>
    </div>
  );
}
