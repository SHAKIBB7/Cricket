'use client';

import React, { useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { AnimationItem } from 'lottie-web';
import rawStadiumAnimation from '../../../animations/stadium.json';

export interface StadiumLottieAnimationProps {
  /** Accent color to tint the stadium shapes (defaults to Stadium Green #34C759) */
  accentColor?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'hero';
  className?: string;
  loop?: boolean;
  autoplay?: boolean;
  animateGlow?: boolean;
}

/**
 * Normalizes hex string into RGB values in [0, 1] range
 */
function parseHexToRgb(hexColor: string): [number, number, number] {
  let hex = hexColor.replace('#', '').trim();
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  const num = parseInt(hex, 16);
  if (isNaN(num)) return [0.204, 0.78, 0.349]; // default #34C759
  return [
    ((num >> 16) & 255) / 255,
    ((num >> 8) & 255) / 255,
    (num & 255) / 255,
  ];
}

const stadiumColorCache = new Map<string, any>();

/**
 * Tints blue structure and field elements in stadium.json to match
 * the application's Stadium Green theme and live blinking dot accent.
 */
function customizeStadiumColors(data: any, accentColor: string): any {
  if (!data) return data;
  const cacheKey = accentColor.toLowerCase();
  if (stadiumColorCache.has(cacheKey)) {
    return stadiumColorCache.get(cacheKey);
  }
  try {
    const cloned = JSON.parse(JSON.stringify(data));
    const [pr, pg, pb] = parseHexToRgb(accentColor);

    function walk(node: any) {
      if (!node || typeof node !== 'object') return;
      if (
        (node.ty === 'fl' || node.ty === 'st') &&
        node.c &&
        Array.isArray(node.c.k)
      ) {
        const [r, g, b, a] = node.c.k;
        // Detect blue/cyan stadium architecture shapes (b > r and b > 0.45)
        if (typeof r === 'number' && typeof b === 'number' && b > r && b > 0.45) {
          const lum = (r + g + b) / 3;
          const factor = Math.max(0.6, Math.min(1.4, lum / 0.6));
          node.c.k = [
            Math.min(1, Math.max(0, pr * factor)),
            Math.min(1, Math.max(0, pg * factor)),
            Math.min(1, Math.max(0, pb * factor)),
            typeof a === 'number' ? a : 1,
          ];
        }
      }
      for (const key of Object.keys(node)) {
        walk(node[key]);
      }
    }

    walk(cloned);
    stadiumColorCache.set(cacheKey, cloned);
    return cloned;
  } catch {
    return data;
  }
}

const SIZE_MAP = {
  xs: 'w-4 h-4',
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
  hero: 'w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24',
};

/**
 * StadiumLottieAnimation
 *
 * Lightweight, hardware-accelerated Lottie player for the Stadium animation.
 * Used for:
 * 1. Application First Scene / Opening Scene visual identity
 * 2. Home / Current / Running Team representation
 */
export const StadiumLottieAnimation = React.memo(
  function StadiumLottieAnimation({
    accentColor = '#34C759',
    size = 'md',
    className = '',
    loop = true,
    autoplay = true,
    animateGlow = true,
  }: StadiumLottieAnimationProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);

    // Cache customized color palette
    const animationData = useMemo(() => {
      return customizeStadiumColors(rawStadiumAnimation, accentColor);
    }, [accentColor]);

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
            animationData,
            rendererSettings: {
              preserveAspectRatio: 'xMidYMid meet',
              progressiveLoad: true,
              hideOnTransparent: true,
            },
          });
        })
        .catch((err) => {
          console.warn('[StadiumLottieAnimation] Failed to initialize lottie-web:', err);
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
    }, [animationData, loop, autoplay]);

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
        aria-label="Stadium Animation"
        title="Stadium / Host Venue Indicator"
      >
        <div
          ref={containerRef}
          className="w-full h-full flex items-center justify-center overflow-hidden"
        />
      </motion.div>
    );
  }
);
