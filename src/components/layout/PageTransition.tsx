'use client';

import React, { useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { PAGE_DIRECTION_VARIANTS } from '@/lib/animations';
import {
  createNavTracker,
  type NavTracker,
  type NavTransitionInfo,
} from '@/lib/navigation-direction';

interface PageTransitionProps {
  children: React.ReactNode;
}

/**
 * Direction-aware page transition (Phase 2 navigation upgrade).
 *
 * Entering and exiting pages animate as a simultaneous pair via
 * AnimatePresence (popLayout: the exiting page is lifted out of
 * flow so the entering page lays out at its final position).
 * Direction comes from the nav tracker (stack heuristic + tab
 * signal channel) and is computed with the React-endorsed
 * render-phase previous-value pattern so the very first render of
 * a new route already knows its direction. First mount never
 * animates (AnimatePresence initial={false} + tracker seeding).
 *
 * No permanent will-change: framer-motion promotes the layer only
 * while a transform is actually animating, so the wrapper stops
 * being a fixed-position containing block at rest (audit R-6).
 *
 * Jank fix H-1 (partial, 2026-11-11): the wrapper is `relative`
 * (as is the shell's content container) so popLayout's popped
 * exiting layer anchors to this wrapper instead of a distant
 * ancestor, and scroll corrections no longer shift it 1:1.
 */
export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname() ?? '';
  const shouldReduceMotion = useReducedMotion();

  const trackerRef = useRef<NavTracker | null>(null);
  if (trackerRef.current === null) {
    const tracker = createNavTracker();
    tracker.observe(pathname); // seed: establishes `from` for the first change
    trackerRef.current = tracker;
  }

  const [prevPathname, setPrevPathname] = useState(pathname);
  const [info, setInfo] = useState<NavTransitionInfo>({ kind: 'none', delta: 0 });

  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setInfo(trackerRef.current.observe(pathname));
  }

  if (shouldReduceMotion) {
    return (
      <div className="relative flex-1 w-full flex flex-col min-w-0">
        {children}
      </div>
    );
  }

  return (
    <AnimatePresence initial={false} mode="popLayout" custom={info}>
      <motion.div
        key={pathname}
        custom={info}
        variants={PAGE_DIRECTION_VARIANTS}
        initial="initial"
        animate="animate"
        exit="exit"
        data-direction={info.kind}
        data-pathname={pathname}
        className="relative flex-1 w-full flex flex-col min-w-0"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
