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
// (NavTransitionInfo): the entering page and the exiting page run
// as a simultaneous iOS-style pair — push slides the new screen in
// from the right while the old one drifts left (parallax-lite),
// pop mirrors it, tab switches slide a short distance along the
// tab delta, and score-route crossings only fade.
const pageDirectionTransition = (info: NavTransitionInfo) => {
  switch (info.kind) {
    case 'push':
    case 'pop':
      return { duration: 0.26, ease: EASINGS.ios };
    case 'tab':
      return { duration: 0.22, ease: EASINGS.ios };
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
      return 16 * Math.sign(info.delta);
    default:
      return 0;
  }
};

const pageExitX = (info: NavTransitionInfo): number => {
  switch (info.kind) {
    case 'push':
      return -24;
    case 'pop':
      return 64;
    case 'tab':
      return -16 * Math.sign(info.delta);
    default:
      return 0;
  }
};

export const PAGE_DIRECTION_VARIANTS: Variants = {
  initial: (info: NavTransitionInfo) => ({
    opacity: 0,
    x: pageEnterX(info),
  }),
  animate: (info: NavTransitionInfo) => ({
    opacity: 1,
    x: 0,
    transition: pageDirectionTransition(info),
  }),
  exit: (info: NavTransitionInfo) => ({
    opacity: 0,
    x: pageExitX(info),
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


