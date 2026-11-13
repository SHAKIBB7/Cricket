'use client';

/**
 * useShellRouteParam (Capacitor Phase 1) — frozen-param recovery.
 *
 * On the normal web build every dynamic page receives its real id
 * from useParams() and this hook returns it untouched: a complete
 * behavioural no-op.
 *
 * Inside the Capacitor static export, a placeholder shell (segment
 * `_`) is what actually mounts for any real id — the param baked
 * into the shell's flight data is frozen to `_`. The real id then
 * only exists in the URL the user actually requested, so after
 * mount this hook recovers it from:
 *   (a) sessionStorage 'csp:redirect-path' — the full path the 404
 *       redirector stored just before replacing the location with
 *       the placeholder path (consumed on use, and only when it
 *       belongs to this same route pattern), else
 *   (b) window.location.pathname at the route's segment index
 *       (pattern-fallback serving, where the real path survives).
 *
 * Hydration safety: the initial value derives ONLY from
 * useParams() (identical on server and first client render); all
 * recovery happens inside useEffect. While the param is a
 * placeholder and not yet recovered the hook returns undefined,
 * so the pages' existing `if (!id) return` guards keep them on
 * their loading/skeleton states instead of flashing not-found.
 *
 * The next/navigation access follows the defensive namespace
 * pattern of useSmartNavigation: some test mocks provide only a
 * subset of the module, and a missing hook must degrade to the
 * direct param rather than throw.
 */
import { useEffect, useState } from 'react';
import * as NextNav from 'next/navigation';
import {
  SHELL_PLACEHOLDER_SEGMENT,
  pathsShareRoutePrefix,
  segmentFromPath,
} from './shellRoutes';

export const REDIRECT_PATH_STORAGE_KEY = 'csp:redirect-path';

export function useShellRouteParam(paramName: string, segmentIndex: number): string | undefined {
  let params: Record<string, string | string[]> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- called unconditionally on every render, in the same order; the guard only covers partial test mocks
    params = typeof NextNav.useParams === 'function' ? NextNav.useParams() : null;
  } catch {
    params = null;
  }
  let pathname: string | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- same unconditional-call pattern as useParams above
    pathname = typeof NextNav.usePathname === 'function' ? NextNav.usePathname() : null;
  } catch {
    pathname = null;
  }

  const raw = params ? params[paramName] : undefined;
  const direct = Array.isArray(raw) ? raw[0] : raw;
  const isPlaceholder = !direct || direct === SHELL_PLACEHOLDER_SEGMENT;
  const [recovered, setRecovered] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!isPlaceholder) return;
    let candidate: string | undefined;
    try {
      const stored = window.sessionStorage.getItem(REDIRECT_PATH_STORAGE_KEY);
      if (stored && pathsShareRoutePrefix(stored, window.location.pathname, segmentIndex)) {
        const seg = segmentFromPath(stored, segmentIndex);
        if (seg && seg !== SHELL_PLACEHOLDER_SEGMENT) {
          candidate = seg;
          // Consume it: a stale stored path must never leak into a
          // later navigation to a different record of the same type.
          window.sessionStorage.removeItem(REDIRECT_PATH_STORAGE_KEY);
        }
      }
    } catch {
      // sessionStorage can throw in hardened WebViews — the
      // pathname fallback below still applies.
    }
    if (!candidate) {
      const seg = segmentFromPath(window.location.pathname, segmentIndex);
      if (seg && seg !== SHELL_PLACEHOLDER_SEGMENT) candidate = seg;
    }
    if (candidate) setRecovered(candidate);
    // `pathname` is a dependency so a client-side navigation to a
    // different record (same frozen placeholder param) re-recovers.
  }, [isPlaceholder, segmentIndex, pathname]);

  if (!isPlaceholder) return direct;
  return recovered;
}
