'use client';

import { useRef, useEffect, useCallback } from 'react';

export interface UseRecentBallsAutoSlideOptions {
  /** Scroll behavior: 'smooth' | 'auto' (default: 'smooth') */
  behavior?: ScrollBehavior;
  /** Delay in ms before measuring DOM layout to account for animations (default: 30) */
  delay?: number;
  /** Extra offset in pixels to ensure rightmost margin is completely visible (default: 8) */
  extraOffset?: number;
}

export interface UseRecentBallsAutoSlideReturn<T extends HTMLElement = HTMLDivElement> {
  containerRef: React.RefObject<T>;
  scrollToLatest: (customBehavior?: ScrollBehavior) => void;
  resetScroll: () => void;
}

/**
 * Custom hook to automatically slide/scroll a horizontal Recent Balls container
 * to the latest delivery smoothly whenever balls are scored, updated, or undone.
 * 
 * Complies with dynamic width handling (no hardcoded ball counts), smooth animations,
 * zero page-level scroll disturbance, and responsive device adaptations.
 */
export function useRecentBallsAutoSlide<T extends HTMLElement = HTMLDivElement>(
  ballsLog: readonly string[] | string[],
  options: UseRecentBallsAutoSlideOptions = {}
): UseRecentBallsAutoSlideReturn<T> {
  const { behavior = 'smooth', delay = 30, extraOffset = 8 } = options;
  const containerRef = useRef<T>(null);
  const prevCountRef = useRef(ballsLog.length);

  const scrollToLatest = useCallback(
    (customBehavior?: ScrollBehavior) => {
      const el = containerRef.current;
      if (!el) return;

      // Calculate maximum scrollable distance
      const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
      if (maxScroll > 0) {
        el.scrollTo({
          left: maxScroll + extraOffset,
          behavior: customBehavior || behavior,
        });
      }
    },
    [behavior, extraOffset]
  );

  const resetScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ left: 0, behavior: 'auto' });
  }, []);

  // Auto-scroll when balls change
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // When an over finishes or resets, rewind immediately to beginning
    if (ballsLog.length === 0) {
      resetScroll();
      prevCountRef.current = 0;
      return;
    }

    const isNewBall = ballsLog.length > prevCountRef.current;
    prevCountRef.current = ballsLog.length;

    let timerId: NodeJS.Timeout | number | null = null;
    const rafId = requestAnimationFrame(() => {
      timerId = setTimeout(() => {
        scrollToLatest(isNewBall ? behavior : 'smooth');
      }, delay);
    });

    return () => {
      cancelAnimationFrame(rafId);
      if (timerId !== null) clearTimeout(timerId);
    };
  }, [ballsLog.length, delay, behavior, scrollToLatest, resetScroll]);

  // Handle container resize (e.g. mobile rotation from portrait to landscape)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver(() => {
      if (el.scrollWidth > el.clientWidth) {
        scrollToLatest('smooth');
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollToLatest]);

  return {
    containerRef,
    scrollToLatest,
    resetScroll,
  };
}
