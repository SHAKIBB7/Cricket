import { Variants } from 'framer-motion';
import type { NavTransitionInfo } from './navigation-direction';

// --- TIMINGS (in seconds) ---
export const DURATIONS = {
  micro: 0.15,
  standard: 0.22,
  modal: 0.25,
  page: 0.22,
  medium: 0.28,
  hero: 0.35,
  dropdown: 0.18,
  waterDrop: 0.34,
};

// --- EASINGS ---
export const EASINGS = {
  easeOut: [0.16, 1, 0.3, 1] as [number, number, number, number],
  // iOS-standard navigation curve (push/pop/tab page motion)
  ios: [0.32, 0.72, 0, 1] as [number, number, number, number],
  easeIn: [0.4, 0.0, 1, 1] as [number, number, number, number],
  easeInOut: [0.4, 0.0, 0.2, 1] as [number, number, number, number],
  springSnappy: { type: 'spring' as const, stiffness: 420, damping: 28 },
  springBouncy: { type: 'spring' as const, stiffness: 300, damping: 15 },
  springGentle: { type: 'spring' as const, stiffness: 450, damping: 35, mass: 0.8 },
  // Fluid water-drop easing (viscous acceleration & organic surface-tension settling)
  waterDrop: [0.22, 1, 0.36, 1] as [number, number, number, number],
  liquidSpring: { type: 'spring' as const, stiffness: 360, damping: 26, mass: 0.85 },
};

// --- TRANSITIONS ---
export const TRANSITIONS = {
  micro: { duration: DURATIONS.micro, ease: EASINGS.easeOut },
  standard: { duration: DURATIONS.standard, ease: EASINGS.easeInOut },
  modalEnter: { duration: DURATIONS.modal, ease: EASINGS.easeOut },
  modalExit: { duration: DURATIONS.micro, ease: EASINGS.easeIn },
  spring: EASINGS.springSnappy,
  contentEntrance: { duration: DURATIONS.medium, ease: EASINGS.easeOut },
  pageTransition: { duration: DURATIONS.page, ease: EASINGS.easeOut },
  waterDrop: { duration: DURATIONS.waterDrop, ease: EASINGS.waterDrop },
  dropdown: { duration: DURATIONS.dropdown, ease: EASINGS.easeOut },
};

// --- VARIANTS ---

// Standard Modal (Center of screen)
export const MODAL_VARIANTS: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { 
    opacity: 1, 
    scale: 1, 
    transition: TRANSITIONS.modalEnter 
  },
  exit: { 
    opacity: 0, 
    scale: 0.98, 
    transition: TRANSITIONS.modalExit 
  },
};

// Bottom Sheet Modal (Mobile)
export const BOTTOM_SHEET_VARIANTS: Variants = {
  hidden: { opacity: 0, y: '100%' },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: TRANSITIONS.spring 
  },
  exit: { 
    opacity: 0, 
    y: '100%', 
    transition: TRANSITIONS.modalExit 
  },
};

// Backdrop fade
export const BACKDROP_VARIANTS: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

// Page Transition: subtle horizontal slide + opacity fade (200ms)
// Retained for compatibility (pinned by premium-animation-suite tests);
// PageTransition itself now uses PAGE_DIRECTION_VARIANTS below.
export const PAGE_TRANSITION_VARIANTS: Variants = {
  initial: { opacity: 0, x: 8 },
  animate: { 
    opacity: 1, 
    x: 0, 
    transition: TRANSITIONS.pageTransition 
  },
  exit: { 
    opacity: 0, 
    x: -8, 
    transition: { duration: 0.15, ease: EASINGS.easeIn } 
  },
};

// Direction-aware Page Transition (Phase 2 navigation upgrade).
// Variants resolve from the AnimatePresence `custom` value
// (NavTransitionInfo). Round-3 shape (2026-11-11, after the
// owner's on-device ghosting reports and a desktop-browser
// reproduction): tab switches are CUTS (native iOS tab-bar
// behaviour — no content slide at all); push/pop slide ONLY
// the entering page in over the static exiting page (one
// moving layer, iOS push-style); score-route crossings fade.
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
      return { duration: 0.26, ease: EASINGS.ios };
    case 'tab':
      // Tab switches are cuts (see pageEnterX): the popped
      // exiting page should also leave almost immediately.
      return { duration: 0.05, ease: EASINGS.ios };
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
      // Native iOS tab bars do not slide content at all — a tab
      // switch is a cut. The invented ±16px tab slide doubled
      // the moving-layer cost for zero platform fidelity
      // (round-3 fix, 2026-11-11).
      return 0;
    default:
      return 0;
  }
};

const pageExitX = (info: NavTransitionInfo): number => {
  // Round-3 fix (2026-11-11): the exiting page NEVER moves.
  // Only the entering page slides (over the static exiting
  // page, iOS push-style), so a transition has exactly one
  // moving layer instead of two full-page layers in motion.
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

// Content Entrance: Fade + subtle slide up (8px)
export const CONTENT_FADE_UP_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: TRANSITIONS.contentEntrance 
  },
};

// List container for staggered children
export const STAGGER_CONTAINER: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
    },
  },
};

// List item fading up
export const FADE_UP_ITEM: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: TRANSITIONS.standard },
};

// Accordion Expand / Collapse: dynamic height animation without fixed heights
export const ACCORDION_VARIANTS: Variants = {
  collapsed: { height: 0, opacity: 0 },
  expanded: { 
    height: 'auto', 
    opacity: 1, 
    transition: { duration: 0.22, ease: EASINGS.easeOut } 
  },
};

// Toast Feedback Notification Entrance & Exit
export const TOAST_VARIANTS: Variants = {
  initial: { opacity: 0, y: -8, scale: 0.98 },
  animate: { 
    opacity: 1, 
    y: 0, 
    scale: 1, 
    transition: { duration: 0.2, ease: EASINGS.easeOut } 
  },
  exit: { 
    opacity: 0, 
    y: -6, 
    scale: 0.98, 
    transition: { duration: 0.15, ease: EASINGS.easeIn } 
  },
};

// Live Score / Number Animation
export const NUMBER_COUNTER_VARIANTS: Variants = {
  initial: { y: 10, opacity: 0 },
  animate: { 
    y: 0, 
    opacity: 1, 
    transition: { duration: 0.18, ease: EASINGS.easeOut } 
  },
  exit: { 
    y: -10, 
    opacity: 0, 
    transition: { duration: 0.14, ease: EASINGS.easeIn } 
  },
};

// Micro-interactions for Buttons/Cards
export const TAP_SCALE = 0.98;
export const HOVER_SCALE = 1.01;
export const ICON_TAP_SCALE = 0.94;
export const ICON_HOVER_SCALE = 1.06;

// Dropdown Menu Transition Variants
export const DROPDOWN_MENU_VARIANTS: Variants = {
  hidden: { opacity: 0, y: -4, scale: 0.98 },
  visible: { 
    opacity: 1, 
    y: 0, 
    scale: 1, 
    transition: TRANSITIONS.dropdown 
  },
  exit: { 
    opacity: 0, 
    y: -4, 
    scale: 0.98, 
    transition: { duration: 0.12, ease: EASINGS.easeIn } 
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


