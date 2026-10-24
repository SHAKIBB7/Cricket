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

export interface CricketBottomNavigationProps {
  pathname: string;
  language?: string;
  t: (key: string) => string;
}

export function CricketBottomNavigation({ pathname, language = 'en', t }: CricketBottomNavigationProps) {
  const navItems = useMemo(() => {
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
        isActive:
          pathname === '/matches/history' ||
          pathname.startsWith('/matches/history/') ||
          (pathname.startsWith('/matches') &&
            !pathname.startsWith('/matches/new') &&
            !pathname.startsWith('/matches/opening-players') &&
            !pathname.startsWith('/matches/score/')),
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
  }, [pathname, language, t]);

  return (
    <nav
      aria-label="Cricket Navigation"
      className="md:hidden fixed bottom-[max(0.6rem,env(safe-area-inset-bottom,0px))] left-0 right-0 z-40 pointer-events-none flex justify-center px-2.5 sm:px-4"
    >
      <div className="pointer-events-auto w-full max-w-[430px] sm:max-w-[460px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-[28px] sm:rounded-[32px] border border-slate-200/80 dark:border-slate-800 shadow-[0_8px_24px_-4px_rgba(15,23,42,0.06),0_2px_6px_rgba(15,23,42,0.03)] dark:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.5)] p-1.5 sm:p-2 transition-all duration-200">
        <div className="grid grid-cols-5 items-center gap-0.5 sm:gap-1" role="menubar">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.isActive;

            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                aria-current={isActive ? 'page' : undefined}
                aria-label={item.label}
                className={`group relative flex flex-col items-center justify-center min-h-[58px] sm:min-h-[62px] py-1 sm:py-1.5 px-0.5 rounded-[20px] sm:rounded-[22px] transition-all duration-200 ease-out active:scale-[0.96] select-none motion-reduce:transition-none motion-reduce:transform-none ${
                  isActive
                    ? 'bg-[#ebfbf2] dark:bg-emerald-950/35 border border-emerald-500/20 dark:border-emerald-500/30 shadow-[0_1px_3px_rgba(16,185,129,0.08)]'
                    : 'bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800/40 border border-transparent'
                }`}
              >
                {/* Standardized Optical Centering Wrapper */}
                <div
                  className={`w-9 h-9 sm:w-9.5 sm:h-9.5 flex items-center justify-center shrink-0 transition-colors duration-200 ${
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
                        ? 'w-7 h-7 sm:w-7.5 sm:h-7.5 scale-105'
                        : 'w-6.5 h-6.5 sm:w-7 sm:h-7 group-hover:scale-105'
                    }`}
                  />
                </div>

                {/* Typography with Balanced Baseline */}
                <span
                  className={`text-[10.5px] xs:text-[11px] sm:text-[11.5px] leading-tight text-center tracking-tight whitespace-nowrap max-w-full px-0.5 mt-0.5 transition-colors duration-200 ${
                    isActive
                      ? 'font-bold text-[#059669] dark:text-emerald-400'
                      : 'font-medium text-[#475569] dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200'
                  }`}
                >
                  {item.label}
                </span>

                {/* Refined Emerald Active Indicator */}
                <div
                  className={`h-[3px] rounded-full mt-1 transition-all duration-200 ease-out ${
                    isActive
                      ? 'w-5 sm:w-6 bg-[#10b981] shadow-xs opacity-100 scale-100'
                      : 'w-5 sm:w-6 bg-transparent opacity-0 scale-75'
                  }`}
                  aria-hidden="true"
                />
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
