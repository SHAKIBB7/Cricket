/**
 * Unified overlay foundations (Phase 2A of the overlay architecture
 * master prompt). Pure, framework-free logic shared by the overlay
 * primitives in src/components/overlay/:
 *
 * - A single z-index scale with an explicit priority order, replacing
 *   the ad-hoc z-50 / z-[60] / z-[70] sprinkled across components.
 * - Sheet detents (PEEK / HALF / FULL) as viewport fractions, with a
 *   pure snap-resolution function so gesture behaviour is unit-testable
 *   without a browser.
 * - The dismissal-guard predicate behind unsaved-changes protection.
 *
 * Nothing here touches the DOM or React. Business logic is untouched.
 */

/** Overlay priority tiers, lowest to highest. Higher renders above. */
export const OVERLAY_Z_INDEX = {
  /** Bottom sheets and drawers (primary layer). */
  sheet: 60,
  /** Centered modal dialogs (primary layer). */
  modal: 70,
  /** Confirmation dialogs — may temporarily sit above a sheet/modal. */
  confirmation: 80,
  /** Destructive confirmations — the highest app tier. */
  critical: 90,
} as const;

export type OverlayTier = keyof typeof OVERLAY_Z_INDEX;

/** Explicit overlay lifecycle (master prompt Phase 2 state machine). */
export type OverlayPhase =
  | 'closed'
  | 'opening'
  | 'open'
  | 'dragging'
  | 'snapping'
  | 'dismissing';

/** Named detents as fractions of the usable viewport height. */
export const SHEET_DETENTS = {
  peek: 0.18,
  half: 0.5,
  full: 0.92,
} as const;

export type SheetDetentName = keyof typeof SHEET_DETENTS;

/** A detent is a viewport-height fraction in (0, 1]. */
export type SheetDetent = number;

/** Pixel heights for a set of detents, ascending, de-duplicated. */
export function detentHeights(detents: readonly SheetDetent[], viewportHeight: number): number[] {
  const heights = detents
    .filter((d) => d > 0 && d <= 1)
    .map((d) => Math.round(d * viewportHeight))
    .sort((a, b) => a - b);
  return [...new Set(heights)];
}

export interface SnapResolution {
  /** Index into the ascending detent heights, or -1 when dismissing. */
  index: number;
  dismiss: boolean;
}

export interface SnapInput {
  /** Ascending detent heights in px (from detentHeights). */
  heights: readonly number[];
  /** Height of the detent the drag started from, in px. */
  currentHeight: number;
  /** Drag offset in px; positive means dragged downward. */
  offsetY: number;
  /** Drag velocity in px/s; positive means moving downward. */
  velocityY: number;
  /** Whether a downward flick/drag past the lowest detent may dismiss. */
  dismissible: boolean;
}

/** A downward flick faster than this (px/s) counts as a flick, not a drag. */
export const FLICK_VELOCITY = 700;
/** How far (seconds of travel) velocity projects the release point. */
export const VELOCITY_PROJECTION_S = 0.15;
/** Projected height below this fraction of the lowest detent dismisses. */
export const DISMISS_THRESHOLD = 0.55;

/**
 * Decide where a released sheet settles: the nearest detent to the
 * velocity-projected height, or dismissal when a dismissible sheet is
 * flicked/dragged decisively below its lowest detent. Users only ever
 * rest at configured detents — never at arbitrary positions.
 */
export function resolveSnapTarget(input: SnapInput): SnapResolution {
  const { heights, currentHeight, offsetY, velocityY, dismissible } = input;
  if (heights.length === 0) return { index: -1, dismiss: dismissible };

  const projected = currentHeight - offsetY - velocityY * VELOCITY_PROJECTION_S;
  const lowest = heights[0];
  const highest = heights[heights.length - 1];

  const fastDownFlick = velocityY > FLICK_VELOCITY && offsetY > 32;
  if (dismissible && (projected < lowest * DISMISS_THRESHOLD || (fastDownFlick && projected <= lowest))) {
    return { index: -1, dismiss: true };
  }

  const clamped = Math.min(Math.max(projected, lowest), highest);
  let best = 0;
  let bestDist = Infinity;
  heights.forEach((h, i) => {
    const dist = Math.abs(h - clamped);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  });
  return { index: best, dismiss: false };
}

/**
 * Unsaved-changes predicate: a dismissal attempt (backdrop, Escape,
 * swipe) is intercepted when the surface is dirty and the attempt is
 * not already an explicit in-UI choice (e.g. a Discard button).
 */
export function shouldInterceptDismiss(isDirty: boolean, isExplicitChoice: boolean): boolean {
  return isDirty && !isExplicitChoice;
}
