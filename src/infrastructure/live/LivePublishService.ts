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
 */

import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { checkFirebaseConfigured, firestore } from '../auth/firebase';
import type { LiveMatchDocument, LiveMatchSnapshot } from '@/domain/live/types';

const COLLECTION = 'live_matches';
const MIN_INTERVAL_MS = 1500;

interface PendingEntry {
  ownerUid: string;
  snapshot: LiveMatchSnapshot;
  lastSentAt: number;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
}

const pending = new Map<string, PendingEntry>();
let onlineHookInstalled = false;

function ensureOnlineHook(): void {
  if (onlineHookInstalled || typeof window === 'undefined') return;
  onlineHookInstalled = true;
  window.addEventListener('online', () => {
    for (const matchId of pending.keys()) void flushLiveMatch(matchId);
  });
}

async function writeNow(matchId: string, entry: PendingEntry): Promise<boolean> {
  const document: LiveMatchDocument = {
    ...entry.snapshot,
    ownerUid: entry.ownerUid,
    updatedAtMs: Date.now(),
  };
  try {
    await setDoc(doc(firestore, COLLECTION, matchId), document);
    entry.lastSentAt = Date.now();
    return true;
  } catch {
    // Offline / rules / transient — stay pending for the next trigger.
    return false;
  }
}

function scheduleTrailing(matchId: string, entry: PendingEntry): void {
  if (entry.timer) return;
  const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - entry.lastSentAt));
  entry.timer = setTimeout(() => {
    entry.timer = null;
    void flushLiveMatch(matchId);
  }, wait);
}

/** Queue a snapshot for publishing (throttled). Never throws. */
export function publishLiveMatch(ownerUid: string, snapshot: LiveMatchSnapshot): void {
  if (!checkFirebaseConfigured()) return;
  ensureOnlineHook();
  const matchId = snapshot.matchId;
  let entry = pending.get(matchId);
  if (!entry) {
    entry = { ownerUid, snapshot, lastSentAt: 0, timer: null, inFlight: false };
    pending.set(matchId, entry);
  } else {
    entry.ownerUid = ownerUid;
    entry.snapshot = snapshot;
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
  entry.inFlight = true;
  const sentSnapshot = entry.snapshot;
  const ok = await writeNow(matchId, entry);
  entry.inFlight = false;
  if (!ok) {
    scheduleTrailing(matchId, entry);
    return;
  }
  // A newer snapshot arrived while writing — trail it.
  if (entry.snapshot !== sentSnapshot) scheduleTrailing(matchId, entry);
}

/** Stop broadcasting: drop pending state and delete the public doc. */
export async function unpublishLiveMatch(matchId: string): Promise<void> {
  const entry = pending.get(matchId);
  if (entry?.timer) clearTimeout(entry.timer);
  pending.delete(matchId);
  if (!checkFirebaseConfigured()) return;
  try {
    await deleteDoc(doc(firestore, COLLECTION, matchId));
  } catch {
    // Best effort: if the delete fails (offline), the doc goes stale
    // and viewers' lists age it out by updatedAtMs.
  }
}
