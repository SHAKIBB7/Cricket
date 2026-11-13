/**
 * Capacitor Phase 1: pure path-parsing helpers behind the shell
 * param recovery hook and the 404 redirector. These pin the exact
 * segment math the frozen-param fix depends on.
 */
import { describe, it, expect } from 'vitest';
import {
  splitPath,
  segmentFromPath,
  pathsShareRoutePrefix,
  matchDynamicRoute,
  placeholderPathForPath,
} from '../lib/shellRoutes';

describe('shellRoutes.splitPath', () => {
  it('splits and drops empty segments (leading/trailing slashes)', () => {
    expect(splitPath('/matches/score/abc/')).toEqual(['matches', 'score', 'abc']);
    expect(splitPath('/')).toEqual([]);
    expect(splitPath('/tournaments')).toEqual(['tournaments']);
  });

  it('ignores query/hash and decodes segments', () => {
    expect(splitPath('/players/Taimur%20Khan/?x=1#y')).toEqual(['players', 'Taimur Khan']);
  });

  it('survives malformed percent-encoding', () => {
    expect(splitPath('/players/%E0%A4%A')).toEqual(['players', '%E0%A4%A']);
  });
});

describe('shellRoutes.segmentFromPath', () => {
  it('reads the dynamic segment at the route index', () => {
    expect(segmentFromPath('/matches/score/m-123/', 2)).toBe('m-123');
    expect(segmentFromPath('/matches/center/m-123', 2)).toBe('m-123');
    expect(segmentFromPath('/tournaments/cup-9/', 1)).toBe('cup-9');
    expect(segmentFromPath('/players/pl_abc/', 1)).toBe('pl_abc');
  });

  it('returns undefined when the segment is absent', () => {
    expect(segmentFromPath('/tournaments/', 1)).toBeUndefined();
    expect(segmentFromPath('/', 2)).toBeUndefined();
  });
});

describe('shellRoutes.matchDynamicRoute', () => {
  it('matches all five dynamic patterns', () => {
    expect(matchDynamicRoute('/matches/score/x/')?.paramName).toBe('matchId');
    expect(matchDynamicRoute('/matches/center/x/')?.paramName).toBe('matchId');
    expect(matchDynamicRoute('/matches/summary/x/')?.paramName).toBe('matchId');
    expect(matchDynamicRoute('/players/x/')?.paramName).toBe('playerKey');
    expect(matchDynamicRoute('/tournaments/x/')?.paramName).toBe('id');
  });

  it('does not match list or static routes', () => {
    expect(matchDynamicRoute('/tournaments/')).toBeNull();
    expect(matchDynamicRoute('/players/')).toBeNull();
    expect(matchDynamicRoute('/matches/history/')).toBeNull();
    expect(matchDynamicRoute('/matches/new/')).toBeNull();
    expect(matchDynamicRoute('/')).toBeNull();
  });
});

describe('shellRoutes.placeholderPathForPath', () => {
  it('maps a real dynamic path to its placeholder shell', () => {
    expect(placeholderPathForPath('/matches/score/m-1/')).toBe('/matches/score/_/');
    expect(placeholderPathForPath('/matches/center/m-1/')).toBe('/matches/center/_/');
    expect(placeholderPathForPath('/matches/summary/m-1/')).toBe('/matches/summary/_/');
    expect(placeholderPathForPath('/players/Some%20One/')).toBe('/players/_/');
    expect(placeholderPathForPath('/tournaments/cup-1/')).toBe('/tournaments/_/');
  });

  it('never redirects a placeholder path (loop guard) or a non-dynamic path', () => {
    expect(placeholderPathForPath('/matches/score/_/')).toBeNull();
    expect(placeholderPathForPath('/tournaments/_/')).toBeNull();
    expect(placeholderPathForPath('/teams/')).toBeNull();
    expect(placeholderPathForPath('/nope/nothing/')).toBeNull();
  });
});

describe('shellRoutes.pathsShareRoutePrefix', () => {
  it('accepts the stored path for its own placeholder page only', () => {
    expect(pathsShareRoutePrefix('/tournaments/cup-1/', '/tournaments/_/', 1)).toBe(true);
    expect(pathsShareRoutePrefix('/matches/score/m-1/', '/matches/score/_/', 2)).toBe(true);
    expect(pathsShareRoutePrefix('/tournaments/cup-1/', '/players/_/', 1)).toBe(false);
    expect(pathsShareRoutePrefix('/matches/center/m-1/', '/matches/score/_/', 2)).toBe(false);
  });
});
