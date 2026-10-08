import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

import { BowlingLimiterDrawer } from '../components/common/BowlingLimiterDrawer';

describe('Bowling Limiter — Collapsible Drawer UI Verification', () => {
  describe('1. BowlingLimiterDrawer Component — Collapsed State', () => {
    it('renders clean collapsed header row with title and status indicator for under 10 overs', () => {
      const html = renderToStaticMarkup(
        React.createElement(BowlingLimiterDrawer, {
          overs: 8,
          bowlingLimitMode: 'default',
          onBowlingLimitModeChange: () => {},
          customOverLimit: 4,
          onCustomOverLimitChange: () => {},
          effectiveMaxOvers: 4,
          isUnder10Overs: true,
          defaultExpanded: false,
        })
      );

      expect(html).toContain('Bowling Limiter');
      expect(html).toContain('⚾');
      expect(html).toContain('4 Overs/Bowler');
      expect(html).toContain('aria-expanded="false"');
      // Collapsed: drawer body must not be visible
      expect(html).not.toContain('Automatically applied');
      expect(html).not.toContain('bowling-limiter-drawer-content');
    });

    it('renders clean collapsed header row for 20-over match with dynamic international quota', () => {
      const html = renderToStaticMarkup(
        React.createElement(BowlingLimiterDrawer, {
          overs: 20,
          bowlingLimitMode: 'international',
          onBowlingLimitModeChange: () => {},
          customOverLimit: 4,
          onCustomOverLimitChange: () => {},
          effectiveMaxOvers: 4,
          isUnder10Overs: false,
          defaultExpanded: false,
        })
      );

      expect(html).toContain('Bowling Limiter');
      expect(html).toContain('4 Overs/Bowler');
      expect(html).toContain('aria-expanded="false"');
      expect(html).not.toContain('bowling-limiter-drawer-content');
    });

    it('renders clean collapsed header row with custom over limit status', () => {
      const html = renderToStaticMarkup(
        React.createElement(BowlingLimiterDrawer, {
          overs: 20,
          bowlingLimitMode: 'custom',
          onBowlingLimitModeChange: () => {},
          customOverLimit: 3,
          onCustomOverLimitChange: () => {},
          effectiveMaxOvers: 3,
          isUnder10Overs: false,
          defaultExpanded: false,
        })
      );

      expect(html).toContain('3 Overs/Bowler');
      expect(html).toContain('aria-expanded="false"');
    });
  });

  describe('2. BowlingLimiterDrawer Component — Expanded State (< 10 Overs)', () => {
    it('displays automatic default rule and locked indicator for matches under 10 overs', () => {
      const html = renderToStaticMarkup(
        React.createElement(BowlingLimiterDrawer, {
          overs: 8,
          bowlingLimitMode: 'default',
          onBowlingLimitModeChange: () => {},
          customOverLimit: 4,
          onCustomOverLimitChange: () => {},
          effectiveMaxOvers: 4,
          isUnder10Overs: true,
          defaultExpanded: true,
        })
      );

      expect(html).toContain('aria-expanded="true"');
      expect(html).toContain('8 Overs');
      expect(html).toContain('Default');
      expect(html).toContain('4 Overs');
      expect(html).toContain('Automatically applied');
      // Must not show selectable dropdowns in under 10 overs
      expect(html).not.toContain('bowling-limiter-mode-select');
      expect(html).not.toContain('bowling-limiter-custom-select');
    });
  });

  describe('3. BowlingLimiterDrawer Component — Expanded State (>= 10 Overs)', () => {
    it('displays mode dropdown with "Auto" maximum for international rule', () => {
      const html = renderToStaticMarkup(
        React.createElement(BowlingLimiterDrawer, {
          overs: 20,
          bowlingLimitMode: 'international',
          onBowlingLimitModeChange: () => {},
          customOverLimit: 4,
          onCustomOverLimitChange: () => {},
          effectiveMaxOvers: 4,
          isUnder10Overs: false,
          defaultExpanded: true,
        })
      );

      expect(html).toContain('aria-expanded="true"');
      expect(html).toContain('20 Overs');
      expect(html).toContain('Limit Mode');
      expect(html).toContain('International Rule');
      expect(html).toContain('Default Rule');
      expect(html).toContain('Custom Rule');
      expect(html).toContain('Auto');
      expect(html).not.toContain('Automatically applied');
    });

    it('displays custom limit selector when Custom Rule is selected', () => {
      const html = renderToStaticMarkup(
        React.createElement(BowlingLimiterDrawer, {
          overs: 15,
          bowlingLimitMode: 'custom',
          onBowlingLimitModeChange: () => {},
          customOverLimit: 3,
          onCustomOverLimitChange: () => {},
          effectiveMaxOvers: 3,
          isUnder10Overs: false,
          defaultExpanded: true,
        })
      );

      expect(html).toContain('aria-expanded="true"');
      expect(html).toContain('data-testid="bowling-limiter-custom-select"');
      expect(html).toContain('<option value="3" selected="">3 Overs</option>');
    });

    it('displays fixed 4 Overs when Default Rule is selected for 10+ overs', () => {
      const html = renderToStaticMarkup(
        React.createElement(BowlingLimiterDrawer, {
          overs: 25,
          bowlingLimitMode: 'default',
          onBowlingLimitModeChange: () => {},
          customOverLimit: 4,
          onCustomOverLimitChange: () => {},
          effectiveMaxOvers: 4,
          isUnder10Overs: false,
          defaultExpanded: true,
        })
      );

      expect(html).toContain('aria-expanded="true"');
      expect(html).toContain('4 Overs');
      expect(html).not.toContain('data-testid="bowling-limiter-custom-select"');
    });
  });

  describe('4. Match Setup Screen Integration & Integrity', () => {
    const pagePath = path.resolve(process.cwd(), 'src/app/matches/new/page.tsx');
    const content = fs.readFileSync(pagePath, 'utf8');

    it('embeds BowlingLimiterDrawer as an inline component with correct props', () => {
      expect(content).toContain("import { BowlingLimiterDrawer } from '@/components/common/BowlingLimiterDrawer'");
      expect(content).toContain('<BowlingLimiterDrawer');
      expect(content).toContain('overs={overs}');
      expect(content).toContain('bowlingLimitMode={bowlingLimitMode}');
      expect(content).toContain('onBowlingLimitModeChange={setBowlingLimitMode}');
      expect(content).toContain('customOverLimit={customOverLimit}');
      expect(content).toContain('onCustomOverLimitChange={setCustomOverLimit}');
      expect(content).toContain('effectiveMaxOvers={effectiveMaxOvers}');
      expect(content).toContain('isUnder10Overs={isUnder10Overs}');
    });

    it('does not open any modal or separate route for bowling limiter', () => {
      // Must not use modal dialogs for the bowling limiter
      expect(content).not.toContain('showBowlingLimiterModal');
      expect(content).not.toContain('BowlingLimiterModal');
      expect(content).not.toContain('BowlingLimiterSheet');
    });

    it('preserves bowling limiter data in match creation payload', () => {
      expect(content).toContain('bowlingLimitMode: effectiveBowlingMode');
      expect(content).toContain('maxOversPerBowler: effectiveMaxOvers');
      expect(content).toContain('manualOverLimit: effectiveMaxOvers');
    });
  });
});
