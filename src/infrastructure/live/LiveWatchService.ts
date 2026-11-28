/**
 * LiveWatchService — viewer-side realtime subscriptions for Live
 * Spectating (2026-11-25). Public read: no sign-in required (the
 * firestore.rules allow read on live_matches to everyone).
 *
 * The live list query filters on the single field `status` only, so
 * it needs no composite index; ordering by updatedAtMs happens
 * client-side (live-match counts are small by design).
 *
 * When Firebase is not configured, subscribers immediately receive
 * the empty state and a no-op unsubscribe.
 */

import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';
import { checkFirebaseConfigured, firestore } from '../auth/firebase';
import type { LiveMatchDocument } from '@/domain/live/types';

const COLLECTION = 'live_matches';

/** A 'live' doc whose scorer has vanished (app closed, phone died)
 * stops counting as live after this long without an update. Shared
 * by the Home list and the broadcast page (bug hunt 2026-11-26
 * D-M2 / P-F3). */
export const LIVE_STALE_AFTER_MS = 6 * 60 * 60 * 1000;

export function subscribeLiveMatches(
  onData: (docs: LiveMatchDocument[]) => void,
): () => void {
  if (!checkFirebaseConfigured()) {
    onData([]);
    return () => {};
  }
  const q = query(collection(firestore, COLLECTION), where('status', '==', 'live'), limit(50));
  return onSnapshot(
    q,
    (snap) => {
      // Bug hunt 2026-11-26 D-M1 (client side): a forged updatedAtMs
      // in the future would otherwise pin a fake doc atop the sorted
      // list and defeat every staleness age-out (now - future < 0).
      // Clamp to the viewer's clock on the way in.
      const now = Date.now();
      const docs = snap.docs.map((d) => {
        const data = d.data() as LiveMatchDocument;
        return { ...data, updatedAtMs: Math.min(data.updatedAtMs ?? 0, now) };
      });
      docs.sort((a, b) => (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0));
      onData(docs);
    },
    () => onData([]),
  );
}

export function subscribeLiveMatch(
  matchId: string,
  onData: (docData: LiveMatchDocument | null) => void,
): () => void {
  if (!checkFirebaseConfigured()) {
    onData(null);
    return () => {};
  }
  return onSnapshot(
    doc(firestore, COLLECTION, matchId),
    (snap) => onData(snap.exists() ? (snap.data() as LiveMatchDocument) : null),
    () => onData(null),
  );
}
