'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Trophy,
  Users,
  History,
  Activity,
  User,
  PlusCircle,
  Home,
  Wifi,
  WifiOff,
  Sun,
  Moon,
  BarChart2,
  Languages,
} from 'lucide-react';
import { useScoringView } from '@/context/ScoringViewContext';
import { useLanguage } from '@/context/LanguageContext';
import { SyncIndicator } from '@/components/common/SyncIndicator';
import { PageTransition } from '@/components/layout/PageTransition';
import { useEngineNavigationLabel } from '@/domain/cricket/match-engine/engine-metadata';

export function Navigation({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const engineNavLabel = useEngineNavigationLabel();
  const { activeView, toggleView } = useScoringView();
  const { language, toggleLanguage, t } = useLanguage();
  const [isOnline, setIsOnline] = useState(true);
  const [isDark, setIsDark] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark' | 'sunlight'>('light');

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Theme check
    const saved = localStorage.getItem('theme');
    if (saved === 'sunlight') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('sunlight');
      setCurrentTheme('sunlight');
      setIsDark(false);
    } else if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.remove('sunlight');
      document.documentElement.classList.add('dark');
      setCurrentTheme('dark');
      setIsDark(true);
    } else {
      document.documentElement.classList.remove('dark', 'sunlight');
      setCurrentTheme('light');
      setIsDark(false);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
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

  const navLinks = [
    { href: '/', label: t('home'), icon: Home },
    { href: '/matches/new', label: t('new_match'), icon: PlusCircle },
    { href: '/matches/history', label: t('matches'), icon: History },
    { href: '/tournaments', label: t('tournaments'), icon: Trophy },
    { href: '/teams', label: t('teams'), icon: Users },
    { href: '/analytics', label: t('analytics'), icon: BarChart2 },
    { href: '/profile', label: t('profile'), icon: User },
  ];

  const isScoringScreen = pathname.startsWith('/matches/score/');

  return (
    <div className="flex flex-col md:flex-row flex-nowrap w-full min-h-screen min-h-[100dvh] md:h-screen md:overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      {/* Desktop Sidebar Navigation */}
      <aside className="hidden md:flex flex-col border-r border-[var(--border)] bg-[var(--card)] shrink-0 w-56 lg:w-64 xl:w-72 h-full overflow-y-auto p-3.5 lg:p-4 short:py-2.5 shadow-xs">
        {/* Brand */}
        <Link href="/" className="flex items-center hover:opacity-90 transition-opacity gap-2.5 px-2.5 py-2 mb-4 short:mb-2 rounded-xl hover:bg-[var(--muted)]/50">
          <div className="bg-slate-900 border border-emerald-500/30 flex items-center justify-center shadow-md shadow-emerald-500/20 overflow-hidden rounded-xl w-9 h-9 p-1 shrink-0">
            <img src="/assets/icon/cricket.png" alt="Cric Scorer Pro" className="object-contain w-full h-full" width={36} height={36} decoding="async" />
          </div>
          <div className="min-w-0">
            <h1 className="font-extrabold tracking-tight bg-gradient-to-r from-emerald-600 to-green-500 bg-clip-text text-card-title truncate">
              Cricket Scorer Pro
            </h1>
            <p className="font-medium text-caption truncate text-[var(--muted-foreground)]">{engineNavLabel}</p>
          </div>
        </Link>

        {/* Links */}
        <nav className="flex-1 space-y-1">
          {navLinks.map((item) => {
            const Icon = item.icon;
            const isMatchesLink = item.href === '/matches/history';
            const isAnalyticsLink = item.href === '/analytics';

            let isActive = false;
            let handleClick: ((e: React.MouseEvent) => void) | undefined = undefined;

            if (isScoringScreen && (isMatchesLink || isAnalyticsLink)) {
              if (isMatchesLink) {
                isActive = activeView === 'matches';
                handleClick = (e) => {
                  e.preventDefault();
                  toggleView('matches');
                };
              } else if (isAnalyticsLink) {
                isActive = activeView === 'advancedAnalytics';
                handleClick = (e) => {
                  e.preventDefault();
                  toggleView('advancedAnalytics');
                };
              }
            } else {
              isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleClick}
                className={`flex items-center gap-3 px-3 py-2.5 lg:py-2.5 rounded-xl font-medium text-body-small transition-all duration-150 ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30 font-semibold'
                    : 'text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]'
                }`}
              >
                <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* System Status & Theme toggle */}
        <div className="border-t border-[var(--border)] pt-3 short:pt-2 space-y-2 mt-auto">
          <SyncIndicator variant="full" />

          {/* Language Switcher */}
          <button
            onClick={toggleLanguage}
            className="flex items-center justify-between font-medium hover:bg-[var(--muted)] active:scale-[0.99] transition-all px-2.5 rounded-lg text-caption w-full py-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            title="Toggle English / বাংলা"
          >
            <span className="flex items-center gap-1.5">
              <Languages className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{language === 'en' ? 'Language' : 'ভাষা'}</span>
            </span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/10 text-xs">
              {language === 'en' ? 'বাংলা' : 'English'}
            </span>
          </button>

          <button
            onClick={toggleTheme}
            suppressHydrationWarning
            className="flex items-center justify-between font-medium hover:bg-[var(--muted)] active:scale-[0.99] transition-all px-2.5 rounded-lg text-caption w-full py-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            title="Toggle Light, Dark, or Sunlight High-Contrast Mode"
          >
            <span>Appearance</span>
            {currentTheme === 'sunlight' ? (
              <span className="flex items-center text-amber-500 font-bold gap-1" suppressHydrationWarning>
                <Sun className="w-3.5 h-3.5" /> Sunlight
              </span>
            ) : isDark ? (
              <span className="flex items-center text-amber-400 gap-1" suppressHydrationWarning>
                <Sun className="w-3.5 h-3.5" /> Light
              </span>
            ) : (
              <span className="flex items-center text-slate-700 dark:text-slate-300 gap-1" suppressHydrationWarning>
                <Moon className="w-3.5 h-3.5" /> Dark
              </span>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className={`flex-1 flex flex-col min-w-0 ${isScoringScreen ? 'h-full overflow-y-auto overflow-x-hidden pb-0' : 'min-h-0 md:h-full md:overflow-y-auto md:overflow-x-hidden pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-0'}`}>
        {/* Top Header Navigation (Cricket Scorer Pro → SCOREBOARD → • → Theme) */}
        <header className={`${isScoringScreen ? 'flex' : 'flex md:hidden'} items-center justify-between border-b border-[var(--border)] bg-[var(--card)]/95 backdrop-blur-md sticky top-0 z-30 shadow-xs px-3 sm:px-4 py-2 min-h-btn shrink-0`}>
          <Link href="/" className="flex items-center shrink gap-2 min-w-0" title="Home">
            <div className="bg-slate-900 border border-emerald-500/30 flex items-center justify-center overflow-hidden shrink-0 shadow-xs rounded-md p-0.5 w-6 h-6">
              <img src="/assets/icon/cricket.png" alt="Cricket Scorer Pro" className="object-contain w-full h-full" width={24} height={24} decoding="async" />
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
                className={`text-caption font-bold px-2.5 sm:px-3 py-1 rounded-lg transition-all active:scale-95 min-h-[32px] flex items-center justify-center cursor-pointer ${
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
              onClick={toggleLanguage}
              className="bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors px-2 py-1 rounded-lg text-[var(--muted-foreground)] min-h-[32px] flex items-center gap-1 text-xs font-bold cursor-pointer"
              aria-label="Toggle language"
              title="Toggle English / বাংলা"
            >
              <Languages className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{language === 'en' ? 'বাং' : 'EN'}</span>
            </button>
            <button
              onClick={toggleTheme}
              suppressHydrationWarning
              className="bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors p-1.5 rounded-lg text-[var(--muted-foreground)] min-w-[32px] min-h-[32px] flex items-center justify-center cursor-pointer"
              aria-label="Toggle theme"
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />}
            </button>
            <Link
              href="/profile"
              className="bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors p-1.5 rounded-lg text-[var(--muted-foreground)] min-w-[32px] min-h-[32px] flex items-center justify-center cursor-pointer"
              aria-label="Profile and Sync"
              title="Profile & Sync"
            >
              <User className="w-3.5 h-3.5" />
            </Link>
          </div>
        </header>

        {/* Content Container */}
        <div className={`flex-1 ${isScoringScreen ? 'p-1.5 sm:p-2.5 md:p-3 lg:p-4 xl:p-5' : 'p-2 sm:p-3 md:p-4 lg:p-6 short:py-3 pb-safe'} ${isScoringScreen ? 'max-w-[1700px]' : 'max-w-7xl'} mx-auto w-full min-w-0 flex flex-col`}>
          <PageTransition>{children}</PageTransition>
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar (Hidden on active live scoring screen to preserve vertical space and prevent accidental navigation) */}
      {!isScoringScreen && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-[var(--border)] bg-[var(--card)]/95 backdrop-blur-md z-40 shadow-lg pb-[max(0.4rem,env(safe-area-inset-bottom,0px))] px-screen-x pt-1">
          <div className="flex items-center justify-around">
            {navLinks.slice(0, 5).map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex-1 flex flex-col items-center justify-center min-h-[50px] py-1.5 px-0.5 rounded-lg text-[11px] font-semibold transition-all active:scale-95 ${
                    isActive ? 'text-emerald-600 dark:text-emerald-400 font-extrabold' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'stroke-[2.5] text-emerald-600 dark:text-emerald-400' : ''}`} />
                  <span className="truncate max-w-[60px] leading-tight text-center">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
