import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { useIsDesktop, DESKTOP_MEDIA_QUERY } from '../hooks/useIsDesktop';

/**
 * Bug 14 — full-screen blinking on scoreboard updates.
 *
 * Verified root cause: the live score page mounted BOTH the mobile and the
 * desktop scorer trees and merely hid one with CSS (`md:hidden` /
 * `hidden md:block`), so every ball re-rendered and re-animated
 * (MotionNumber) both trees. Contributing factor: ScoringViewProvider handed
 * out a new context value object on every render.
 *
 * Fix: the page mounts exactly one tree, gated by useIsDesktop
 * (matchMedia `(min-width: 768px)`, Tailwind's md breakpoint), and the
 * provider value is memoized with stable callbacks. All scoring state,
 * handlers and modals live outside the two trees (page scope + sibling
 * modals), so gating cannot lose match state.
 */

const pageSrc = fs.readFileSync(
  path.resolve(process.cwd(), 'src/app/matches/score/[matchId]/page.tsx'),
  'utf-8'
);
const ctxSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/context/ScoringViewContext.tsx'), 'utf-8');
const hookSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/hooks/useIsDesktop.ts'), 'utf-8');

describe('Bug 14: single mounted scorer tree', () => {
  it('page gates the mobile tree on !isDesktop and the desktop tree on isDesktop', () => {
    const mobileGate = pageSrc.indexOf('{!isDesktop && (');
    const mobileTree = pageSrc.indexOf('MOBILE SCORER COCKPIT');
    const desktopGate = pageSrc.indexOf('{isDesktop && (');
    const desktopTree = pageSrc.indexOf('DESKTOP SCORER WORKSPACE');
    expect(mobileGate).toBeGreaterThanOrEqual(0);
    expect(desktopGate).toBeGreaterThanOrEqual(0);
    // Each gate must wrap its own tree (gate appears before its tree markup).
    expect(mobileGate).toBeLessThan(mobileTree);
    expect(mobileTree).toBeLessThan(desktopGate);
    expect(desktopGate).toBeLessThan(desktopTree);
  });

  it('neither tree root is CSS-hidden anymore (dual-mount pattern removed)', () => {
    expect(pageSrc).not.toContain('md:hidden flex flex-col select-none');
    expect(pageSrc).not.toContain('hidden md:block max-w-7xl');
  });

  it('both trees keep their original layout classes (no visual redesign snuck in)', () => {
    expect(pageSrc).toContain(
      'className="flex flex-col select-none overflow-y-auto min-h-[calc(100dvh-3.25rem)] gap-card-gap pb-safe pt-4 px-screen-x w-full max-w-full overflow-x-hidden"'
    );
    expect(pageSrc).toContain('className="max-w-7xl mx-auto space-y-4"');
  });

  it('shared modals remain siblings after the trees, not inside a gated tree', () => {
    const desktopTree = pageSrc.indexOf('DESKTOP SCORER WORKSPACE');
    // These must render regardless of which tree is mounted.
    for (const marker of ['<OutModal', '<PlayerSelectionModal', '<HistoricalBallEditModal', '<ToastNotification']) {
      const idx = pageSrc.indexOf(marker, desktopTree);
      expect(idx, `${marker} present after desktop tree`).toBeGreaterThan(desktopTree);
    }
  });

  it('hook listens to the Tailwind md media query and cleans up', () => {
    expect(DESKTOP_MEDIA_QUERY).toBe('(min-width: 768px)');
    expect(hookSrc).toContain('window.matchMedia(DESKTOP_MEDIA_QUERY)');
    expect(hookSrc).toContain("mq.addEventListener('change', update)");
    expect(hookSrc).toContain("mq.removeEventListener('change', update)");
  });

  it('hook renders mobile-first on the server (SSR contract: no hydration mismatch)', () => {
    function Probe() {
      const isDesktop = useIsDesktop();
      return React.createElement('span', null, String(isDesktop));
    }
    // renderToString runs no effects: the initial value must be false so the
    // server HTML matches the first client render on every device.
    expect(renderToString(React.createElement(Probe))).toContain('false');
  });

  it('ScoringViewProvider memoizes its value and stabilizes callbacks', () => {
    expect(ctxSrc).toContain('useMemo(');
    expect(ctxSrc).toContain('const toggleView = useCallback(');
    expect(ctxSrc).toContain('const closeView = useCallback(');
    // The old unmemoized inline value object must be gone.
    expect(ctxSrc).not.toMatch(/<ScoringViewContext\.Provider\s+value=\{\{/);
  });
});
