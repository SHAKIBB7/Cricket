// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  REVEAL_CHILD_VARIANTS,
  REVEAL_MAX_STAGGER_INDEX,
  REVEAL_PARENT_VARIANTS,
  REVEAL_STAGGER_SECONDS,
  EASINGS,
} from '../lib/animations';
import { useLoadReveal, type LoadReveal } from '../hooks/useLoadReveal';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Motion system (TAIMUR, 2026-11-11) — the reveal gatekeeper.
 *
 * useLoadReveal contract under test:
 * - fast load (< 150ms): no skeleton, no reveal, ever;
 * - slow load: skeleton at 150ms; reveal never before mount+290ms
 *   (data at 200ms -> skeleton holds, reveal flips at 290ms);
 * - one-shot: a second load cycle never re-shows the skeleton or
 *   re-fires the reveal.
 */

interface Harness {
  snapshots: LoadReveal[];
  setLoading: (v: boolean) => void;
  unmount: () => void;
}

function mountHarness(initialLoading: boolean): Harness {
  const snapshots: LoadReveal[] = [];
  let setLoadingFn: (v: boolean) => void = () => {};

  function Probe() {
    const [loading, setLoading] = React.useState(initialLoading);
    setLoadingFn = setLoading;
    const state = useLoadReveal(loading);
    snapshots.push({ ...state });
    return null;
  }

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(<Probe />);
  });

  return {
    snapshots,
    setLoading: (v: boolean) => {
      act(() => {
        setLoadingFn(v);
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function latest(h: Harness): LoadReveal {
  return h.snapshots[h.snapshots.length - 1];
}

function ever(h: Harness, pick: (s: LoadReveal) => boolean): boolean {
  return h.snapshots.some(pick);
}

function revealTransitions(h: Harness): number {
  let count = 0;
  let prev = false;
  for (const s of h.snapshots) {
    if (s.reveal && !prev) count += 1;
    prev = s.reveal;
  }
  return count;
}

describe('useLoadReveal state machine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('fast load (<150ms): never shows a skeleton and never arms the reveal', () => {
    const h = mountHarness(true);

    act(() => {
      vi.advanceTimersByTime(100);
    });
    h.setLoading(false);
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(ever(h, (s) => s.showSkeleton)).toBe(false);
    expect(ever(h, (s) => s.reveal)).toBe(false);
    expect(latest(h)).toEqual({ showSkeleton: false, reveal: false });
    h.unmount();
  });

  it('slow load: skeleton appears at 150ms while still loading', () => {
    const h = mountHarness(true);

    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(latest(h).showSkeleton).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(latest(h).showSkeleton).toBe(true);
    expect(latest(h).reveal).toBe(false);
    h.unmount();
  });

  it('data at 200ms: skeleton holds and reveal flips exactly at the 290ms floor', () => {
    const h = mountHarness(true);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(latest(h).showSkeleton).toBe(true);

    h.setLoading(false);
    // Loading is over but the floor has not passed: no reveal yet,
    // and the skeleton stays up so content never flashes plainly.
    expect(latest(h).reveal).toBe(false);
    expect(latest(h).showSkeleton).toBe(true);

    act(() => {
      vi.advanceTimersByTime(89);
    });
    expect(latest(h).reveal).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(latest(h).reveal).toBe(true);
    expect(latest(h).showSkeleton).toBe(false);
    h.unmount();
  });

  it('data after the floor (400ms): reveal fires as soon as loading ends', () => {
    const h = mountHarness(true);

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(latest(h).showSkeleton).toBe(true);

    h.setLoading(false);
    expect(latest(h).reveal).toBe(true);
    expect(latest(h).showSkeleton).toBe(false);
    h.unmount();
  });

  it('one-shot: a second load cycle never re-shows the skeleton or re-fires the reveal', () => {
    const h = mountHarness(true);

    act(() => {
      vi.advanceTimersByTime(400);
    });
    h.setLoading(false);
    expect(latest(h).reveal).toBe(true);
    expect(revealTransitions(h)).toBe(1);

    // Second cycle: slow again — refreshes must render plainly.
    const snapshotCountBeforeSecondCycle = h.snapshots.length;
    h.setLoading(true);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    const secondCycle = h.snapshots.slice(snapshotCountBeforeSecondCycle);
    expect(secondCycle.some((s) => s.showSkeleton)).toBe(false);

    h.setLoading(false);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(revealTransitions(h)).toBe(1);
    expect(latest(h).showSkeleton).toBe(false);
    h.unmount();
  });

  it('fast first cycle spends the machine: a later slow cycle stays plain', () => {
    const h = mountHarness(true);

    act(() => {
      vi.advanceTimersByTime(80);
    });
    h.setLoading(false);

    h.setLoading(true);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(ever(h, (s) => s.showSkeleton)).toBe(false);
    expect(ever(h, (s) => s.reveal)).toBe(false);
    h.unmount();
  });

  it('no initial load: nothing ever shows', () => {
    const h = mountHarness(false);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(ever(h, (s) => s.showSkeleton)).toBe(false);
    expect(ever(h, (s) => s.reveal)).toBe(false);
    h.unmount();
  });
});

describe('REVEAL variants carry the contract values', () => {
  it('parent staggers children at 45ms with no leading delay', () => {
    const show = REVEAL_PARENT_VARIANTS.show as any;
    expect(show.transition.staggerChildren).toBe(0.045);
    expect(show.transition.delayChildren).toBe(0);
    expect(REVEAL_STAGGER_SECONDS).toBe(0.045);
    expect(REVEAL_MAX_STAGGER_INDEX).toBe(8);
  });

  it('child hidden state is opacity 0 + scale 0.97 (transform/opacity only)', () => {
    expect(REVEAL_CHILD_VARIANTS.hidden).toEqual({ opacity: 0, scale: 0.97 });
  });

  it('child show runs 0.28s on the iOS easing', () => {
    const resolve = REVEAL_CHILD_VARIANTS.show as (i?: number) => any;
    const shown = resolve(undefined);
    expect(shown.opacity).toBe(1);
    expect(shown.scale).toBe(1);
    expect(shown.transition.duration).toBe(0.28);
    expect(shown.transition.ease).toEqual([0.32, 0.72, 0, 1]);
    expect(shown.transition.ease).toEqual(EASINGS.ios);
    // Without an index there is no explicit delay — the parent's
    // staggerChildren drives ordering.
    expect('delay' in shown.transition).toBe(false);
  });

  it('child delay is capped at item 8 (index >= 8 shares item 8 delay)', () => {
    const resolve = REVEAL_CHILD_VARIANTS.show as (i?: number) => any;
    expect(resolve(0).transition.delay).toBe(0);
    expect(resolve(3).transition.delay).toBeCloseTo(0.135, 5);
    expect(resolve(8).transition.delay).toBeCloseTo(0.36, 5);
    expect(resolve(9).transition.delay).toBeCloseTo(0.36, 5);
    expect(resolve(20).transition.delay).toBeCloseTo(0.36, 5);
  });
});
