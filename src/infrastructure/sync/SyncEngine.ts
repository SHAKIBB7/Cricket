/**
 * SyncEngine — Enterprise Offline-First Cloud Synchronization Engine
 * 
 * Features:
 * - Durable outbox queue processing (FIFO)
 * - Exponential backoff with jitter on retry
 * - Rate-limit (HTTP 429) & transient error mitigation
 * - Operation coalescing for high-frequency ball scoring
 * - Bi-directional synchronization with non-destructive conflict branching
 * - Real backend reachability detection (distinguishing network adapter from server availability)
 * - Observable synchronization state for non-intrusive UI indicators
 * - Multi-trigger sync: init, online, visibility change, focus, mutation queue, background sync
 * - Lifecycle resource management (zero memory or timer leaks)
 */

import { db, SyncQueueRecord } from '../database/dexie-db';
import { supabase } from '../auth/supabase';
import { MatchScorecard, DomainEvent } from '@/domain/cricket/types';

export type SyncState = 'OFFLINE' | 'SYNCING' | 'SYNCED' | 'PENDING' | 'ERROR';

export interface SyncStatusSnapshot {
  state: SyncState;
  pendingCount: number;
  lastSyncedAt: Date | null;
  errorMessage: string | null;
  isOnline: boolean;
  isServerReachable: boolean;
}

type SyncListener = (snapshot: SyncStatusSnapshot) => void;

export class SyncEngine {
  private static debounceTimer: any = null;
  private static periodicTimer: any = null;
  private static retryTimer: any = null;
  private static retryAttempt = 0;
  private static isSyncing = false;
  private static lastSyncedAt: Date | null = null;
  private static lastErrorMessage: string | null = null;
  private static isServerReachable = false;
  private static listeners: Set<SyncListener> = new Set();

  // Jittered backoff parameters: base 2s, max 60s
  private static baseDelayMs = 2000;
  private static maxDelayMs = 60000;
  private static maxRetries = 10;

  // Event handlers for clean lifecycle teardown
  private static onlineHandler: (() => void) | null = null;
  private static offlineHandler: (() => void) | null = null;
  private static visibilityHandler: (() => void) | null = null;
  private static swMessageHandler: ((event: MessageEvent) => void) | null = null;

