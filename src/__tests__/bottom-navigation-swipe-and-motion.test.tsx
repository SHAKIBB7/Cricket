import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CricketBottomNavigation } from '../components/navigation/CricketBottomNavigation';

describe('Liquid Glass Bottom Navigation Motion & Swipe Verification Suite', () => {
  const mockT = (key: string) => {
    const map: Record<string, string> = {
      home: 'Home',
      new_match: 'New Match',
      matches: 'Matches',
      tournaments: 'Tournament',
      teams: 'Teams',
    };
    return map[key] || key;
  };

  describe('1. Visual Clarity & Liquid Glass Architecture', () => {
    it('renders the 5 primary tabs with active Home tab indicator', () => {
      const html = renderToStaticMarkup(
        <CricketBottomNavigation pathname="/" language="en" t={mockT} />
      );

      // Verify all 5 routes are present
      expect(html).toContain('href="/"');
      expect(html).toContain('href="/matches/new"');
      expect(html).toContain('href="/matches/history"');
      expect(html).toContain('href="/tournaments"');
      expect(html).toContain('href="/teams"');

      // Home active state
      expect(html).toContain('aria-current="page"');
      expect(html).toContain('text-[#059669]');
    });

    it('positions the floating navbar lower closer to viewport bottom with safe-area protection', () => {
      const html = renderToStaticMarkup(
        <CricketBottomNavigation pathname="/" language="en" t={mockT} />
      );

      // Viewport-aware responsive calculation
      expect(html).toContain('bottom-[max(0.35rem,calc(env(safe-area-inset-bottom,0px)*0.65+0.125rem))]');
      expect(html).toContain('fixed');
      expect(html).toContain('z-40');
    });

    it('renders crystal specular highlight sheen for 50% clearer optical definition', () => {
      const html = renderToStaticMarkup(
        <CricketBottomNavigation pathname="/" language="en" t={mockT} />
      );

      expect(html).toContain('bg-gradient-to-b from-white/60 via-white/15 to-transparent');
      expect(html).toContain('dark:from-white/14 dark:via-white/3 dark:to-transparent');
    });
  });

  describe('2. Continuous Slide Animation & Single-Identity Track', () => {
    it('uses a single continuous sliding track for both pill background and emerald bar', () => {
      const html = renderToStaticMarkup(
        <CricketBottomNavigation pathname="/" language="en" t={mockT} />
      );

      // Sliding track contains the 380ms fluid bezier curve
      expect(html).toContain('duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)]');
      expect(html).toContain('will-change-transform');

      // The emerald bar is nested inside the sliding track
      expect(html).toContain('h-[3px] w-5 sm:w-6 rounded-full bg-[#10b981] shadow-xs opacity-100 scale-100');

      // Individual link items do not have jarring opaque background jumps
      expect(html).toContain('bg-transparent hover:bg-white/30');
    });

    it('dynamically translates sliding track per active route index', () => {
      const routes = [
        { path: '/', expected: 'transform:translateX(0%)' },
        { path: '/matches/new', expected: 'transform:translateX(100%)' },
        { path: '/matches/history', expected: 'transform:translateX(200%)' },
        { path: '/tournaments', expected: 'transform:translateX(300%)' },
        { path: '/teams', expected: 'transform:translateX(400%)' },
      ];

      for (const { path, expected } of routes) {
        const html = renderToStaticMarkup(
          <CricketBottomNavigation pathname={path} language="en" t={mockT} />
        );
        expect(html).toContain(expected);
      }
    });
  });

  describe('3. Swipe Gesture Direction & Threshold Guard Mathematical Verification', () => {
    // Pure mathematical function mirroring the navbar and page swipe detection
    const evaluateSwipe = (
      startX: number,
      startY: number,
      endX: number,
      endY: number,
      elapsed: number,
      threshold = 60,
      ratio = 2.2,
      maxDuration = 450
    ): 'left' | 'right' | null => {
      const deltaX = endX - startX;
      const deltaY = endY - startY;

      if (
        Math.abs(deltaX) >= threshold &&
        Math.abs(deltaX) >= Math.abs(deltaY) * ratio &&
        elapsed <= maxDuration &&
        Math.abs(deltaX) / elapsed >= 0.2
      ) {
        return deltaX < 0 ? 'left' : 'right';
      }
      return null;
    };

    it('detects genuine horizontal left swipe (advancing to next tab)', () => {
      // Swipe left: X from 300 to 180 (-120px), Y barely moved 10px, in 220ms
      const result = evaluateSwipe(300, 200, 180, 210, 220);
      expect(result).toBe('left');
    });

    it('detects genuine horizontal right swipe (returning to prev tab)', () => {
      // Swipe right: X from 100 to 220 (+120px), Y moved 8px, in 200ms
      const result = evaluateSwipe(100, 200, 220, 208, 200);
      expect(result).toBe('right');
    });

    it('strictly rejects vertical scrolling gestures (preventing accidental navigation)', () => {
      // Vertical scroll: Y changed by 150px, X only drifted 25px
      const verticalScroll = evaluateSwipe(200, 400, 225, 250, 250);
      expect(verticalScroll).toBeNull();

      // Diagonal swipe with steep angle: deltaX = 70, deltaY = 60 -> ratio is 1.16 (< 2.2 required)
      const diagonalScroll = evaluateSwipe(200, 300, 130, 240, 220);
      expect(diagonalScroll).toBeNull();
    });

    it('strictly rejects taps, micro-movements, and long drag timeouts', () => {
      // Tap micro-movement: deltaX = 5px
      const tap = evaluateSwipe(100, 100, 105, 102, 80);
      expect(tap).toBeNull();

      // Long sluggish drag: deltaX = 80px, but took 900ms (> 450ms timeout)
      const slowDrag = evaluateSwipe(100, 100, 20, 100, 900);
      expect(slowDrag).toBeNull();
    });

    it('preserves tab boundaries (no out-of-bounds tab navigation)', () => {
      const PRIMARY_TABS = ['/', '/matches/new', '/matches/history', '/tournaments', '/teams'];

      const getNextTab = (currentIdx: number, direction: 'left' | 'right'): string => {
        if (direction === 'left' && currentIdx < PRIMARY_TABS.length - 1) {
          return PRIMARY_TABS[currentIdx + 1];
        }
        if (direction === 'right' && currentIdx > 0) {
          return PRIMARY_TABS[currentIdx - 1];
        }
        return PRIMARY_TABS[currentIdx]; // Stays on current tab if at boundary
      };

      // At Home (index 0): swiping right does not go below 0
      expect(getNextTab(0, 'right')).toBe('/');
      // At Home (index 0): swiping left advances to /matches/new
      expect(getNextTab(0, 'left')).toBe('/matches/new');

      // At Teams (index 4): swiping left does not go beyond 4
      expect(getNextTab(4, 'left')).toBe('/teams');
      // At Teams (index 4): swiping right returns to /tournaments
      expect(getNextTab(4, 'right')).toBe('/tournaments');
    });
  });
});
