'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  AnimatePresence,
  motion,
  useAnimationControls,
  useReducedMotion,
} from 'framer-motion';
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
 * One page in the transition pair. Owns its own animation controls
 * so the enter animation can be started on a delay (see below)
 * without touching the exiting page's variant-driven exit.
 *
 * CRITICAL: this component MUST forward its ref to the motion.div.
 * AnimatePresence's popLayout mode measures and pops the exiting
 * child through that ref; without it the exiting page is never
 * lifted out of flow and BOTH pages render stacked in the document
 * for the whole transition — the doubled-page artifact the owner
 * filmed on device and that reproduced in the desktop browser
 * (round-3 diagnosis, 2026-11-11).
 *
 * Ghost defences that remain from the first attempt: the wrapper
 * carries the app's opaque background (one opaque layer for the
 * compositor), and the enter animation starts after two frames at
 * the initial offset so the first raster completes at rest.
 */
const TransitionPage = React.forwardRef<
  HTMLDivElement,
  {
    info: NavTransitionInfo;
    pathname: string;
    children: React.ReactNode;
  }
>(function TransitionPage({ info, pathname, children }, ref) {
  const controls = useAnimationControls();

  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        void controls.start('animate');
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [controls]);

  return (
    <motion.div
      ref={ref}
      custom={info}
      variants={PAGE_DIRECTION_VARIANTS}
      initial="initial"
      animate={controls}
      exit="exit"
      data-direction={info.kind}
      data-pathname={pathname}
      className="relative flex-1 w-full flex flex-col min-w-0 bg-[var(--background)]"
    >
      {children}
    </motion.div>
  );
});

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
      <TransitionPage key={pathname} info={info} pathname={pathname}>
        {children}
      </TransitionPage>
    </AnimatePresence>
  );
}
