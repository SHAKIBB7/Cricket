/**
 * Navigation direction detection for the page-transition system.
 *
 * Pure classification + a tiny module-level "tab signal" channel +
 * a stateful tracker used by PageTransition.
 *
 * The signal channel exists because bottom-nav taps and content
 * swipes know the intended tab delta *before* the router changes
 * the pathname; the tracker consumes the pending signal on the
 * next pathname observation and trusts it over stack heuristics.
 *
 * The stack heuristic is exact-match only: a navigation is a "pop"
 * when the destination is precisely the entry under the current
 * top of the observed stack. Browser forward-after-back and other
 * exotic sequences classify as "push" — acceptable, because the
 * motion difference is subtle and correctness (no lost pages, no
 * wrong-direction jank on the common paths) matters more.
 */

/** Primary bottom-nav tabs, in bar order (mirrors Navigation.tsx). */
export const PRIMARY_TABS = [
  '/',
  '/matches/new',
  '/matches/history',
  '/tournaments',
  '/teams',
] as const;

export type NavTransitionKind = 'push' | 'pop' | 'tab' | 'fade' | 'none';

export interface NavTransitionInfo {
  kind: NavTransitionKind;
  /** Tab index delta for kind='tab' (+ right, - left); +1 push, -1 pop, 0 otherwise. */
  delta: number;
}

// --- Pending tab signal -------------------------------------------------

let pendingTabDelta: number | null = null;

/** Called immediately before initiating a tab switch (tap or swipe). */
export function signalTabNavigation(delta: number): void {
  pendingTabDelta = delta;
}

/** Reads and clears the pending tab signal. Returns null when none. */
export function consumeTabSignal(): number | null {
  const delta = pendingTabDelta;
  pendingTabDelta = null;
  return delta;
}

// --- Pure classification --------------------------------------------------

/**
 * Classify a navigation from `from` to `to`, given the observed
 * visit stack (oldest first, current path last).
 *
 * Rules, in order:
 *  a. Same path -> 'none'.
 *  b. Either side is a live scoring route -> 'fade' (the score page
 *     must never slide: two engine instances must never coexist).
 *  c. Both paths are primary tabs -> 'tab' with index delta.
 *  d. Stack top is `from` and the entry below it is `to` -> 'pop'.
 *  e. Everything else -> 'push'.
 */
export function classifyNavigation(
  from: string,
  to: string,
  stack: readonly string[],
): NavTransitionInfo {
  if (from === to) {
    return { kind: 'none', delta: 0 };
  }
  if (from.startsWith('/matches/score') || to.startsWith('/matches/score')) {
    return { kind: 'fade', delta: 0 };
  }
  const fromTab = (PRIMARY_TABS as readonly string[]).indexOf(from);
  const toTab = (PRIMARY_TABS as readonly string[]).indexOf(to);
  if (fromTab !== -1 && toTab !== -1) {
    return { kind: 'tab', delta: toTab - fromTab };
  }
  if (
    stack.length >= 2 &&
    stack[stack.length - 1] === from &&
    stack[stack.length - 2] === to
  ) {
    return { kind: 'pop', delta: -1 };
  }
  return { kind: 'push', delta: 1 };
}

// --- Stateful tracker -----------------------------------------------------

export interface NavTracker {
  /**
   * Observe a pathname (the first call seeds the tracker and
   * returns 'none'). Maintains the visit stack: forward kinds push,
   * 'pop' removes the entry that was navigated away from, so the
   * stack top always equals the last observed pathname.
   */
  observe(pathname: string): NavTransitionInfo;
}

export function createNavTracker(): NavTracker {
  const stack: string[] = [];
  let current: string | null = null;
  // The classification of the most recent observation. Repeated
  // observations of the same pathname (a discarded concurrent
  // render re-running the caller's render-phase update) must
  // return THIS, not a fresh 'none' — otherwise an interrupted
  // render can erase a pop/push that was already computed.
  let lastInfo: NavTransitionInfo = { kind: 'none', delta: 0 };

  return {
    observe(pathname: string): NavTransitionInfo {
      if (current === null) {
        current = pathname;
        stack.push(pathname);
        consumeTabSignal(); // never carry a stale signal past seeding
        lastInfo = { kind: 'none', delta: 0 };
        return lastInfo;
      }

      if (pathname === current) {
        consumeTabSignal();
        return lastInfo;
      }

      const from = current;
      const signaled = consumeTabSignal();
      let info: NavTransitionInfo;
      if (
        signaled !== null &&
        (PRIMARY_TABS as readonly string[]).includes(pathname)
      ) {
        info = { kind: 'tab', delta: signaled };
      } else {
        info = classifyNavigation(from, pathname, stack);
      }

      if (info.kind === 'pop') {
        stack.pop();
        // Defensive: after a pop the top must be the destination.
        if (stack[stack.length - 1] !== pathname) {
          stack.push(pathname);
        }
      } else if (info.kind !== 'none') {
        stack.push(pathname);
      }

      current = pathname;
      lastInfo = info;
      return info;
    },
  };
}
