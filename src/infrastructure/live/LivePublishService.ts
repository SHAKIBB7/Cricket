/**
 * LivePublishService — publishes public live-match snapshots to
 * Firestore `live_matches/{matchId}` (Live Spectating, 2026-11-25).
 *
 * Design constraints:
 * - Scoring must NEVER block or fail because of publishing: every entry
 *   point is fire-and-forget, all errors are swallowed after recording
 *   the snapshot as pending.
 * - Ball events arrive in bursts (and persistState can be called many
 *   times per second during edits), so writes are throttled per match:
 *   leading edge immediate, then at most one write per MIN_INTERVAL_MS
 *   with a trailing send of the latest snapshot.
 * - Offline is normal at a cricket ground: a failed write keeps the
 *   latest snapshot pending and retries on the next publish call and
 *   on the browser 'online' event.
 * - When Firebase is not configured the service is a complete no-op.
 *
 * Bug hunt 2026-11-26 hardening (D-H2, D-H3, D-L1, D-L2, D-M3):
 * - A failed write no longer reschedules with a 0 ms wait: retries use
 *   exponential backoff (2s → 60s) and park after MAX_FAILURES
 *   consecutive failures until a fresh publish call or an 'online'
 *   event re-arms them. The old code derived the wait from a
 *   lastSentAt that only advanced on success, so any persistent
 *   rejection (e.g. rules not yet deployed) spun a tight loop for the
 *   whole session.
 * - A cleanly-sent entry is evicted from the pending map; the 'online'
 *   hook only re-flushes entries that actually hold unsent changes.
 * - Unpublish deletes are no longer best-effort: a failed delete is
 *   recorded in a localStorage-backed queue and retried on later app
 *   activity (publish calls, 'online' events, service init), so a
 *   deleted match does not stay public just because the scorer was
 *   offline when they deleted it.
 * - A completed snapshot schedules its own removal
 *   (COMPLETED_RETAIN_MS later) through the same queue, so finished
 *   matches do not accumulate as public documents forever.
 * - clearLivePublishState() drops all pending snapshots and timers;
 *   AuthContext calls it on sign-out so a previous user's queued
 *   snapshots cannot keep retrying under a dead session.
 */

import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { checkFirebaseConfigured, firestore } from '../auth/firebase';
import type { LiveMatchDocument, LiveMatchSnapshot } from '@/domain/live/types';

const COLLECTION = 'live_matches';
const MIN_INTERVAL_MS = 1500;
const MAX_FAILURES = 6;
const BACKOFF_BASE_MS = 2000;
const BACKOFF_MAX_MS = 60_000;
const COMPLETED_RETAIN_MS = 30 * 60 * 1000;
const PENDING_DELETES_KEY = 'csp:livePendingDeletes';

interface PendingEntry {
  ownerUid: string;
  snapshot: LiveMatchSnapshot;
  lastSentAt: number;
  failures: number;
  dirty: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
}

interface PendingDelete {
  matchId: string;
  /** Epoch ms before which the delete should not be attempted yet. */
  notBefore: number;
}

const pending = new Map<string, PendingEntry>();
/** Throttle memory that survives entry eviction. */
const lastSentByMatch = new Map<string, number>();
let onlineHookInstalled = false;

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function backoffMs(failures: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, failures - 1));
}

function ensureOnlineHook(): void {
  if (onlineHookInstalled || typeof window === 'undefined') return;
  onlineHookInstalled = true;
  window.addEventListener('online', () => {
    // Only entries holding unsent changes are re-flushed (D-L2);
    // a fresh connectivity event also re-arms parked retries.
    for (const [matchId, entry] of pending) {
      if (!entry.dirty) continue;
      entry.failures = 0;
      void flushLiveMatch(matchId);
    }
    drainPendingLiveDeletes();
  });
}

// ---------------------------------------------------------------------------
// Persistent pending-delete queue (D-H3 / D-L1)
// ---------------------------------------------------------------------------

function readPendingDeletes(): PendingDelete[] {
  try {
    const raw = window.localStorage.getItem(PENDING_DELETES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingDelete[];
    return Array.isArray(parsed) ? parsed.filter((d) => d && typeof d.matchId === 'string') : [];
  } catch {
    return [];
  }
}

function writePendingDeletes(list: PendingDelete[]): void {
  try {
    if (list.length === 0) window.localStorage.removeItem(PENDING_DELETES_KEY);
    else window.localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify(list));
  } catch {
    // Storage unavailable: deletes fall back to best-effort in-memory.
  }
}

function queuePendingDelete(matchId: string, notBefore: number): void {
  if (typeof window === 'undefined') return;
  const list = readPendingDeletes().filter((d) => d.matchId !== matchId);
  list.push({ matchId, notBefore });
  writePendingDeletes(list);
}

