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
    <div className="flex bg-[var(--background)] overflow-x-hidden flex-wrap min-h-screen text-[var(--foreground)]">
      {/* Desktop Sidebar Navigation */}
      <aside className="hidden md:flex flex-col border-r border-[var(--border)] bg-[var(--card)] shrink-0 shadow-sm w-80 p-5">
        {/* Brand */}
        <Link href="/" className="flex items-center hover:opacity-90 transition-opacity gap-3 px-3 py-3 mb-6">
          <div className="bg-slate-900 border border-emerald-500/30 flex items-center justify-center shadow-md shadow-emerald-500/20 overflow-hidden rounded-xl w-10 h-10 p-1">
            <img src="/assets/icon/cricket.png" alt="Cric Scorer Pro" className="object-contain w-full h-full" />
          </div>
          <div>
            <h1 className="font-extrabold tracking-tight bg-gradient-to-r from-emerald-600 to-green-500 bg-clip-text text-lg">
              Cric Scorer Pro
            </h1>
            <p className="font-medium text-xs">Professional Match Engine</p>
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
                className={`flex items-center gap-4 px-4 py-3 rounded-xl font-medium text-base transition-all duration-200 ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20 font-semibold'
                    : 'text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]'
                }`}
              >
                <Icon className={`w-6 h-6 ${isActive ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* System Status & Theme toggle */}
        <div className="border-t border-[var(--border)] pt-4 space-y-3">
          <div className="flex items-center justify-between bg-[var(--muted)] font-semibold rounded-lg px-3 py-2 text-xs">
            <span className="flex items-center gap-1.5">
              {isOnline ? (
                <>
                  <span className="bg-emerald-500 animate-pulse rounded-full w-2 h-2" />
                  <span className="dark:text-emerald-400 text-emerald-600">Online & Synced</span>
                </>
              ) : (
                <>
                  <span className="bg-amber-500 rounded-full w-2 h-2" />
                  <span className="dark:text-amber-400 text-amber-600">Offline Scorer Active</span>
                </>
              )}
            </span>
            {isOnline ? <Wifi className="text-emerald-500 w-4 h-4" /> : <WifiOff className="text-amber-500 w-4 h-4" />}
          </div>

          <button
            onClick={toggleTheme}
            className="flex items-center justify-between font-medium hover:bg-[var(--muted)] transition-colors px-3.5 rounded-lg text-xs w-full py-2"
          >
            <span>Appearance</span>
            {isDark ? (
              <span className="flex items-center text-amber-400 gap-1">
                <Sun className="w-4 h-4" /> Light
              </span>
            ) : (
              <span className="flex items-center text-slate-700 gap-1">
                <Moon className="w-4 h-4" /> Dark
              </span>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className={`flex-1 flex flex-col min-w-0 overflow-x-hidden ${isScoringScreen ? 'pb-0' : 'pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]'} md:pb-6`}>
        {/* Mobile Header (Compact & Safe-Area Aware) */}
        <header className="md:hidden flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)]/95 backdrop-blur-md sticky top-0 z-30 shadow-xs px-3 py-2 min-h-btn">
          <Link href="/" className="flex items-center shrink gap-2 min-w-0">
            <div className="bg-slate-900 border border-emerald-500/30 flex items-center justify-center overflow-hidden shrink-0 shadow-xs rounded-md p-0.5 w-6 h-6">
              <img src="/assets/icon/cricket.png" alt="Cric Scorer Pro" className="object-contain w-full h-full" />
            </div>
            <span className="font-extrabold tracking-tight bg-gradient-to-r from-emerald-600 to-green-500 bg-clip-text truncate xs:max-w-[160px] text-sm max-w-[110px]">
              Cric Scorer Pro
            </span>
          </Link>

          <div className="flex items-center shrink-0 gap-1">
            {isScoringScreen ? (
              <>
                <button
                  type="button"
                  onClick={() => toggleView('matches')}
                  className={`text-xs sm:text-xs sm:text-sm font-bold px-2 py-1 rounded-md transition-all active:scale-95 ${
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
              className="bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors p-1.5 rounded-md text-[var(--muted-foreground)]"
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-700" />}
            </button>
            <Link
              href="/profile"
              className="bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors p-1.5 rounded-md text-[var(--muted-foreground)]"
              aria-label="Profile and Sync"
            >
              <User className="w-3.5 h-3.5" />
            </Link>
          </div>
        </header>

        <div className={`flex-1 ${isScoringScreen ? 'p-1.5 sm:p-card md:p-6 lg:p-8' : 'p-2 sm:p-3 md:p-6 lg:p-8'} max-w-7xl mx-auto w-full min-w-0`}>
          {children}
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
                  className={`flex-1 flex flex-col items-center justify-center min-h-[56px] py-2 px-0.5 rounded-lg text-[12px] font-semibold transition-all active:scale-95 ${
                    isActive ? 'text-emerald-600 dark:text-emerald-400 font-extrabold' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  <Icon className={`w-5 h-5 xs:w-6 xs:h-6 mb-1 ${isActive ? 'stroke-[2.5] text-emerald-600 dark:text-emerald-400' : ''}`} />
                  <span className="truncate xs:max-w-[64px] leading-tight max-w-[56px] text-center">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
