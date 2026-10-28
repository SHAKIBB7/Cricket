'use client';

import React from 'react';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function Skeleton({ className = '', ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-lg bg-[var(--muted)] animate-shimmer overflow-hidden ${className}`}
      {...props}
    />
  );
}

// ── MATCH CARD SKELETON (Matches History & Ongoing Cards) ──
export function MatchCardSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading match details..."
      className="floating-card p-4 sm:p-5 flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] select-none"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="w-5 h-5 rounded-full" />
          <Skeleton className="w-24 h-4 rounded-md" />
        </div>
        <Skeleton className="w-16 h-5 rounded-full" />
      </div>

      <div className="flex items-center justify-between gap-4 py-1">
        <div className="space-y-2 flex-1">
          <div className="flex items-center gap-2">
            <Skeleton className="w-6 h-6 rounded-md" />
            <Skeleton className="w-36 h-5 rounded-md" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="w-6 h-6 rounded-md" />
            <Skeleton className="w-32 h-5 rounded-md" />
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <Skeleton className="w-20 h-7 rounded-md" />
          <Skeleton className="w-14 h-4 rounded-md" />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-[var(--border)] text-caption">
        <Skeleton className="w-28 h-3.5 rounded-md" />
        <Skeleton className="w-20 h-3.5 rounded-md" />
      </div>
    </div>
  );
}

// ── TOURNAMENT CARD SKELETON ──
export function TournamentCardSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading tournament..."
      className="floating-card p-4 sm:p-5 flex flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--card)] min-h-[160px] gap-3 select-none"
    >
      <div className="flex items-start justify-between">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <Skeleton className="w-16 h-5 rounded-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="w-3/4 h-5 rounded-md" />
        <Skeleton className="w-1/2 h-3.5 rounded-md" />
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
        <Skeleton className="w-24 h-4 rounded-md" />
        <Skeleton className="w-12 h-4 rounded-md" />
      </div>
    </div>
  );
}

// ── TEAM SQUAD CARD SKELETON ──
export function TeamCardSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading squad..."
      className="floating-card p-4 sm:p-5 flex flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--card)] min-h-[140px] gap-3 select-none"
    >
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
        <div className="space-y-1.5 flex-1">
          <Skeleton className="w-32 h-4 rounded-md" />
          <Skeleton className="w-20 h-3 rounded-md" />
        </div>
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
        <Skeleton className="w-16 h-4 rounded-md" />
        <Skeleton className="w-20 h-4 rounded-md" />
      </div>
    </div>
  );
}

// ── SCOREBOARD SKELETON (Prevents layout shift when loading Live Scoring Cockpit) ──
export function ScoreboardSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading live scoreboard..."
      className="max-w-5xl mx-auto w-full flex flex-col gap-3 sm:gap-4 select-none animate-fade-in"
    >
      {/* Top Banner Skeleton */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[var(--card)] border border-[var(--border)] flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Skeleton className="w-8 h-8 rounded-xl" />
            <div className="space-y-1">
              <Skeleton className="w-32 h-4 rounded-md" />
              <Skeleton className="w-20 h-3 rounded-md" />
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Skeleton className="w-28 h-8 rounded-lg" />
            <Skeleton className="w-16 h-3 rounded-md" />
          </div>
        </div>
      </div>

      {/* Batsmen & Bowler Cards Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)] space-y-3">
          <Skeleton className="w-28 h-4 rounded-md" />
          <div className="space-y-2">
            <Skeleton className="w-full h-10 rounded-xl" />
            <Skeleton className="w-full h-10 rounded-xl" />
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)] space-y-3">
          <Skeleton className="w-24 h-4 rounded-md" />
          <Skeleton className="w-full h-16 rounded-xl" />
        </div>
      </div>

      {/* Scoring Buttons Grid Skeleton */}
      <div className="p-3 sm:p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)]">
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── STATS / ANALYTICS CARD SKELETON ──
export function AnalyticsStatsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="floating-card p-3.5 sm:p-4 space-y-2">
          <Skeleton className="w-20 h-3.5 rounded-md" />
          <Skeleton className="w-16 h-6 rounded-md" />
        </div>
      ))}
    </div>
  );
}
