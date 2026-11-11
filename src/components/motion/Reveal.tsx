'use client';

import React, { useContext, useEffect, useRef, useState } from 'react';
import { motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import {
  REVEAL_CHILD_VARIANTS,
  REVEAL_PARENT_VARIANTS,
} from '@/lib/animations';

/**
 * Reveal primitives for the motion system (TAIMUR, 2026-11-11).
 *
 * Usage pattern (gated by useLoadReveal): a page renders its plain
 * content normally, its skeletons while `showSkeleton`, and the
 * loaded content wrapped in <RevealGroup active={reveal}> with one
 * <RevealItem index={i}> per item. The stagger (transform +
 * opacity only) plays exactly when `reveal` has armed — data
 * arrived after a shown skeleton, never before mount+290ms, never
 * for fast loads.
 *
 * Arming can land two ways and both are handled:
 * - The group mounts already armed (data arrived at/after the
 *   290ms floor): initial="hidden", the effect starts "show".
 * - The group mounts unarmed and arms moments later (data arrived
 *   in the 150–290ms window; the hook flips `reveal` at the
 *   floor): the effect re-hides then starts "show", so the
 *   stagger still plays instead of the content sitting plain.
 *
 * Under reduced motion both render plain <div>s — content simply
 * appears, exactly like the fast-load path.
 */

/**
 * Once a group's reveal has finished playing, `settled` flips true
 * and any RevealItem mounted LATER under that group (e.g. fixture
 * cards remounting when the user returns to a tab on the tournament
 * details page) renders straight at "show" — the stagger is a
 * first-load ceremony, never a re-entry one.
 */
const RevealSettledContext = React.createContext(false);

interface RevealGroupProps {
  /** Arm the staggered reveal (from useLoadReveal's `reveal`). */
  active?: boolean;
  /** Alias for `active` — either prop arms the group. */
  reveal?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export function RevealGroup({
  active,
  reveal,
  className,
  style,
  children,
}: RevealGroupProps) {
  const shouldReduceMotion = useReducedMotion();
  const armed = active ?? reveal ?? false;
  const controls = useAnimationControls();
  const mountedArmedRef = useRef(armed);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!armed || shouldReduceMotion) return;
    let startPromise: Promise<unknown> | undefined;
    if (mountedArmedRef.current) {
      // Mounted armed: initial already put the tree at "hidden".
      startPromise = controls.start('show') as Promise<unknown>;
    } else {
      // Late arm: the tree is sitting at "show" (plain) — re-hide
      // it and play the stagger in.
      controls.set('hidden');
      startPromise = controls.start('show') as Promise<unknown>;
    }
    if (startPromise && typeof startPromise.then === 'function') {
      void startPromise.then(() => setSettled(true));
    }
  }, [armed, controls, shouldReduceMotion]);

  if (shouldReduceMotion) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <RevealSettledContext.Provider value={settled}>
      <motion.div
        className={className}
        style={style}
        variants={REVEAL_PARENT_VARIANTS}
        initial={armed ? 'hidden' : 'show'}
        animate={controls}
      >
        {children}
      </motion.div>
    </RevealSettledContext.Provider>
  );
}

interface RevealItemProps {
  /**
   * Item position in the reveal. When supplied, the item's delay
   * is min(index, 8) * 45ms (see REVEAL_CHILD_VARIANTS); when
   * omitted, the parent group's staggerChildren orders the items.
   */
  index?: number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export function RevealItem({ index, className, style, children }: RevealItemProps) {
  const shouldReduceMotion = useReducedMotion();
  const settled = useContext(RevealSettledContext);

  if (shouldReduceMotion) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={className}
      style={style}
      variants={REVEAL_CHILD_VARIANTS}
      custom={index}
      initial={settled ? false : undefined}
    >
      {children}
    </motion.div>
  );
}
