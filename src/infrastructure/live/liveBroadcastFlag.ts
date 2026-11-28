/**
 * Per-match "broadcast live" preference, stored on the scoring device
 * only. Kept out of the match record itself: the flag is a device-level
 * choice (this phone publishes), not match data, and it must survive
 * scorecard rewrites/sync unchanged. Client-only — call from effects
 * and handlers, never during render.
 */

// Bug hunt 2026-11-26 D-M3: the flag is scoped to the signed-in
// user, not just the device. The old per-device key let user B,
// signing in on a shared phone, auto-publish user A's flagged match
// under B's uid. Calls without a uid (signed out) never read or set
// a flag: broadcasting requires a signed-in owner anyway.
const keyFor = (matchId: string, uid: string): string => `csp:liveBroadcast:${uid}:${matchId}`;

export function getLiveBroadcastFlag(matchId: string, uid: string | null | undefined): boolean {
  if (!uid) return false;
  try {
    return window.localStorage.getItem(keyFor(matchId, uid)) === '1';
  } catch {
    return false;
  }
}

export function setLiveBroadcastFlag(
  matchId: string,
  on: boolean,
  uid: string | null | undefined,
): void {
  if (!uid) return;
  try {
    if (on) window.localStorage.setItem(keyFor(matchId, uid), '1');
    else window.localStorage.removeItem(keyFor(matchId, uid));
  } catch {
    // Storage unavailable (private mode / quota): the broadcast simply
    // will not auto-resume next visit; the in-memory state still works.
  }
}

/** Remove every broadcast flag for one match, any user (match deleted). */
export function clearLiveBroadcastFlagsForMatch(matchId: string): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith('csp:liveBroadcast:') && k.endsWith(`:${matchId}`)) doomed.push(k);
    }
    for (const k of doomed) window.localStorage.removeItem(k);
  } catch {
    // Storage unavailable: nothing to clear.
  }
}

/** Remove every broadcast flag on this device (Clear Database). */
export function clearAllLiveBroadcastFlags(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith('csp:liveBroadcast:')) doomed.push(k);
    }
    for (const k of doomed) window.localStorage.removeItem(k);
  } catch {
    // Storage unavailable: nothing to clear.
  }
}
