import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

import { PageTransition } from '../components/layout/PageTransition';
import { FadeInUp } from '../components/common/FadeInUp';
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
  DURATIONS,
  EASINGS,
  TRANSITIONS,
  PAGE_TRANSITION_VARIANTS,
  CONTENT_FADE_UP_VARIANTS,
  TOAST_VARIANTS,
  NUMBER_COUNTER_VARIANTS,
  ACCORDION_VARIANTS,
} from '../lib/animations';

// Mock next/navigation for testing PageTransition
vi.mock('next/navigation', () => ({
  usePathname: () => '/matches/history',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useParams: () => ({ matchId: 'test-123' }),
}));

describe('Premium Animation System — Comprehensive Validation Suite', () => {
  describe('1. Animation Design Standards & Timings', () => {
    it('verifies standard animation durations fall within designated target ranges (200-350ms)', () => {
      // Page transitions: 200–300 ms
      expect(DURATIONS.standard).toBeGreaterThanOrEqual(0.2);
      expect(DURATIONS.standard).toBeLessThanOrEqual(0.3);

      // Content entrances: 200–350 ms
      expect(DURATIONS.medium).toBeGreaterThanOrEqual(0.2);
      expect(DURATIONS.medium).toBeLessThanOrEqual(0.35);

      // Micro interactions: 120–200 ms
      expect(DURATIONS.micro).toBeGreaterThanOrEqual(0.12);
      expect(DURATIONS.micro).toBeLessThanOrEqual(0.2);
    });

    it('verifies natural ease-out cubic-bezier easing curve for entrances', () => {
      expect(EASINGS.easeOut).toEqual([0.16, 1, 0.3, 1]);
    });

    it('verifies globals.css includes keyframes for fade, slide, shimmer, and reduced motion', () => {
      const cssPath = path.resolve(process.cwd(), 'src/app/globals.css');
      const css = fs.readFileSync(cssPath, 'utf8');

      expect(css).toContain('@keyframes fade-slide-up');
      expect(css).toContain('@keyframes fade-in');
      expect(css).toContain('@keyframes shimmer');
      expect(css).toContain('@keyframes skeleton-pulse');
      expect(css).toContain('animate-fade-up');
      expect(css).toContain('animate-shimmer');
      expect(css).toContain('@media (prefers-reduced-motion: reduce)');
      expect(css).toContain('animation-duration: 0.01ms !important');
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

    it('has subtle horizontal slide and opacity fade in PAGE_TRANSITION_VARIANTS', () => {
      expect(PAGE_TRANSITION_VARIANTS.initial).toEqual({ opacity: 0, x: 8 });
      expect(PAGE_TRANSITION_VARIANTS.animate).toBeDefined();
    });
  });

  describe('3. Fade + Slide-Up Content Animation (Category B)', () => {
    it('renders FadeInUp component with children and custom classNames', () => {
      const html = renderToStaticMarkup(
        React.createElement(
          FadeInUp,
          { className: 'test-fade-card', delay: 0.05 },
          React.createElement('p', null, 'Card Content')
        )
      );

      expect(html).toContain('Card Content');
      expect(html).toContain('test-fade-card');
    });

    it('verifies CONTENT_FADE_UP_VARIANTS uses subtle 8px vertical movement and opacity', () => {
      expect(CONTENT_FADE_UP_VARIANTS.hidden).toEqual({ opacity: 0, y: 8 });
      expect(CONTENT_FADE_UP_VARIANTS.visible).toBeDefined();
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

    it('verifies NUMBER_COUNTER_VARIANTS uses restrained 10px translation for immediate legibility', () => {
      expect(NUMBER_COUNTER_VARIANTS.initial).toEqual({ y: 10, opacity: 0 });
      expect(NUMBER_COUNTER_VARIANTS.animate).toBeDefined();
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
    it('verifies ACCORDION_VARIANTS has height: auto and dynamic collapse to 0', () => {
      expect(ACCORDION_VARIANTS.collapsed).toEqual({ height: 0, opacity: 0 });
      expect((ACCORDION_VARIANTS.expanded as Record<string, unknown>).height).toBe('auto');
      expect((ACCORDION_VARIANTS.expanded as Record<string, unknown>).opacity).toBe(1);
    });

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
      expect(profileContent).toContain('<ToastNotification show={!!feedbackMessage}>');

      const scorePath = path.resolve(process.cwd(), 'src/app/matches/score/[matchId]/page.tsx');
      const scoreContent = fs.readFileSync(scorePath, 'utf8');
      expect(scoreContent).toContain('<ToastNotification show={inn.isOverComplete}>');
      expect(scoreContent).toContain('<ToastNotification show={!!bowlerError}>');
    });
  });
});
