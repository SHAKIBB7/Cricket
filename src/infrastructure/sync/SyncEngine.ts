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

import type { Table } from 'dexie';
import { db, SyncQueueRecord, SavedTeam } from '../database/dexie-db';
import { supabase, getSupabaseClient, setSupabaseAuthToken, checkSupabaseConfigured } from '../auth/supabase';
import { auth, checkFirebaseConfigured, isPlaceholderOrEmpty } from '../auth/firebase';
import { MatchScorecard, CricketGround } from '@/domain/cricket/types';
import { Tournament } from '@/domain/tournament/types';
import { normalizeTeamPlayers } from '@/domain/teams/playerIdentity';
import { StorageManagerService } from '../storage/StorageManagerService';

export type SyncState = 'OFFLINE' | 'SYNCING' | 'SYNCED' | 'PENDING' | 'ERROR';

export interface AuthenticatedSession {
  provider: 'firebase' | 'supabase';
  uid: string;
  token: string;
}

export interface SyncStatusSnapshot {
  state: SyncState;
  pendingCount: number;
  failedCount: number;
  failedError: string | null;
  /** PENDING ops intentionally not executed under the current
   * session because they were queued by a different user
   * (P3-H1). They drain when their owner signs in. */
  heldCount: number;
  lastSyncedAt: Date | null;
  errorMessage: string | null;
  isOnline: boolean;
  isServerReachable: boolean;
}

/**
 * Conflict resolution (pick-a-version): when a pull would
 * overwrite a record that still has unsynced local work, the
 * local version is preserved as a branch record with
 * syncStatus 'CONFLICT' and id `<primary>_local_conflict_<ts>`
 * (see conflictBranchIdFor). listConflicts surfaces those
 * branches to the user; resolveConflict applies their choice.
 */
export type SyncConflictEntityType = 'match' | 'team' | 'tournament' | 'ground';

export type SyncConflictChoice = 'keep-local' | 'keep-remote';

export interface SyncConflictItem {
  /** Id of the preserved branch record. */
  branchId: string;
  /** Id of the primary record the branch belongs to. */
  primaryId: string;
  entityType: SyncConflictEntityType;
  /** Display name with the "(Local Conflict)" suffix removed. */
  name: string;
  updatedAt: string | null;
}

type SyncListener = (snapshot: SyncStatusSnapshot) => void;

/** Ball-by-ball domain events ride along on stored and synced scorecard
 * payloads without being part of the MatchScorecard type. Reads them
 * structurally so replication code never needs an any-cast. */
export function scorecardEvents(payload: unknown): unknown[] | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const events = (payload as { events?: unknown }).events;
  return Array.isArray(events) ? events : undefined;
}

/** Attempts a queued operation gets before it is parked as FAILED
 * (F12-1 hardening): enough for transient network failures to heal,
 * few enough that a permanently invalid operation cannot block the
 * FIFO queue for long. */
export const MAX_SYNC_OP_ATTEMPTS = 5;

/**
 * Firestore rejects `undefined` field values anywhere in a document
 * (setDoc throws "Unsupported field value: undefined"), while the
 * app's own records use undefined for not-yet-present data — most
 * ordinarily a match whose second innings has not started
 * (scorecard_data.secondInnings, F12-1). Strip undefined deeply at
 * the write boundary: object keys whose value is undefined are
 * dropped (undefined is equivalent to absent), undefined array
 * ELEMENTS become null (Firestore arrays cannot hold undefined;
 * null keeps indices stable), and non-plain values (Date, class
 * instances) pass through untouched. Applied at EXECUTION time so
 * operations queued before this fix are sanitised too.
 */
export function stripUndefinedForFirestore<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) =>
      item === undefined ? null : stripUndefinedForFirestore(item),
    ) as T;
  }
  if (value !== null && typeof value === 'object') {
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[key] = stripUndefinedForFirestore(v);
    }
    return out as T;
  }
  return value;
}

export class SyncEngine {
  private static debounceTimer: any = null;
  private static periodicTimer: any = null;
  private static retryTimer: any = null;
  private static retryAttempt = 0;
  private static isSyncing = false;
  private static lastSyncedAt: Date | null = null;
  private static lastErrorMessage: string | null = null;
  private static isServerReachable = false;
  // P3-L5: brief cache for the Firebase reachability probe so
  // the 60 s heartbeat doesn't hammer the Firestore REST base.
  private static firebaseProbeCache: { at: number; reachable: boolean } | null = null;
  private static readonly FIREBASE_PROBE_CACHE_MS = 30 * 1000;
  // P3-L4: one-shot delay handed from a 429 response's
  // Retry-After header to the next scheduleRetry() call.
  private static pendingRetryAfterMs: number | null = null;
  // P3-M4: message of the most recent queueMutation failure,
  // consumed by recordQueueFailure().
  private static lastQueueFailureMessage: string | null = null;
  private static listeners: Set<SyncListener> = new Set();

  // Jittered backoff parameters: base 2s, max 60s
  private static baseDelayMs = 2000;
  private static maxDelayMs = 60000;
  private static maxRetries = 10;

  // Event handlers for clean lifecycle teardown
  private static onlineHandler: (() => void) | null = null;
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
    this.isSyncing = false;
    this.firebaseProbeCache = null;
    this.pendingRetryAfterMs = null;
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
      const failedOps = await db.sync_queue.where('status').equals('FAILED').sortBy('createdAt');
      const heldCount = await this.countHeldOps();
      const snapshot = this.getSnapshot(pendingCount, failedOps.length, failedOps[0]?.errorMessage ?? null, heldCount);
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
  /**
   * P3-H1: counts PENDING ops whose provenance uid belongs to a
   * different user than the one currently signed in. Such ops are
   * never executed under the current session (that would upload
   * one user's data into another user's account); they stay
   * queued until their owner signs in. Guest ops (userId null)
   * and legacy ops without provenance are never held.
   */
  private static async countHeldOps(): Promise<number> {
    let uid: string | null = null;
    try {
      uid = auth?.currentUser?.uid ?? null;
    } catch {
      uid = null;
    }
    if (!uid) return 0;
    try {
      return await db.sync_queue
        .where('status')
        .equals('PENDING')
        .and((r) => !!r.userId && r.userId !== uid)
        .count();
    } catch {
      return 0;
    }
  }

