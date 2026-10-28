'use client';

import React, { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { AnimationItem } from 'lottie-web';

export interface WicketLottieAnimationProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  loop?: boolean;
  autoplay?: boolean;
}

const SIZE_MAP = {
  xs: 'w-5 h-5',
  sm: 'w-7 h-7',
  md: 'w-10 h-10',
  lg: 'w-14 h-14',
};

/**
 * WicketLottieAnimation
 *
 * Lightweight, hardware-accelerated Lottie player for the Cricket Wicket animation.
 * Features:
 * - Dynamic SSR & Vitest-safe loading of lottie-web & wickets.json
 * - Unmount cleanup and container isolation to prevent memory leaks
 * - Respects prefers-reduced-motion
 */
export const WicketLottieAnimation = React.memo(
  function WicketLottieAnimation({
    size = 'md',
    className = '',
    loop = false,
    autoplay = true,
  }: WicketLottieAnimationProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const shouldReduceMotion = useReducedMotion();

    useEffect(() => {
      const container = containerRef.current;
      let animItem: AnimationItem | null = null;
      let isMounted = true;

      if (shouldReduceMotion) return;

      Promise.all([
        import('lottie-web'),
        import('../../../animations/wickets.json'),
      ])
        .then(([lottieModule, wicketsJsonModule]) => {
          if (!isMounted || !container) return;
          const lottie = lottieModule.default || lottieModule;
          const animationData = wicketsJsonModule.default || wicketsJsonModule;

          container.innerHTML = '';

          animItem = lottie.loadAnimation({
            container,
            renderer: 'svg',
            loop,
            autoplay,
            animationData,
            rendererSettings: {
              preserveAspectRatio: 'xMidYMid meet',
              progressiveLoad: true,
              hideOnTransparent: true,
            },
          });
        })
        .catch((err) => {
          console.warn('[WicketLottieAnimation] Failed to initialize lottie-web:', err);
        });

      return () => {
        isMounted = false;
        if (animItem) {
          animItem.destroy();
          animItem = null;
        }
        if (container) {
          container.innerHTML = '';
        }
      };
    }, [loop, autoplay, shouldReduceMotion]);

    const sizeClass = SIZE_MAP[size] || SIZE_MAP.md;

    return (
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        className={`relative inline-flex items-center justify-center shrink-0 select-none pointer-events-none ${sizeClass} ${className}`}
        role="img"
        aria-label="Wicket Animation"
        title="Wicket"
      >
        <div
          ref={containerRef}
          className="w-full h-full flex items-center justify-center overflow-hidden"
        />
      </motion.div>
    );
  }
);
