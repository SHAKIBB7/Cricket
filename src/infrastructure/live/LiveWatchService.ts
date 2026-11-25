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
      const docs = snap.docs.map((d) => d.data() as LiveMatchDocument);
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
