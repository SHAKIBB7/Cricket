import { describe, it, expect } from 'vitest';
import {
  PRIMARY_TABS,
  classifyNavigation,
  createNavTracker,
  signalTabNavigation,
  consumeTabSignal,
} from '../lib/navigation-direction';

describe('navigation-direction — classifyNavigation', () => {
  it('exposes the primary tabs in bottom-bar order', () => {
    expect(PRIMARY_TABS).toEqual([
      '/',
      '/matches/new',
      '/matches/history',
      '/tournaments',
      '/teams',
    ]);
  });

  it('classifies same-path as none', () => {
    expect(classifyNavigation('/teams', '/teams', ['/teams'])).toEqual({
      kind: 'none',
      delta: 0,
    });
  });

  it('classifies tab-to-tab with signed index delta', () => {
    expect(classifyNavigation('/', '/teams', ['/'])).toEqual({
      kind: 'tab',
      delta: 4,
    });
    expect(classifyNavigation('/teams', '/', ['/teams'])).toEqual({
      kind: 'tab',
      delta: -4,
    });
    expect(
      classifyNavigation('/matches/history', '/tournaments', []),
    ).toEqual({ kind: 'tab', delta: 1 });
  });

  it('classifies any crossing of a scoring route as fade', () => {
    expect(classifyNavigation('/', '/matches/score/m1', ['/'])).toEqual({
      kind: 'fade',
      delta: 0,
    });
    expect(
      classifyNavigation('/matches/score/m1', '/matches/history', [
        '/',
        '/matches/score/m1',
      ]),
    ).toEqual({ kind: 'fade', delta: 0 });
    // Score rule outranks the tab rule.
    expect(
      classifyNavigation('/matches/score/m1', '/tournaments', []),
    ).toEqual({ kind: 'fade', delta: 0 });
  });

  it('classifies an exact stack reversal as pop', () => {
    const stack = ['/', '/tournaments', '/tournaments/abc'];
    expect(classifyNavigation('/tournaments/abc', '/tournaments', stack)).toEqual({
      kind: 'pop',
      delta: -1,
    });
  });

  it('classifies detail pushes and non-exact reversals as push', () => {
    expect(classifyNavigation('/', '/profile', ['/'])).toEqual({
      kind: 'push',
      delta: 1,
    });
    // Forward-after-back: destination is in the stack but not in the
    // exact top-2 pattern -> push (documented heuristic limit).
    expect(
      classifyNavigation('/profile', '/tournaments/abc', [
        '/',
        '/tournaments',
        '/profile',
      ]),
    ).toEqual({ kind: 'push', delta: 1 });
  });
});

describe('navigation-direction — tab signal channel', () => {
  it('delivers a signal exactly once', () => {
    signalTabNavigation(2);
    expect(consumeTabSignal()).toBe(2);
    expect(consumeTabSignal()).toBeNull();
  });
});

describe('navigation-direction — tracker', () => {
  it('seeds on first observe and ignores repeat pathnames', () => {
    const tracker = createNavTracker();
    expect(tracker.observe('/')).toEqual({ kind: 'none', delta: 0 });
    expect(tracker.observe('/')).toEqual({ kind: 'none', delta: 0 });
  });

  it('tracks a forward-then-back sequence as push then pop', () => {
    const tracker = createNavTracker();
    tracker.observe('/');
    expect(tracker.observe('/profile')).toEqual({ kind: 'push', delta: 1 });
    expect(tracker.observe('/')).toEqual({ kind: 'pop', delta: -1 });
    // After the pop, going forward again is a fresh push.
    expect(tracker.observe('/profile')).toEqual({ kind: 'push', delta: 1 });
  });

  it('tracks a deep-link back chain one level at a time', () => {
    const tracker = createNavTracker();
    tracker.observe('/');
    expect(tracker.observe('/tournaments')).toEqual({ kind: 'tab', delta: 3 });
    expect(tracker.observe('/tournaments/abc')).toEqual({
      kind: 'push',
      delta: 1,
    });
    expect(tracker.observe('/tournaments')).toEqual({ kind: 'pop', delta: -1 });
    expect(tracker.observe('/')).toEqual({ kind: 'tab', delta: -3 });
  });

  it('fades crossings of the scoring route', () => {
    const tracker = createNavTracker();
    tracker.observe('/matches/history');
    expect(tracker.observe('/matches/score/m1')).toEqual({
      kind: 'fade',
      delta: 0,
    });
    expect(tracker.observe('/matches/history')).toEqual({
      kind: 'fade',
      delta: 0,
    });
  });

  it('lets a pending tab signal win over stack classification, once', () => {
    const tracker = createNavTracker();
    tracker.observe('/');
    signalTabNavigation(-2);
    // classifyNavigation alone would call this tab +4; the signal wins.
    expect(tracker.observe('/teams')).toEqual({ kind: 'tab', delta: -2 });
    // Signal consumed: the next tab move classifies normally.
    expect(tracker.observe('/tournaments')).toEqual({
      kind: 'tab',
      delta: -1,
    });
  });

  it('ignores a pending signal when the destination is not a tab', () => {
    const tracker = createNavTracker();
    tracker.observe('/');
    signalTabNavigation(1);
    expect(tracker.observe('/profile')).toEqual({ kind: 'push', delta: 1 });
    expect(consumeTabSignal()).toBeNull();
  });
});
