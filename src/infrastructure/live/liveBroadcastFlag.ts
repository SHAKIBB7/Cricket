/**
 * Per-match "broadcast live" preference, stored on the scoring device
 * only. Kept out of the match record itself: the flag is a device-level
 * choice (this phone publishes), not match data, and it must survive
 * scorecard rewrites/sync unchanged. Client-only — call from effects
 * and handlers, never during render.
 */

const keyFor = (matchId: string): string => `csp:liveBroadcast:${matchId}`;

export function getLiveBroadcastFlag(matchId: string): boolean {
  try {
    return window.localStorage.getItem(keyFor(matchId)) === '1';
  } catch {
    return false;
  }
}

export function setLiveBroadcastFlag(matchId: string, on: boolean): void {
  try {
    if (on) window.localStorage.setItem(keyFor(matchId), '1');
    else window.localStorage.removeItem(keyFor(matchId));
  } catch {
    // Storage unavailable (private mode / quota): the broadcast simply
    // will not auto-resume next visit; the in-memory state still works.
  }
}
