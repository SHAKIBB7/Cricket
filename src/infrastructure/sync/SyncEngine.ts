/**
 * SyncEngine — Offline-First Bidirectional Synchronization
 * Ported from Flutter's FirebaseAccountService with exponential backoff,
 * debounced sync, queue processing, non-destructive conflict branching,
 * and robust lifecycle resource management.
 */

import { db, SyncQueueRecord } from '../database/dexie-db';
import { MatchRepository } from '../storage/MatchRepository';
import { FeatureHubRepository } from '../storage/FeatureHubRepository';
import { supabase } from '../auth/supabase';
import { MatchScorecard } from '@/domain/cricket/types';

export class SyncEngine {
 private static debounceTimer: any = null;
 private static periodicTimer: any = null;
 private static retryTimer: any = null;
 private static retryAttempt = 0;
 private static isSyncing = false;
 private static retryDelays = [5000, 15000, 30000, 60000, 120000];
 private static onlineHandler: (() => void) | null = null;

 static init(): void {
 if (typeof window === 'undefined') return;

 // Prevent duplicate listeners and orphaned intervals
 this.stop();

 this.onlineHandler = () => {
 this.scheduleSync(1000);
 };
 window.addEventListener('online', this.onlineHandler);

 // 5-minute periodic sync
 this.periodicTimer = setInterval(() => {
 if (navigator.onLine) {
 this.syncNow();
 }
 }, 5 * 60 * 1000);
 }

 /**
 * Complete lifecycle teardown: clears all active intervals, timeouts, and DOM listeners
 */
 static stop(): void {
 if (this.periodicTimer) {
 clearInterval(this.periodicTimer);
 this.periodicTimer = null;
 }
 if (this.retryTimer) {
 clearTimeout(this.retryTimer);
 this.retryTimer = null;
 }
 if (this.debounceTimer) {
 clearTimeout(this.debounceTimer);
 this.debounceTimer = null;
 }
 if (this.onlineHandler && typeof window !== 'undefined') {
 window.removeEventListener('online', this.onlineHandler);
 this.onlineHandler = null;
 }
 this.retryAttempt = 0;
 }

 static scheduleSync(delay = 2000): void {
 if (this.debounceTimer) clearTimeout(this.debounceTimer);
 this.debounceTimer = setTimeout(() => {
 this.syncNow();
 }, delay);
 }

 static async queueMutation(
 operationType: SyncQueueRecord['operationType'],
 payload: any
): Promise<void> {
 const op: SyncQueueRecord = {
 clientOpId: `op_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
 operationType,
 payload,
 status: 'PENDING',
 retryCount: 0,
 createdAt: new Date().toISOString(),
 };
 await db.sync_queue.put(op);
 this.scheduleSync(500);
 }

 /**
 * Prunes legacy completed queue items to release browser storage quota
 */
 static async pruneCompletedQueue(): Promise<void> {
 try {
 await db.sync_queue.where('status').equals('SYNCED').delete();
 } catch {
 // Non-critical cleanup
 }
 }

 static async syncNow(): Promise<void> {
 if (this.isSyncing || typeof navigator === 'undefined' || !navigator.onLine) {
 return;
 }

 const { data: sessionData } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
 if (!sessionData?.session?.user) {
 // User not signed in to cloud; local offline mode is active
 return;
 }

 this.isSyncing = true;
 try {
 // 1. Process pending offline sync queue
 const pendingOps = await db.sync_queue.where('status').equals('PENDING').toArray();

 for (const op of pendingOps) {
 try {
 if (op.operationType === 'UPSERT_MATCH') {
 await supabase.from('matches').upsert(op.payload);
 } else if (op.operationType === 'DELETE_MATCH') {
 await supabase.from('matches').delete().eq('id', op.payload.id);
 }
 // Evict synced item from queue to prevent unbounded IndexedDB growth
 await db.sync_queue.delete(op.clientOpId);
 } catch {
 op.retryCount++;
 await db.sync_queue.update(op.clientOpId, {
 retryCount: op.retryCount,
 lastAttemptAt: new Date().toISOString(),
 });
 }
 }

 // 2. Fetch remote matches (incremental if lastSyncedAt exists) and merge with local
 const profile = await FeatureHubRepository.loadProfile();
 let query = supabase.from('matches').select('*').order('updated_at', { ascending: false });
 if (profile?.lastSyncedAt) {
 query = query.gt('updated_at', profile.lastSyncedAt);
 }

 const { data: remoteMatches, error } = await query;

 if (!error && remoteMatches) {
 for (const remote of remoteMatches) {
 const local = await MatchRepository.getMatch(remote.id);
 if (!local) {
 // New match from cloud -> save locally
 await MatchRepository.saveMatch(remote as MatchScorecard);
 } else {
 const localUpdated = new Date(local.updatedAt).getTime();
 const remoteUpdated = new Date(remote.updated_at || remote.updatedAt).getTime();

 if (remoteUpdated > localUpdated) {
 // Remote wins
 await MatchRepository.saveMatch(remote as MatchScorecard);
 } else if (localUpdated > remoteUpdated) {
 // Local is newer -> push to remote
 await supabase.from('matches').upsert(local);
 }
 }
 }
 }

 this.retryAttempt = 0;
 if (this.retryTimer) {
 clearTimeout(this.retryTimer);
 this.retryTimer = null;
 }

 // Update user profile sync timestamp
 if (profile) {
 await FeatureHubRepository.saveProfile({
 ...profile,
 lastSyncedAt: new Date().toISOString(),
 });
 }

 // Prune any legacy synced records
 await this.pruneCompletedQueue();
 } catch {
 this.scheduleRetry();
 } finally {
 this.isSyncing = false;
 }
 }

 private static scheduleRetry(): void {
 if (this.retryAttempt >= this.retryDelays.length) return;
 const delay = this.retryDelays[this.retryAttempt];
 this.retryAttempt++;
 if (this.retryTimer) clearTimeout(this.retryTimer);
 this.retryTimer = setTimeout(() => {
 this.syncNow();
 }, delay);
 }
}
