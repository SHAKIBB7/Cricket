import { Variants } from 'framer-motion';
import type { NavTransitionInfo } from './navigation-direction';

// --- THE motion system (unification, owner pick 2026-11-11) ---
// framer-motion + this token file are the app's ONE motion
// language: PageTransition (pages), Reveal (content entrance),
// the overlay variants (modal/backdrop/toast) and the sheet
// spring all draw from here. Retired in the unification (dead or
// duplicated systems, grep-verified): DURATIONS, TRANSITIONS,
// BOTTOM_SHEET_VARIANTS, CONTENT_FADE_UP_VARIANTS,
// STAGGER_CONTAINER / FADE_UP_ITEM (superseded by Reveal),
// ACCORDION_VARIANTS, NUMBER_COUNTER_VARIANTS (MotionNumber is
// inline by design), DROPDOWN_MENU_VARIANTS, the TAP/HOVER scale
// constants, the CSS animate-fade-*/scale-in entrance classes,
// the skeleton-pulse keyframes and the FadeInUp component.

// --- EASINGS ---
export const EASINGS = {
  easeOut: [0.16, 1, 0.3, 1] as [number, number, number, number],
  // iOS-standard navigation curve (push/pop/tab page motion)
  ios: [0.32, 0.72, 0, 1] as [number, number, number, number],
  easeIn: [0.4, 0.0, 1, 1] as [number, number, number, number],
  springGentle: { type: 'spring' as const, stiffness: 450, damping: 35, mass: 0.8 },
};

// --- VARIANTS ---

// Standard Modal (Center of screen)
export const MODAL_VARIANTS: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.25, ease: EASINGS.easeOut },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    transition: { duration: 0.15, ease: EASINGS.easeIn },
  },
};

// Backdrop fade
export const BACKDROP_VARIANTS: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

// (The legacy PAGE_TRANSITION_VARIANTS export was retired in the
// 2026-11-11 performance cleanup — PageTransition has used
// PAGE_DIRECTION_VARIANTS since Phase 2 and nothing else did.)

// Direction-aware Page Transition (Phase 2 navigation upgrade).
// Variants resolve from the AnimatePresence `custom` value
// (NavTransitionInfo). Current shape (unification, 2026-11-11):
// ONE slide-over pattern for push, pop AND tab — the entering
// page slides in over the static, popped exiting page (exactly
// one moving layer; the round-3 forwardRef + popLayout geometry
// is what makes this safe — see PageTransition). Tab direction
// follows the signed tab delta, at the owner's explicit request
// to use the New Match → Opening Players push motion app-wide
// (superseding the round-3 tab cut). Score-route crossings fade.
//
// Jank fix H-2 (2026-11-11): slides are TRANSFORM-ONLY. Animating
// opacity < 1 on a full-page root forces WebKit to raster the
// whole subtree into an offscreen buffer every frame (two pages
// at once during the pair) — the main source of residual jerk on
// device. Opacity is animated ONLY for the `fade` kind (score
// routes), where the pages do not translate.
const pageDirectionTransition = (info: NavTransitionInfo) => {
  switch (info.kind) {
    case 'push':
    case 'pop':
    case 'tab':
      return { duration: 0.26, ease: EASINGS.ios };
    default:
      return { duration: 0.15, ease: EASINGS.easeOut };
  }
};

const pageEnterX = (info: NavTransitionInfo): number => {
  switch (info.kind) {
    case 'push':
      return 64;
    case 'pop':
      return -24;
    case 'tab':
      // Owner's app-wide slide (2026-11-11): a tab switch slides
      // like a push, from the side of travel (signed tab delta).
      return 64 * Math.sign(info.delta);
    default:
      return 0;
  }
};

const pageExitX = (info: NavTransitionInfo): number => {
  // The exiting page NEVER moves (round-3 rule, kept). Only the
  // entering page slides, over the static exiting page, so a
  // transition has exactly one moving layer.
  void info;
  return 0;
};

export const PAGE_DIRECTION_VARIANTS: Variants = {
  initial: (info: NavTransitionInfo) => ({
    x: pageEnterX(info),
    // H-2: opacity only for the fade kind; slides stay opacity 1.
    ...(info.kind === 'fade' ? { opacity: 0 } : null),
  }),
  animate: (info: NavTransitionInfo) => ({
    x: 0,
    ...(info.kind === 'fade' ? { opacity: 1 } : null),
    transition: pageDirectionTransition(info),
  }),
  exit: (info: NavTransitionInfo) => ({
    x: pageExitX(info),
    ...(info.kind === 'fade' ? { opacity: 0 } : null),
    transition: pageDirectionTransition(info),
  }),
};

// Toast Feedback Notification Entrance & Exit
export const TOAST_VARIANTS: Variants = {
  initial: { opacity: 0, y: -8, scale: 0.98 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.2, ease: EASINGS.easeOut },
  },
  exit: {
    opacity: 0,
    y: -6,
    scale: 0.98,
    transition: { duration: 0.15, ease: EASINGS.easeIn },
  },
};

// --- LOAD REVEAL (Motion system, TAIMUR 2026-11-11) ---
// Staggered scale-in for content that arrives AFTER a shown skeleton
// (see useLoadReveal for the 150ms skeleton gate + 290ms start floor
// that keep the reveal out of the page slide). Transform + opacity
// ONLY — never layout properties. When an item receives an explicit
// index (via RevealItem's `custom`), its delay is
// min(index, REVEAL_MAX_STAGGER_INDEX) * stagger, so long lists stop
// accruing delay after the 9th item; without an index the parent's
// staggerChildren drives the ordering.
export const REVEAL_STAGGER_SECONDS = 0.045;
export const REVEAL_MAX_STAGGER_INDEX = 8;

export const REVEAL_PARENT_VARIANTS: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: REVEAL_STAGGER_SECONDS,
      delayChildren: 0,
    },
  },
};

export const REVEAL_CHILD_VARIANTS: Variants = {
  hidden: { opacity: 0, scale: 0.97 },
  show: (index?: number) => ({
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.28,
      ease: EASINGS.ios,
      ...(typeof index === 'number'
        ? {
            delay:
              Math.min(Math.max(index, 0), REVEAL_MAX_STAGGER_INDEX) *
              REVEAL_STAGGER_SECONDS,
          }
        : null),
    },
  }),
};
