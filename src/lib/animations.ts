import { Variants } from 'framer-motion';

// --- TIMINGS ---
export const DURATIONS = {
  micro: 0.15,
  standard: 0.2,
  medium: 0.3,
  hero: 0.4,
};

// --- EASINGS ---
export const EASINGS = {
  easeOut: [0.0, 0.0, 0.2, 1] as [number, number, number, number],
  easeIn: [0.4, 0.0, 1, 1] as [number, number, number, number],
  easeInOut: [0.4, 0.0, 0.2, 1] as [number, number, number, number],
  springSnappy: { type: 'spring' as const, stiffness: 400, damping: 25 },
  springBouncy: { type: 'spring' as const, stiffness: 300, damping: 15 },
};

// --- TRANSITIONS ---
export const TRANSITIONS = {
  micro: { duration: DURATIONS.micro, ease: EASINGS.easeOut },
  standard: { duration: DURATIONS.standard, ease: EASINGS.easeInOut },
  modalEnter: { duration: DURATIONS.medium, ease: EASINGS.easeOut },
  modalExit: { duration: DURATIONS.micro, ease: EASINGS.easeIn },
  spring: EASINGS.springSnappy,
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

// List container for staggered children
export const STAGGER_CONTAINER: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

// List item fading up
export const FADE_UP_ITEM: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: TRANSITIONS.standard },
};

// Micro-interactions for Buttons/Cards
export const TAP_SCALE = 0.97;
export const HOVER_SCALE = 1.01;
