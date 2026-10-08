'use client';

import React, { useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { AnimationItem } from 'lottie-web';
import rawCricketAnimation from '../../../animations/cricket.json';

interface StrikerLottieAnimationProps {
  /** Accent color to tint the striker batsman (defaults to team accent #34C759) */
  accentColor?: string;
  className?: string;
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

/**
 * Tints blue jersey/cap shape elements in cricket.json to the team's accent color
 * while preserving natural cricket bat wood, ball red, and white trail strokes.
 */
function customizeAnimationColors(data: any, accentColor: string): any {
  if (!data) return data;
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
        // Detect player jersey / accents (blue shades where b > r and b > 0.55)
        if (typeof r === 'number' && typeof b === 'number' && b > r && b > 0.55) {
          const lum = (r + g + b) / 3;
          const factor = Math.max(0.65, Math.min(1.35, lum / 0.65));
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
    return cloned;
  } catch {
    return data;
  }
}

/**
 * StrikerLottieAnimation
 *
 * Lightweight, hardware-accelerated Lottie player for the active striker batsman.
 * Features:
 * - Dynamic color synchronization with Team Accent / Stadium Green (#34C759)
 * - Subtle, smooth, restrained glow pulse (Normal -> Soft Glow -> Slight Brightness -> Normal)
 * - Strictly isolated to active striker; zero memory leaks or unmount leaks
 * - SSR & Vitest safe with dynamic lottie-web loading and SVG cleanup
 */
export const StrikerLottieAnimation = React.memo(
  function StrikerLottieAnimation({
    accentColor = '#34C759',
    className = '',
  }: StrikerLottieAnimationProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);

    // Cache customized color palette so it only recalculates when accentColor changes
    const animationData = useMemo(() => {
      return customizeAnimationColors(rawCricketAnimation, accentColor);
    }, [accentColor]);

    useEffect(() => {
      const container = containerRef.current;
      let animItem: AnimationItem | null = null;
      let isMounted = true;

      // Dynamically load lottie-web on client only
      import('lottie-web')
        .then((lottieModule) => {
          if (!isMounted || !container) return;
          const lottie = lottieModule.default || lottieModule;

          // Clear any previous child nodes to prevent duplicate instances
          container.innerHTML = '';

          animItem = lottie.loadAnimation({
            container,
            renderer: 'svg',
            loop: true,
            autoplay: true,
            animationData,
            rendererSettings: {
              preserveAspectRatio: 'xMidYMid meet',
              progressiveLoad: true,
              hideOnTransparent: true,
            },
          });
        })
        .catch((err) => {
          console.warn('[StrikerLottieAnimation] Failed to initialize lottie-web:', err);
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
    }, [animationData]);

    return (
      <motion.div
        animate={{
          filter: [
            `drop-shadow(0 0 0px ${accentColor}00) brightness(1)`,
            `drop-shadow(0 0 3px ${accentColor}70) brightness(1.06)`,
            `drop-shadow(0 0 6px ${accentColor}a0) brightness(1.12)`,
            `drop-shadow(0 0 3px ${accentColor}70) brightness(1.06)`,
            `drop-shadow(0 0 0px ${accentColor}00) brightness(1)`,
          ],
          opacity: [0.92, 0.97, 1, 0.97, 0.92],
        }}
        transition={{
          duration: 2.2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className={`relative inline-flex items-center justify-center shrink-0 w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 select-none pointer-events-none ${className}`}
        aria-label="Active Striker Animation"
        title="Active Striker Indicator"
      >
        <div
          ref={containerRef}
          className="w-full h-full flex items-center justify-center overflow-hidden"
        />
      </motion.div>
    );
  }
);
