import { describe, it, expect } from 'vitest';
import {
  OVERLAY_Z_INDEX,
  SHEET_DETENTS,
  detentHeights,
  resolveSnapTarget,
  shouldInterceptDismiss,
} from '../lib/overlay';

/**
 * Phase 2A foundations — pure overlay logic.
 * The snap resolver is the heart of the detent system: users must only
 * ever rest at configured detents, flicks must dismiss decisively, and
 * non-dismissible sheets must never dismiss.
 */

describe('z-index scale', () => {
  it('orders tiers sheet < modal < confirmation < critical', () => {
    expect(OVERLAY_Z_INDEX.sheet).toBeLessThan(OVERLAY_Z_INDEX.modal);
    expect(OVERLAY_Z_INDEX.modal).toBeLessThan(OVERLAY_Z_INDEX.confirmation);
    expect(OVERLAY_Z_INDEX.confirmation).toBeLessThan(OVERLAY_Z_INDEX.critical);
  });

  it('sits above the legacy ad-hoc overlay values (50/60/70)', () => {
    expect(OVERLAY_Z_INDEX.confirmation).toBeGreaterThan(70);
    expect(OVERLAY_Z_INDEX.critical).toBeGreaterThan(OVERLAY_Z_INDEX.confirmation);
  });
});

describe('detentHeights', () => {
  it('converts fractions to ascending pixel heights', () => {
    expect(detentHeights([0.92, 0.18, 0.5], 800)).toEqual([144, 400, 736]);
  });

  it('de-duplicates and drops out-of-range fractions', () => {
    expect(detentHeights([0.5, 0.5, 0, 1.5], 800)).toEqual([400]);
  });

  it('named detents are ordered peek < half < full', () => {
    expect(SHEET_DETENTS.peek).toBeLessThan(SHEET_DETENTS.half);
    expect(SHEET_DETENTS.half).toBeLessThan(SHEET_DETENTS.full);
    expect(SHEET_DETENTS.full).toBeLessThanOrEqual(0.92);
  });
});

describe('resolveSnapTarget', () => {
  const heights = [144, 400, 736]; // peek, half, full at 800px viewport

  it('settles at the nearest detent after a slow drag', () => {
    // From half (400), dragged up 120px → projected 520 → nearer full? |520-400|=120, |736-520|=216 → half
    expect(resolveSnapTarget({ heights, currentHeight: 400, offsetY: -120, velocityY: 0, dismissible: true }))
      .toEqual({ index: 1, dismiss: false });
    // Dragged up 250px → projected 650 → full
    expect(resolveSnapTarget({ heights, currentHeight: 400, offsetY: -250, velocityY: 0, dismissible: true }))
      .toEqual({ index: 2, dismiss: false });
  });

  it('collapses one detent on a moderate downward drag', () => {
    expect(resolveSnapTarget({ heights, currentHeight: 736, offsetY: 200, velocityY: 0, dismissible: true }))
      .toEqual({ index: 1, dismiss: false });
  });

  it('dismisses on a fast downward flick from the lowest detent', () => {
    expect(resolveSnapTarget({ heights, currentHeight: 144, offsetY: 60, velocityY: 900, dismissible: true }))
      .toEqual({ index: -1, dismiss: true });
  });

  it('dismisses when dragged decisively below the lowest detent', () => {
    // projected = 400 - 330 = 70 < 144 * 0.55 ≈ 79
    expect(resolveSnapTarget({ heights, currentHeight: 400, offsetY: 330, velocityY: 0, dismissible: true }))
      .toEqual({ index: -1, dismiss: true });
  });

  it('never dismisses a non-dismissible sheet — clamps to the lowest detent', () => {
    expect(resolveSnapTarget({ heights, currentHeight: 144, offsetY: 300, velocityY: 1200, dismissible: false }))
      .toEqual({ index: 0, dismiss: false });
  });

  it('uses velocity projection: an upward flick expands without a long drag', () => {
    // projected = 400 + 10 + 900*0.15 = 545 → still nearer half (400) than full (736)? |545-400|=145 < |736-545|=191 → half
    expect(resolveSnapTarget({ heights, currentHeight: 400, offsetY: -10, velocityY: -900, dismissible: true }).index).toBe(1);
    // stronger: projected = 400 + 150 + 135 = 685 → full
    expect(resolveSnapTarget({ heights, currentHeight: 400, offsetY: -150, velocityY: -900, dismissible: true }).index).toBe(2);
  });

  it('supports a single-detent sheet', () => {
    expect(resolveSnapTarget({ heights: [736], currentHeight: 736, offsetY: 100, velocityY: 0, dismissible: true }))
      .toEqual({ index: 0, dismiss: false });
  });
});

describe('shouldInterceptDismiss', () => {
  it('intercepts only dirty, non-explicit dismissals', () => {
    expect(shouldInterceptDismiss(true, false)).toBe(true);
    expect(shouldInterceptDismiss(true, true)).toBe(false);
    expect(shouldInterceptDismiss(false, false)).toBe(false);
  });
});
