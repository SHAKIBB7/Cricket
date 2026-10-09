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
 name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || '',
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

 const [matchesCount, teamsCount, tournamentsCount, pendingSyncCount] = await Promise.all([
 db.matches.count(),
 db.teams.count(),
 db.tournaments.count(),
 db.sync_queue.where('status').equals('PENDING').count(),
 ]);

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
 <div className="max-w-5xl xl:max-w-6xl mx-auto space-y-4 sm:space-y-5 w-full">
 {/* Header */}
 <div className="flex sm:items-center justify-between border-b border-[var(--border)] flex-wrap gap-4 pb-4">
 <div>
 <div className="flex items-center gap-2 mb-1">
 <button
 type="button"
 onClick={() => router.back()}
 className="hover:text-emerald-500 flex items-center transition-colors -ml-1 active:scale-95 text-body-small gap-1.5 p-1"
 >
 <ArrowLeft className="w-4 h-4" />
 <span>Back</span>
 </button>
 </div>
 <h1 className="font-extrabold tracking-tight flex items-center text-h1 gap-3">
 <span>Account &amp; Sync</span>
 <span className="font-semibold bg-emerald-500/20 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full text-caption">
 PRO ACTIVE
 </span>
 </h1>
 <p className="text-body-small mt-1">
 Cloud synchronization, offline persistence, and data backup controls
 </p>
 </div>

 <div className="flex items-center gap-3">
 <span
 className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold ${
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
 <div className="bg-[var(--card)] border border-[var(--border)] flex items-start justify-between animate-fadeIn p-4 rounded-xl text-body-small gap-3">
 <div className="flex items-center gap-2">
 <span className="font-bold text-emerald-500">ℹ</span>
 <span className="text-[var(--foreground)]">{syncMessage}</span>
 </div>
 <button
 onClick={() => setSyncMessage(null)}
 className="hover:text-[var(--foreground)] text-caption"
 >
 Dismiss
 </button>
 </div>
)}

 {/* Profile Card */}
 <div className="floating-card flex justify-between flex-wrap items-center p-4 sm:p-5 gap-4">
 <div className="flex items-center min-w-0 gap-4">
 <div className="bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center font-bold shadow-lg overflow-hidden border-2 border-emerald-400/30 shrink-0 rounded-full text-h2 w-16 h-16">
 {profile?.photoUrl ? (
 <img src={profile.photoUrl} alt="Avatar" className="object-cover w-full h-full" />
) : (
 (profile?.name?.[0] || 'C').toUpperCase()
)}
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center flex-wrap gap-2">
 <h2 className="font-bold truncate text-h3">{profile?.name || 'No Name Set'}</h2>
 {profile?.isLoggedIn && (
 <span className="rounded bg-blue-500/20 font-semibold border border-blue-500/30 shrink-0 text-blue-400 py-0.5 px-2">
 Google Connected
 </span>
)}
 </div>
 <p className="truncate text-body-small">{profile?.email || 'No Email Set'}</p>
 <p className="truncate text-caption mt-1">
 Last synced:{' '}
 {profile?.lastSyncedAt
 ? new Date(profile.lastSyncedAt).toLocaleString()
 : 'Never (Local only)'}
 </p>
 </div>
 </div>

 <div className="flex items-center gap-3">
 {profile?.isLoggedIn ? (
 <button
 onClick={handleSignOut}
 className="bg-slate-800 hover:bg-slate-700 font-semibold border border-slate-700 transition-colors py-2.5 rounded-xl text-body-small min-h-[42px] px-4"
 >
 Sign Out
 </button>
) : (
 <button
 onClick={handleGoogleSignIn}
 className="bg-white hover:bg-slate-100 font-bold flex items-center justify-center shadow-lg transition-transform active:scale-95 py-2.5 rounded-xl text-body-small min-h-[42px] px-5 gap-2"
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
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5">
 <div className="floating-card p-3.5 sm:p-4">
 <p className="uppercase font-semibold text-caption">Local Matches</p>
 <p className="font-black num-font text-h2 mt-1">{stats.matchesCount}</p>
 </div>
 <div className="floating-card p-3.5 sm:p-4">
 <p className="uppercase font-semibold text-caption">Saved Squads</p>
 <p className="font-black num-font text-h2 mt-1">{stats.teamsCount}</p>
 </div>
 <div className="floating-card p-3.5 sm:p-4">
 <p className="uppercase font-semibold text-caption">Tournaments</p>
 <p className="font-black num-font text-h2 mt-1">{stats.tournamentsCount}</p>
 </div>
 <div className="floating-card p-3.5 sm:p-4">
 <p className="uppercase font-semibold text-caption">Pending Sync</p>
 <p className="font-black num-font text-h2 mt-1">{stats.pendingSyncCount}</p>
 </div>
 </div>

 {/* Synchronization Controls */}
 <div className="floating-card space-y-3.5 p-4 sm:p-5">
 <div className="flex sm:items-center justify-between flex-wrap gap-3">
 <div>
 <h3 className="font-bold text-card-title">Cloud Synchronization</h3>
 <p className="text-caption">
 Bidirectional synchronization between IndexedDB and Supabase PostgreSQL with conflict resolution
 </p>
 </div>
 <button
 onClick={handleTriggerSync}
 disabled={isSyncing || !isOnline}
 className={`w-full sm:w-auto px-4 py-2.5 rounded-xl text-caption font-bold flex items-center justify-center gap-2 transition-all min-h-[42px] ${
 isSyncing
 ? 'bg-[var(--muted)] text-[var(--muted-foreground)] cursor-not-allowed'
 : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md active:scale-95'
 }`}
 >
 {isSyncing ? (
 <>
 <span className="border-2 border-slate-400 border-t-transparent animate-spin rounded-full w-4 h-4" />
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

 <div className="bg-[var(--muted)]/50 border border-[var(--border)] rounded-xl text-caption p-4 space-y-2">
 <div className="flex sm:justify-between sm:items-center flex-wrap gap-0.5">
 <span>Automatic Background Sync:</span>
 <span className="font-semibold text-emerald-500">Enabled (Every 5 min + Reconnect)</span>
 </div>
 <div className="flex sm:justify-between sm:items-center flex-wrap gap-0.5">
 <span>Conflict Resolution:</span>
 <span className="font-semibold text-[var(--foreground)]">Latest Timestamp Wins</span>
 </div>
 <div className="flex sm:justify-between sm:items-center flex-wrap gap-0.5">
 <span>Offline Scoring Safeguard:</span>
 <span className="font-semibold text-[var(--foreground)]">Dexie IndexedDB (Zero network dependency)</span>
 </div>
 </div>
 </div>

 {/* Data Backup & Restore */}
 <div className="floating-card space-y-3.5 p-4 sm:p-5">
 <div>
 <h3 className="font-bold text-card-title">Data Backup &amp; Portability</h3>
 <p className="text-caption">
 Export and import your entire scoring history, teams, and tournament brackets in JSON format
 </p>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
 <button
 onClick={handleExportBackup}
 className="bg-[var(--muted)] hover:bg-[var(--border)] border border-[var(--border)] transition-colors flex items-center justify-between group p-4 rounded-xl text-left min-h-[52px]"
 >
 <div>
 <p className="font-bold group-hover:text-emerald-500 transition-colors text-body-small">
 Export JSON Backup
 </p>
 <p className="text-[var(--muted-foreground)] mt-0.5">Download matches, squads &amp; tournaments</p>
 </div>
 <span className="group-hover:text-emerald-500 text-card-title">↓</span>
 </button>

 <button
 onClick={handleImportClick}
 className="bg-[var(--muted)] hover:bg-[var(--border)] border border-[var(--border)] transition-colors flex items-center justify-between group p-4 rounded-xl text-left min-h-[52px]"
 >
 <div>
 <p className="font-bold group-hover:text-blue-500 transition-colors text-body-small">
 Import JSON Backup
 </p>
 <p className="text-[var(--muted-foreground)] mt-0.5">Restore data from an exported file</p>
 </div>
 <span className="group-hover:text-blue-500 text-card-title">↑</span>
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
 <div className="bg-red-500/10 border border-red-500/30 rounded-2xl space-y-3 p-6">
 <h3 className="font-bold uppercase tracking-wider text-body-small">Danger Zone</h3>
 <p className="text-caption">
 Permanently clear all locally saved matches, teams, and events stored in IndexedDB.
 </p>
 <button
 onClick={handleClearDatabase}
 className="bg-red-600 hover:bg-red-500 font-bold transition-colors rounded-xl text-caption min-h-[38px] px-4 py-2"
 >
 Clear Local Database
 </button>
 </div>

 {/* System & Architecture Info */}
 <div className="bg-[var(--card)]/50 border border-[var(--border)] rounded-2xl text-caption space-y-2 p-6">
 <p className="font-semibold text-[var(--foreground)]">Cric Scorer Pro • Version 2.5.0</p>
 <p>
 Official ICC Rules Engine • MCC Law 18.11 • Event-Sourced Architecture • Free Hit &amp; DLS Ready
 </p>
 <p>Built with Next.js 14, React 18, Dexie IndexedDB, Tailwind CSS &amp; Supabase</p>
 </div>
 </div>
);
}
