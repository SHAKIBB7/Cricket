'use client';

import React, { useEffect, useRef } from 'react';
import type { AnimationItem } from 'lottie-web';
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
      let observer: IntersectionObserver | null = null;
      let isMounted = true;
      let idleHandle: number | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const start = () => {
        // Dynamically load lottie-web & animation JSON on client only (SSR and Vitest safe)
        Promise.all([
          import('lottie-web'),
          import('../../../animations/plane.json'),
        ])
          .then(([lottieModule, planeJsonModule]) => {
            if (!isMounted || !container) return;
            const lottie = lottieModule.default || lottieModule;
            const planeData = planeJsonModule.default || planeJsonModule;

            container.innerHTML = '';

            animItem = lottie.loadAnimation({
              container,
              // F5 (parity with StadiumLottieAnimation): canvas
              // renderer is cheaper than the SVG tree for a
              // looping ambient animation.
              renderer: 'canvas',
              loop,
              autoplay,
              animationData: planeData,
              rendererSettings: {
                // CanvasRendererConfig only — the SVG-only
                // progressiveLoad/hideOnTransparent settings went
                // away with the renderer switch.
                preserveAspectRatio: 'xMidYMid meet',
              },
            });
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
            console.warn('[PlaneLottieAnimation] Failed to initialize lottie-web:', err);
          });
      };

      // F5: defer the Lottie bootstrap until the browser is idle
      // so it never competes with a page-entry transition.
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
    }, [loop, autoplay]);

    const sizeClass = SIZE_MAP[size] || SIZE_MAP.md;

    // F5 (mirrors StadiumLottieAnimation): plain div — the old
    // framer-motion wrapper ran an INFINITE filter: drop-shadow
    // keyframe loop (a repaint every frame on iOS). The
    // `animateGlow` prop is retained for API compatibility but
    // no longer animates anything.
    void animateGlow;
    return (
      <div
        className={`relative inline-flex items-center justify-center shrink-0 select-none pointer-events-none ${sizeClass} ${className}`}
        role="img"
        aria-label="Plane Animation"
        title="Visiting Team / Flight Indicator"
      >
        <div
          ref={containerRef}
          className="w-full h-full flex items-center justify-center overflow-hidden"
        />
      </div>
    );
  }
);
