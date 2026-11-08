'use client';

import { useEffect, useState } from 'react';

/** Tailwind `md` breakpoint — the score page's mobile/desktop split point. */
export const DESKTOP_MEDIA_QUERY = '(min-width: 768px)';

/**
 * Bug 14 (full-screen blinking): the live score page used to mount BOTH its
 * mobile and desktop scorer trees and merely hide one with CSS, so every ball
 * re-rendered and re-animated (MotionNumber) both trees. This hook lets the
 * page mount only the tree for the current viewport.
 *
 * SSR / first paint returns `false` (mobile tree): scoring is phone-first,
 * and the server render must match the first client render. On desktop the
 * effect swaps to the desktop tree immediately after mount — before any
 * scoring interaction — and all scoring state lives in page scope (not in
 * either tree), so a breakpoint change mid-match loses nothing.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mq = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return isDesktop;
}
