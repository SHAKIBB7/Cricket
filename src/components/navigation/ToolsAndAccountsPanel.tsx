'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronRight, ChevronDown, Moon, Sun, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useSyncStatus } from '@/context/SyncContext';
import { useAuth } from '@/context/AuthContext';

function useOptionalSyncStatus() {
  try {
    return useSyncStatus();
  } catch {
    return null;
  }
}

function useOptionalAuth() {
  try {
    return useAuth();
  } catch {
    return null;
  }
}

export interface ToolsAndAccountsPanelProps {
  pathname: string;
  isScoringScreen?: boolean;
  activeView?: string | null;
  toggleView?: (view: 'scoreboard' | 'matches' | 'advancedAnalytics') => void;
  language?: string;
  t?: (key: string) => string;
  currentTheme?: 'light' | 'dark' | 'sunlight';
  toggleTheme?: () => void;
  setTheme?: (theme: 'light' | 'dark' | 'sunlight') => void;
}

/**
 * Format last synced timestamp into concise, readable relative string
 * e.g., "Last sync: 2 mins ago" or "Last sync: Just now"
 */
function formatRelativeTime(date: Date | null): string | null {
  if (!date) return null;
  const d = new Date(date);
  const time = d.getTime();
  if (Number.isNaN(time)) return null;

  const now = Date.now();
  const diffMs = Math.max(0, now - time);
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Last sync: Just now';
  if (diffMins === 1) return 'Last sync: 1 min ago';
  if (diffMins < 60) return `Last sync: ${diffMins} mins ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return 'Last sync: 1 hr ago';
  if (diffHours < 24) return `Last sync: ${diffHours} hrs ago`;

  return `Last sync: ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

export function ToolsAndAccountsPanel({
  pathname,
  isScoringScreen = false,
  activeView,
  toggleView,
  language = 'en',
  t,
  currentTheme = 'light',
  toggleTheme,
  setTheme,
}: ToolsAndAccountsPanelProps) {
  // Safe context accessors that never throw in unit tests outside of Providers
  const syncCtx = useOptionalSyncStatus();
  const authCtx = useOptionalAuth();

  const [isSyncingLocal, setIsSyncingLocal] = useState(false);
  const [relativeTime, setRelativeTime] = useState<string | null>(null);

  // Sync snapshot
  const syncState = syncCtx?.syncState || 'SYNCED';
  const lastSyncedAt = syncCtx?.lastSyncedAt || null;
  const isOnline = syncCtx?.isOnline ?? true;
  const triggerSync = syncCtx?.triggerSync;

  // Real user authentication snapshot
  const user = authCtx?.user || null;
  const userDisplayName = user?.displayName || (user?.email ? user.email.split('@')[0] : null);

  // Update relative timestamp periodically
  useEffect(() => {
    setRelativeTime(formatRelativeTime(lastSyncedAt));
    if (!lastSyncedAt) return;

    const interval = setInterval(() => {
      setRelativeTime(formatRelativeTime(lastSyncedAt));
    }, 30000);
    return () => clearInterval(interval);
  }, [lastSyncedAt]);

  const handleManualSync = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!triggerSync || !isOnline) return;

    try {
      setIsSyncingLocal(true);
      await triggerSync();
    } catch {
      // Handled in SyncEngine
    } finally {
      setIsSyncingLocal(false);
    }
  };

  const isAnalyticsActive = isScoringScreen
    ? activeView === 'advancedAnalytics'
    : pathname === '/analytics' || pathname.startsWith('/analytics/');

  const isProfileActive = pathname === '/profile' || pathname.startsWith('/profile/');

  const analyticsHref = '/analytics';
  const handleAnalyticsClick = isScoringScreen && toggleView
    ? (e: React.MouseEvent) => {
        e.preventDefault();
        toggleView('advancedAnalytics');
      }
    : undefined;

  const profileLabel = language === 'en' ? 'Sync & Profile' : (t ? t('profile') || 'Sync & Profile' : 'Sync & Profile');
  const analyticsLabel = language === 'en' ? 'Analytics' : (t ? t('analytics') || 'Analytics' : 'Analytics');
  const cloudSyncLabel = language === 'en' ? 'Cloud Sync' : (t ? t('cloud_sync') || 'Cloud Sync' : 'Cloud Sync');
  const appearanceLabel = language === 'en' ? 'Appearance' : (t ? t('appearance') || 'Appearance' : 'Appearance');

  return (
    <section
      aria-label="Tools and Accounts"
      className="bg-white dark:bg-slate-900/90 rounded-[22px] lg:rounded-[24px] border border-slate-200/80 dark:border-slate-800 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.06),0_2px_6px_rgba(15,23,42,0.03)] dark:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.5)] p-3 lg:p-3.5 xl:p-4 space-y-2 lg:space-y-2.5 relative overflow-hidden select-none transition-colors duration-200"
    >
      {/* Decorative Watermark (Cricket batsman & slogan, subtle, non-intrusive) */}
      <div
        aria-hidden="true"
        className="absolute top-1.5 right-2 pointer-events-none select-none opacity-[0.14] dark:opacity-[0.08] hidden xl:flex flex-col items-end rotate-[-4deg]"
      >
        <span className="text-[10px] font-bold tracking-tight text-slate-500 italic">Better Tools</span>
        <span className="text-[10px] font-bold tracking-tight text-slate-500 italic -mt-1">Better Cricket</span>
      </div>

      {/* Header with Cricket Shield Emblem, Vertical Emerald Bar, Title & Subtitle */}
      <header className="flex items-center gap-2.5 lg:gap-3 pb-1 relative z-10">
        {/* Cricket Shield Emblem */}
        <div
          className="w-10 h-10 lg:w-11 lg:h-11 rounded-[14px] lg:rounded-[16px] bg-[#ebfbf2] dark:bg-emerald-950/60 border border-emerald-500/20 flex items-center justify-center shrink-0 shadow-xs"
          aria-hidden="true"
        >
          <svg width="22" height="24" viewBox="0 0 24 26" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Shield Outline and Gradient Fill */}
            <path
              d="M12 1L3 4.5V11.5C3 17.5 6.8 23.1 12 25C17.2 23.1 21 17.5 21 11.5V4.5L12 1Z"
              fill="#059669"
              stroke="#047857"
              strokeWidth="1.2"
            />
            {/* Horizontal Cricket Bail */}
            <rect x="7" y="7.5" width="10" height="1.5" rx="0.75" fill="#ffffff" />
            {/* 3 Vertical Cricket Stumps */}
            <rect x="8" y="9.5" width="1.3" height="8.5" rx="0.65" fill="#ffffff" />
            <rect x="11.35" y="9.5" width="1.3" height="8.5" rx="0.65" fill="#ffffff" />
            <rect x="14.7" y="9.5" width="1.3" height="8.5" rx="0.65" fill="#ffffff" />
          </svg>
        </div>

        {/* Vertical Emerald Accent Line */}
        <div className="w-1 h-7 lg:h-8 bg-emerald-500 rounded-full shrink-0" aria-hidden="true" />

        {/* Title & Subtitle */}
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] lg:text-[15px] xl:text-[15.5px] font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight truncate">
            Tools &amp; Accounts
          </h2>
          <p className="text-[10px] lg:text-[10.5px] xl:text-[11px] text-slate-500 dark:text-slate-400 font-normal leading-tight truncate mt-0.5">
            Manage your account settings, preferences and integrations
          </p>
        </div>
      </header>

      {/* 4 Dedicated Settings Rows */}
      <div className="space-y-1.5 lg:space-y-2 relative z-10" role="menu">
        {/* ROW 1: Analytics */}
        <Link
          href={analyticsHref}
          onClick={handleAnalyticsClick}
          role="menuitem"
          aria-current={isAnalyticsActive ? 'page' : undefined}
          aria-label={analyticsLabel}
          className={`group flex items-center justify-between p-2 lg:p-2.5 rounded-[16px] lg:rounded-[18px] transition-all duration-200 ease-out active:scale-[0.99] motion-reduce:transform-none border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:focus-visible:ring-emerald-400/40 focus-visible:ring-offset-1 ${
            isAnalyticsActive
              ? 'bg-[#ebfbf2] dark:bg-emerald-950/40 border-emerald-500/25 shadow-xs'
              : 'bg-slate-50/70 hover:bg-slate-100/90 dark:bg-slate-800/40 dark:hover:bg-slate-800/80 border-slate-100 dark:border-slate-800/60'
          }`}
        >
          <div className="flex items-center gap-2.5 lg:gap-3 min-w-0 flex-1">
            {/* 40-44px Mint Squircle Analytics Icon */}
            <div
              className="w-10 h-10 lg:w-11 lg:h-11 rounded-[14px] lg:rounded-[15px] bg-[#ebfbf2] dark:bg-emerald-950/70 border border-emerald-500/20 text-[#059669] dark:text-emerald-400 flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 motion-reduce:transform-none transition-transform duration-200"
              aria-hidden="true"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="6" y1="20" x2="6" y2="13" />
                <line x1="12" y1="20" x2="12" y2="8" />
                <line x1="18" y1="20" x2="18" y2="4" />
                <circle cx="17.5" cy="5.5" r="3.5" fill="#10b981" stroke="none" />
                <path d="M16 6.5L19 4M19 4H16.8M19 4V6.2" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            {/* Labels Column */}
            <div className="min-w-0 flex-1">
              <span className="block text-[13.5px] lg:text-[14px] font-bold whitespace-nowrap text-slate-900 dark:text-slate-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 leading-snug transition-colors">
                {analyticsLabel}
              </span>
              <span className="block text-[10.5px] lg:text-[11px] text-slate-500 dark:text-slate-400 leading-tight truncate mt-0.5">
                View your performance, match statistics and insights
              </span>
            </div>
          </div>

          {/* Right Area: Live Data Badge & Chevron */}
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 lg:py-1 rounded-full text-[9.5px] lg:text-[10px] font-semibold bg-[#ebfbf2] dark:bg-emerald-950/80 text-[#059669] dark:text-emerald-400 border border-emerald-500/25 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse motion-reduce:animate-none" />
              Live Data
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 group-hover:translate-x-0.5 motion-reduce:transform-none transition-transform duration-200" />
          </div>
        </Link>

        {/* ROW 2: Sync & Profile */}
        <Link
          href="/profile"
          role="menuitem"
          aria-current={isProfileActive ? 'page' : undefined}
          aria-label={profileLabel}
          className={`group flex items-center justify-between p-2 lg:p-2.5 rounded-[16px] lg:rounded-[18px] transition-all duration-200 ease-out active:scale-[0.99] motion-reduce:transform-none border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:focus-visible:ring-blue-400/40 focus-visible:ring-offset-1 ${
            isProfileActive
              ? 'bg-[#eff6ff] dark:bg-blue-950/40 border-blue-500/25 shadow-xs'
              : 'bg-slate-50/70 hover:bg-slate-100/90 dark:bg-slate-800/40 dark:hover:bg-slate-800/80 border-slate-100 dark:border-slate-800/60'
          }`}
        >
          <div className="flex items-center gap-2.5 lg:gap-3 min-w-0 flex-1">
            {/* 40-44px Soft Blue Squircle User & Cog Icon */}
            <div
              className="w-10 h-10 lg:w-11 lg:h-11 rounded-[14px] lg:rounded-[15px] bg-[#eff6ff] dark:bg-blue-950/70 border border-blue-500/20 text-[#2563eb] dark:text-blue-400 flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 motion-reduce:transform-none transition-transform duration-200"
              aria-hidden="true"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21v-2a4 4 0 0 0-3-3.87" />
                <circle cx="12" cy="7" r="4" />
                <path d="M5 21v-2a4 4 0 0 1 4-4h4" />
                {/* Small Cog badge at bottom right */}
                <circle cx="18" cy="18" r="3" fill="#2563eb" stroke="#1d4ed8" strokeWidth="1" />
                <path d="M18 16.5v3M16.5 18h3" stroke="#ffffff" strokeWidth="1" strokeLinecap="round" />
              </svg>
            </div>

            {/* Labels Column */}
            <div className="min-w-0 flex-1">
              <span className="block text-[13.5px] lg:text-[14px] font-bold whitespace-nowrap text-slate-900 dark:text-slate-100 group-hover:text-blue-700 dark:group-hover:text-blue-400 leading-snug transition-colors">
                {profileLabel}
              </span>
              <span className="block text-[10.5px] lg:text-[11px] text-slate-500 dark:text-slate-400 leading-tight truncate mt-0.5">
                Manage your account, profile information and security
              </span>
            </div>
          </div>

          {/* Right Area: User Badge & Chevron */}
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            {userDisplayName ? (
              <span className="max-w-[70px] lg:max-w-[85px] truncate px-2 py-0.5 rounded-full text-[9.5px] lg:text-[10px] font-semibold bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                {userDisplayName}
              </span>
            ) : null}
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 group-hover:translate-x-0.5 motion-reduce:transform-none transition-transform duration-200" />
          </div>
        </Link>

        {/* ROW 3: Cloud Sync (Normal Document Flow, No Floating/Overlapping Banner) */}
        <Link
          href="/profile#sync"
          role="menuitem"
          aria-label={cloudSyncLabel}
          className="group flex items-center justify-between p-2 lg:p-2.5 rounded-[16px] lg:rounded-[18px] bg-slate-50/70 hover:bg-slate-100/90 dark:bg-slate-800/40 dark:hover:bg-slate-800/80 border border-slate-100 dark:border-slate-800/60 transition-all duration-200 ease-out active:scale-[0.99] motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/40 dark:focus-visible:ring-purple-400/40 focus-visible:ring-offset-1"
        >
          <div className="flex items-center gap-2.5 lg:gap-3 min-w-0 flex-1">
            {/* 40-44px Soft Purple Squircle Cloud Sync Icon */}
            <div
              className="w-10 h-10 lg:w-11 lg:h-11 rounded-[14px] lg:rounded-[15px] bg-[#f5f3ff] dark:bg-purple-950/70 border border-purple-500/20 text-[#7c3aed] dark:text-purple-400 flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 motion-reduce:transform-none transition-transform duration-200"
              aria-hidden="true"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                <circle cx="12" cy="14" r="2.8" strokeWidth="1.4" fill="currentColor" fillOpacity="0.1" />
                <path d="M10.8 12.8L12 11.6l1.2 1.2" strokeWidth="1.2" />
                <path d="M13.2 15.2L12 16.4l-1.2-1.2" strokeWidth="1.2" />
              </svg>
            </div>

            {/* Labels Column */}
            <div className="min-w-0 flex-1">
              <span className="block text-[13.5px] lg:text-[14px] font-bold whitespace-nowrap text-slate-900 dark:text-slate-100 group-hover:text-purple-700 dark:group-hover:text-purple-400 leading-snug transition-colors">
                {cloudSyncLabel}
              </span>
              <span className="block text-[10.5px] lg:text-[11px] text-slate-500 dark:text-slate-400 leading-tight truncate mt-0.5">
                Your data is safely synced across all devices
              </span>
            </div>
          </div>

          {/* Right Area: Status Badge & Dynamic Relative Timestamp */}
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            <div className="flex flex-col items-end text-right">
              {isSyncingLocal || syncState === 'SYNCING' ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9.5px] lg:text-[10px] font-bold bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 border border-blue-500/25 shrink-0">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin motion-reduce:animate-none" />
                  Syncing
                </span>
              ) : !isOnline || syncState === 'OFFLINE' ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9.5px] lg:text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 shrink-0">
                  Offline
                </span>
              ) : syncState === 'ERROR' ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9.5px] lg:text-[10px] font-bold bg-rose-50 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 border border-rose-500/25 shrink-0">
                  Retry
                </span>
              ) : (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={handleManualSync}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleManualSync(e as any);
                    }
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9.5px] lg:text-[10px] font-bold bg-[#ebfbf2] dark:bg-emerald-950/80 text-[#059669] dark:text-emerald-400 border border-emerald-500/25 shrink-0 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 transition-colors"
                  title="Click to trigger manual sync"
                  aria-label="Trigger manual sync"
                >
                  <CheckCircle2 className="w-2.5 h-2.5 text-[#10b981]" />
                  Synced
                </span>
              )}

              {/* Real Last Sync Timestamp */}
              {relativeTime && (
                <span className="text-[8.5px] lg:text-[9px] text-slate-400 dark:text-slate-500 mt-0.5 leading-none">
                  {relativeTime}
                </span>
              )}
            </div>

            <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 group-hover:translate-x-0.5 motion-reduce:transform-none transition-transform duration-200" />
          </div>
        </Link>

        {/* ROW 4: Appearance (Smooth Theme Control, Fully Accessible & Visible) */}
        <div
          role="menuitem"
          tabIndex={0}
          aria-label={appearanceLabel}
          onClick={() => toggleTheme?.()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleTheme?.();
            }
          }}
          className="group flex items-center justify-between p-2 lg:p-2.5 rounded-[16px] lg:rounded-[18px] bg-slate-50/70 hover:bg-slate-100/90 dark:bg-slate-800/40 dark:hover:bg-slate-800/80 border border-slate-100 dark:border-slate-800/60 transition-all duration-200 ease-out active:scale-[0.99] motion-reduce:transform-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 dark:focus-visible:ring-amber-400/40 focus-visible:ring-offset-1"
        >
          <div className="flex items-center gap-2.5 lg:gap-3 min-w-0 flex-1">
            {/* 40-44px Soft Amber Squircle Dual Sun & Moon Icon */}
            <div
              className="w-10 h-10 lg:w-11 lg:h-11 rounded-[14px] lg:rounded-[15px] bg-[#fefce8] dark:bg-amber-950/70 border border-amber-500/20 text-[#d97706] dark:text-amber-400 flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 motion-reduce:transform-none transition-transform duration-200"
              aria-hidden="true"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v2M4.93 4.93l1.41 1.41M2 12h2M4.93 19.07l1.41-1.41M12 20v2" />
                <path d="M12 4a8 8 0 1 0 8 8 6 6 0 0 1-8-8Z" fill="currentColor" fillOpacity="0.25" />
              </svg>
            </div>

            {/* Labels Column */}
            <div className="min-w-0 flex-1">
              <span className="block text-[13.5px] lg:text-[14px] font-bold whitespace-nowrap text-slate-900 dark:text-slate-100 group-hover:text-amber-700 dark:group-hover:text-amber-400 leading-snug transition-colors">
                {appearanceLabel}
              </span>
              <span className="block text-[10.5px] lg:text-[11px] text-slate-500 dark:text-slate-400 leading-tight truncate mt-0.5">
                Customize theme, display and visual preferences
              </span>
            </div>
          </div>

          {/* Right Area: Interactive Theme Pill Selector & Chevron */}
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleTheme?.();
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] lg:text-[11px] font-semibold bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 transition-colors shrink-0 cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
              title="Click to toggle theme (Light / Dark / Sunlight)"
              aria-label={`Current theme: ${currentTheme}. Click to cycle.`}
            >
              {currentTheme === 'dark' ? (
                <>
                  <Moon className="w-3 h-3 text-slate-700 dark:text-slate-300" />
                  <span>Dark</span>
                </>
              ) : currentTheme === 'sunlight' ? (
                <>
                  <Sun className="w-3 h-3 text-amber-500" />
                  <span>Sunlight</span>
                </>
              ) : (
                <>
                  <Sun className="w-3 h-3 text-amber-500" />
                  <span>Light</span>
                </>
              )}
              <ChevronDown className="w-3 h-3 text-slate-400 ml-0.5" />
            </button>

            <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 group-hover:translate-x-0.5 motion-reduce:transform-none transition-transform duration-200" />
          </div>
        </div>
      </div>
    </section>
  );
}
