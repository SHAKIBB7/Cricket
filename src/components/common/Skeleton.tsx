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
      className="floating-card p-4 sm:p-5 flex flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--card)] min-h-[166px] gap-3 select-none"
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

// ── TEAM CARD SKELETON (mirrors the Teams Matchday card) ──
// Navy band (~52px) + Captain/Manager/Squad stat strip + squad
// strength segments + roster lines, so the swap to the real card
// does not shift the list. On-navy blocks use the shimmer utility
// directly with white tints (the muted Skeleton tone would be
// invisible against the band).
export function TeamCardSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading squad..."
      className="floating-card shadow-elev1 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] select-none"
    >
      {/* Matchday band */}
      <div className="bg-[#181868] flex items-center gap-2 px-3 py-2.5">
        <div className="w-8 h-8 rounded-full border-2 border-white/40 bg-white/20 animate-shimmer shrink-0" />
        <div className="h-5 flex-1 rounded-md bg-white/25 animate-shimmer" />
        <div className="w-8 h-8 rounded-full bg-white/20 animate-shimmer shrink-0" />
        <div className="w-8 h-8 rounded-full bg-white/20 animate-shimmer shrink-0" />
      </div>

      {/* Stat strip: Captain / Manager / Squad */}
      <div className="grid grid-cols-3 divide-x divide-[var(--border)]">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="py-2 px-2 flex flex-col items-center gap-1.5">
            <Skeleton className="w-12 h-[11px] rounded-md" />
            <Skeleton className="w-14 h-6 rounded-md" />
          </div>
        ))}
      </div>

      {/* Squad strength segments */}
      <div className="flex items-center gap-2 px-4 pb-2.5 pt-1">
        <div className="flex flex-1 gap-[3px]">
          {Array.from({ length: 15 }).map((_, i) => (
            <span key={i} className="h-1.5 flex-1 rounded-full bg-[var(--muted)] animate-shimmer" />
          ))}
        </div>
        <Skeleton className="w-5 h-5 rounded-md shrink-0" />
      </div>

      {/* Roster lines */}
      <div className="border-t border-[var(--border)] px-4 py-3 space-y-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <Skeleton className="w-6 h-6 rounded-full shrink-0" />
            <Skeleton className="flex-1 h-3.5 rounded-md" />
            <Skeleton className="w-16 h-3.5 rounded-md shrink-0" />
          </div>
        ))}
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
      className="max-w-5xl mx-auto w-full flex flex-col gap-3 sm:gap-4 select-none min-w-0"
    >
      {/* Top Banner Skeleton */}
      <div className="p-3 sm:p-5 rounded-2xl bg-[var(--card)] border border-[var(--border)] flex flex-col gap-3 min-w-0">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <Skeleton className="w-8 h-8 rounded-xl shrink-0" />
            <div className="space-y-1 min-w-0">
              <Skeleton className="w-20 sm:w-32 h-4 rounded-md" />
              <Skeleton className="w-14 sm:w-20 h-3 rounded-md" />
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Skeleton className="w-20 sm:w-28 h-8 rounded-lg" />
            <Skeleton className="w-12 sm:w-16 h-3 rounded-md" />
          </div>
        </div>
      </div>

      {/* Batsmen & Bowler Cards Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 min-w-0">
        <div className="p-3.5 sm:p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)] space-y-3 min-w-0">
          <Skeleton className="w-28 h-4 rounded-md" />
          <div className="space-y-2">
            <Skeleton className="w-full h-10 rounded-xl" />
            <Skeleton className="w-full h-10 rounded-xl" />
          </div>
        </div>
        <div className="p-3.5 sm:p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)] space-y-3 min-w-0">
          <Skeleton className="w-24 h-4 rounded-md" />
          <Skeleton className="w-full h-16 rounded-xl" />
        </div>
      </div>

      {/* Scoring Buttons Grid Skeleton */}
      <div className="p-3 sm:p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)] min-w-0">
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

