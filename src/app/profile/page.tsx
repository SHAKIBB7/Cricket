'use client';

import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/infrastructure/auth/supabase';
import { FeatureHubRepository } from '@/infrastructure/storage/FeatureHubRepository';
import { MatchRepository } from '@/infrastructure/storage/MatchRepository';
import { SyncEngine } from '@/infrastructure/sync/SyncEngine';
import { db, UserProfileRecord } from '@/infrastructure/database/dexie-db';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfileRecord | null>(null);
  const [stats, setStats] = useState({
    matchesCount: 0,
    teamsCount: 0,
    tournamentsCount: 0,
    pendingSyncCount: 0,
  });
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOnline(navigator.onLine);

    // Listen to Supabase auth state change
    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const updated: UserProfileRecord = {
          id: 'current',
          uid: session.user.id,
          name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Cricket Fan',
          email: session.user.email || '',
          photoUrl: session.user.user_metadata?.avatar_url || '',
          isLoggedIn: true,
          lastSyncedAt: new Date().toISOString(),
        };
        await FeatureHubRepository.saveProfile(updated);
        setProfile(updated);
      } else {
        const guest: UserProfileRecord = {
          id: 'current',
          name: 'Guest Scorer',
          email: 'offline@cricscorerpro.local',
          isLoggedIn: false,
        };
        setProfile(guest);
      }
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      authListener?.subscription?.unsubscribe();
      SyncEngine.stop();
    };
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      await SyncEngine.pruneCompletedQueue();
      const stored = await FeatureHubRepository.loadProfile();
      if (stored) {
        setProfile(stored);
      } else {
        const guest: UserProfileRecord = {
          id: 'current',
          name: 'Guest Scorer',
          email: 'offline@cricscorerpro.local',
          isLoggedIn: false,
        };
        setProfile(guest);
      }

      const matchesCount = await db.matches.count();
      const teamsCount = await db.teams.count();
      const tournamentsCount = await db.tournaments.count();
      const pendingSyncCount = await db.sync_queue.where('status').equals('PENDING').count();

      setStats({
        matchesCount,
        teamsCount,
        tournamentsCount,
        pendingSyncCount,
      });
    } catch (e) {
      console.error('Failed to load profile data', e);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/profile` : undefined,
        },
      });
      if (error) {
        setSyncMessage(`Login error: ${error.message}`);
      }
    } catch (err: any) {
      setSyncMessage(`Auth exception: ${err.message || err}`);
    }
  }

  async function handleSignOut() {
    try {
      SyncEngine.stop();
      await supabase.auth.signOut();
      await FeatureHubRepository.clearProfile();
      setProfile({
        id: 'current',
        name: 'Guest Scorer',
        email: 'offline@cricscorerpro.local',
        isLoggedIn: false,
      });
      setSyncMessage('Successfully signed out.');
    } catch (err: any) {
      setSyncMessage(`Sign out error: ${err.message}`);
    }
  }

  async function handleTriggerSync() {
    if (!isOnline) {
      setSyncMessage('Cannot sync while offline. Check network connection.');
      return;
    }
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      await SyncEngine.syncNow();
      await loadData();
      setSyncMessage('Sync completed successfully.');
    } catch (err: any) {
      setSyncMessage(`Sync failed: ${err.message || 'Unknown network error'}`);
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleExportBackup() {
    try {
      const allMatches = await db.matches.toArray();
      const allEvents = await db.match_events.toArray();
      const allTeams = await db.teams.toArray();
      const allTournaments = await db.tournaments.toArray();

      const backupData = {
        app: 'Cric Scorer Pro',
        version: '2.5.0',
        exportedAt: new Date().toISOString(),
        matches: allMatches,
        matchEvents: allEvents,
        teams: allTeams,
        tournaments: allTournaments,
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cric-scorer-pro-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSyncMessage('Backup exported successfully.');
    } catch (err: any) {
      setSyncMessage(`Backup export failed: ${err.message}`);
    }
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const data = JSON.parse(text);

        if (!data.matches && !data.teams && !data.tournaments) {
          throw new Error('Invalid Cric Scorer Pro backup file format');
        }

        if (Array.isArray(data.matches)) {
          await db.matches.bulkPut(data.matches);
        }
        if (Array.isArray(data.matchEvents)) {
          await db.match_events.bulkPut(data.matchEvents);
        }
        if (Array.isArray(data.teams)) {
          await db.teams.bulkPut(data.teams);
        }
        if (Array.isArray(data.tournaments)) {
          await db.tournaments.bulkPut(data.tournaments);
        }

        await loadData();
        setSyncMessage(`Restored ${data.matches?.length || 0} matches and ${data.teams?.length || 0} teams.`);
      } catch (err: any) {
        setSyncMessage(`Import error: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function handleClearDatabase() {
    if (!confirm('CAUTION: This will delete all local matches, teams, and tournament records. Are you sure?')) {
      return;
    }
    try {
      await db.matches.clear();
      await db.match_events.clear();
      await db.teams.clear();
      await db.tournaments.clear();
      await db.sync_queue.clear();
      await loadData();
      setSyncMessage('Local database cleared successfully.');
    } catch (err: any) {
      setSyncMessage(`Clear error: ${err.message}`);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-3 sm:pb-4 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button
              type="button"
              onClick={() => router.back()}
              className="text-[var(--muted-foreground)] hover:text-emerald-500 text-xs sm:text-sm flex items-center gap-1.5 transition-colors p-1 -ml-1 active:scale-95"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2 sm:gap-3">
            <span>Account &amp; Sync</span>
            <span className="text-xs sm:text-xs px-2 sm:px-2.5 py-0.5 rounded-full font-semibold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
              PRO ACTIVE
            </span>
          </h1>
          <p className="text-[var(--muted-foreground)] text-xs sm:text-sm mt-0.5 sm:mt-1">
            Cloud synchronization, offline persistence, and data backup controls
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
              isOnline
                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                : 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            {isOnline ? 'Network Online' : 'Offline Mode'}
          </span>
        </div>
      </div>

      {/* Sync message alert */}
      {syncMessage && (
        <div className="p-3.5 sm:p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] text-xs sm:text-sm flex items-start justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="text-emerald-500 font-bold">ℹ</span>
            <span className="text-[var(--foreground)]">{syncMessage}</span>
          </div>
          <button
            onClick={() => setSyncMessage(null)}
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Profile Card */}
      <div className="p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="w-13 h-13 sm:w-16 sm:h-16 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white text-xl sm:text-2xl font-bold shadow-lg overflow-hidden border-2 border-emerald-400/30 shrink-0">
              {profile?.photoUrl ? (
                <img src={profile.photoUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                (profile?.name?.[0] || 'C').toUpperCase()
              )}
            </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-[var(--foreground)] truncate">{profile?.name || 'Guest Scorer'}</h2>
              {profile?.isLoggedIn && (
                <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-semibold border border-blue-500/30 shrink-0">
                  Google Connected
                </span>
              )}
            </div>
            <p className="text-sm text-[var(--muted-foreground)] truncate">{profile?.email || 'offline-storage@cricscorerpro.local'}</p>
            <p className="text-xs text-[var(--muted-foreground)]/80 mt-1 truncate">
              Last synced:{' '}
              {profile?.lastSyncedAt
                ? new Date(profile.lastSyncedAt).toLocaleString()
                : 'Never (Local only)'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {profile?.isLoggedIn ? (
            <button
              onClick={handleSignOut}
              className="w-full md:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold border border-slate-700 transition-colors min-h-[42px]"
            >
              Sign Out
            </button>
          ) : (
            <button
              onClick={handleGoogleSignIn}
              className="w-full md:w-auto px-5 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-900 text-sm font-bold flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95 min-h-[42px]"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              Sign In with Google
            </button>
          )}
        </div>
      </div>

      {/* Local Storage & Sync Statistics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="p-3 sm:p-4 rounded-xl bg-[var(--card)] border border-[var(--border)]">
          <p className="text-xs sm:text-xs uppercase font-semibold text-[var(--muted-foreground)]">Local Matches</p>
          <p className="text-xl sm:text-2xl font-black text-emerald-500 mt-0.5 sm:mt-1 num-font">{stats.matchesCount}</p>
        </div>
        <div className="p-3 sm:p-4 rounded-xl bg-[var(--card)] border border-[var(--border)]">
          <p className="text-xs sm:text-xs uppercase font-semibold text-[var(--muted-foreground)]">Saved Squads</p>
          <p className="text-xl sm:text-2xl font-black text-blue-500 mt-0.5 sm:mt-1 num-font">{stats.teamsCount}</p>
        </div>
        <div className="p-3 sm:p-4 rounded-xl bg-[var(--card)] border border-[var(--border)]">
          <p className="text-xs sm:text-xs uppercase font-semibold text-[var(--muted-foreground)]">Tournaments</p>
          <p className="text-xl sm:text-2xl font-black text-purple-500 mt-0.5 sm:mt-1 num-font">{stats.tournamentsCount}</p>
        </div>
        <div className="p-3 sm:p-4 rounded-xl bg-[var(--card)] border border-[var(--border)]">
          <p className="text-xs sm:text-xs uppercase font-semibold text-[var(--muted-foreground)]">Pending Sync</p>
          <p className="text-xl sm:text-2xl font-black text-amber-500 mt-0.5 sm:mt-1 num-font">{stats.pendingSyncCount}</p>
        </div>
      </div>

      {/* Synchronization Controls */}
      <div className="p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] space-y-3.5 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[var(--foreground)]">Cloud Synchronization</h3>
            <p className="text-xs text-[var(--muted-foreground)]">
              Bidirectional synchronization between IndexedDB and Supabase PostgreSQL with conflict resolution
            </p>
          </div>
          <button
            onClick={handleTriggerSync}
            disabled={isSyncing || !isOnline}
            className={`w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all min-h-[42px] ${
              isSyncing
                ? 'bg-[var(--muted)] text-[var(--muted-foreground)] cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md active:scale-95'
            }`}
          >
            {isSyncing ? (
              <>
                <span className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <span>↻</span>
                Sync Now
              </>
            )}
          </button>
        </div>

        <div className="p-3 sm:p-4 rounded-xl bg-[var(--muted)]/50 border border-[var(--border)] text-xs text-[var(--muted-foreground)] space-y-2">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-0.5">
            <span>Automatic Background Sync:</span>
            <span className="text-emerald-500 font-semibold">Enabled (Every 5 min + Reconnect)</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-0.5">
            <span>Conflict Resolution:</span>
            <span className="text-[var(--foreground)] font-semibold">Latest Timestamp Wins</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-0.5">
            <span>Offline Scoring Safeguard:</span>
            <span className="text-[var(--foreground)] font-semibold">Dexie IndexedDB (Zero network dependency)</span>
          </div>
        </div>
      </div>

      {/* Data Backup & Restore */}
      <div className="p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] space-y-3.5 sm:space-y-4">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-[var(--foreground)]">Data Backup &amp; Portability</h3>
          <p className="text-xs text-[var(--muted-foreground)]">
            Export and import your entire scoring history, teams, and tournament brackets in JSON format
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 pt-1">
          <button
            onClick={handleExportBackup}
            className="p-3.5 sm:p-4 rounded-xl bg-[var(--muted)] hover:bg-[var(--border)] border border-[var(--border)] text-left transition-colors flex items-center justify-between group min-h-[52px]"
          >
            <div>
              <p className="text-xs sm:text-sm font-bold text-[var(--foreground)] group-hover:text-emerald-500 transition-colors">
                Export JSON Backup
              </p>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">Download matches, squads &amp; tournaments</p>
            </div>
            <span className="text-base sm:text-lg text-[var(--muted-foreground)] group-hover:text-emerald-500">↓</span>
          </button>

          <button
            onClick={handleImportClick}
            className="p-3.5 sm:p-4 rounded-xl bg-[var(--muted)] hover:bg-[var(--border)] border border-[var(--border)] text-left transition-colors flex items-center justify-between group min-h-[52px]"
          >
            <div>
              <p className="text-xs sm:text-sm font-bold text-[var(--foreground)] group-hover:text-blue-500 transition-colors">
                Import JSON Backup
              </p>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">Restore data from an exported file</p>
            </div>
            <span className="text-base sm:text-lg text-[var(--muted-foreground)] group-hover:text-blue-500">↑</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelected}
            accept=".json"
            className="hidden"
          />
        </div>
      </div>

      {/* Danger Zone */}
      <div className="p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-red-500/10 border border-red-500/30 space-y-2.5 sm:space-y-3">
        <h3 className="text-xs sm:text-sm font-bold text-red-500 uppercase tracking-wider">Danger Zone</h3>
        <p className="text-xs text-[var(--muted-foreground)]">
          Permanently clear all locally saved matches, teams, and events stored in IndexedDB.
        </p>
        <button
          onClick={handleClearDatabase}
          className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors min-h-[38px]"
        >
          Clear Local Database
        </button>
      </div>

      {/* System & Architecture Info */}
      <div className="p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-[var(--card)]/50 border border-[var(--border)] text-center space-y-1.5 sm:space-y-2 text-xs text-[var(--muted-foreground)]">
        <p className="font-semibold text-[var(--foreground)]">Cric Scorer Pro • Version 2.5.0</p>
        <p>
          Official ICC Rules Engine • MCC Law 18.11 • Event-Sourced Architecture • Free Hit &amp; DLS Ready
        </p>
        <p>Built with Next.js 14, React 18, Dexie IndexedDB, Tailwind CSS &amp; Supabase</p>
      </div>
    </div>
  );
}
