'use client';

import { useEffect, useState } from 'react';

export interface ViewportMetrics {
  /** Usable viewport height in px (shrinks when the on-screen keyboard opens). */
  height: number;
  width: number;
  /**
   * Visual viewport's offset from the layout viewport's top edge. On
   * iOS the keyboard does not move fixed-position layers — the visual
   * viewport pans up instead (offsetTop > 0) while a bottom-anchored
   * fixed layer stays glued to the layout bottom, UNDER the keyboard.
   * Bottom-anchored overlays must add this offset to sit inside the
   * visible region (keyboard bug report, 2026-11-10).
   */
  offsetTop: number;
}

function measure(): ViewportMetrics {
  if (typeof window === 'undefined') return { height: 0, width: 0, offsetTop: 0 };
  const vv = window.visualViewport;
  return {
    height: Math.round(vv?.height ?? window.innerHeight),
    width: Math.round(vv?.width ?? window.innerWidth),
    offsetTop: Math.round(vv?.offsetTop ?? 0),
  };
}

/**
 * Viewport metrics driven by the VisualViewport API where available
 * (master prompt Phases 3 & 7): detent heights derive from the usable
 * viewport — accounting for dynamic browser chrome, orientation and
 * the virtual keyboard — never from fixed pixel assumptions.
 */
export function useViewportMetrics(): ViewportMetrics {
  const [metrics, setMetrics] = useState<ViewportMetrics>(measure);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setMetrics(measure()));
    };
    update();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      cancelAnimationFrame(raf);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return metrics;
}