// ── TOURNAMENT DETAILS SKELETON (Refined Hero + fixture rows) ──
// Mirrors the details page: navy hero (medallion + name + stat
// trio) with the docked tab window stitched under it, then fixture
// cards with their navy/gold strips.
export function DetailsHeroSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading tournament details..."
      className="space-y-4 select-none"
    >
      <div className="relative">
        <div className="relative overflow-hidden rounded-3xl bg-[#181868] px-6 pt-6 pb-11">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full border-2 border-[#e8b850]/70 bg-white/15 animate-shimmer shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="h-6 w-1/2 rounded-md bg-white/25 animate-shimmer" />
              <div className="h-3.5 w-1/3 rounded-md bg-white/15 animate-shimmer" />
            </div>
            <div className="hidden sm:flex items-stretch gap-3 shrink-0">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-1.5">
                  <div className="h-2.5 w-10 rounded-md bg-white/15 animate-shimmer" />
                  <div className="h-6 w-8 rounded-md bg-white/25 animate-shimmer" />
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Docked tab window */}
        <div className="relative z-10 mx-2 sm:mx-3 -mt-8 flex gap-1 rounded-2xl border border-[var(--border)] border-t-[3px] border-t-[#e8b850] bg-[var(--card)] p-1.5 shadow-elev2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="flex-1 h-[38px] rounded-xl" />
          ))}
        </div>
      </div>

      {/* Fixture rows */}
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden shadow-elev1"
        >
          <div className="h-10 bg-[#181868] border-b-[3px] border-[#e8b850] px-4 flex items-center">
            <div className="h-4 w-40 rounded-md bg-white/25 animate-shimmer" />
          </div>
          <div className="p-4 space-y-2.5">
            <Skeleton className="w-2/3 h-4 rounded-md" />
            <Skeleton className="w-1/2 h-4 rounded-md" />
            <Skeleton className="w-full h-10 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── PROFILE PAGE SKELETON ──
// Header row (avatar + identity + account block), stat tiles and
// the settings/account section rows of the profile page.
export function ProfileSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading profile..."
      className="space-y-4 select-none"
    >
      <div className="floating-card p-4 sm:p-5 flex items-center gap-3.5">
        <Skeleton className="w-16 h-16 rounded-full shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton className="w-40 max-w-full h-6 rounded-md" />
          <Skeleton className="w-28 h-3.5 rounded-md" />
        </div>
        <Skeleton className="w-20 h-9 rounded-xl shrink-0" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="floating-card p-3.5 sm:p-4 space-y-2">
            <Skeleton className="w-16 h-3.5 rounded-md" />
            <Skeleton className="w-12 h-6 rounded-md" />
          </div>
        ))}
      </div>

      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="floating-card p-4 sm:p-5 space-y-3">
          <Skeleton className="w-32 h-4 rounded-md" />
          <Skeleton className="w-full h-3.5 rounded-md" />
          <Skeleton className="w-3/4 h-3.5 rounded-md" />
        </div>
      ))}
    </div>
  );
}

// ── SCORE PAGE SKELETON ──
// The scoring cockpit's first paint: scoreboard card (two innings
// rows + chase strip), active batsmen rows and the scoring keypad
// block. (ScoreboardSkeleton above serves the match-center and
// summary surfaces; this one mirrors the live score page.)
export function ScorePageSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading score page..."
      className="max-w-5xl mx-auto w-full flex flex-col gap-3 sm:gap-4 select-none min-w-0"
    >
      {/* Scoreboard card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[var(--card)] border border-[var(--border)] flex flex-col gap-3 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2 flex-1 min-w-0">
            <Skeleton className="w-36 max-w-full h-5 rounded-md" />
            <Skeleton className="w-28 h-4 rounded-md" />
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <Skeleton className="w-24 h-9 rounded-lg" />
            <Skeleton className="w-16 h-3.5 rounded-md" />
          </div>
        </div>
        <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
          <Skeleton className="w-20 h-4 rounded-md" />
          <Skeleton className="w-20 h-4 rounded-md" />
          <Skeleton className="w-24 h-4 rounded-md" />
        </div>
      </div>

      {/* Active batsmen rows */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)] space-y-2.5 min-w-0">
        <Skeleton className="w-28 h-4 rounded-md" />
        <Skeleton className="w-full h-10 rounded-xl" />
        <Skeleton className="w-full h-10 rounded-xl" />
      </div>

      {/* Scoring keypad block */}
      <div className="p-3 sm:p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)] min-w-0">
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── PLAYER PROFILE SKELETON (career player page) ──
// Header (avatar + name + meta), the hairline stat strip and the
// per-section record rows.
export function PlayerProfileSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading player profile..."
      className="space-y-4 select-none"
    >
      <div className="floating-card p-4 sm:p-5 flex items-center gap-4">
        <Skeleton className="w-20 h-20 rounded-2xl shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton className="w-48 max-w-full h-7 rounded-md" />
          <Skeleton className="w-32 h-4 rounded-md" />
          <Skeleton className="w-24 h-3.5 rounded-md" />
        </div>
      </div>

      {/* Stat strip: one hairline card, five cells */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] grid grid-cols-5 gap-px overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="p-3 flex flex-col items-center gap-1.5">
            <Skeleton className="w-10 h-5 rounded-md" />
            <Skeleton className="w-12 h-3 rounded-md" />
          </div>
        ))}
      </div>

      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="floating-card p-4 sm:p-5 space-y-2.5">
          <Skeleton className="w-36 h-4 rounded-md" />
          <Skeleton className="w-full h-3.5 rounded-md" />
          <Skeleton className="w-5/6 h-3.5 rounded-md" />
          <Skeleton className="w-2/3 h-3.5 rounded-md" />
        </div>
      ))}
    </div>
  );
}
