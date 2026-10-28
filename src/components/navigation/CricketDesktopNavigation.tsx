'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import {
  CricketHomeIcon,
  CricketNewMatchIcon,
  CricketMatchesIcon,
  CricketTournamentIcon,
  CricketTeamsIcon,
} from './CricketNavIcons';
import { ToolsAndAccountsPanel } from './ToolsAndAccountsPanel';

export interface CricketDesktopNavigationProps {
  pathname: string;
  isScoringScreen?: boolean;
  activeView?: string | null;
  toggleView?: (view: 'scoreboard' | 'matches' | 'advancedAnalytics') => void;
  language?: string;
  t: (key: string) => string;
  currentTheme?: 'light' | 'dark' | 'sunlight';
  toggleTheme?: () => void;
  setTheme?: (theme: 'light' | 'dark' | 'sunlight') => void;
}

export function CricketDesktopNavigation({
  pathname,
  isScoringScreen = false,
  activeView,
  toggleView,
  language = 'en',
  t,
  currentTheme = 'light',
  toggleTheme,
  setTheme,
}: CricketDesktopNavigationProps) {
  const primaryNavItems = useMemo(() => {
    const tournamentLabel = language === 'en' ? 'Tournament' : (t('tournaments') || 'Tournament');
    return [
      {
        id: 'home',
        href: '/',
        label: t('home') || 'Home',
        icon: CricketHomeIcon,
        isActive: pathname === '/',
      },
      {
        id: 'new_match',
        href: '/matches/new',
        label: t('new_match') || 'New Match',
        icon: CricketNewMatchIcon,
        isActive:
          pathname === '/matches/new' ||
          pathname.startsWith('/matches/new/') ||
          pathname === '/matches/opening-players',
      },
      {
        id: 'matches',
        href: '/matches/history',
        label: t('matches') || 'Matches',
        icon: CricketMatchesIcon,
        isActive: isScoringScreen
          ? activeView === 'matches'
          : pathname === '/matches/history' ||
            pathname.startsWith('/matches/history/') ||
            (pathname.startsWith('/matches') &&
              !pathname.startsWith('/matches/new') &&
              !pathname.startsWith('/matches/opening-players') &&
              !pathname.startsWith('/matches/score/')),
        handleClick:
          isScoringScreen && toggleView
            ? (e: React.MouseEvent) => {
                e.preventDefault();
                toggleView('matches');
              }
            : undefined,
      },
      {
        id: 'tournaments',
        href: '/tournaments',
        label: tournamentLabel,
        icon: CricketTournamentIcon,
        isActive: pathname === '/tournaments' || pathname.startsWith('/tournaments/'),
      },
      {
        id: 'teams',
        href: '/teams',
        label: t('teams') || 'Teams',
        icon: CricketTeamsIcon,
        isActive: pathname === '/teams' || pathname.startsWith('/teams/'),
      },
    ];
  }, [pathname, isScoringScreen, activeView, toggleView, language, t]);

  return (
    <div className="flex-1 flex flex-col space-y-3.5 lg:space-y-4">
      {/* 5 Primary Cricket Navigation Items in Premium Rounded Container */}
      <div
        role="menubar"
        aria-orientation="vertical"
        aria-label="Primary Navigation"
        className="bg-white dark:bg-slate-900/90 rounded-[22px] lg:rounded-[24px] border border-slate-200/80 dark:border-slate-800 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.06),0_2px_6px_rgba(15,23,42,0.03)] dark:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.5)] p-2 lg:p-2.5 space-y-1.5"
      >
        {primaryNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.isActive;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={item.handleClick}
              role="menuitem"
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.label}
              className={`group flex items-center justify-between px-2.5 py-2 lg:py-2.5 rounded-[16px] lg:rounded-[18px] transition-all duration-200 ease-out active:scale-[0.98] select-none ${
                isActive
                  ? 'bg-[#ebfbf2] dark:bg-emerald-950/40 border border-emerald-500/20 dark:border-emerald-500/30 shadow-[0_1px_3px_rgba(16,185,129,0.08)]'
                  : 'bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800/40 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Standardized Optical Centering Disc */}
                <div
                  className={`w-9 h-9 lg:w-10 lg:h-10 flex items-center justify-center shrink-0 transition-colors duration-200 ${
                    isActive
                      ? ''
                      : 'rounded-full bg-[#f1f5f9] dark:bg-slate-800/70 group-hover:bg-slate-200/70 dark:group-hover:bg-slate-700/70'
                  }`}
                >
                  <Icon
                    isActive={isActive}
                    size={28}
                    className={`transition-transform duration-200 ease-out ${
                      isActive
                        ? 'w-7 h-7 lg:w-7.5 lg:h-7.5 scale-105'
                        : 'w-6.5 h-6.5 lg:w-7 lg:h-7 group-hover:scale-105'
                    }`}
                  />
                </div>

                {/* Professional Typography */}
                <span
                  className={`text-[13px] lg:text-[14px] leading-tight truncate tracking-tight transition-colors duration-200 ${
                    isActive
                      ? 'font-bold text-[#047857] dark:text-emerald-400'
                      : 'font-semibold text-[#475569] dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-100'
                  }`}
                >
                  {item.label}
                </span>
              </div>

              {/* Refined Emerald Active Indicator */}
              <div
                className={`w-1.5 h-5 rounded-full transition-all duration-200 ease-out shrink-0 ${
                  isActive
                    ? 'bg-[#10b981] shadow-xs opacity-100 scale-100'
                    : 'bg-transparent opacity-0 scale-50'
                }`}
                aria-hidden="true"
              />
            </Link>
          );
        })}
      </div>

      {/* Enterprise-Level Tools & Accounts Panel */}
      <ToolsAndAccountsPanel
        pathname={pathname}
        isScoringScreen={isScoringScreen}
        activeView={activeView}
        toggleView={toggleView}
        language={language}
        t={t}
        currentTheme={currentTheme}
        toggleTheme={toggleTheme}
        setTheme={setTheme}
      />
    </div>
  );
}
