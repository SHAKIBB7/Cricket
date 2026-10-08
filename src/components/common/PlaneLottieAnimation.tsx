'use client';

import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type { AnimationItem } from 'lottie-web';
import rawPlaneAnimation from '../../../animations/plane.json';

export interface PlaneLottieAnimationProps {
  /** Accent color to glow visiting airplane (defaults to Away Blue #3B82F6) */
  accentColor?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  loop?: boolean;
  autoplay?: boolean;
  animateGlow?: boolean;
}

const SIZE_MAP = {
  xs: 'w-4 h-4',
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
};

/**
 * PlaneLottieAnimation
 *
 * Lightweight, hardware-accelerated Lottie player for the Visiting Airplane animation.
 * Used for: Away / Visitor Team representation.
 */
export const PlaneLottieAnimation = React.memo(
  function PlaneLottieAnimation({
    accentColor = '#3B82F6',
    size = 'md',
    className = '',
    loop = true,
    autoplay = true,
    animateGlow = true,
  }: PlaneLottieAnimationProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      const container = containerRef.current;
      let animItem: AnimationItem | null = null;
      let isMounted = true;

      // Dynamically load lottie-web on client only (SSR and Vitest safe)
      import('lottie-web')
        .then((lottieModule) => {
          if (!isMounted || !container) return;
          const lottie = lottieModule.default || lottieModule;

          container.innerHTML = '';

          animItem = lottie.loadAnimation({
            container,
            renderer: 'svg',
            loop,
            autoplay,
            animationData: rawPlaneAnimation,
            rendererSettings: {
              preserveAspectRatio: 'xMidYMid meet',
              progressiveLoad: true,
              hideOnTransparent: true,
            },
          });
        })
        .catch((err) => {
          console.warn('[PlaneLottieAnimation] Failed to initialize lottie-web:', err);
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
    }, [loop, autoplay]);

    const sizeClass = SIZE_MAP[size] || SIZE_MAP.md;

    return (
      <motion.div
        animate={
          animateGlow
            ? {
                filter: [
                  `drop-shadow(0 0 0px ${accentColor}00) brightness(1)`,
                  `drop-shadow(0 0 3px ${accentColor}60) brightness(1.05)`,
                  `drop-shadow(0 0 6px ${accentColor}90) brightness(1.10)`,
                  `drop-shadow(0 0 3px ${accentColor}60) brightness(1.05)`,
                  `drop-shadow(0 0 0px ${accentColor}00) brightness(1)`,
                ],
                opacity: [0.94, 0.98, 1, 0.98, 0.94],
              }
            : undefined
        }
        transition={
          animateGlow
            ? {
                duration: 2.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }
            : undefined
        }
        className={`relative inline-flex items-center justify-center shrink-0 select-none pointer-events-none ${sizeClass} ${className}`}
        aria-label="Plane Animation"
        title="Visiting Team / Flight Indicator"
      >
        <div
          ref={containerRef}
          className="w-full h-full flex items-center justify-center overflow-hidden"
        />
      </motion.div>
    );
  }
);
