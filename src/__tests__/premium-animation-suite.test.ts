import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

import { PageTransition } from '../components/layout/PageTransition';
import { MotionNumber } from '../components/common/MotionNumber';
import {
  Skeleton,
  MatchCardSkeleton,
  TournamentCardSkeleton,
  TeamCardSkeleton,
  ScoreboardSkeleton,
  AnalyticsStatsSkeleton,
} from '../components/common/Skeleton';
import { ToastNotification } from '../components/common/ToastNotification';
import {
  EASINGS,
  PAGE_DIRECTION_VARIANTS,
  REVEAL_CHILD_VARIANTS,
  TOAST_VARIANTS,
} from '../lib/animations';
import * as animationsModule from '../lib/animations';

// Mock next/navigation for testing PageTransition
vi.mock('next/navigation', () => ({
  usePathname: () => '/matches/history',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useParams: () => ({ matchId: 'test-123' }),
}));

describe('Premium Animation System — Comprehensive Validation Suite', () => {
  describe('1. Animation Design Standards & Timings', () => {
    it('verifies standard animation durations fall within designated target ranges (200-350ms)', () => {
      // Page transitions: 200–300 ms (push variant transition)
      const pushAnimate = PAGE_DIRECTION_VARIANTS.animate as (i: unknown) => {
        transition: { duration: number };
      };
      expect(pushAnimate({ kind: 'push', delta: 1 }).transition.duration).toBeGreaterThanOrEqual(0.2);
      expect(pushAnimate({ kind: 'push', delta: 1 }).transition.duration).toBeLessThanOrEqual(0.3);

      // Content entrances: 200–350 ms (Reveal child transition)
      const revealShow = REVEAL_CHILD_VARIANTS.show as (i?: number) => {
        transition: { duration: number };
      };
      expect(revealShow(0).transition.duration).toBeGreaterThanOrEqual(0.2);
      expect(revealShow(0).transition.duration).toBeLessThanOrEqual(0.35);

      // Toast micro interaction: 120–200 ms
      const toastAnimate = TOAST_VARIANTS.animate as { transition: { duration: number } };
      expect(toastAnimate.transition.duration).toBeGreaterThanOrEqual(0.12);
      expect(toastAnimate.transition.duration).toBeLessThanOrEqual(0.2);
    });

    it('keeps the retired pre-unification exports deleted (one motion system)', () => {
      // Motion unification (owner pick, 2026-11-11): framer-motion +
      // animations.ts tokens are the ONE system. These exports were
      // dead or zombie (test-only) and must not come back.
      const mod = animationsModule as unknown as Record<string, unknown>;
      for (const name of [
        'DURATIONS',
        'TRANSITIONS',
        'BOTTOM_SHEET_VARIANTS',
        'CONTENT_FADE_UP_VARIANTS',
        'STAGGER_CONTAINER',
        'FADE_UP_ITEM',
        'ACCORDION_VARIANTS',
        'NUMBER_COUNTER_VARIANTS',
        'DROPDOWN_MENU_VARIANTS',
        'TAP_SCALE',
        'HOVER_SCALE',
        'ICON_TAP_SCALE',
        'ICON_HOVER_SCALE',
      ]) {
        expect(mod[name], name).toBeUndefined();
      }
      expect(fs.existsSync(path.resolve(process.cwd(), 'src/components/common/FadeInUp.tsx'))).toBe(false);
    });

    it('verifies natural ease-out cubic-bezier easing curve for entrances', () => {
      expect(EASINGS.easeOut).toEqual([0.16, 1, 0.3, 1]);
    });

    it('verifies globals.css keeps shimmer + reduced motion, and the retired CSS entrances stay deleted', () => {
      const cssPath = path.resolve(process.cwd(), 'src/app/globals.css');
      const css = fs.readFileSync(cssPath, 'utf8');

      expect(css).toContain('@keyframes shimmer');
      expect(css).toContain('animate-shimmer');
      expect(css).toContain('@media (prefers-reduced-motion: reduce)');
      expect(css).toContain('animation-duration: 0.01ms !important');
      // Retired in the unification: the parallel CSS entrance system
      // and the duplicate skeleton pulse.
      expect(css).not.toContain('@keyframes fade-in');
      expect(css).not.toContain('@keyframes fade-slide-up');
      expect(css).not.toContain('@keyframes skeleton-pulse');
      expect(css).not.toContain('.animate-fade-in');
      expect(css).not.toContain('.animate-scale-in');
    });
  });

  describe('2. Page Transition Animation (Category A)', () => {
    it('renders PageTransition component cleanly around child routes', () => {
      const html = renderToStaticMarkup(
        React.createElement(
          PageTransition,
          null,
          React.createElement('div', { id: 'test-child' }, 'Route Content')
        )
      );

      expect(html).toContain('Route Content');
      expect(html).toContain('id="test-child"');
    });

    it('verifies PageTransition is integrated inside Navigation.tsx wrapping children', () => {
      const navPath = path.resolve(process.cwd(), 'src/components/layout/Navigation.tsx');
      const navContent = fs.readFileSync(navPath, 'utf8');

      expect(navContent).toContain("import { PageTransition } from '@/components/layout/PageTransition';");
      expect(navContent).toContain('<PageTransition>{children}</PageTransition>');
    });

    it('slides the entering page in PAGE_DIRECTION_VARIANTS (legacy variants retired)', () => {
      const initial = PAGE_DIRECTION_VARIANTS.initial as (i: unknown) => { x: number };
      expect(initial({ kind: 'push', delta: 1 }).x).toBe(64);
      expect(PAGE_DIRECTION_VARIANTS.animate).toBeDefined();
    });
  });

  describe('3. Content Entrance Animation (Category B) — the Reveal system', () => {
    it('verifies REVEAL_CHILD_VARIANTS uses the unified scale/fade entrance with capped stagger', () => {
      expect(REVEAL_CHILD_VARIANTS.hidden).toEqual({ opacity: 0, scale: 0.97 });
      const show = REVEAL_CHILD_VARIANTS.show as (i?: number) => {
        transition: { delay?: number };
      };
      expect(show(2).transition.delay).toBeCloseTo(0.09);
      // Delay caps at the 9th item (index 8) so long lists stop accruing.
      expect(show(20).transition.delay).toBeCloseTo(0.36);
    });
  });

  describe('4. Button Interaction Animation (Category C)', () => {
    it('verifies button transition properties and active press effect in globals.css', () => {
      const cssPath = path.resolve(process.cwd(), 'src/app/globals.css');
      const css = fs.readFileSync(cssPath, 'utf8');

      // 150ms transition on interactive buttons
      expect(css).toContain('transition-duration: 150ms;');
      // Restrained scale(0.98) on active press
      expect(css).toContain('transform: scale(0.98);');
      // Disabled button safeguard: transform: none !important
      expect(css).toContain('transform: none !important;');
      // Focus-visible outline for keyboard navigation
      expect(css).toContain(':focus-visible');
    });
  });

  describe('5. Skeleton Loading Animation (Category D)', () => {
    it('renders base Skeleton with animate-shimmer styling and aria-hidden', () => {
      const html = renderToStaticMarkup(React.createElement(Skeleton, { className: 'h-4 w-24' }));
      expect(html).toContain('animate-shimmer');
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('h-4 w-24');
    });

    it('renders MatchCardSkeleton with layout-matched dimensions and accessible loading label', () => {
      const html = renderToStaticMarkup(React.createElement(MatchCardSkeleton));
      expect(html).toContain('aria-label="Loading match details..."');
      expect(html).toContain('floating-card');
      expect(html).toContain('animate-shimmer');
    });

    it('renders TournamentCardSkeleton and TeamCardSkeleton', () => {
      const htmlTournament = renderToStaticMarkup(React.createElement(TournamentCardSkeleton));
      expect(htmlTournament).toContain('aria-label="Loading tournament..."');
      expect(htmlTournament).toContain('animate-shimmer');

      const htmlTeam = renderToStaticMarkup(React.createElement(TeamCardSkeleton));
      expect(htmlTeam).toContain('aria-label="Loading squad..."');
      expect(htmlTeam).toContain('animate-shimmer');
    });

    it('renders ScoreboardSkeleton for layout-shift prevention during live scoring load', () => {
      const htmlScoreboard = renderToStaticMarkup(React.createElement(ScoreboardSkeleton));
      expect(htmlScoreboard).toContain('aria-label="Loading live scoreboard..."');
      expect(htmlScoreboard).toContain('animate-shimmer');
    });

    it('verifies match history page displays skeleton while loading instead of flash of empty', () => {
      const historyPath = path.resolve(process.cwd(), 'src/app/matches/history/page.tsx');
      const content = fs.readFileSync(historyPath, 'utf8');

      expect(content).toContain('data-testid="match-history-skeleton-container"');
      expect(content).toContain('<MatchCardSkeleton />');
    });
  });

  describe('6. Live Score and Number Animation (Category E)', () => {
    it('renders MotionNumber with tabular nums class and initial value', () => {
      const html = renderToStaticMarkup(
        React.createElement(MotionNumber, { value: 145, prefix: '$' })
      );

      expect(html).toContain('145');
      expect(html).toContain('$');
      expect(html).toContain('num-font');
    });

    it('verifies MotionNumber carries its digit animation inline (no shared counter variants)', () => {
      const motionNumberPath = path.resolve(process.cwd(), 'src/components/common/MotionNumber.tsx');
      const content = fs.readFileSync(motionNumberPath, 'utf8');
      expect(content).toContain('popLayout');
      expect(content).not.toContain('NUMBER_COUNTER_VARIANTS');
    });

    it('verifies Live Scoring cockpit integrates MotionNumber for total runs, wickets, and overs', () => {
      const scorePath = path.resolve(process.cwd(), 'src/app/matches/score/[matchId]/page.tsx');
      const content = fs.readFileSync(scorePath, 'utf8');

      expect(content).toContain('<MotionNumber value={inn.totalRuns} />');
      expect(content).toContain('<MotionNumber value={inn.totalWickets} />');
      expect(content).toContain('<MotionNumber value={inn.oversString} />');
    });
  });

  describe('7. Expand and Collapse Animation (Category F)', () => {
    it('verifies BowlingLimiterDrawer uses smooth accordion animation and aria-expanded', () => {
      const drawerPath = path.resolve(process.cwd(), 'src/components/common/BowlingLimiterDrawer.tsx');
      const content = fs.readFileSync(drawerPath, 'utf8');

      expect(content).toContain('aria-expanded={isExpanded}');
      expect(content).toContain('data-testid="bowling-limiter-drawer-content"');
      expect(content).toContain("rotate-180");
    });

    it('verifies Teams squad roster uses AnimatePresence with dynamic height animation', () => {
      const teamsPath = path.resolve(process.cwd(), 'src/app/teams/page.tsx');
      const content = fs.readFileSync(teamsPath, 'utf8');

      expect(content).toContain('key="squad-roster"');
      expect(content).toContain("initial={{ height: 0, opacity: 0 }}");
      expect(content).toContain("animate={{ height: 'auto', opacity: 1 }}");
      expect(content).toContain("exit={{ height: 0, opacity: 0 }}");
    });
  });

  describe('8. Toast Notification Animation (Category G)', () => {
    it('renders ToastNotification when show is true', () => {
      const html = renderToStaticMarkup(
        React.createElement(
          ToastNotification,
          { show: true },
          React.createElement('div', { id: 'toast-msg' }, 'Changes Saved!')
        )
      );

      expect(html).toContain('Changes Saved!');
      expect(html).toContain('id="toast-msg"');
    });

    it('does not render content when show is false', () => {
      const html = renderToStaticMarkup(
        React.createElement(
          ToastNotification,
          { show: false },
          React.createElement('div', { id: 'toast-msg' }, 'Hidden')
        )
      );

      expect(html).not.toContain('Hidden');
      expect(html).not.toContain('id="toast-msg"');
    });

    it('verifies Profile and Scoring pages wrap feedback alerts in ToastNotification', () => {
      const profilePath = path.resolve(process.cwd(), 'src/app/profile/page.tsx');
      const profileContent = fs.readFileSync(profilePath, 'utf8');
      // F4-16 consolidation: the profile page's feedback moved to the shared
      // AppToast system (showAppToast via handleNotify); ToastNotification
      // remains only on the scoring page.
      expect(profileContent).toContain('showAppToast(');
      expect(profileContent).not.toContain('ToastNotification');

      const scorePath = path.resolve(process.cwd(), 'src/app/matches/score/[matchId]/page.tsx');
      const scoreContent = fs.readFileSync(scorePath, 'utf8');
      expect(scoreContent).toContain('<ToastNotification show={inn.isOverComplete}>');
      expect(scoreContent).toContain('<ToastNotification show={!!bowlerError}>');
    });
  });
});