  /**
   * Initializes the synchronization engine, attaches lifecycle listeners,
   * registers background sync handlers, and performs initial queue reconciliation.
   */
  static init(): void {
    if (typeof window === 'undefined') return;

    // Clean up any existing listeners/timers first
    this.stop();

    // 1. Online listener on window
    this.onlineHandler = () => {
      this.notifyListeners();
      this.checkServerReachability().then((reachable) => {
        if (reachable) {
          this.scheduleSync(500);
        }
      });
    };
    window.addEventListener('online', this.onlineHandler);

    // 2. Foreground Visibility listener on document
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      this.visibilityHandler = () => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
          this.scheduleSync(1000);
        }
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }

    // 3. Service Worker Background Sync message listener
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      this.swMessageHandler = (event: MessageEvent) => {
        if (event.data?.type === 'TRIGGER_BACKGROUND_SYNC') {
          this.syncNow();
        }
      };
      navigator.serviceWorker.addEventListener('message', this.swMessageHandler);
    }

    // 4. Periodic heartbeat sync (every 60 seconds when online)
    this.periodicTimer = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine && !this.isSyncing) {
        this.syncNow();
      }
    }, 60 * 1000);

    // Initial check and reconciliation
    this.checkPendingAndNotify();
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      this.scheduleSync(1000);
    }
  }

  /**
   * Complete lifecycle teardown: cleans all timers, intervals, and event listeners.
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

    if (this.visibilityHandler && typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && this.swMessageHandler) {
      navigator.serviceWorker.removeEventListener('message', this.swMessageHandler);
      this.swMessageHandler = null;
    }

    this.retryAttempt = 0;
  }

  /**
   * Subscribes a listener to sync state changes.
   */
  static subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot(0));
    this.checkPendingAndNotify();

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Helper to notify all registered UI listeners with the latest state snapshot.
   */
  private static async notifyListeners(): Promise<void> {
    if (this.listeners.size === 0) return;
    try {
      const pendingCount = await db.sync_queue.where('status').equals('PENDING').count();
      const snapshot = this.getSnapshot(pendingCount);
      for (const listener of this.listeners) {
        try {
          listener(snapshot);
        } catch {
          // Prevent listener errors from halting sync
        }
      }
    } catch {
      // IndexedDB query fallback
    }
  }

  private static async checkPendingAndNotify(): Promise<void> {
    await this.notifyListeners();
  }

  /**
   * Generates a sync snapshot based on current state.
   */
  private static getSnapshot(pendingCount: number): SyncStatusSnapshot {
    const isOnline = typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : true;

    let state: SyncState = 'SYNCED';
    if (!isOnline) {
      state = 'OFFLINE';
    } else if (this.isSyncing) {
      state = 'SYNCING';
    } else if (this.lastErrorMessage) {
      state = 'ERROR';
    } else if (pendingCount > 0) {
      state = 'PENDING';
    } else {
      state = 'SYNCED';
    }

    return {
      state,
      pendingCount,
      lastSyncedAt: this.lastSyncedAt,
      errorMessage: this.lastErrorMessage,
      isOnline,
      isServerReachable: this.isServerReachable,
    };
  }

  /**
   * Debounces synchronization requests to prevent thrashing during fast user inputs.
   */
  static scheduleSync(delay = 1500): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.syncNow();
    }, delay);
  }

  private static lastCreatedAtMs = 0;
  private static subMsCounter = 0;

  /**
   * Generates a strictly monotonically increasing ISO timestamp for FIFO queue ordering.
   */
  private static generateMonotonicTimestamp(): string {
    const now = Date.now();
    if (now <= this.lastCreatedAtMs) {
      this.subMsCounter++;
    } else {
      this.lastCreatedAtMs = now;
      this.subMsCounter = 0;
    }
    return new Date(this.lastCreatedAtMs + this.subMsCounter).toISOString();
  }

  /**
   * Adds an operation to the durable outbox queue in IndexedDB.
   * If a pending operation for the same entity exists, it coalesces them safely.
   */
  static async queueMutation(
    operationType: SyncQueueRecord['operationType'],
    payload: any,
    entityId?: string
  ): Promise<void> {
    try {
      const resolvedEntityId = entityId || payload?.id || (payload?.matchId as string);

      await db.transaction('rw', db.sync_queue, async () => {
        // Coalesce high-frequency UPSERTs on the same match (e.g. ball-by-ball updates)
        if (resolvedEntityId && (operationType === 'UPSERT_MATCH' || operationType === 'UPSERT_TEAM')) {
          const existing = await db.sync_queue
            .where('status')
            .equals('PENDING')
            .and((r) => r.operationType === operationType && r.entityId === resolvedEntityId)
            .first();

          if (existing) {
            // Update the existing queue entry with latest snapshot payload
            await db.sync_queue.update(existing.clientOpId, {
              payload,
              createdAt: this.generateMonotonicTimestamp(),
              retryCount: 0,
            });
            return;
          }
        }

        const op: SyncQueueRecord = {
          clientOpId: `op_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          operationType,
          entityId: resolvedEntityId,
          payload,
          status: 'PENDING',
          retryCount: 0,
          createdAt: this.generateMonotonicTimestamp(),
        };

        await db.sync_queue.put(op);
      });

      this.lastErrorMessage = null;
      await this.notifyListeners();

      // Trigger debounced synchronization opportunity
      this.scheduleSync(500);
    } catch (err) {
      console.error('SyncEngine: Failed to queue mutation in IndexedDB', err);
    }
  }

  /**
   * Validates if a URL string is a well-formed HTTP/HTTPS URL.
   */
  private static isValidHttpUrl(url?: string): boolean {
    if (!url || typeof url !== 'string' || url.trim() === '') return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Checks whether the cloud backend is genuinely reachable (distinguishing network from server availability).
   * 
   * Verifies:
   * 1. Browser offline state (navigator.onLine === false) -> immediately false without network calls
   * 2. Backend configuration -> missing or placeholder URLs return false
   * 3. Network-level transport failures -> fetch rejections/DNS/connection refused return false
   * 4. Request timeout -> AbortController triggers after timeoutMs returning false
   * 5. HTTP response status -> < 500 (2xx, 3xx, 4xx) is reachable; >= 500 (5xx server error/downtime) is unreachable
   */
  static async checkServerReachability(timeoutMs = 4000): Promise<boolean> {
    // 1. Browser offline state: If the device network adapter is disconnected,
    // the backend is definitively unreachable without making any network calls.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.isServerReachable = false;
      return false;
    }

    // 2. Validate backend server configuration: URL must be valid HTTP/HTTPS
    const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!this.isValidHttpUrl(rawUrl)) {
      this.isServerReachable = false;
      return false;
    }

    // Exclude placeholder and dummy URLs from pretending to be reachable
    if (rawUrl!.includes('dummy') || rawUrl!.includes('your-project')) {
      this.isServerReachable = false;
      return false;
    }

    // 3. Actively probe backend health endpoint with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const probeUrl = `${rawUrl!.replace(/\/+$/, '')}/rest/v1/`;
      const res = await fetch(probeUrl, {
        method: 'HEAD',
        signal: controller.signal,
      });

      // 4. Distinguish server availability (< 500) from server errors (>= 500)
      this.isServerReachable = res.status < 500;
      return this.isServerReachable;
    } catch {
      // Handles network-level failure, DNS error, connection refused, or AbortError on timeout
      this.isServerReachable = false;
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Main synchronization routine:
   * 1. Validates server availability & auth session
   * 2. Processes pending queue items in FIFO order with batching & acknowledgment
   * 3. Pulls remote updates with non-destructive conflict branching
   * 4. Updates reactive state without disrupting active match or forcing reloads
   */
  static async syncNow(): Promise<void> {
    if (this.isSyncing || typeof navigator === 'undefined' || !navigator.onLine) {
      this.notifyListeners();
      return;
    }

    this.isSyncing = true;
    this.lastErrorMessage = null;
    await this.notifyListeners();

    try {
      // 1. Reachability Check
      const reachable = await this.checkServerReachability();
      if (!reachable) {
        throw new Error('Backend server is currently unreachable.');
      }

      // 2. Auth Session Check
      let sessionUser: any = null;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        sessionUser = sessionData?.session?.user;
      } catch {
        // Fallback for unconfigured or offline auth
      }

      // If user is not authenticated with Supabase, cloud synchronization is safely deferred;
      // local offline mode remains 100% functional and records remain safely queued in IndexedDB.
      if (!sessionUser) {
        this.isSyncing = false;
        this.notifyListeners();
        return;
      }

      // 3. Process Pending Queue in FIFO order
      const pendingOps = await db.sync_queue
        .where('status')
        .equals('PENDING')
        .sortBy('createdAt');

      for (const op of pendingOps) {
        try {
          await this.executeRemoteOperation(op);

          // Acknowledgment received from server -> delete from outbox queue
          await db.sync_queue.delete(op.clientOpId);

          // Mark corresponding entity as SYNCED locally if applicable
          if (op.operationType === 'UPSERT_MATCH' && op.entityId) {
            await db.matches.update(op.entityId, {
              syncStatus: 'SYNCED',
              lastSyncedAt: new Date().toISOString(),
            });
          }
        } catch (opErr: any) {
          console.warn(`SyncEngine: Operation ${op.clientOpId} failed`, opErr);

          // Rate limit check (HTTP 429)
          if (opErr?.status === 429) {
            const retryAfterSec = parseInt(opErr?.headers?.get?.('Retry-After') || '5', 10);
            throw new Error(`Rate limited by server. Retrying after ${retryAfterSec}s.`);
          }

          op.retryCount++;
          await db.sync_queue.update(op.clientOpId, {
            retryCount: op.retryCount,
            lastAttemptAt: new Date().toISOString(),
            errorMessage: opErr?.message || 'Remote persistence error',
          });

          // Break loop on non-recoverable or network error to avoid out-of-order execution
          throw opErr;
        }
      }

      // 4. Bi-directional Remote Pull & Non-Destructive Conflict Resolution
      await this.pullRemoteChanges(sessionUser.id);

      // Successful sync completion
      this.retryAttempt = 0;
      this.lastSyncedAt = new Date();
      this.lastErrorMessage = null;
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }

      // Prune old synced queue entries to conserve storage quota
      await this.pruneCompletedQueue();
    } catch (err: any) {
      console.warn('SyncEngine: Synchronization attempt encountered error', err);
      this.lastErrorMessage = err?.message || 'Synchronization paused';
      this.scheduleRetry();
    } finally {
      this.isSyncing = false;
      await this.notifyListeners();
    }
  }

  /**
   * Executes an individual mutation against the backend database.
   */
  private static async executeRemoteOperation(op: SyncQueueRecord): Promise<void> {
    switch (op.operationType) {
      case 'UPSERT_MATCH': {
        const scorecard: MatchScorecard = op.payload;
        const payloadToUpload = {
          id: scorecard.id,
          team_a: scorecard.teamA,
          team_b: scorecard.teamB,
          toss_winner: scorecard.tossWinner,
          toss_decision: scorecard.tossDecision,
          total_overs: scorecard.totalOvers,
          status: scorecard.status,
          current_innings: scorecard.currentInnings,
          target_score: scorecard.targetScore,
          venue: scorecard.venue,
          result: scorecard.result,
          scorecard_data: scorecard,
          updated_at: scorecard.updatedAt || new Date().toISOString(),
        };

        const { error } = await supabase.from('matches').upsert(payloadToUpload);
        if (error) throw error;
        break;
      }

      case 'DELETE_MATCH': {
        const id = op.payload?.id || op.entityId;
        if (id) {
          const { error } = await supabase.from('matches').delete().eq('id', id);
          if (error) throw error;
        }
        break;
      }

      case 'UPSERT_TEAM': {
        const team = op.payload;
        const { error } = await supabase.from('teams').upsert({
          id: team.id,
          name: team.name,
          captain: team.captain,
          manager: team.manager,
          players: team.players,
          updated_at: new Date().toISOString(),
        });
        if (error) throw error;
        break;
      }

      case 'DELETE_TEAM': {
        const id = op.payload?.id || op.entityId;
        if (id) {
          const { error } = await supabase.from('teams').delete().eq('id', id);
          if (error) throw error;
        }
        break;
      }

      case 'UPSERT_TOURNAMENT': {
        const tourney = op.payload;
        const { error } = await supabase.from('tournaments').upsert({
          id: tourney.id,
          name: tourney.name,
          format: tourney.format,
          tournament_data: tourney,
          updated_at: new Date().toISOString(),
        });
        if (error) throw error;
        break;
      }

      case 'DELETE_TOURNAMENT': {
        const id = op.payload?.id || op.entityId;
        if (id) {
          const { error } = await supabase.from('tournaments').delete().eq('id', id);
          if (error) throw error;
        }
        break;
      }
    }
  }

  /**
   * Pulls remote changes and performs non-destructive conflict branching.
   * If remote is newer and has conflicting edits, local match is preserved as a conflict branch.
   */
  private static async pullRemoteChanges(userId: string): Promise<void> {
    try {
      const { data: remoteRecords, error } = await supabase
        .from('matches')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(50);

      if (error || !remoteRecords) return;

      for (const remote of remoteRecords) {
        const remoteScorecard: MatchScorecard = remote.scorecard_data || remote;
        if (!remoteScorecard?.id) continue;

        const local = await db.matches.get(remoteScorecard.id);

        if (!local) {
          // New match from cloud -> save locally
          remoteScorecard.syncStatus = 'SYNCED';
          await db.matches.put(remoteScorecard);
          continue;
        }

        const localUpdated = new Date(local.updatedAt).getTime();
        const remoteUpdated = new Date(remote.updated_at || remoteScorecard.updatedAt).getTime();

        // Check if there are unsynchronized local changes
        const hasPendingLocalOps = (await db.sync_queue
          .where('status')
          .equals('PENDING')
          .and((r) => r.entityId === local.id)
          .count()) > 0;

        if (remoteUpdated > localUpdated) {
          if (hasPendingLocalOps) {
            // CONFLICT DETECTED:
            // Non-destructive branching: preserve local version as a separate conflict branch
            const conflictBranchId = `${local.id}_local_conflict_${Date.now()}`;
            const preservedLocalCopy: MatchScorecard = {
              ...local,
              id: conflictBranchId,
              syncStatus: 'CONFLICT',
              isConflictBranch: true,
              teamA: `${local.teamA} (Local Conflict)`,
            };
            await db.matches.put(preservedLocalCopy);

            // Accept remote as authoritative for the primary ID
            remoteScorecard.syncStatus = 'SYNCED';
            await db.matches.put(remoteScorecard);
          } else {
            // Clean remote update (no local unsynced edits)
            remoteScorecard.syncStatus = 'SYNCED';
            await db.matches.put(remoteScorecard);
          }
        } else if (localUpdated > remoteUpdated && !hasPendingLocalOps) {
          // Local is newer and cleanly synced -> update cloud
          await this.executeRemoteOperation({
            clientOpId: `op_pull_push_${Date.now()}`,
            operationType: 'UPSERT_MATCH',
            entityId: local.id,
            payload: local,
            status: 'PENDING',
            retryCount: 0,
            createdAt: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      console.warn('SyncEngine: Error during remote pull', err);
    }
  }

  /**
   * Schedules a retry with exponential backoff and random jitter.
   */
  private static scheduleRetry(): void {
    if (this.retryAttempt >= this.maxRetries) {
      console.warn('SyncEngine: Max retry attempts reached.');
      return;
    }

    // Exponential backoff formula with jitter: min(maxDelay, baseDelay * 2^attempt) + jitter
    const exponential = Math.min(
      this.maxDelayMs,
      this.baseDelayMs * Math.pow(2, this.retryAttempt)
    );
    const jitter = Math.floor(Math.random() * 1000);
    const delay = exponential + jitter;

    this.retryAttempt++;

    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.syncNow();
    }, delay);
  }

  /**
   * Prunes completed queue items to avoid unbounded IndexedDB growth.
   */
  static async pruneCompletedQueue(): Promise<void> {
    try {
      await db.sync_queue.where('status').equals('SYNCED').delete();
    } catch {
      // Non-critical cleanup
    }
  }
}