function drainPendingLiveDeletes(): void {
  if (typeof window === 'undefined' || !checkFirebaseConfigured() || isOffline()) return;
  const now = Date.now();
  const due = readPendingDeletes().filter((d) => d.notBefore <= now);
  for (const d of due) {
    void (async () => {
      try {
        await deleteDoc(doc(firestore, COLLECTION, d.matchId));
        writePendingDeletes(readPendingDeletes().filter((x) => x.matchId !== d.matchId));
      } catch {
        // Still failing (offline / signed out): stays queued for the
        // next drain trigger.
      }
    })();
  }
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

async function writeNow(matchId: string, entry: PendingEntry): Promise<boolean> {
  const document: LiveMatchDocument = {
    ...entry.snapshot,
    ownerUid: entry.ownerUid,
    updatedAtMs: Date.now(),
  };
  try {
    await setDoc(doc(firestore, COLLECTION, matchId), document);
    entry.lastSentAt = Date.now();
    lastSentByMatch.set(matchId, entry.lastSentAt);
    return true;
  } catch {
    // Offline / rules / transient — stay pending for the next trigger.
    return false;
  }
}

function scheduleTimer(matchId: string, entry: PendingEntry, waitMs: number): void {
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    entry.timer = null;
    void flushLiveMatch(matchId);
  }, Math.max(0, waitMs));
}

function scheduleTrailing(matchId: string, entry: PendingEntry): void {
  if (entry.timer) return;
  const last = Math.max(entry.lastSentAt, lastSentByMatch.get(matchId) ?? 0);
  scheduleTimer(matchId, entry, MIN_INTERVAL_MS - (Date.now() - last));
}

/** Queue a snapshot for publishing (throttled). Never throws. */
export function publishLiveMatch(ownerUid: string, snapshot: LiveMatchSnapshot): void {
  if (!checkFirebaseConfigured()) return;
  ensureOnlineHook();
  drainPendingLiveDeletes();
  const matchId = snapshot.matchId;
  let entry = pending.get(matchId);
  if (!entry) {
    entry = {
      ownerUid,
      snapshot,
      lastSentAt: lastSentByMatch.get(matchId) ?? 0,
      failures: 0,
      dirty: true,
      timer: null,
      inFlight: false,
    };
    pending.set(matchId, entry);
  } else {
    entry.ownerUid = ownerUid;
    entry.snapshot = snapshot;
    entry.dirty = true;
    // A fresh scoring action re-arms a parked retry loop (D-H2).
    entry.failures = 0;
  }
  if (entry.inFlight) return;
  if (Date.now() - entry.lastSentAt >= MIN_INTERVAL_MS) {
    void flushLiveMatch(matchId);
  } else {
    scheduleTrailing(matchId, entry);
  }
}

/** Send the latest pending snapshot for a match immediately. */
export async function flushLiveMatch(matchId: string): Promise<void> {
  const entry = pending.get(matchId);
  if (!entry || entry.inFlight || !checkFirebaseConfigured()) return;
  if (isOffline()) {
    // Don't burn retry attempts while known-offline; the 'online'
    // hook re-flushes dirty entries when connectivity returns.
    return;
  }
  entry.inFlight = true;
  const sentSnapshot = entry.snapshot;
  const ok = await writeNow(matchId, entry);
  entry.inFlight = false;
  if (!ok) {
    entry.failures += 1;
    if (entry.failures >= MAX_FAILURES) {
      // Park: wait for the next publish call or 'online' event
      // instead of spinning against a persistent rejection (D-H2).
      if (entry.timer) {
        clearTimeout(entry.timer);
        entry.timer = null;
      }
      return;
    }
    scheduleTimer(matchId, entry, backoffMs(entry.failures));
    return;
  }
  entry.failures = 0;
  if (entry.snapshot !== sentSnapshot) {
    // A newer snapshot arrived while writing — trail it.
    scheduleTrailing(matchId, entry);
    return;
  }
  // Clean send with nothing newer pending: evict (D-L2). The
  // throttle timestamp survives in lastSentByMatch.
  if (entry.timer) clearTimeout(entry.timer);
  pending.delete(matchId);
  if (sentSnapshot.status === 'completed') {
    // D-L1: a finished match stays viewable briefly, then removes
    // itself through the persistent delete queue.
    queuePendingDelete(matchId, Date.now() + COMPLETED_RETAIN_MS);
  }
}

/** Stop broadcasting: drop pending state and delete the public doc. */
export async function unpublishLiveMatch(matchId: string): Promise<void> {
  const entry = pending.get(matchId);
  if (entry?.timer) clearTimeout(entry.timer);
  pending.delete(matchId);
  if (!checkFirebaseConfigured()) return;
  try {
    await deleteDoc(doc(firestore, COLLECTION, matchId));
    // A stale queued delete for this match (e.g. the completion
    // retention entry) is now moot — drop it.
    if (typeof window !== 'undefined') {
      writePendingDeletes(readPendingDeletes().filter((d) => d.matchId !== matchId));
    }
  } catch {
    // D-H3: not best-effort any more — queue the delete so a later
    // session/activity retries it instead of leaving the doc public.
    queuePendingDelete(matchId, 0);
  }
}

/**
 * Drop every pending snapshot and timer (sign-out / account switch,
 * D-M3). Queued snapshots carry the previous user's uid and must not
 * keep retrying under a dead or different session. The persistent
 * delete queue is intentionally kept: those deletes are still wanted
 * and will drain on the next signed-in activity.
 */
export function clearLivePublishState(): void {
  for (const entry of pending.values()) {
    if (entry.timer) clearTimeout(entry.timer);
  }
  pending.clear();
}