  private static getSnapshot(pendingCount: number, failedCount = 0, failedError: string | null = null, heldCount = 0): SyncStatusSnapshot {
    const isOnline = typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : true;

    let state: SyncState = 'SYNCED';
    if (!isOnline) {
      state = 'OFFLINE';
    } else if (this.isSyncing) {
      state = 'SYNCING';
    } else if (this.lastErrorMessage || failedCount > 0) {
      state = 'ERROR';
    } else if (pendingCount > 0) {
      state = 'PENDING';
    } else {
      state = 'SYNCED';
    }

    return {
      state,
      pendingCount,
      failedCount,
      failedError,
      heldCount,
      lastSyncedAt: this.lastSyncedAt,
      errorMessage: this.lastErrorMessage ?? failedError,
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

  /** Sync-op metadata schema stamped on every queued op (P7). */
  private static readonly OP_SCHEMA_VERSION = 1;

  /**
   * Provenance for a newly queued op (P7, sync metadata S): the
   * op schema version, the currently signed-in uid (null for
   * guests — read synchronously from the auth instance, never a
   * token fetch on the save path), and this device's stable id.
   * Since the P3-H1 fix, execution DOES branch on the uid: an op
   * stamped with a non-null uid is only ever executed under that
   * same user's session (see syncNow / countHeldOps).
   */
  private static async opProvenance(): Promise<{
    schemaVersion: number;
    userId: string | null;
    deviceId: string;
  }> {
    let userId: string | null = null;
    try {
      userId = auth?.currentUser?.uid ?? null;
    } catch {
      userId = null;
    }
    const deviceId = await StorageManagerService.getOrCreateDeviceId().catch(() => 'dev_unknown');
    return { schemaVersion: this.OP_SCHEMA_VERSION, userId, deviceId };
  }

  /**
   * Durable, inspectable record of the most recent queue-write
   * failure (P3-M4): a save whose outbox insert failed used to
   * vanish silently, leaving the record "PENDING" forever with
   * no op behind it. Repositories call this when queueMutation
   * reports failure. Never throws.
   */
  static async recordQueueFailure(
    entityId: string | undefined,
    operationType: string,
    err?: unknown
  ): Promise<void> {
    // Prefer the error queueMutation just captured, so the
    // durable record carries the real failure, not a generic one.
    const captured = this.lastQueueFailureMessage;
    this.lastQueueFailureMessage = null;
    try {
      await db.app_metadata.put({
        key: 'sync_queue_error',
        value: {
          entityId: entityId ?? null,
          operationType,
          error:
            err instanceof Error
              ? err.message
              : err
                ? String(err)
                : (captured ?? 'Sync queue write failed'),
          at: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      });
    } catch {
      // Best effort only — never mask the original failure.
    }
  }

  /**
   * Adds an operation to the durable outbox queue in IndexedDB.
   * If a pending operation for the same entity exists, it coalesces them safely.
   *
   * Returns true when the op is durably queued, false when the
   * queue write failed (P3-M4) — callers that persist user data
   * must check the result and surface the failure (see
   * recordQueueFailure); ignoring it remains possible for
   * fire-and-forget callers, but is now a deliberate choice.
   */
  static async queueMutation(
    operationType: SyncQueueRecord['operationType'],
    payload: any,
    entityId?: string
  ): Promise<boolean> {
    let resolvedEntityId: string | undefined;
    try {
      resolvedEntityId = entityId || payload?.id || (payload?.matchId as string);
      const provenance = await this.opProvenance();

      await db.transaction('rw', db.sync_queue, async () => {
        // Coalesce high-frequency UPSERTs on the same entity
        if (
          resolvedEntityId &&
          (operationType === 'UPSERT_MATCH' ||
            operationType === 'UPSERT_TEAM' ||
            operationType === 'UPSERT_GROUND' ||
            operationType === 'UPSERT_TOURNAMENT')
        ) {
          const existing = await db.sync_queue
            .where('status')
            .equals('PENDING')
            .and((r) => r.operationType === operationType && r.entityId === resolvedEntityId)
            .first();

          if (existing) {
            // Update the existing queue entry with latest snapshot payload.
            // P3-L6: do NOT refresh createdAt or reset retryCount
            // here. Refreshing createdAt broke the FIFO ordering
            // guarantee (an edited op jumped the queue), and
            // resetting retryCount meant a chronically failing
            // record that kept being edited never accumulated
            // attempts toward FAILED parking — a partial bypass
            // of the F12-1 parking fix.
            await db.sync_queue.update(existing.clientOpId, {
              payload,
              // Refresh provenance on coalesce: the op may have
              // been queued as a guest before sign-in.
              ...provenance,
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
          ...provenance,
        };

        await db.sync_queue.put(op);
      });

      this.lastErrorMessage = null;
      await this.notifyListeners();

      // Trigger debounced synchronization opportunity
      this.scheduleSync(500);
      return true;
    } catch (err) {
      console.error('SyncEngine: Failed to queue mutation in IndexedDB', err);
      // P3-M4: report the failure to the caller (boolean result)
      // instead of swallowing it, and keep the message for the
      // caller's recordQueueFailure() so the durable record
      // carries the real error.
      this.lastQueueFailureMessage = err instanceof Error ? err.message : String(err);
      return false;
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
   * P3-L5: honest reachability for the Firebase backend.
   *
   * Previously, "Firebase is configured" was reported as
   * "reachable" with no network probe at all, so the UI claimed
   * synced states while the backend had never answered. This
   * performs a real, lightweight, unauthenticated GET against
   * the configured project's Firestore REST base: ANY HTTP
   * response (401/403 included — the service answered) counts
   * as reachable; only a transport failure, a timeout, or a
   * 5xx counts as unreachable. Results are cached for
   * FIREBASE_PROBE_CACHE_MS so frequent callers stay cheap.
   */
  private static async probeFirebaseReachable(timeoutMs: number): Promise<boolean> {
    const now = Date.now();
    if (
      this.firebaseProbeCache &&
      now - this.firebaseProbeCache.at < this.FIREBASE_PROBE_CACHE_MS
    ) {
      this.isServerReachable = this.firebaseProbeCache.reachable;
      return this.firebaseProbeCache.reachable;
    }

    let reachable = false;
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!isPlaceholderOrEmpty(projectId)) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(
          `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`,
          { method: 'GET', signal: controller.signal }
        );
        reachable = res.status < 500;
      } catch {
        reachable = false;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    this.firebaseProbeCache = { at: now, reachable };
    this.isServerReachable = reachable;
    return reachable;
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

    // 2. Validate backend server configuration
    const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const hasValidSupaUrl =
      this.isValidHttpUrl(rawUrl) &&
      !isPlaceholderOrEmpty(rawUrl) &&
      !rawUrl!.includes('your-project');

    // If Supabase backend is configured, probe it
    if (hasValidSupaUrl) {
      // If Supabase anon key is missing/placeholder while Firebase is fully configured,
      // Firebase serves as the active cloud provider — probe IT for
      // real (P3-L5) instead of probing Supabase unauthenticated.
      if (isPlaceholderOrEmpty(rawKey) && checkFirebaseConfigured()) {
        return this.probeFirebaseReachable(timeoutMs);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const probeUrl = `${rawUrl!.replace(/\/+$/, '')}/auth/v1/health`;
        const headers: Record<string, string> = {};
        if (rawKey && !isPlaceholderOrEmpty(rawKey)) {
          headers['apikey'] = rawKey;
          headers['Authorization'] = `Bearer ${rawKey}`;
        }

        const res = await fetch(probeUrl, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });

        this.isServerReachable = res.status < 500;
        return this.isServerReachable;
      } catch {
        // If the Supabase probe failed, fall back to a REAL probe
        // of the Firebase backend when it is configured (P3-L5) —
        // configuration alone no longer counts as reachability.
        if (checkFirebaseConfigured()) {
          return this.probeFirebaseReachable(timeoutMs);
        }
        this.isServerReachable = false;
        return false;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    // If Supabase is not configured, probe the Firebase backend
    // for real when it is configured (P3-L5).
    if (checkFirebaseConfigured()) {
      return this.probeFirebaseReachable(timeoutMs);
    }

    this.isServerReachable = false;
    return false;
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

      // 2. Auth Session Check & Cryptographic Identity Verification
      const session = await this.getAuthenticatedSession();

      // If user identity is unverified, cloud synchronization is safely deferred;
      // offline mode remains 100% functional and records remain safely queued in IndexedDB.
      if (!session || !session.uid || !session.token) {
        this.isSyncing = false;
        await this.notifyListeners();
        return;
      }

      // 3. Process Pending Queue in FIFO order
      const pendingOps = await db.sync_queue
        .where('status')
        .equals('PENDING')
        .sortBy('createdAt');

      let failedThisRun = 0;
      for (const op of pendingOps) {
        // P3-H1: never execute one user's queued work under a
        // different user's session — the writes would be stamped
        // with the current uid and land in the wrong account.
        // Ops stamped with a non-null provenance uid that differs
        // from the session uid are held: left PENDING, no attempt
        // consumed, counted in the snapshot's heldCount, and they
        // drain when their owner signs in. Guest ops (userId
        // null) and legacy ops without provenance execute as
        // before.
        if (op.userId && op.userId !== session.uid) {
          continue;
        }

        // P3-L7: a tournament UPSERT with fewer than 2 teams can
        // never pass Firestore rules validation (isValidTournament
        // requires teams.size() >= 2), so executing it only burns
        // attempts toward a guaranteed FAILED parking. Hold draft
        // tournaments as local-only — left PENDING, no attempt
        // consumed — until the record becomes valid.
        if (op.operationType === 'UPSERT_TOURNAMENT') {
          const teams = (op.payload as Tournament | undefined)?.teams;
          if (!Array.isArray(teams) || teams.length < 2) {
            continue;
          }
        }

        try {
          // Correctness audit finding 1 (2026-11-11): capture the
          // payload signature BEFORE executing. While this op is
          // in flight (a Firestore setDoc can take seconds on a
          // slow connection), the user keeps scoring: saveMatch ->
          // queueMutation COALESCES the newer scorecard into this
          // same PENDING row. The execution below uploads the
          // snapshot it captured at loop start, so acknowledging
          // unconditionally would delete the row that now carries
          // the newer, never-uploaded payload — and stamping the
          // record SYNCED would hide the loss permanently.
          const payloadSignatureBefore = this.payloadSignature(op);

          await this.executeRemoteOperation(op, session);

          // Acknowledgment received from server -> delete the
          // outbox row ONLY if it still holds exactly the payload
          // that was uploaded. A changed (coalesced) row stays
          // PENDING and drains on the next run; a missing row
          // needs no acknowledgment at all.
          const currentOp = await db.sync_queue.get(op.clientOpId);
          if (!currentOp || this.payloadSignature(currentOp) !== payloadSignatureBefore) {
            continue;
          }
          await db.sync_queue.delete(op.clientOpId);

          // Mark corresponding entity as SYNCED locally if
          // applicable — guarded by stampEntitySynced so a record
          // that moved on mid-flight is not falsely stamped.
          await this.stampEntitySynced(op);
        } catch (opErr: any) {
          console.warn(`SyncEngine: Operation ${op.clientOpId} failed`, opErr);

          // Rate limit check (HTTP 429)
          if (opErr?.status === 429) {
            const retryAfterSec = parseInt(opErr?.headers?.get?.('Retry-After') || '5', 10);
            // P3-L4: hand the server's Retry-After to
            // scheduleRetry() instead of announcing it in the
            // message and then ignoring it for a local guess.
            this.pendingRetryAfterMs =
              Number.isFinite(retryAfterSec) && retryAfterSec > 0
                ? retryAfterSec * 1000
                : null;
            throw new Error(`Rate limited by server. Retrying after ${retryAfterSec}s.`);
          }

          op.retryCount++;
          const exhausted = op.retryCount >= MAX_SYNC_OP_ATTEMPTS;
          await db.sync_queue.update(op.clientOpId, {
            retryCount: op.retryCount,
            lastAttemptAt: new Date().toISOString(),
            errorMessage: opErr?.message || 'Remote persistence error',
            ...(exhausted ? { status: 'FAILED' as const } : {}),
          });

          if (exhausted) {
            // A permanently failing operation must not block the queue
            // forever (F12-1): park it as FAILED — the record is kept
            // with its error, surfaced in the UI, and revivable via
            // retryFailed() — and let the operations behind it proceed.
            failedThisRun++;
            console.warn(
              `SyncEngine: Operation ${op.clientOpId} marked FAILED after ${op.retryCount} attempts; continuing with the next operation`,
              opErr,
            );
            continue;
          }

          // Break loop on non-recoverable or network error to avoid out-of-order execution
          throw opErr;
        }
      }

      // 4. Bi-directional Remote Pull & Non-Destructive Conflict Resolution
      await this.pullRemoteChanges(session);

      // Successful sync completion
      this.retryAttempt = 0;
      this.lastSyncedAt = new Date();
      this.lastErrorMessage = failedThisRun > 0
        ? `${failedThisRun} operation(s) could not be synced and were parked as failed.`
        : null;
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
   * Revives operations parked as FAILED (see MAX_SYNC_OP_ATTEMPTS):
   * resets them to PENDING with a fresh attempt budget and kicks a
   * sync. The records are never deleted by parking, so no user data
   * is lost while an operation waits for a fix or a manual retry.
   */
  static async retryFailed(): Promise<void> {
    try {
      const failed = await db.sync_queue.where('status').equals('FAILED').toArray();
      for (const op of failed) {
        await db.sync_queue.update(op.clientOpId, {
          status: 'PENDING',
          retryCount: 0,
          errorMessage: undefined,
        });
      }
      if (failed.length > 0) {
        await this.notifyListeners();
        this.scheduleSync(10);
      }
    } catch {
      // Non-critical: the next scheduled sync still reports the state
    }
  }

  /**
   * Resolves a cryptographically verified authenticated session across Firebase and Supabase.
   * If Firebase Auth is signed in, retrieves its signed JWT ID token.
   * If native Supabase session is signed in, retrieves its access token.
   * Strictly returns null if identity cannot be verified (e.g. guest or offline unauthenticated).
   */
  static async getAuthenticatedSession(): Promise<AuthenticatedSession | null> {
    try {
      // 1. Firebase Auth session verification
      if (auth?.currentUser) {
        const user = auth.currentUser;
        if (user.uid) {
          const token = await user.getIdToken().catch(() => null);
          if (token) {
            setSupabaseAuthToken(token);
            return {
              provider: 'firebase',
              uid: user.uid,
              token,
            };
          }
        }
      }

      // 2. Supabase native Auth session verification
      const { data: sessionData } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
      if (sessionData?.session?.user?.id && sessionData?.session?.access_token) {
        setSupabaseAuthToken(sessionData.session.access_token);
        return {
          provider: 'supabase',
          uid: sessionData.session.user.id,
          token: sessionData.session.access_token,
        };
      }
    } catch {
      // Offline fallback
    }
    return null;
  }

  /**
   * Resolves the authoritative authenticated user UID across Firebase and Supabase sessions.
   * Retained for backward compatibility with callers expecting a string UID or null.
   */
  static async getAuthenticatedUserId(): Promise<string | null> {
    const session = await this.getAuthenticatedSession();
    return session?.uid ?? null;
  }

  /**
   * Cheap identity for an op's payload, used by the in-flight
   * coalesce guard in syncNow (correctness audit finding 1):
   * two signatures are equal only when the payloads are deeply
   * equal, so any mid-flight coalesce — which replaces the
   * stored payload wholesale — is detected. Payloads are plain
   * JSON-shaped data by construction (scorecards, teams,
   * tournaments, grounds, delete stubs).
   */
  private static payloadSignature(op: SyncQueueRecord): string {
    try {
      return JSON.stringify(op.payload ?? null) ?? 'null';
    } catch {
      return `unserializable:${(op.payload as { updatedAt?: string } | undefined)?.updatedAt ?? ''}`;
    }
  }

  /**
   * Stamps the local entity behind a successfully executed
   * UPSERT as SYNCED — but only when the local record still IS
   * the uploaded payload (correctness audit finding 1). If the
   * record's updatedAt moved past the payload's while the
   * upload was in flight, a newer local save exists whose own
   * op owns the record's sync state; stamping here would mark
   * unsynced work as synced. When either side lacks an
   * updatedAt the op-row guard in syncNow has already vouched
   * for the payload, so the stamp proceeds.
   */
  private static async stampEntitySynced(op: SyncQueueRecord): Promise<void> {
    if (!op.entityId) return;
    const payloadUpdatedAt = (op.payload as { updatedAt?: string } | undefined)?.updatedAt;
    const stillMatchesUpload = (recordUpdatedAt?: string): boolean =>
      !payloadUpdatedAt || !recordUpdatedAt || recordUpdatedAt === payloadUpdatedAt;
    try {
      if (op.operationType === 'UPSERT_MATCH') {
        const local = await db.matches.get(op.entityId);
        if (local && stillMatchesUpload(local.updatedAt)) {
          await db.matches.update(op.entityId, {
            syncStatus: 'SYNCED',
            lastSyncedAt: new Date().toISOString(),
          });
        }
      } else if (op.operationType === 'UPSERT_GROUND') {
        const local = await db.grounds.get(op.entityId);
        if (local && stillMatchesUpload(local.updatedAt)) {
          await db.grounds.update(op.entityId, {
            syncStatus: 'SYNCED',
          });
        }
      } else if (op.operationType === 'UPSERT_TEAM') {
        const local = await db.teams.get(op.entityId);
        if (local && stillMatchesUpload(local.updatedAt)) {
          await db.teams.update(op.entityId, {
            syncStatus: 'SYNCED',
          });
        }
      } else if (op.operationType === 'UPSERT_TOURNAMENT') {
        const local = await db.tournaments.get(op.entityId);
        if (local && stillMatchesUpload(local.updatedAt)) {
          await db.tournaments.update(op.entityId, {
            syncStatus: 'SYNCED',
          });
        }
      }
    } catch {
      // Stamping is bookkeeping; never fail the sync run for it.
    }
  }

  /**
   * Executes an individual mutation against the backend database with authenticated user ownership.
   */
  private static async executeRemoteOperation(op: SyncQueueRecord, session: AuthenticatedSession): Promise<void> {
    const supaClient = getSupabaseClient(session.token);
    const userId = session.uid;

    switch (op.operationType) {
      case 'UPSERT_MATCH': {
        const scorecard: MatchScorecard = op.payload;

        // Normalize createdAt so it remains strictly immutable on subsequent updates
        const matchCreatedAt = scorecard.createdAt || scorecard.updatedAt || new Date().toISOString();
        if (!scorecard.createdAt) {
          scorecard.createdAt = matchCreatedAt;
        }

        // Gather any ball-by-ball domain events from local Dexie so
        // events replicate across devices. D-2: this gather used to
        // live ONLY in the Firestore branch below, so the Supabase
        // write uploaded the raw payload — and locally built
        // scorecards never embed events — meaning Supabase-provider
        // restores arrived with scorecard aggregates but NO event
        // history, permanently. Both backends now replicate the
        // same complete scorecard_data.
        let eventsForReplication = scorecardEvents(scorecard);
        if (!eventsForReplication || eventsForReplication.length === 0) {
          try {
            eventsForReplication = await db.match_events.where('matchId').equals(scorecard.id).sortBy('version');
          } catch {
            // Non-blocking
          }
        }

        const scorecardPayload = {
          ...scorecard,
          events: eventsForReplication && eventsForReplication.length > 0 ? eventsForReplication : undefined,
        };

        const payloadToUpload = {
          id: scorecard.id,
          user_id: userId,
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
          scorecard_data: scorecardPayload,
          updated_at: scorecard.updatedAt || new Date().toISOString(),
        };

        if (!isPlaceholderOrEmpty(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
          try {
            const { error } = await supaClient.from('matches').upsert(payloadToUpload);
            if (error && session.provider === 'supabase') throw error;
          } catch (supaErr) {
            if (session.provider === 'supabase') throw supaErr;
          }
        }

        // When authenticated via Firebase, also sync to Cloud Firestore
        if (session.provider === 'firebase' && checkFirebaseConfigured()) {
          try {
            const { doc, setDoc } = await import('firebase/firestore');
            const { firestore } = await import('../auth/firebase');

            // Ensure result conforms to Firestore schema rules (must be string, null, or absent)
            const serializedResult = scorecard.result
              ? typeof scorecard.result === 'string'
                ? scorecard.result
                : JSON.stringify(scorecard.result)
              : null;

            await setDoc(doc(firestore, 'matches', scorecard.id), stripUndefinedForFirestore({
              id: scorecard.id,
              userId: session.uid,
              teamA: scorecard.teamA,
              teamB: scorecard.teamB,
              tossWinner: scorecard.tossWinner || null,
              tossDecision: scorecard.tossDecision || null,
              totalOvers: scorecard.totalOvers,
              status: scorecard.status || 'ONGOING',
              currentInnings: scorecard.currentInnings || 1,
              targetScore: scorecard.targetScore || null,
              venue: scorecard.venue || null,
              result: serializedResult,
              isPublic: scorecard.isPublic ?? true,
              scorecard_data: scorecardPayload,
              createdAt: matchCreatedAt,
              updatedAt: scorecard.updatedAt || new Date().toISOString(),
            }), { merge: true });
          } catch (fsErr) {
            console.warn('[SyncEngine] Firestore match sync notice:', fsErr);
            throw fsErr;
          }
        }
        break;
      }

      case 'DELETE_MATCH': {
        const id = op.payload?.id || op.entityId;
        if (id) {
          if (!isPlaceholderOrEmpty(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
            try {
              let query = supaClient.from('matches').delete().eq('id', id);
              if (userId) query = query.eq('user_id', userId);
              const { error } = await query;
              if (error && session.provider === 'supabase') throw error;
            } catch (supaErr) {
              if (session.provider === 'supabase') throw supaErr;
            }
          }

          if (session.provider === 'firebase' && checkFirebaseConfigured()) {
            try {
              const { doc, deleteDoc } = await import('firebase/firestore');
              const { firestore } = await import('../auth/firebase');
              await deleteDoc(doc(firestore, 'matches', id));
            } catch (fsErr) {
              console.warn('[SyncEngine] Firestore match delete notice:', fsErr);
              throw fsErr;
            }
          }
        }
        break;
      }

      case 'UPSERT_TEAM': {
        const team = op.payload;
        // When Supabase is configured, upsert to Supabase
        if (!isPlaceholderOrEmpty(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
          const { error } = await supaClient.from('teams').upsert({
            id: team.id,
            user_id: userId || team.userId,
            name: team.name,
            captain: team.captain || '',
            manager: team.manager || '',
            players: team.players || [],
            // D-6: the record's OWN updatedAt, like matches and
            // tournaments send. This used to stamp upload time,
            // and the Supabase team pull writes the row's
            // updated_at back as the local record's updatedAt —
            // the inflated stamp made stale content win
            // last-writer comparisons on other devices.
            updated_at: team.updatedAt || team.createdAt || new Date().toISOString(),
          });
          if (error && session.provider === 'supabase') throw error;
        }

        // When authenticated via Firebase, also sync to Cloud Firestore
        if (session.provider === 'firebase' && checkFirebaseConfigured()) {
          try {
            const { doc, setDoc } = await import('firebase/firestore');
            const { firestore } = await import('../auth/firebase');
            await setDoc(doc(firestore, 'teams', team.id), stripUndefinedForFirestore({
              id: team.id,
              userId: session.uid,
              name: team.name,
              captain: team.captain || '',
              manager: team.manager || '',
              players: team.players || [],
              createdAt: team.createdAt || new Date().toISOString(),
              updatedAt: team.updatedAt || new Date().toISOString(),
            }), { merge: true });
          } catch (fsErr) {
            console.warn('[SyncEngine] Firestore team sync notice:', fsErr);
            throw fsErr;
          }
        }
        break;
      }

      case 'DELETE_TEAM': {
        const id = op.payload?.id || op.entityId;
        if (id) {
          if (!isPlaceholderOrEmpty(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
            let query = supaClient.from('teams').delete().eq('id', id);
            if (userId) query = query.eq('user_id', userId);
            const { error } = await query;
            if (error && session.provider === 'supabase') throw error;
          }

          if (session.provider === 'firebase' && checkFirebaseConfigured()) {
            try {
              const { doc, deleteDoc } = await import('firebase/firestore');
              const { firestore } = await import('../auth/firebase');
              await deleteDoc(doc(firestore, 'teams', id));
            } catch (fsErr) {
              console.warn('[SyncEngine] Firestore team delete notice:', fsErr);
              throw fsErr;
            }
          }
        }
        break;
      }

      case 'UPSERT_TOURNAMENT': {
        const tourney = op.payload;
        if (!isPlaceholderOrEmpty(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
          const { error } = await supaClient.from('tournaments').upsert({
            id: tourney.id,
            user_id: userId || tourney.userId,
            name: tourney.name,
            format: tourney.format,
            tournament_data: tourney,
            updated_at: tourney.updatedAt || new Date().toISOString(),
          });
          if (error && session.provider === 'supabase') throw error;
        }

        // When authenticated via Firebase, also sync to Cloud Firestore
        if (session.provider === 'firebase' && checkFirebaseConfigured()) {
          try {
            const { doc, setDoc } = await import('firebase/firestore');
            const { firestore } = await import('../auth/firebase');
            await setDoc(doc(firestore, 'tournaments', tourney.id), stripUndefinedForFirestore({
              id: tourney.id,
              userId: session.uid,
              name: tourney.name,
              format: tourney.format,
              teams: tourney.teams || [],
              fixtures: tourney.fixtures || [],
              leagueMeetings: tourney.leagueMeetings || 1,
              matchOvers: tourney.matchOvers || 20,
              champion: tourney.champion || null,
              createdAt: tourney.createdAt || new Date().toISOString(),
              updatedAt: tourney.updatedAt || new Date().toISOString(),
            }), { merge: true });
          } catch (fsErr) {
            console.warn('[SyncEngine] Firestore tournament sync notice:', fsErr);
            throw fsErr;
          }
        }
        break;
      }

      case 'DELETE_TOURNAMENT': {
        const id = op.payload?.id || op.entityId;
        if (id) {
          if (!isPlaceholderOrEmpty(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
            let query = supaClient.from('tournaments').delete().eq('id', id);
            if (userId) query = query.eq('user_id', userId);
            const { error } = await query;
            if (error && session.provider === 'supabase') throw error;
          }

          if (session.provider === 'firebase' && checkFirebaseConfigured()) {
            try {
              const { doc, deleteDoc } = await import('firebase/firestore');
              const { firestore } = await import('../auth/firebase');
              await deleteDoc(doc(firestore, 'tournaments', id));
            } catch (fsErr) {
              console.warn('[SyncEngine] Firestore tournament delete notice:', fsErr);
              throw fsErr;
            }
          }
        }
        break;
      }

      case 'UPSERT_GROUND': {
        const ground: CricketGround = op.payload;
        if (!isPlaceholderOrEmpty(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
          try {
            const { error } = await supaClient.from('grounds').upsert({
              id: ground.id,
              user_id: userId,
              name: ground.name,
              latitude: ground.latitude,
              longitude: ground.longitude,
              google_place_id: ground.googlePlaceId,
              address: ground.address,
              updated_at: ground.updatedAt || new Date().toISOString(),
            });
            if (error && error.code !== '42P01' && session.provider === 'supabase') throw error;
          } catch (e: any) {
            if (e?.code !== '42P01' && session.provider === 'supabase') throw e;
          }
        }

        if (session.provider === 'firebase' && checkFirebaseConfigured()) {
          try {
            const { doc, setDoc } = await import('firebase/firestore');
            const { firestore } = await import('../auth/firebase');
            await setDoc(doc(firestore, 'grounds', ground.id), stripUndefinedForFirestore({
              id: ground.id,
              userId: session.uid,
              name: ground.name,
              latitude: ground.latitude,
              longitude: ground.longitude,
              accuracy: ground.accuracy ?? null,
              locationSource: ground.locationSource || null,
              googlePlaceId: ground.googlePlaceId || null,
              address: ground.address || null,
              referencePlaceId: ground.referencePlaceId || null,
              referencePlaceName: ground.referencePlaceName || null,
              referenceLatitude: ground.referenceLatitude ?? null,
              referenceLongitude: ground.referenceLongitude ?? null,
              referenceDistanceMeters: ground.referenceDistanceMeters ?? null,
              isProvisional: ground.isProvisional ?? false,
              isUserConfirmed: ground.isUserConfirmed ?? false,
              isUserDefined: ground.isUserDefined ?? false,
              namingSource: ground.namingSource || null,
              confidenceScore: ground.confidenceScore ?? null,
              detectionRadiusMeters: ground.detectionRadiusMeters ?? null,
              createdAt: ground.createdAt || ground.updatedAt || new Date().toISOString(),
              updatedAt: ground.updatedAt || new Date().toISOString(),
            }), { merge: true });
          } catch (fsErr) {
            console.warn('[SyncEngine] Firestore ground sync notice:', fsErr);
            throw fsErr;
          }
        }
        break;
      }

      case 'DELETE_GROUND': {
        const id = op.payload?.id || op.entityId;
        if (id) {
          if (!isPlaceholderOrEmpty(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
            try {
              let query = supaClient.from('grounds').delete().eq('id', id);
              if (userId) query = query.eq('user_id', userId);
              await query;
            } catch (e) {
              // Tolerate if table is missing remotely
            }
          }

          if (session.provider === 'firebase' && checkFirebaseConfigured()) {
            try {
              const { doc, deleteDoc } = await import('firebase/firestore');
              const { firestore } = await import('../auth/firebase');
              await deleteDoc(doc(firestore, 'grounds', id));
            } catch (fsErr) {
              console.warn('[SyncEngine] Firestore ground delete notice:', fsErr);
              throw fsErr;
            }
          }
        }
        break;
      }
    }
  }

  /**
   * True when a local entity still carries work the cloud has
   * not acknowledged: a PENDING *or FAILED* queued op for it, or
   * the record itself flagged PENDING/CONFLICT. P3-M3: parked
   * FAILED ops hold the user's newest payload, so they must
   * trigger the same conflict protection as pending ones —
   * counting only PENDING let a newer remote copy silently
   * overwrite the local entity while its failed op sat queued.
   */
  private static async hasUnsyncedLocalChanges(
    entityId: string,
    localSyncStatus?: string
  ): Promise<boolean> {
    if (localSyncStatus === 'PENDING' || localSyncStatus === 'CONFLICT') {
      return true;
    }
    try {
      const count = await db.sync_queue
        .where('entityId')
        .equals(entityId)
        .and((r) => r.status === 'PENDING' || r.status === 'FAILED')
        .count();
      return count > 0;
    } catch {
      return false;
    }
  }

  /**
   * P3-M6: conflict branches used to be re-minted on EVERY
   * conflicting pull (a fresh `${id}_local_conflict_${ts}` each
   * time), so a long-lived conflict accumulated duplicate
   * "(Local Conflict)" copies. Reuse the existing branch id for
   * a primary record when one exists — the caller refreshes its
   * content with the latest local copy — and mint a new id only
   * for the first conflict.
   */
  private static async conflictBranchIdFor(
    table: { where: (index: string) => any },
    primaryId: string
  ): Promise<string> {
    const prefix = `${primaryId}_local_conflict_`;
    try {
      const existing = await table.where('id').startsWith(prefix).first();
      if (existing?.id) return existing.id as string;
    } catch {
      // Fall through to minting a fresh branch id.
    }
    return `${prefix}${Date.now()}`;
  }

  /**
   * D-1: preserve the local match as a conflict branch
   * INCLUDING its ball-by-ball log. Match history lives in the
   * match_events table, not on the scorecard record — and the
   * pull that creates the branch immediately converges the
   * primary id's events to the remote list
   * (applyRemoteMatchEvents), which used to delete the local
   * version's balls in the same pass that "preserved" it. The
   * local events are therefore embedded on the branch copy
   * first (the same structural `events` field pulls already
   * read via scorecardEvents); resolveConflict installs them
   * back if the user keeps the local version.
   */
  private static async preserveLocalMatchBranch(
    local: MatchScorecard,
    conflictBranchId: string
  ): Promise<void> {
    const preservedLocalCopy: MatchScorecard = {
      ...local,
      id: conflictBranchId,
      syncStatus: 'CONFLICT',
      isConflictBranch: true,
      teamA: `${local.teamA} (Local Conflict)`,
    };
    try {
      const localEvents = await db.match_events
        .where('matchId')
        .equals(local.id)
        .sortBy('version');
      if (localEvents.length > 0) {
        (preservedLocalCopy as MatchScorecard & { events?: unknown[] }).events =
          localEvents;
      }
    } catch {
      // Branching the scorecard must not fail because the log
      // snapshot did — a branch without events still preserves
      // the aggregates (the pre-D-1 behaviour).
    }
    await db.matches.put(preservedLocalCopy);
  }

  /**
   * P3-H2: applies a remote match's event list locally AND
   * converges deletions. Pull previously only bulkPut remote
   * events, so events deleted remotely (undo / over-log edits
   * on another device) survived locally forever — and were
   * later re-embedded into scorecard_data.events on this
   * device's next upsert, resurrecting them everywhere. After
   * writing the remote list, local events for the match whose
   * ids are absent from it are deleted.
   *
   * Guard: this runs ONLY when the remote scorecard actually
   * carries a non-empty events list. An absent or empty list
   * means "events not replicated in this payload" — never a
   * licence to wipe the local history.
   */
  private static async applyRemoteMatchEvents(
    matchId: string,
    remoteEventsRaw: unknown[] | undefined
  ): Promise<void> {
    if (!Array.isArray(remoteEventsRaw) || remoteEventsRaw.length === 0) return;
    const normalizedEvents = remoteEventsRaw.map((evt: any) => ({
      ...evt,
      eventId:
        evt.eventId ||
        evt.id ||
        `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      matchId: evt.matchId || matchId,
    }));
    await db.match_events.bulkPut(normalizedEvents);
    const remoteIds = new Set(normalizedEvents.map((e: any) => e.eventId as string));
    const localEvents = await db.match_events.where('matchId').equals(matchId).toArray();
    const staleIds = localEvents
      .filter((e: any) => !remoteIds.has(e.eventId))
      .map((e: any) => e.eventId as string);
    if (staleIds.length > 0) {
      await db.match_events.bulkDelete(staleIds);
    }
  }

  /** localStorage key for the Clear Database tombstone (D-4). */
  private static readonly DB_CLEARED_AT_KEY = 'csp_db_cleared_at';

  /**
   * D-4: epoch-ms of the user's last confirmed Clear Database,
   * written by the profile page BEFORE the wipe. It lives in
   * localStorage precisely because the wipe clears IndexedDB —
   * the marker must survive the database it describes. Null
   * when the database was never cleared on this device.
   */
  private static readDbClearedAtMs(): number | null {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(this.DB_CLEARED_AT_KEY);
      if (!raw) return null;
      const ms = Number(raw);
      return Number.isFinite(ms) && ms > 0 ? ms : null;
    } catch {
      return null;
    }
  }

  /**
   * D-7: true while a DELETE op for this entity sits in the
   * outbox unfinished — PENDING (including ops held because
   * they were queued under another user's session; "held" is a
   * property of a PENDING op, not a separate status) or parked
   * FAILED. While one exists, the record's local absence is
   * deliberate and a pull must not resurrect it.
   */
  private static async hasPendingDelete(entityId: string): Promise<boolean> {
    try {
      const count = await db.sync_queue
        .where('entityId')
        .equals(entityId)
        .and(
          (r) =>
            (r.status === 'PENDING' || r.status === 'FAILED') &&
            r.operationType.startsWith('DELETE_')
        )
        .count();
      return count > 0;
    } catch {
      return false;
    }
  }

  /**
   * D-4/D-7 gate for every pull section's "missing locally →
   * restore from cloud" branch. Returns true when the remote
   * record must NOT be restored:
   *
   *  - D-7: a DELETE for it is still queued — the user deleted
   *    it on purpose; restoring would resurrect it locally and,
   *    once the delete lands remotely, strand a local-only
   *    zombie with no remote twin and no op.
   *  - D-4: the user cleared the database at `clearedAtMs` and
   *    the remote record's own updatedAt is not newer than the
   *    clear — the clear was a deliberate permanent delete, so
   *    a tombstone DELETE is queued for the cloud copy instead
   *    (the hasPendingDelete check above deduplicates it on
   *    later pulls). Records NEWER than the clear restore
   *    normally.
   */
  private static async shouldSuppressCloudRestore(args: {
    deleteOperationType: SyncQueueRecord['operationType'];
    entityId: string;
    remoteUpdatedAt?: string | null;
    clearedAtMs: number | null;
  }): Promise<boolean> {
    if (await this.hasPendingDelete(args.entityId)) return true;
    if (args.clearedAtMs == null) return false;
    const parsed = args.remoteUpdatedAt ? Date.parse(args.remoteUpdatedAt) : NaN;
    const remoteMs = Number.isFinite(parsed) ? parsed : 0;
    if (remoteMs > args.clearedAtMs) return false;
    await this.queueMutation(
      args.deleteOperationType,
      { id: args.entityId },
      args.entityId
    );
    return true;
  }

  /**
   * Pulls remote changes and performs non-destructive conflict branching, strictly scoped to the authenticated user.
   */
  private static async pullRemoteChanges(session: AuthenticatedSession): Promise<void> {
    try {
      // D-4: snapshot the Clear Database tombstone once per pull.
      const clearedAtMs = this.readDbClearedAtMs();
      // 1. Pull matches from Cloud Firestore (for Firebase-authenticated sessions)
      if (session.provider === 'firebase' && checkFirebaseConfigured()) {
        try {
          const { collection, query: fsQuery, where: fsWhere, getDocs } = await import('firebase/firestore');
          const { firestore } = await import('../auth/firebase');
          const q = fsQuery(collection(firestore, 'matches'), fsWhere('userId', '==', session.uid));
          const snap = await getDocs(q);

          for (const docSnap of snap.docs) {
            const data = docSnap.data();
            const remoteScorecard: MatchScorecard = data.scorecard_data || data;
            if (!remoteScorecard?.id) continue;
            remoteScorecard.userId = session.uid;

            const local = await db.matches.get(remoteScorecard.id);

            if (!local) {
              // D-4/D-7: never resurrect a deliberately deleted
              // record (Clear Database tombstone / queued DELETE).
              if (await this.shouldSuppressCloudRestore({
                deleteOperationType: 'DELETE_MATCH',
                entityId: remoteScorecard.id,
                remoteUpdatedAt: data.updatedAt || remoteScorecard.updatedAt || remoteScorecard.createdAt,
                clearedAtMs,
              })) continue;
              // New match from cloud -> restore into local database
              remoteScorecard.syncStatus = 'SYNCED';
              await db.matches.put(remoteScorecard);

              const remoteEvents = scorecardEvents(data.scorecard_data) || scorecardEvents(remoteScorecard);
              await this.applyRemoteMatchEvents(remoteScorecard.id, remoteEvents);
              continue;
            }

            const localUpdated = new Date(local.updatedAt || local.createdAt).getTime();
            const remoteUpdated = new Date(data.updatedAt || remoteScorecard.updatedAt || remoteScorecard.createdAt).getTime();

            // Check if there are unsynchronized local changes
            // (PENDING or FAILED ops — P3-M3 — or a record itself
            // flagged PENDING/CONFLICT)
            const hasPendingLocalOps = await this.hasUnsyncedLocalChanges(local.id, local.syncStatus);

            if (remoteUpdated > localUpdated) {
              if (hasPendingLocalOps) {
                // CONFLICT DETECTED: Non-destructive branching
                // (branch id reused across pulls — P3-M6). D-1:
                // the branch snapshots the local event log too.
                const conflictBranchId = await this.conflictBranchIdFor(db.matches, local.id);
                await this.preserveLocalMatchBranch(local, conflictBranchId);

                // Authoritative remote applied to primary ID
                remoteScorecard.syncStatus = 'SYNCED';
                await db.matches.put(remoteScorecard);
                const remoteEvents = scorecardEvents(data.scorecard_data) || scorecardEvents(remoteScorecard);
                await this.applyRemoteMatchEvents(remoteScorecard.id, remoteEvents);
              } else {
                // Clean remote update
                remoteScorecard.syncStatus = 'SYNCED';
                await db.matches.put(remoteScorecard);
                const remoteEvents = scorecardEvents(data.scorecard_data) || scorecardEvents(remoteScorecard);
                await this.applyRemoteMatchEvents(remoteScorecard.id, remoteEvents);
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
              }, session);
            }
          }
        } catch (fsMatchPullErr) {
          console.warn('[SyncEngine] Firestore match pull notice:', fsMatchPullErr);
        }
      }

      // 2. Pull matches from Supabase (if configured)
      if (!isPlaceholderOrEmpty(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
        try {
          const supaClient = getSupabaseClient(session.token);
          // P3-L3: this pull used to be capped at `.limit(50)`,
          // so users with more than 50 Supabase-backed matches
          // silently never pulled the older ones to a new device.
          // Fetch page by page (newest first) until exhausted,
          // bounded at MAX_PULL_RECORDS so a pathological account
          // cannot stall a sync run.
          const PULL_PAGE_SIZE = 200;
          const MAX_PULL_RECORDS = 1000;
          const remoteRecords: any[] = [];
          let pullError: any = null;
          for (let offset = 0; offset < MAX_PULL_RECORDS; offset += PULL_PAGE_SIZE) {
            let pageQuery = supaClient
              .from('matches')
              .select('*')
              .order('updated_at', { ascending: false })
              .range(offset, offset + PULL_PAGE_SIZE - 1);

            if (session.uid) {
              pageQuery = pageQuery.eq('user_id', session.uid);
            }

            const { data: pageData, error: pageError } = await pageQuery;
            if (pageError) {
              pullError = pageError;
              break;
            }
            if (!pageData || pageData.length === 0) break;
            remoteRecords.push(...pageData);
            if (pageData.length < PULL_PAGE_SIZE) break;
          }

          if (!pullError && remoteRecords) {
            for (const remote of remoteRecords) {
              const remoteScorecard: MatchScorecard = remote.scorecard_data || remote;
              if (!remoteScorecard?.id) continue;

              const local = await db.matches.get(remoteScorecard.id);

              if (!local) {
                // D-4/D-7: never resurrect a deliberately
                // deleted record (see Firestore section above).
                if (await this.shouldSuppressCloudRestore({
                  deleteOperationType: 'DELETE_MATCH',
                  entityId: remoteScorecard.id,
                  remoteUpdatedAt: remote.updated_at || remoteScorecard.updatedAt || remoteScorecard.createdAt,
                  clearedAtMs,
                })) continue;
                remoteScorecard.syncStatus = 'SYNCED';
                await db.matches.put(remoteScorecard);
                await this.applyRemoteMatchEvents(
                  remoteScorecard.id,
                  scorecardEvents(remote.scorecard_data) || scorecardEvents(remoteScorecard)
                );
                continue;
              }

              const localUpdated = new Date(local.updatedAt || local.createdAt).getTime();
              const remoteUpdated = new Date(remote.updated_at || remoteScorecard.updatedAt).getTime();

              // PENDING or FAILED ops count as unsynced (P3-M3)
              const hasPendingLocalOps = await this.hasUnsyncedLocalChanges(local.id, local.syncStatus);

              if (remoteUpdated > localUpdated) {
                const remoteEvents =
                  scorecardEvents(remote.scorecard_data) || scorecardEvents(remoteScorecard);
                if (hasPendingLocalOps) {
                  // Branch id reused across pulls (P3-M6). D-1:
                  // the branch snapshots the local event log too.
                  const conflictBranchId = await this.conflictBranchIdFor(db.matches, local.id);
                  await this.preserveLocalMatchBranch(local, conflictBranchId);
                  remoteScorecard.syncStatus = 'SYNCED';
                  await db.matches.put(remoteScorecard);
                  await this.applyRemoteMatchEvents(remoteScorecard.id, remoteEvents);
                } else {
                  remoteScorecard.syncStatus = 'SYNCED';
                  await db.matches.put(remoteScorecard);
                  await this.applyRemoteMatchEvents(remoteScorecard.id, remoteEvents);
                }
              } else if (localUpdated > remoteUpdated && !hasPendingLocalOps) {
                await this.executeRemoteOperation({
                  clientOpId: `op_pull_push_${Date.now()}`,
                  operationType: 'UPSERT_MATCH',
                  entityId: local.id,
                  payload: local,
                  status: 'PENDING',
                  retryCount: 0,
                  createdAt: new Date().toISOString(),
                }, session);
              }
            }
          }
        } catch (supaMatchPullErr) {
          console.warn('[SyncEngine] Supabase match pull notice:', supaMatchPullErr);
        }
      }

      // 3. Pull teams from Cloud Firestore
      if (session.provider === 'firebase' && checkFirebaseConfigured()) {
        try {
          const { collection, query: fsQuery, where: fsWhere, getDocs } = await import('firebase/firestore');
          const { firestore } = await import('../auth/firebase');
          const q = fsQuery(collection(firestore, 'teams'), fsWhere('userId', '==', session.uid));
          const snap = await getDocs(q);
          for (const docSnap of snap.docs) {
            const remoteTeam = docSnap.data() as SavedTeam;
            if (!remoteTeam?.id) continue;
            const local = await db.teams.get(remoteTeam.id);
            // P3-M1: normalise players exactly like every other
            // intake (Supabase pull, Drive, file import, Dexie v4
            // upgrade). This path used to put the raw document,
            // so a legacy string-player team from Firestore landed
            // in Dexie violating the TeamPlayer[] invariant.
            const teamObj: SavedTeam = {
              ...remoteTeam,
              players: normalizeTeamPlayers(remoteTeam.players, local?.players),
              syncStatus: 'SYNCED',
            };
            if (!local) {
              // D-4/D-7: never resurrect a deliberately deleted record.
              if (await this.shouldSuppressCloudRestore({
                deleteOperationType: 'DELETE_TEAM',
                entityId: remoteTeam.id,
                remoteUpdatedAt: remoteTeam.updatedAt || remoteTeam.createdAt,
                clearedAtMs,
              })) continue;
              await db.teams.put(teamObj);
            } else {
              const localUpdated = new Date(local.updatedAt || local.createdAt).getTime();
              const remoteUpdated = new Date(remoteTeam.updatedAt || remoteTeam.createdAt).getTime();
              if (remoteUpdated >= localUpdated) {
                // P3-H3: never blindly overwrite unsynced local
                // work — preserve it as a conflict branch first
                // (the same protection matches get), then take
                // the remote as primary.
                if (await this.hasUnsyncedLocalChanges(local.id, local.syncStatus)) {
                  const branchId = await this.conflictBranchIdFor(db.teams, local.id);
                  await db.teams.put({
                    ...local,
                    id: branchId,
                    name: `${local.name} (Local Conflict)`,
                    syncStatus: 'CONFLICT',
                  });
                }
                await db.teams.put(teamObj);
              }
            }
          }
        } catch (fsPullErr) {
          console.warn('[SyncEngine] Firestore team pull notice:', fsPullErr);
        }
      }

      // 4. Pull teams from Supabase if configured
      if (!isPlaceholderOrEmpty(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
        try {
          const supaClient = getSupabaseClient(session.token);
          let teamQuery = supaClient.from('teams').select('*');
          if (session.uid) teamQuery = teamQuery.eq('user_id', session.uid);
          const { data: remoteTeams, error: teamErr } = await teamQuery;
          if (!teamErr && remoteTeams) {
            for (const rt of remoteTeams) {
              if (!rt?.id) continue;
              const local = await db.teams.get(rt.id);
              const teamObj: SavedTeam = {
                id: rt.id,
                userId: rt.user_id,
                name: rt.name,
                captain: rt.captain || '',
                manager: rt.manager || '',
                // F9-β2: storage is object-form now. Normalise the
                // remote list, preserving LOCAL ids by name match so a
                // legacy string-writer can never orphan identities.
                players: normalizeTeamPlayers(rt.players, local?.players),
                createdAt: rt.created_at || rt.updated_at || new Date().toISOString(),
                updatedAt: rt.updated_at || new Date().toISOString(),
                syncStatus: 'SYNCED',
              };
              if (!local) {
                // D-4/D-7: never resurrect a deliberately deleted record.
                if (await this.shouldSuppressCloudRestore({
                  deleteOperationType: 'DELETE_TEAM',
                  entityId: rt.id,
                  remoteUpdatedAt: rt.updated_at || rt.created_at,
                  clearedAtMs,
                })) continue;
                await db.teams.put(teamObj);
              } else {
                const localUpdated = new Date(local.updatedAt || local.createdAt).getTime();
                const remoteUpdated = new Date(rt.updated_at || teamObj.updatedAt).getTime();
                if (remoteUpdated >= localUpdated) {
                  // P3-H3: preserve unsynced local work as a
                  // conflict branch before taking the remote.
                  if (await this.hasUnsyncedLocalChanges(local.id, local.syncStatus)) {
                    const branchId = await this.conflictBranchIdFor(db.teams, local.id);
                    await db.teams.put({
                      ...local,
                      id: branchId,
                      name: `${local.name} (Local Conflict)`,
                      syncStatus: 'CONFLICT',
                    });
                  }
                  await db.teams.put(teamObj);
                }
              }
            }
          }
        } catch (supaPullErr) {
          console.warn('[SyncEngine] Supabase team pull notice:', supaPullErr);
        }
      }

      // 5. Pull tournaments from Cloud Firestore
      if (session.provider === 'firebase' && checkFirebaseConfigured()) {
        try {
          const { collection, query: fsQuery, where: fsWhere, getDocs } = await import('firebase/firestore');
          const { firestore } = await import('../auth/firebase');
          const q = fsQuery(collection(firestore, 'tournaments'), fsWhere('userId', '==', session.uid));
          const snap = await getDocs(q);
          for (const docSnap of snap.docs) {
            const remoteTourney = docSnap.data() as Tournament;
            if (!remoteTourney?.id) continue;
            const local = await db.tournaments.get(remoteTourney.id);
            if (!local) {
              // D-4/D-7: never resurrect a deliberately deleted record.
              if (await this.shouldSuppressCloudRestore({
                deleteOperationType: 'DELETE_TOURNAMENT',
                entityId: remoteTourney.id,
                remoteUpdatedAt: remoteTourney.updatedAt || remoteTourney.createdAt,
                clearedAtMs,
              })) continue;
              await db.tournaments.put({ ...remoteTourney, syncStatus: 'SYNCED' });
            } else {
              const localUpdated = new Date(local.updatedAt || local.createdAt).getTime();
              const remoteUpdated = new Date(remoteTourney.updatedAt || remoteTourney.createdAt).getTime();
              if (remoteUpdated >= localUpdated) {
                // P3-H3: preserve unsynced local work as a
                // conflict branch before taking the remote.
                if (await this.hasUnsyncedLocalChanges(local.id, local.syncStatus)) {
                  const branchId = await this.conflictBranchIdFor(db.tournaments, local.id);
                  const branch: Tournament = {
                    ...local,
                    id: branchId,
                    name: `${local.name} (Local Conflict)`,
                  };
                  // Tournament's syncStatus union predates
                  // conflict branches; matches/teams carry
                  // 'CONFLICT' in theirs. Set it structurally.
                  (branch as { syncStatus?: string }).syncStatus = 'CONFLICT';
                  await db.tournaments.put(branch);
                }
                await db.tournaments.put({ ...remoteTourney, syncStatus: 'SYNCED' });
              }
            }
          }
        } catch (fsPullErr) {
          console.warn('[SyncEngine] Firestore tournament pull notice:', fsPullErr);
        }
      }

      // 6. Pull tournaments from Supabase if configured
      if (!isPlaceholderOrEmpty(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
        try {
          const supaClient = getSupabaseClient(session.token);
          let tourneyQuery = supaClient.from('tournaments').select('*');
          if (session.uid) tourneyQuery = tourneyQuery.eq('user_id', session.uid);
          const { data: remoteTourneys, error: tourneyErr } = await tourneyQuery;
          if (!tourneyErr && remoteTourneys) {
            for (const rt of remoteTourneys) {
              if (!rt?.id) continue;
              const local = await db.tournaments.get(rt.id);
              const tourneyObj: Tournament = rt.tournament_data || {
                id: rt.id,
                userId: rt.user_id,
                name: rt.name,
                format: rt.format,
                teams: [],
                fixtures: [],
                leagueMeetings: 1,
                matchOvers: 20,
                createdAt: rt.created_at || rt.updated_at || new Date().toISOString(),
                updatedAt: rt.updated_at || new Date().toISOString(),
                syncStatus: 'SYNCED',
              };
              tourneyObj.syncStatus = 'SYNCED';
              if (!local) {
                // D-4/D-7: never resurrect a deliberately deleted record.
                if (await this.shouldSuppressCloudRestore({
                  deleteOperationType: 'DELETE_TOURNAMENT',
                  entityId: rt.id,
                  remoteUpdatedAt: rt.updated_at || tourneyObj.updatedAt || tourneyObj.createdAt,
                  clearedAtMs,
                })) continue;
                await db.tournaments.put(tourneyObj);
              } else {
                const localUpdated = new Date(local.updatedAt || local.createdAt).getTime();
                const remoteUpdated = new Date(rt.updated_at || tourneyObj.updatedAt || tourneyObj.createdAt).getTime();
                if (remoteUpdated >= localUpdated) {
                  // P3-H3: preserve unsynced local work as a
                  // conflict branch before taking the remote.
                  if (await this.hasUnsyncedLocalChanges(local.id, local.syncStatus)) {
                    const branchId = await this.conflictBranchIdFor(db.tournaments, local.id);
                    const branch: Tournament = {
                      ...local,
                      id: branchId,
                      name: `${local.name} (Local Conflict)`,
                    };
                    (branch as { syncStatus?: string }).syncStatus = 'CONFLICT';
                    await db.tournaments.put(branch);
                  }
                  await db.tournaments.put(tourneyObj);
                }
              }
            }
          }
        } catch (supaPullErr) {
          console.warn('[SyncEngine] Supabase tournament pull notice:', supaPullErr);
        }
      }

      // 7. Pull grounds from Cloud Firestore
      if (session.provider === 'firebase' && checkFirebaseConfigured()) {
        try {
          const { collection, query: fsQuery, where: fsWhere, getDocs } = await import('firebase/firestore');
          const { firestore } = await import('../auth/firebase');
          const q = fsQuery(collection(firestore, 'grounds'), fsWhere('userId', '==', session.uid));
          const snap = await getDocs(q);
          for (const docSnap of snap.docs) {
            const remoteGround = docSnap.data() as CricketGround;
            if (!remoteGround?.id) continue;
            const local = await db.grounds.get(remoteGround.id);
            if (!local) {
              // D-4/D-7: never resurrect a deliberately deleted record.
              if (await this.shouldSuppressCloudRestore({
                deleteOperationType: 'DELETE_GROUND',
                entityId: remoteGround.id,
                remoteUpdatedAt: remoteGround.updatedAt || remoteGround.createdAt,
                clearedAtMs,
              })) continue;
              await db.grounds.put({ ...remoteGround, syncStatus: 'SYNCED' });
            } else {
              const localUpdated = new Date(local.updatedAt || local.createdAt).getTime();
              const remoteUpdated = new Date(remoteGround.updatedAt || remoteGround.createdAt).getTime();
              if (remoteUpdated >= localUpdated) {
                // P3-H3: preserve unsynced local work as a
                // conflict branch before taking the remote.
                if (await this.hasUnsyncedLocalChanges(local.id, local.syncStatus)) {
                  const branchId = await this.conflictBranchIdFor(db.grounds, local.id);
                  const branch: CricketGround = {
                    ...local,
                    id: branchId,
                    name: `${local.name} (Local Conflict)`,
                  };
                  // CricketGround's syncStatus union predates
                  // conflict branches; set 'CONFLICT' structurally
                  // (same note as tournaments above).
                  (branch as { syncStatus?: string }).syncStatus = 'CONFLICT';
                  await db.grounds.put(branch);
                }
                await db.grounds.put({ ...remoteGround, syncStatus: 'SYNCED' });
              }
            }
          }
        } catch (fsGroundPullErr) {
          console.warn('[SyncEngine] Firestore ground pull notice:', fsGroundPullErr);
        }
      }

      // 8. REMOVED (P3-L1): this section used to apply
      // lastActiveMatchId / theme / language from the remote
      // users document to local app_metadata and localStorage.
      // No code anywhere writes those fields to Firestore, so
      // the pull was dead code — and a hazard: if the fields
      // ever appeared in a user doc (older build, manual edit),
      // every sync would silently override this device's theme
      // and last-active-match pointer with the stale values.
      // Preferences are device-local by design; if cross-device
      // preference sync is ever wanted, it needs a writer side
      // and an explicit design, not a pull-only application.
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
      this.pendingRetryAfterMs = null;
      return;
    }

    let delay: number;
    if (this.pendingRetryAfterMs != null) {
      // P3-L4: honour the server's Retry-After exactly once.
      delay = this.pendingRetryAfterMs;
      this.pendingRetryAfterMs = null;
    } else {
      // Exponential backoff formula with jitter: min(maxDelay, baseDelay * 2^attempt) + jitter
      const exponential = Math.min(
        this.maxDelayMs,
        this.baseDelayMs * Math.pow(2, this.retryAttempt)
      );
      const jitter = Math.floor(Math.random() * 1000);
      delay = exponential + jitter;
    }

    this.retryAttempt++;

    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.syncNow();
    }, delay);
  }

  // ─── Conflict resolution (pick-a-version) ───────────────────
  // Pulls preserve a record with unsynced local work as a
  // CONFLICT branch copy instead of overwriting it (see
  // conflictBranchIdFor). These helpers surface the branches so
  // the user can pick which version wins. Both operations are
  // fully offline: keep-local only queues an UPSERT, which the
  // normal outbox drains when connectivity returns.

  /** Marker segment in every conflict-branch id. */
  private static readonly CONFLICT_BRANCH_MARKER = '_local_conflict_';
  /** Display suffix the pull adds to a branch copy's name/teamA. */
  private static readonly CONFLICT_NAME_SUFFIX = ' (Local Conflict)';

  private static conflictTable(
    entityType: SyncConflictEntityType
  ): Table<any, string> {
    switch (entityType) {
      case 'match':
        return db.matches;
      case 'team':
        return db.teams;
      case 'tournament':
        return db.tournaments;
      case 'ground':
        return db.grounds;
    }
  }

  private static conflictUpsertType(
    entityType: SyncConflictEntityType
  ): SyncQueueRecord['operationType'] {
    switch (entityType) {
      case 'match':
        return 'UPSERT_MATCH';
      case 'team':
        return 'UPSERT_TEAM';
      case 'tournament':
        return 'UPSERT_TOURNAMENT';
      case 'ground':
        return 'UPSERT_GROUND';
    }
  }

  /** Primary id of a conflict branch: everything before the marker. */
  private static primaryIdFromBranchId(branchId: string): string | null {
    const idx = branchId.lastIndexOf(this.CONFLICT_BRANCH_MARKER);
    if (idx <= 0) return null;
    return branchId.slice(0, idx);
  }

  private static stripConflictSuffix(value: string | undefined): string {
    const name = value ?? '';
    return name.endsWith(this.CONFLICT_NAME_SUFFIX)
      ? name.slice(0, -this.CONFLICT_NAME_SUFFIX.length)
      : name;
  }

  private static conflictDisplayName(
    entityType: SyncConflictEntityType,
    branch: any
  ): string {
    if (entityType === 'match') {
      const teamA = this.stripConflictSuffix(branch.teamA);
      return branch.teamB ? `${teamA} vs ${branch.teamB}` : teamA;
    }
    return this.stripConflictSuffix(branch.name);
  }

  /**
   * Every preserved conflict branch across all four entity
   * types, newest first — what the profile page's
   * SyncConflictsSection renders.
   */
  static async listConflicts(): Promise<SyncConflictItem[]> {
    const entityTypes: SyncConflictEntityType[] = [
      'match',
      'team',
      'tournament',
      'ground',
    ];
    const items: SyncConflictItem[] = [];
    for (const entityType of entityTypes) {
      let branches: any[] = [];
      try {
        branches = await this.conflictTable(entityType)
          .filter((record: any) => record?.syncStatus === 'CONFLICT')
          .toArray();
      } catch {
        branches = [];
      }
      for (const branch of branches) {
        const primaryId =
          typeof branch?.id === 'string'
            ? this.primaryIdFromBranchId(branch.id)
            : null;
        if (!primaryId) continue;
        items.push({
          branchId: branch.id,
          primaryId,
          entityType,
          name: this.conflictDisplayName(entityType, branch),
          updatedAt: branch.updatedAt ?? branch.createdAt ?? null,
        });
      }
    }
    items.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
    return items;
  }

  /**
   * Resolve one conflict branch.
   *
   *  - 'keep-local': the branch's content replaces the primary
   *    record (original id and name restored, syncStatus
   *    'PENDING', fresh updatedAt so the queued upsert and any
   *    later pull comparison treat it as the newest version),
   *    an UPSERT is queued for it, and the branch is deleted.
   *  - 'keep-remote': the primary already holds the cloud
   *    version that won the pull; only the branch is deleted.
   *
   * Returns false for an unknown branch id, a missing branch
   * record, or a write failure — never throws.
   */
  static async resolveConflict(
    branchId: string,
    entityType: SyncConflictEntityType,
    choice: SyncConflictChoice
  ): Promise<boolean> {
    const primaryId = this.primaryIdFromBranchId(branchId);
    if (!primaryId) return false;
    const table = this.conflictTable(entityType);
    try {
      const branch = await table.get(branchId);
      if (!branch) return false;

      if (choice === 'keep-remote') {
        await table.delete(branchId);
        await this.notifyListeners();
        return true;
      }

      const restored: any = {
        ...branch,
        id: primaryId,
        syncStatus: 'PENDING',
        updatedAt: new Date().toISOString(),
      };
      // D-1: a match branch may carry its own ball-by-ball log,
      // embedded by the pull when the conflict was created. It
      // is installed into match_events below — NOT persisted on
      // the restored record (locally stored scorecards never
      // carry an events field; the table is the log's home).
      let branchEvents: unknown[] | undefined;
      if (entityType === 'match') {
        restored.teamA = this.stripConflictSuffix(branch.teamA);
        restored.isConflictBranch = false;
        branchEvents = scorecardEvents(branch);
        delete restored.events;
      } else {
        restored.name = this.stripConflictSuffix(branch.name);
      }

      await db.transaction('rw', table, async () => {
        await table.put(restored);
        await table.delete(branchId);
      });

      if (entityType === 'match' && branchEvents && branchEvents.length > 0) {
        // Replace semantics with the same convergence guard as
        // the pull path: the branch's list becomes the primary's
        // complete history (remote events installed by the
        // conflicting pull are removed). Runs BEFORE the UPSERT
        // is queued below, so the op's execution-time event
        // gather can only ever read this restored log — the
        // scorecard and its ball-by-ball history are re-paired
        // atomically from the user's point of view.
        await this.applyRemoteMatchEvents(primaryId, branchEvents);
      }

      const operationType = this.conflictUpsertType(entityType);
      const queued = await this.queueMutation(operationType, restored, primaryId);
      if (!queued) {
        await this.recordQueueFailure(primaryId, operationType);
      }
      await this.notifyListeners();
      return true;
    } catch (err) {
      console.error('SyncEngine: Failed to resolve sync conflict', err);
      return false;
    }
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
