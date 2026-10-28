'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useReducedMotion } from 'framer-motion';
import { HapticFeedbackService } from '@/infrastructure/haptics/HapticFeedbackService';
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
  const shouldReduceMotion = useReducedMotion();

  let router: { push: (url: string) => void };
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    router = useRouter();
  } catch {
    router = {
      push: (url: string) => {
        if (typeof window !== 'undefined') window.location.href = url;
      },
    };
  }

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

  const activeIndex = navItems.findIndex((item) => item.isActive);

  // Optimistic tracking for instantaneous visual feedback upon tap and swipe
  const [optimisticIndex, setOptimisticIndex] = useState<number | null>(null);

  useEffect(() => {
    setOptimisticIndex(null);
  }, [pathname]);

  const effectiveIndex = optimisticIndex !== null ? optimisticIndex : activeIndex;

  // Swipe gesture detection on navbar itself
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || e.changedTouches.length !== 1) return;
    const start = touchStartRef.current;
    touchStartRef.current = null;

    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const deltaX = endX - start.x;
    const deltaY = endY - start.y;
    const elapsed = Math.max(1, Date.now() - start.time);

    // Swipe threshold on navbar: >= 35px horizontal, predominantly horizontal, < 400ms
    if (Math.abs(deltaX) >= 35 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5 && elapsed < 400) {
      if (deltaX < 0 && activeIndex < navItems.length - 1 && activeIndex !== -1) {
        // Swiped left -> next tab
        const nextIndex = activeIndex + 1;
        setOptimisticIndex(nextIndex);
        HapticFeedbackService.light();
        router.push(navItems[nextIndex].href);
      } else if (deltaX > 0 && activeIndex > 0) {
        // Swiped right -> prev tab
        const prevIndex = activeIndex - 1;
        setOptimisticIndex(prevIndex);
        HapticFeedbackService.light();
        router.push(navItems[prevIndex].href);
      }
    }
  };

  return (
    <nav
      aria-label="Cricket Navigation"
      className="md:hidden fixed bottom-[max(0.35rem,calc(env(safe-area-inset-bottom,0px)*0.65+0.125rem))] left-0 right-0 z-40 pointer-events-none flex justify-center px-2.5 sm:px-4"
    >
      <div className="liquid-glass-nav pointer-events-auto relative w-full max-w-[430px] sm:max-w-[460px] bg-white/75 dark:bg-slate-900/75 backdrop-blur-xl sm:backdrop-blur-2xl rounded-[28px] sm:rounded-[32px] border border-white/60 dark:border-white/10 shadow-[0_8px_24px_-4px_rgba(15,23,42,0.06),0_2px_6px_rgba(15,23,42,0.03)] dark:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.5)] p-1.5 sm:p-2 transition-all duration-200 overflow-hidden">
        {/* Liquid glass top specular reflection sheen for ~50% clearer optical definition */}
        <div
          className="absolute top-0 inset-x-3 h-[42%] rounded-t-[26px] sm:rounded-t-[30px] bg-gradient-to-b from-white/60 via-white/15 to-transparent dark:from-white/14 dark:via-white/3 dark:to-transparent pointer-events-none"
          aria-hidden="true"
        />

        <div className="relative">
          {/* Fluid Sliding Liquid Glass Active Highlight Track with Continuous Physics */}
          {effectiveIndex !== -1 && (
            <div
              className="absolute top-0 bottom-0 w-1/5 p-0.5 pointer-events-none transition-transform duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none will-change-transform z-0"
              style={{
                transform: `translateX(${effectiveIndex * 100}%)`,
              }}
              aria-hidden="true"
            >
              <div className="w-full h-full rounded-[20px] sm:rounded-[22px] bg-[#ebfbf2]/85 dark:bg-emerald-950/60 border border-emerald-500/25 dark:border-emerald-500/40 shadow-[0_2px_12px_rgba(16,185,129,0.15),inset_0_1.5px_1px_rgba(255,255,255,0.92)] dark:shadow-[0_2px_14px_rgba(16,185,129,0.25),inset_0_1.5px_1px_rgba(255,255,255,0.18)] relative overflow-hidden flex flex-col justify-end items-center pb-1">
                {/* Water-drop liquid meniscus reflection: authentic surface tension sheen */}
                <div
                  className="absolute top-0 inset-x-1.5 h-[45%] rounded-t-[18px] bg-gradient-to-b from-white/80 via-white/25 to-transparent dark:from-white/20 dark:to-transparent pointer-events-none"
                  aria-hidden="true"
                />
                {/* Organic fluid volumetric refraction glow */}
                <div
                  className="absolute inset-0 bg-radial from-emerald-400/20 via-transparent to-transparent pointer-events-none opacity-85"
                  aria-hidden="true"
                />
                {/* Emerald Active Indicator Bar gliding continuously with the track */}
                <div
                  className="h-[3px] w-5 sm:w-6 rounded-full bg-[#10b981] shadow-xs opacity-100 scale-100 relative z-10"
                  aria-hidden="true"
                />
              </div>
            </div>
          )}

          {/* 5 Cricket Navigation Items */}
          <div
            className="grid grid-cols-5 items-center relative z-10"
            role="menubar"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {navItems.map((item, index) => {
              const Icon = item.icon;
              const isActive = item.isActive;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    if (effectiveIndex !== index) {
                      setOptimisticIndex(index);
                      HapticFeedbackService.light();
                    }
                  }}
                  role="menuitem"
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={item.label}
                  className="group relative flex flex-col items-center justify-center min-h-[58px] sm:min-h-[62px] py-1 sm:py-1.5 px-0.5 rounded-[20px] sm:rounded-[22px] transition-all duration-200 ease-out active:scale-[0.92] select-none motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500/50 bg-transparent hover:bg-white/30 dark:hover:bg-slate-800/30 border border-transparent"
                >
                  {/* Standardized Optical Centering Wrapper with Liquid Glass Disc Detail */}
                  <div
                    className={`w-9 h-9 sm:w-9.5 sm:h-9.5 flex items-center justify-center shrink-0 transition-all duration-200 ${
                      isActive
                        ? ''
                        : 'rounded-full bg-[#f1f5f9]/80 dark:bg-slate-800/70 group-hover:bg-white/80 dark:group-hover:bg-slate-700/70 group-hover:scale-105 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]'
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
                    className={`text-[10px] xs:text-[10.5px] sm:text-[11.5px] leading-tight text-center tracking-tight whitespace-nowrap max-w-full px-0.5 mt-0.5 transition-colors duration-200 ${
                      isActive
                        ? 'font-bold text-[#059669] dark:text-emerald-400'
                        : 'font-medium text-[#475569] dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200'
                    }`}
                  >
                    {item.label}
                  </span>

                  {/* Vertical spacing keeper matching the sliding emerald indicator bar */}
                  <div className="h-[3px] mt-1 pointer-events-none" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}

