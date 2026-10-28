'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  User,
  Sun,
  Moon,
} from 'lucide-react';
import { useScoringView } from '@/context/ScoringViewContext';
import { useLanguage } from '@/context/LanguageContext';
import { SyncIndicator } from '@/components/common/SyncIndicator';
import { PageTransition } from '@/components/layout/PageTransition';
import { useEngineNavigationLabel } from '@/domain/cricket/match-engine/engine-metadata';
import { CricketBottomNavigation, CricketDesktopNavigation } from '@/components/navigation';
import { HapticFeedbackService } from '@/infrastructure/haptics/HapticFeedbackService';

const PRIMARY_TABS = ['/', '/matches/new', '/matches/history', '/tournaments', '/teams'];

export function Navigation({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const engineNavLabel = useEngineNavigationLabel();
  const { activeView, toggleView } = useScoringView();
  const { language, t } = useLanguage();
  const [isDark, setIsDark] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark' | 'sunlight'>('light');

  useEffect(() => {
    // Theme check - synchronizes React state without redundant DOM class mutations if already applied
    const saved = localStorage.getItem('theme');
    const isDarkTarget = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const isSunlightTarget = saved === 'sunlight';

    if (isSunlightTarget) {
      if (!document.documentElement.classList.contains('sunlight')) {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('sunlight');
      }
      setCurrentTheme('sunlight');
      setIsDark(false);
    } else if (isDarkTarget) {
      if (!document.documentElement.classList.contains('dark')) {
        document.documentElement.classList.remove('sunlight');
        document.documentElement.classList.add('dark');
      }
      setCurrentTheme('dark');
      setIsDark(true);
    } else {
      if (document.documentElement.classList.contains('dark') || document.documentElement.classList.contains('sunlight')) {
        document.documentElement.classList.remove('dark', 'sunlight');
      }
      setCurrentTheme('light');
      setIsDark(false);
    }
  }, []);

  const toggleTheme = () => {
    if (currentTheme === 'light') {
      document.documentElement.classList.remove('sunlight');
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setCurrentTheme('dark');
      setIsDark(true);
    } else if (currentTheme === 'dark') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('sunlight');
      localStorage.setItem('theme', 'sunlight');
      setCurrentTheme('sunlight');
      setIsDark(false);
    } else {
      document.documentElement.classList.remove('dark', 'sunlight');
      localStorage.setItem('theme', 'light');
      setCurrentTheme('light');
      setIsDark(false);
    }
  };

  const isScoringScreen = pathname.startsWith('/matches/score/');

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

  // Swipe gesture handling between primary tabs on mobile
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handlePageTouchStart = (e: React.TouchEvent) => {
    if (isScoringScreen || e.touches.length !== 1) return;
    if (!PRIMARY_TABS.includes(pathname)) return;

    const target = e.target as HTMLElement | null;
    if (target) {
      const tagName = target.tagName.toLowerCase();
      if (['input', 'textarea', 'select', 'button', 'canvas'].includes(tagName)) return;
      if (target.closest('[role="dialog"], [role="menu"], input, textarea, select, button, [data-no-swipe]')) return;
      let el: HTMLElement | null = target;
      while (el && el !== e.currentTarget) {
        const overflowX = window.getComputedStyle(el).overflowX;
        if ((overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth) {
          return;
        }
        el = el.parentElement;
      }
    }

    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
  };

  const handlePageTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || isScoringScreen) return;
    const start = touchStartRef.current;
    touchStartRef.current = null;

    if (e.changedTouches.length !== 1) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const deltaX = endX - start.x;
    const deltaY = endY - start.y;
    const elapsed = Math.max(1, Date.now() - start.time);

    // Strict horizontal swipe criteria:
    // 1. Min horizontal distance >= 60px
    // 2. Strict horizontal dominance (|deltaX| >= 2.2 * |deltaY|) to prevent accidental triggers during vertical scroll
    // 3. Quick swipe gesture (elapsed <= 450ms)
    // 4. Sufficient velocity (> 0.2 px/ms)
    if (
      Math.abs(deltaX) >= 60 &&
      Math.abs(deltaX) >= Math.abs(deltaY) * 2.2 &&
      elapsed <= 450 &&
      Math.abs(deltaX) / elapsed >= 0.2
    ) {
      const currentIndex = PRIMARY_TABS.indexOf(pathname);
      if (currentIndex === -1) return;

      if (deltaX < 0 && currentIndex < PRIMARY_TABS.length - 1) {
        // Swiped left -> next tab
        HapticFeedbackService.light();
        router.push(PRIMARY_TABS[currentIndex + 1]);
      } else if (deltaX > 0 && currentIndex > 0) {
        // Swiped right -> prev tab
        HapticFeedbackService.light();
        router.push(PRIMARY_TABS[currentIndex - 1]);
      }
    }
  };

  return (
    <div className="flex flex-col md:flex-row flex-nowrap w-full min-h-screen min-h-[100dvh] md:h-screen md:overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      {/* Desktop Sidebar Navigation */}
      <aside className="hidden md:flex flex-col border-r border-[var(--border)] bg-[var(--card)] shrink-0 w-72 lg:w-80 xl:w-[340px] h-full overflow-y-auto p-3.5 lg:p-4 short:py-2.5 shadow-xs">
        {/* Brand */}
        <Link href="/" className="flex items-center hover:opacity-90 transition-opacity gap-2.5 px-2.5 py-2 mb-3.5 short:mb-2 rounded-xl hover:bg-[var(--muted)]/50">
          <div className="bg-slate-900 border border-emerald-500/30 flex items-center justify-center shadow-md shadow-emerald-500/20 overflow-hidden rounded-xl w-9 h-9 p-1 shrink-0">
            <img src="/assets/icon/cricket.png" alt="" aria-hidden="true" className="object-contain w-full h-full" width={36} height={36} decoding="async" />
          </div>
          <div className="min-w-0">
            <h1 className="font-extrabold tracking-tight bg-gradient-to-r from-emerald-600 to-green-500 bg-clip-text text-card-title truncate">
              Cricket Scorer Pro
            </h1>
            <p className="font-medium text-caption truncate text-[var(--muted-foreground)]">{engineNavLabel}</p>
          </div>
        </Link>

        {/* Desktop Cricket Navigation & Enterprise Tools & Accounts Panel */}
        <nav className="flex-1 flex flex-col min-h-0" aria-label="Desktop Navigation">
          <CricketDesktopNavigation
            pathname={pathname}
            isScoringScreen={isScoringScreen}
            activeView={activeView}
            toggleView={toggleView}
            language={language}
            t={t}
            currentTheme={currentTheme}
            toggleTheme={toggleTheme}
          />
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className={`flex-1 flex flex-col min-w-0 ${isScoringScreen ? 'h-full overflow-y-auto overflow-x-hidden pb-0' : 'min-h-0 md:h-full md:overflow-y-auto md:overflow-x-hidden pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-0'}`}>
        {/* Top Header Navigation (Cricket Scorer Pro → SCOREBOARD → • → Theme) */}
        <header className={`${isScoringScreen ? 'flex' : 'flex md:hidden'} items-center justify-between border-b border-[var(--border)] bg-[var(--card)]/95 backdrop-blur-md sticky top-0 z-30 shadow-xs px-3 sm:px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top,0px))] min-h-btn shrink-0`}>
          <Link href="/" className="flex items-center shrink gap-2 min-w-0" title="Home">
            <div className="bg-slate-900 border border-emerald-500/30 flex items-center justify-center overflow-hidden shrink-0 shadow-xs rounded-md p-0.5 w-6 h-6">
              <img src="/assets/icon/cricket.png" alt="" aria-hidden="true" className="object-contain w-full h-full" width={24} height={24} decoding="async" />
            </div>
            <span className="font-extrabold tracking-tight bg-gradient-to-r from-emerald-600 to-green-500 bg-clip-text text-body-small whitespace-nowrap">
              Cricket Scorer Pro
            </span>
          </Link>

          <div className="flex items-center shrink-0 gap-1.5 sm:gap-2">
            {isScoringScreen && (
              <button
                type="button"
                onClick={() => toggleView('scoreboard')}
                className={`text-caption font-bold px-3 py-1.5 sm:py-2 rounded-xl transition-all active:scale-95 min-h-[40px] sm:min-h-[44px] flex items-center justify-center cursor-pointer ${
                  activeView === 'scoreboard'
                    ? 'bg-emerald-600 text-white shadow-xs font-black'
                    : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--border)]'
                }`}
                title="Toggle Scoreboard"
              >
                {language === 'bn' ? t('scoreboard') : 'SCOREBOARD'}
              </button>
            )}
            <span className="rounded-full">
              <SyncIndicator variant="compact" />
            </span>
            <button
              onClick={toggleTheme}
              suppressHydrationWarning
              className="bg-[var(--muted)] hover:text-[var(--foreground)] transition-all active:scale-95 duration-150 p-2 sm:p-2.5 rounded-xl text-[var(--muted-foreground)] min-w-[40px] sm:min-w-[44px] min-h-[40px] sm:min-h-[44px] flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 relative before:content-[''] before:absolute before:-inset-1 before:min-w-[44px] before:min-h-[44px]"
              aria-label="Toggle theme"
              title={
                currentTheme === 'sunlight'
                  ? 'Switch to Light Mode'
                  : isDark
                  ? 'Switch to Sunlight High-Contrast Mode'
                  : 'Switch to Dark Mode'
              }
            >
              {currentTheme === 'sunlight' ? (
                <Sun className="w-4 h-4 text-amber-500 stroke-[2] transition-transform duration-200" />
              ) : isDark ? (
                <Sun className="w-4 h-4 text-amber-400 stroke-[2] transition-transform duration-200" />
              ) : (
                <Moon className="w-4 h-4 text-slate-700 dark:text-slate-300 stroke-[2] transition-transform duration-200" />
              )}
            </button>
            <Link
              href="/profile"
              className="bg-[var(--muted)] hover:text-[var(--foreground)] transition-all active:scale-95 duration-150 p-2 sm:p-2.5 rounded-xl text-[var(--muted-foreground)] min-w-[40px] sm:min-w-[44px] min-h-[40px] sm:min-h-[44px] flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 relative before:content-[''] before:absolute before:-inset-1 before:min-w-[44px] before:min-h-[44px]"
              aria-label="Profile and Sync"
              title="Profile & Sync"
            >
              <User className="w-4 h-4 stroke-[2] transition-transform duration-150" />
            </Link>
          </div>
        </header>

        {/* Content Container */}
        <div
          onTouchStart={handlePageTouchStart}
          onTouchEnd={handlePageTouchEnd}
          className={`flex-1 ${isScoringScreen ? 'p-1.5 sm:p-2.5 md:p-3 lg:p-4 xl:p-5' : 'p-2 sm:p-3 md:p-4 lg:p-6 short:py-3 pb-safe'} ${isScoringScreen ? 'max-w-[1700px]' : 'max-w-7xl'} mx-auto w-full min-w-0 flex flex-col`}
        >
          <PageTransition>{children}</PageTransition>
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar (Hidden on active live scoring screen to preserve vertical space and prevent accidental navigation) */}
      {!isScoringScreen && (
        <CricketBottomNavigation pathname={pathname} language={language} t={t} />
      )}
    </div>
  );
}
