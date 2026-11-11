'use client';

import React, { useEffect, useRef, useMemo } from 'react';
import type { AnimationItem } from 'lottie-web';
export interface StadiumLottieAnimationProps {
  /** Accent color to tint the stadium shapes (defaults to Stadium Green #34C759) */
  accentColor?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'hero';
  className?: string;
  loop?: boolean;
  autoplay?: boolean;
  animateGlow?: boolean;
  /** Fired once the animation is loaded and rendering (image-entrance programme: the Home hero crossfades from a static poster on this signal). */
  onReady?: () => void;
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
    onReady,
  }: StadiumLottieAnimationProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const onReadyRef = useRef(onReady);
    useEffect(() => {
      onReadyRef.current = onReady;
    }, [onReady]);

    useEffect(() => {
      const container = containerRef.current;
      let animItem: AnimationItem | null = null;
      let observer: IntersectionObserver | null = null;
      let isMounted = true;
      let idleHandle: number | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const start = () => {
        // Dynamically load lottie-web & stadium animation JSON on client only (SSR and Vitest safe)
        Promise.all([
          import('lottie-web'),
          import('../../../animations/stadium.json'),
        ])
          .then(([lottieModule, stadiumJsonModule]) => {
            if (!isMounted || !container) return;
            const lottie = lottieModule.default || lottieModule;
            const rawData = stadiumJsonModule.default || stadiumJsonModule;
            const animationData = customizeStadiumColors(rawData, accentColor);

            container.innerHTML = '';

            animItem = lottie.loadAnimation({
              container,
              // F5: canvas renderer — cheaper than the SVG tree
              // for a looping ambient animation.
              renderer: 'canvas',
              loop,
              autoplay,
              animationData,
              rendererSettings: {
                // CanvasRendererConfig only — the SVG-only
                // progressiveLoad/hideOnTransparent settings went
                // away with the renderer switch.
                preserveAspectRatio: 'xMidYMid meet',
              },
            });
            onReadyRef.current?.();
            // Performance round (2026-11-11): pause the ambient
            // loop while it is scrolled off-screen; resume on
            // return. An invisible canvas that keeps painting is
            // pure cost on a phone GPU.
            if (autoplay && typeof IntersectionObserver !== 'undefined') {
              observer = new IntersectionObserver(
                (entries) => {
                  for (const entry of entries) {
                    if (!animItem) return;
                    if (entry.isIntersecting) animItem.play();
                    else animItem.pause();
                  }
                },
                { threshold: 0.05 },
              );
              observer.observe(container);
            }
          })
          .catch((err) => {
            console.warn('[StadiumLottieAnimation] Failed to initialize lottie-web:', err);
          });
      };

      // F5: defer the Lottie bootstrap until the browser is idle
      // so module loading + first render never compete with the
      // page-entry transition (Home hero mounts this immediately).
      const idleWin = window as unknown as {
        requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
        cancelIdleCallback?: (handle: number) => void;
      };
      if (typeof idleWin.requestIdleCallback === 'function') {
        idleHandle = idleWin.requestIdleCallback(start, { timeout: 800 });
      } else {
        timer = setTimeout(start, 350);
      }

      return () => {
        isMounted = false;
        if (idleHandle !== null && typeof idleWin.cancelIdleCallback === 'function') {
          idleWin.cancelIdleCallback(idleHandle);
        }
        if (timer !== null) clearTimeout(timer);
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        if (animItem) {
          animItem.destroy();
          animItem = null;
        }
        if (container) {
          container.innerHTML = '';
        }
      };
    }, [accentColor, loop, autoplay]);

    const sizeClass = SIZE_MAP[size] || SIZE_MAP.md;

    // F5: the wrapper is a plain div now. The previous
    // framer-motion wrapper ran an INFINITE filter: drop-shadow
    // keyframe animation (a repaint every frame on iOS, not
    // compositor-only) for the component's whole lifetime. The
    // `animateGlow` prop is retained for API compatibility but
    // no longer animates anything.
    void animateGlow;
    return (
      <div
        className={`relative inline-flex items-center justify-center shrink-0 select-none pointer-events-none ${sizeClass} ${className}`}
        role="img"
        aria-label="Stadium Animation"
        title="Stadium / Host Venue Indicator"
      >
        <div
          ref={containerRef}
          className="w-full h-full flex items-center justify-center overflow-hidden"
        />
      </div>
    );
  }
);
