/**
 * Round-3 page-transition contract (2026-11-11).
 *
 * The owner's on-device video and a desktop-browser walk both
 * showed pages rendering DOUBLED during tab transitions. Root
 * cause: the TransitionPage wrapper around the motion.div did not
 * forward its ref, so AnimatePresence's popLayout mode could
 * never pop the exiting page out of flow — both pages stayed
 * stacked in the document (measured: exiting wrapper
 * position:relative, pairs stacked, never overlapping).
 *
 * These pins hold the round-3 decisions:
 * 1. TransitionPage forwards its ref to the motion.div.
 * 2. The exiting page never moves (exit x is 0 for every kind) —
 *    only the entering page slides, over a static exiting page.
 *
 * Decision 2's original second half (tab switches are cuts) was
 * superseded the same evening: the owner explicitly asked for
 * the push slide app-wide (motion unification, 2026-11-11), so
 * tab switches now slide like pushes — from the side of travel
 * (signed delta) — still over the static, popped exiting page,
 * which is what keeps them free of the doubling fault.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PAGE_DIRECTION_VARIANTS } from '../lib/animations';
import type { NavTransitionInfo } from '../lib/navigation-direction';

const src = readFileSync(
  join(process.cwd(), 'src/components/layout/PageTransition.tsx'),
  'utf8',
);

const info = (kind: NavTransitionInfo['kind'], delta = 1): NavTransitionInfo =>
  ({ kind, delta }) as NavTransitionInfo;

describe('page transition round-3 contract', () => {
  it('TransitionPage forwards its ref to the motion.div (popLayout requirement)', () => {
    expect(src).toContain('React.forwardRef');
    expect(src).toContain('ref={ref}');
  });

  it('tab switches slide the entering page like a push, from the side of travel', () => {
    const initial = PAGE_DIRECTION_VARIANTS.initial as (
      i: NavTransitionInfo,
    ) => { x: number };
    expect(initial(info('tab')).x).toBe(64);
    expect(initial(info('tab', -1)).x).toBe(-64);
  });

  it('the exiting page is static for every transition kind', () => {
    const exit = PAGE_DIRECTION_VARIANTS.exit as (
      i: NavTransitionInfo,
    ) => { x: number };
    for (const kind of ['push', 'pop', 'tab', 'fade'] as const) {
      expect(exit(info(kind)).x).toBe(0);
    }
  });

  it('push and pop still slide the entering page', () => {
    const initial = PAGE_DIRECTION_VARIANTS.initial as (
      i: NavTransitionInfo,
    ) => { x: number };
    expect(initial(info('push')).x).toBe(64);
    expect(initial(info('pop')).x).toBe(-24);
  });
});
