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
} from 'lucide-react';
import { useScoringView } from '@/context/ScoringViewContext';

export function Navigation({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { activeView, toggleView } = useScoringView();
  const [isOnline, setIsOnline] = useState(true);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Dark mode check
    if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
      setIsDark(true);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setIsDark(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setIsDark(true);
    }
  };

  const navLinks = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/matches/new', label: 'New Match', icon: PlusCircle },
    { href: '/matches/history', label: 'Matches', icon: History },
    { href: '/tournaments', label: 'Tournaments', icon: Trophy },
    { href: '/teams', label: 'Teams', icon: Users },
    { href: '/analytics', label: 'Analytics', icon: BarChart2 },
    { href: '/profile', label: 'Sync & Profile', icon: User },
  ];

  const isScoringScreen = pathname.startsWith('/matches/score/');

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[var(--background)] text-[var(--foreground)] overflow-x-hidden">
      {/* Desktop Sidebar Navigation */}
      <aside className="hidden md:flex flex-col w-64 border-r border-[var(--border)] bg-[var(--card)] p-4 shrink-0 shadow-sm">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-3 px-3 py-3 mb-6 hover:opacity-90 transition-opacity">
          <div className="w-10 h-10 rounded-xl bg-slate-900 border border-emerald-500/30 flex items-center justify-center p-1 shadow-md shadow-emerald-500/20 overflow-hidden">
            <img src="/assets/icon/cricket.png" alt="Cric Scorer Pro" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-emerald-600 to-green-500 bg-clip-text text-transparent">
              Cric Scorer Pro
            </h1>
            <p className="text-xs text-[var(--muted-foreground)] font-medium">Professional Match Engine</p>
          </div>
        </Link>

        {/* Links */}
        <nav className="flex-1 space-y-1.5">
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
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20 font-semibold'
                    : 'text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* System Status & Theme toggle */}
        <div className="pt-4 border-t border-[var(--border)] space-y-3">
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--muted)] text-xs font-semibold">
            <span className="flex items-center gap-1.5">
              {isOnline ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-emerald-600 dark:text-emerald-400">Online & Synced</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-amber-600 dark:text-amber-400">Offline Scorer Active</span>
                </>
              )}
            </span>
            {isOnline ? <Wifi className="w-4 h-4 text-emerald-500" /> : <WifiOff className="w-4 h-4 text-amber-500" />}
          </div>

          <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-between px-3.5 py-2 rounded-lg text-xs font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)] transition-colors"
          >
            <span>Appearance</span>
            {isDark ? (
              <span className="flex items-center gap-1 text-amber-400">
                <Sun className="w-4 h-4" /> Light
              </span>
            ) : (
              <span className="flex items-center gap-1 text-slate-700">
                <Moon className="w-4 h-4" /> Dark
              </span>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className={`flex-1 flex flex-col min-w-0 overflow-x-hidden ${isScoringScreen ? 'pb-0' : 'pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))]'} md:pb-6`}>
        {/* Mobile Header (Compact & Safe-Area Aware) */}
        <header className="md:hidden flex items-center justify-between px-2.5 sm:px-3 py-1.5 sm:py-2 border-b border-[var(--border)] bg-[var(--card)]/95 backdrop-blur-md sticky top-0 z-30 shadow-xs min-h-[44px]">
          <Link href="/" className="flex items-center gap-1.5 sm:gap-2 min-w-0 shrink">
            <div className="w-6 h-6 rounded-md bg-slate-900 border border-emerald-500/30 flex items-center justify-center p-0.5 overflow-hidden shrink-0 shadow-xs">
              <img src="/assets/icon/cricket.png" alt="Cric Scorer Pro" className="w-full h-full object-contain" />
            </div>
            <span className="font-extrabold text-xs sm:text-sm tracking-tight bg-gradient-to-r from-emerald-600 to-green-500 bg-clip-text text-transparent truncate max-w-[110px] xs:max-w-[160px]">
              Cric Scorer Pro
            </span>
          </Link>

          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {isScoringScreen ? (
              <>
                <button
                  type="button"
                  onClick={() => toggleView('matches')}
                  className={`text-xs sm:text-xs font-bold px-2 py-1 rounded-md transition-all active:scale-95 ${
                    activeView === 'matches'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                  title="Toggle Matches Panel"
                >
                  Matches
                </button>
                <button
                  type="button"
                  onClick={() => toggleView('advancedAnalytics')}
                  className={`p-1.5 rounded-md transition-all active:scale-95 ${
                    activeView === 'advancedAnalytics'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                  aria-label="Toggle Advanced Cricket Analytics"
                  title="Advanced Analytics"
                >
                  <BarChart2 className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <Link
                href="/analytics"
                className={`p-1.5 rounded-md transition-colors ${
                  pathname === '/analytics'
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
                aria-label="Cricket Analytics"
                title="Analytics"
              >
                <BarChart2 className="w-3.5 h-3.5" />
              </Link>
            )}
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`}
              title={isOnline ? 'Online & Synced' : 'Offline Mode'}
            />
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-md bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-700" />}
            </button>
            <Link
              href="/profile"
              className="p-1.5 rounded-md bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              aria-label="Profile and Sync"
            >
              <User className="w-3.5 h-3.5" />
            </Link>
          </div>
        </header>

        <div className={`flex-1 ${isScoringScreen ? 'p-1.5 sm:p-2.5 md:p-6 lg:p-8' : 'p-2 sm:p-3 md:p-6 lg:p-8'} max-w-7xl mx-auto w-full min-w-0`}>
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar (Hidden on active live scoring screen to preserve vertical space and prevent accidental navigation) */}
      {!isScoringScreen && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-[var(--border)] bg-[var(--card)]/95 backdrop-blur-md z-40 px-1 pt-1 pb-[max(0.4rem,env(safe-area-inset-bottom,0px))] shadow-lg">
          <div className="flex items-center justify-around">
            {navLinks.slice(0, 5).map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex-1 flex flex-col items-center justify-center min-h-[44px] py-1 px-0.5 rounded-lg text-xs xs:text-xs font-semibold transition-all active:scale-95 ${
                    isActive ? 'text-emerald-600 dark:text-emerald-400 font-extrabold' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  <Icon className={`w-4 h-4 xs:w-5 xs:h-5 mb-0.5 ${isActive ? 'stroke-[2.5] text-emerald-600 dark:text-emerald-400' : ''}`} />
                  <span className="truncate max-w-[56px] xs:max-w-[64px] text-center leading-tight">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
