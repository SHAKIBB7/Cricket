/**
 * Shell route patterns (Capacitor Phase 1, static-export support).
 *
 * The five dynamic routes below are the only routes whose segment
 * values exist solely in the user's local database, so the static
 * export can only pre-render a placeholder shell for each of them
 * (segment `_`). These pure helpers describe those patterns and
 * recover a real segment from a URL path. They take their inputs
 * explicitly, never touch window/sessionStorage, and are
 * unit-tested directly (see shell-routes.test.ts).
 */

export interface DynamicRoutePattern {
  /** Segments before the dynamic segment, e.g. ['matches', 'score']. */
  prefixSegments: string[];
  /** Index of the dynamic segment within the split path. */
  segmentIndex: number;
  /** Next.js param name for the dynamic segment. */
  paramName: string;
  /** Placeholder path the export emits for this pattern. */
  placeholderPath: string;
}

export const SHELL_PLACEHOLDER_SEGMENT = '_';

export const DYNAMIC_ROUTE_PATTERNS: DynamicRoutePattern[] = [
  { prefixSegments: ['matches', 'score'], segmentIndex: 2, paramName: 'matchId', placeholderPath: '/matches/score/_/' },
  { prefixSegments: ['matches', 'center'], segmentIndex: 2, paramName: 'matchId', placeholderPath: '/matches/center/_/' },
  { prefixSegments: ['matches', 'summary'], segmentIndex: 2, paramName: 'matchId', placeholderPath: '/matches/summary/_/' },
  { prefixSegments: ['players'], segmentIndex: 1, paramName: 'playerKey', placeholderPath: '/players/_/' },
  { prefixSegments: ['tournaments'], segmentIndex: 1, paramName: 'id', placeholderPath: '/tournaments/_/' },
];

/** Splits a URL pathname into decoded, non-empty segments. */
export function splitPath(pathname: string): string[] {
  const clean = (pathname || '').split('?')[0].split('#')[0];
  return clean
    .split('/')
    .filter((s) => s.length > 0)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
}

/** The decoded segment at `segmentIndex` in `pathname`, if present. */
export function segmentFromPath(pathname: string, segmentIndex: number): string | undefined {
  const seg = splitPath(pathname)[segmentIndex];
  return seg && seg.length > 0 ? seg : undefined;
}

/**
 * True when both paths agree on every segment before
 * `segmentIndex` — i.e. they belong to the same dynamic route
 * pattern. Used so a stored redirect path is only consumed by the
 * placeholder page it was stored for.
 */
export function pathsShareRoutePrefix(a: string, b: string, segmentIndex: number): boolean {
  const sa = splitPath(a);
  const sb = splitPath(b);
  for (let i = 0; i < segmentIndex; i++) {
    if (sa[i] !== sb[i]) return false;
  }
  return true;
}

/** The dynamic pattern a pathname belongs to, or null. */
export function matchDynamicRoute(pathname: string): DynamicRoutePattern | null {
  const segments = splitPath(pathname);
  for (const pattern of DYNAMIC_ROUTE_PATTERNS) {
    if (segments.length <= pattern.segmentIndex) continue;
    let ok = true;
    for (let i = 0; i < pattern.segmentIndex; i++) {
      if (segments[i] !== pattern.prefixSegments[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return pattern;
  }
  return null;
}

/**
 * For a pathname on a dynamic pattern carrying a REAL segment,
 * the placeholder path to redirect to; otherwise null (static
 * paths, list pages, and placeholder paths themselves).
 */
export function placeholderPathForPath(pathname: string): string | null {
  const pattern = matchDynamicRoute(pathname);
  if (!pattern) return null;
  const segment = segmentFromPath(pathname, pattern.segmentIndex);
  if (!segment || segment === SHELL_PLACEHOLDER_SEGMENT) return null;
  return pattern.placeholderPath;
}
