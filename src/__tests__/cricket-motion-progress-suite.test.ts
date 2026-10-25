import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

import { TargetProgressBar } from '../components/scoring/TargetProgressBar';
import { MatchProgressBar } from '../components/scoring/MatchProgressBar';
import { WicketLottieAnimation } from '../components/scoring/WicketLottieAnimation';

describe('Cricket Motion Progress & Celebration Suite', () => {
  describe('1. TargetProgressBar (Chase Mode & DLS Par)', () => {
    it('calculates chase percentage accurately based on current runs vs target', () => {
      const html = renderToStaticMarkup(
        React.createElement(TargetProgressBar, {
          currentRuns: 60,
          targetRuns: 120,
          ballsRemaining: 36,
          totalOvers: 20,
          rrr: 10.0,
        })
      );

      expect(html).toContain('50%');
      expect(html).toContain('Need');
      expect(html).toContain('60'); // needed runs
      expect(html).toContain('36'); // balls remaining
      expect(html).toContain('10.00'); // RRR
      expect(html).toContain('role="progressbar"');
      expect(html).toContain('aria-valuenow="50"');
    });

    it('safely handles target achieved state when runs exceed target', () => {
      const html = renderToStaticMarkup(
        React.createElement(TargetProgressBar, {
          currentRuns: 135,
          targetRuns: 130,
          ballsRemaining: 15,
          totalOvers: 20,
          rrr: 0,
        })
      );

      expect(html).toContain('100%');
      expect(html).toContain('Target Achieved');
      expect(html).toContain('aria-valuenow="100"');
    });

    it('safely handles zero target and zero balls without NaN or division by zero', () => {
      const html = renderToStaticMarkup(
        React.createElement(TargetProgressBar, {
          currentRuns: 0,
          targetRuns: 0,
          ballsRemaining: 0,
          totalOvers: 20,
          rrr: 0,
        })
      );

      expect(html).not.toContain('NaN');
      expect(html).toContain('0%');
    });

    it('displays DLS Chase badge when isDlsApplied is true', () => {
      const html = renderToStaticMarkup(
        React.createElement(TargetProgressBar, {
          currentRuns: 85,
          targetRuns: 110,
          ballsRemaining: 18,
          totalOvers: 15,
          rrr: 8.33,
          isDlsApplied: true,
        })
      );

      expect(html).toContain('DLS Chase');
    });

    it('displays Innings Concluded when isMatchCompleted is true', () => {
      const html = renderToStaticMarkup(
        React.createElement(TargetProgressBar, {
          currentRuns: 110,
          targetRuns: 110,
          ballsRemaining: 0,
          totalOvers: 20,
          rrr: 0,
          isMatchCompleted: true,
        })
      );

      expect(html).toContain('Innings Concluded');
    });

    it('verifies TargetProgressBar does not render duplicate title cursor tooltips', () => {
      const html = renderToStaticMarkup(
        React.createElement(TargetProgressBar, {
          currentRuns: 60,
          targetRuns: 120,
          ballsRemaining: 36,
          totalOvers: 20,
          rrr: 10.0,
        })
      );

      expect(html).not.toContain('title=');
      expect(html).toContain('role="progressbar"');
    });
  });

  describe('2. MatchProgressBar (1st Innings Match Progress)', () => {
    it('calculates overs bowled percentage, displays OVER before over count, and hides projected score', () => {
      const html = renderToStaticMarkup(
        React.createElement(MatchProgressBar, {
          currentBalls: 60, // 10 overs out of 20 = 50%
          totalOvers: 20,
          crr: 8.5,
          projectedRuns: 170,
        })
      );

      expect(html).toContain('INNINGS PROGRESS');
      expect(html).toContain('OVER');
      expect(html).toContain('10.0'); // overs string
      expect(html).toContain('/ 20');
      expect(html).not.toContain('Proj');
      expect(html).not.toContain('170'); // Projected score completely hidden
      expect(html).toContain('50%');
      expect(html).toContain('role="progressbar"');
      expect(html).toContain('aria-valuenow="50"');
    });

    it('handles zero balls bowled gracefully at match start', () => {
      const html = renderToStaticMarkup(
        React.createElement(MatchProgressBar, {
          currentBalls: 0,
          totalOvers: 10,
          crr: 0,
        })
      );

      expect(html).not.toContain('NaN');
      expect(html).toContain('OVER');
      expect(html).toContain('0.0');
      expect(html).toContain('/ 10');
      expect(html).toContain('0%');
      expect(html).toContain('aria-valuenow="0"');
    });

    it('verifies MatchProgressBar does not render duplicate title cursor tooltips', () => {
      const html = renderToStaticMarkup(
        React.createElement(MatchProgressBar, {
          currentBalls: 60,
          totalOvers: 20,
          crr: 8.5,
          projectedRuns: 170,
        })
      );

      expect(html).not.toContain('title=');
      expect(html).toContain('role="progressbar"');
    });
  });

  describe('3. Boundary & Wicket Popup Notifications Disabled', () => {
    it('verifies score page does not contain BoundaryCelebrationBanner or triggerCelebration calls', () => {
      const scorePagePath = path.resolve(process.cwd(), 'src/app/matches/score/[matchId]/page.tsx');
      const content = fs.readFileSync(scorePagePath, 'utf8');

      expect(content).not.toContain('BoundaryCelebrationBanner');
      expect(content).not.toContain('triggerCelebration');
      expect(content).not.toContain('celebrationEvent');
    });

    it('verifies scoring 4 or 6 does not trigger any popup notification banner in scoring handlers', () => {
      const scorePagePath = path.resolve(process.cwd(), 'src/app/matches/score/[matchId]/page.tsx');
      const content = fs.readFileSync(scorePagePath, 'utf8');

      const handleScoreRunBlock = content.slice(
        content.indexOf('const handleScoreRun ='),
        content.indexOf('const handleConfirmOut =')
      );
      expect(handleScoreRunBlock).not.toContain('triggerCelebration');
      expect(handleScoreRunBlock).not.toContain('setToastMessage');
      expect(handleScoreRunBlock).not.toContain('toast');

      const handleConfirmOutBlock = content.slice(
        content.indexOf('const handleConfirmOut ='),
        content.indexOf('const handleUndo =')
      );
      expect(handleConfirmOutBlock).not.toContain('triggerCelebration');
      expect(handleConfirmOutBlock).not.toContain('setToastMessage');
      expect(handleConfirmOutBlock).not.toContain('toast');
    });
  });

  describe('4. WicketLottieAnimation', () => {
    it('renders WicketLottieAnimation container with accessible title', () => {
      const html = renderToStaticMarkup(
        React.createElement(WicketLottieAnimation, { size: 'sm' })
      );

      expect(html).toContain('aria-label="Wicket Animation"');
      expect(html).toContain('title="Wicket"');
    });
  });

  describe('5. Design System Tokens & globals.css Integration', () => {
    it('verifies globals.css includes .liquid-glass-card, .motion-progress-track, and .animate-boundary-glow', () => {
      const cssPath = path.resolve(process.cwd(), 'src/app/globals.css');
      const css = fs.readFileSync(cssPath, 'utf8');

      expect(css).toContain('.liquid-glass-card');
      expect(css).toContain('.motion-progress-track');
      expect(css).toContain('.motion-progress-bar');
      expect(css).toContain('@keyframes boundary-glow');
      expect(css).toContain('.animate-boundary-glow');
    });
  });

  describe('6. OverBallButton & Score Page Integration', () => {
    it('verifies OverBallButton supports long press, multi-char tokens, and micro-motion', () => {
      const scorePagePath = path.resolve(process.cwd(), 'src/app/matches/score/[matchId]/page.tsx');
      const content = fs.readFileSync(scorePagePath, 'utf8');

      expect(content).toContain('function OverBallButton(');
      expect(content).toContain('isMultiChar');
      expect(content).toContain('min-w-[32px]');
      expect(content).toContain('min-w-[36px]');
    });

    it('verifies score page mounts TargetProgressBar and MatchProgressBar, and does NOT mount BoundaryCelebrationBanner', () => {
      const scorePagePath = path.resolve(process.cwd(), 'src/app/matches/score/[matchId]/page.tsx');
      const content = fs.readFileSync(scorePagePath, 'utf8');

      expect(content).toContain('<TargetProgressBar');
      expect(content).toContain('<MatchProgressBar');
      expect(content).not.toContain('<BoundaryCelebrationBanner');
    });

    it('verifies IntegratedScoreboard mounts TargetProgressBar and MatchProgressBar', () => {
      const scoreboardPath = path.resolve(process.cwd(), 'src/components/scoring/IntegratedScoreboard.tsx');
      const content = fs.readFileSync(scoreboardPath, 'utf8');

      expect(content).toContain('<TargetProgressBar');
      expect(content).toContain('<MatchProgressBar');
    });
  });

  describe('7. Progress Bar & Cursor Tooltip Non-Duplication Suite', () => {
    it('verifies AdvancedAnalyticsPanel progress bar does not have duplicate title tooltips', () => {
      const panelPath = path.resolve(process.cwd(), 'src/components/scoring/AdvancedAnalyticsPanel.tsx');
      const content = fs.readFileSync(panelPath, 'utf8');

      expect(content).toContain('role="progressbar"');
      expect(content).not.toContain('title={`Boundaries:');
      expect(content).not.toContain('title={`Running:');
    });

    it('verifies BatsmanProfileModal progress bar does not have duplicate title tooltips', () => {
      const modalPath = path.resolve(process.cwd(), 'src/components/modals/BatsmanProfileModal.tsx');
      const content = fs.readFileSync(modalPath, 'utf8');

      expect(content).toContain('role="progressbar"');
      expect(content).not.toContain('title={`Boundaries:');
      expect(content).not.toContain('title={`Running:');
    });
  });
});
