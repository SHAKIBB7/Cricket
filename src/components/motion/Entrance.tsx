'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { HTMLAttributes, ReactNode } from 'react';
import { EASINGS } from '@/lib/animations';

interface EntranceProps
  extends Omit<
    HTMLAttributes<HTMLDivElement>,
    | 'onDrag'
    | 'onDragStart'
    | 'onDragEnd'
    | 'onDragEnter'
    | 'onDragLeave'
    | 'onDragOver'
    | 'onDragExit'
    | 'onDrop'
    | 'onAnimationStart'
    | 'onAnimationEnd'
    | 'onAnimationIteration'
    | 'onTransitionEnd'
  > {
  children: ReactNode;
  /** Backdrops and full-screen layers: fade only, no scale. */
  fadeOnly?: boolean;
  delay?: number;
}

/**
 * Single-element entrance in the app's ONE motion system (the
 * Reveal curve: scale 0.97 → 1 + fade, 0.28 s iOS ease). For
 * elements that mount outside a RevealGroup — conditional
 * banners, page-level modal backdrops/panels, standalone cards.
 * This replaces the retired CSS fade/scale entrance classes
 * (motion unification, 2026-11-11). Reduced motion renders a
 * plain div.
 */
export function Entrance({
  children,
  fadeOnly = false,
  delay = 0,
  ...rest
}: EntranceProps) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div {...rest}>{children}</div>;
  }
  return (
    <motion.div
      {...rest}
      initial={{ opacity: 0, ...(fadeOnly ? null : { scale: 0.97 }) }}
      animate={{ opacity: 1, ...(fadeOnly ? null : { scale: 1 }) }}
      transition={{ duration: 0.28, ease: EASINGS.ios, delay }}
    >
      {children}
    </motion.div>
  );
}
