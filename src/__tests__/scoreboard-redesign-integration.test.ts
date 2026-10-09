import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

import { IntegratedScoreboard } from '../components/scoring/IntegratedScoreboard';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { SCOREBOARD_THEMES } from '../lib/theme/scoreboard-themes';

describe('Scoreboard UI Redesign & Integration Verification', () => {
  const createMockEngine = () => {
    const engine = new EventSourcedMatchEngine({
      id: 'test-match-123',
      teamA: 'Dhaka Gladiators',
      teamB: 'Chittagong Kings',
      tossWinner: 'Dhaka Gladiators',
      tossDecision: 'Batting',
      totalOvers: 20,
      strikerName: 'Tamim Iqbal',
      nonStrikerName: 'Litton Das',
      bowlerName: 'Mustafizur Rahman',
    });

    engine.scoreBall({ runsScored: 4 });
    engine.scoreBall({ runsScored: 1 });
    engine.scoreBall({ runsScored: 6 });
    engine.scoreBall({ runsScored: 0 });
    return engine;
  };

  describe('1. IntegratedScoreboard Component Rendering & Hierarchy', () => {
    it('renders with clean "Scoreboard" title without any "Full" label prefix', () => {
      const engine = createMockEngine();
      const html = renderToStaticMarkup(
        React.createElement(IntegratedScoreboard, {
          engine,
          selectedTheme: SCOREBOARD_THEMES[0],
          onClose: () => {},
        })
      );

      // Must contain clean "Scoreboard"
      expect(html).toContain('Scoreboard');
      // Must NOT contain "Full Match Scoreboard" or "Full Scoreboard"
      expect(html).not.toContain('Full Match Scoreboard');
      expect(html).not.toContain('Full Scoreboard');
    });

    it('displays team info, scores, overs, and CRR in the compact overview banner', () => {
      const engine = createMockEngine();
      const html = renderToStaticMarkup(
        React.createElement(IntegratedScoreboard, {
          engine,
          selectedTheme: SCOREBOARD_THEMES[0],
          onClose: () => {},
        })
      );

      expect(html).toContain('Dhaka Gladiators');
      expect(html).toContain('1st Innings');
      expect(html).toContain('CRR:');
      expect(html).toContain('Projected:');
      expect(html).toContain('Back to Scoring');
      expect(html).toContain('Download PDF');
    });

    it('renders batting scorecard and bowling figures tables with correct statistics', () => {
      const engine = createMockEngine();
      const html = renderToStaticMarkup(
        React.createElement(IntegratedScoreboard, {
          engine,
          selectedTheme: SCOREBOARD_THEMES[0],
          onClose: () => {},
        })
      );

      // Batting
      expect(html).toContain('Batting');
      expect(html).toContain('Tamim Iqbal');
      expect(html).toContain('Litton Das');
      expect(html).toContain('not out');

      // Bowling
      expect(html).toContain('Bowling');
      expect(html).toContain('Mustafizur Rahman');
      expect(html).toContain('Econ');

      // Extras & Fall of Wickets
      expect(html).toContain('Extras:');
      expect(html).toContain('Fall of Wickets');
    });
  });

  describe('2. Source Code Verifications for User Requirements', () => {
    it('verifies the top navigation header has Cricket Scorer Pro -> SCOREBOARD -> • -> Theme structure', () => {
      const navFilePath = path.resolve(__dirname, '../components/layout/Navigation.tsx');
      const navContent = fs.readFileSync(navFilePath, 'utf-8');

      // Extract top header
      const headerMatch = navContent.match(/<header[\s\S]*?<\/header>/);
      expect(headerMatch).not.toBeNull();
      const header = headerMatch![0];

      // 1. Brand name displays Cricket Scorer Pro
      expect(header).toContain('Cricket Scorer Pro');

      // 2. MATCH / Matches has been completely replaced with SCOREBOARD
      expect(header).toContain('SCOREBOARD');
      expect(header).toContain("toggleView('scoreboard')");
      expect(header).not.toContain('>Matches<');
      expect(header).not.toContain('>MATCH<');

      // 3. Dot indicator • is present
      expect(header).toContain('rounded-full');

      // 4. Theme switch is present
      expect(header).toContain('toggleTheme');

      // 5. Any previous extra button next to MATCH is removed
      expect(header).not.toContain("toggleView('advancedAnalytics')");
      expect(header).not.toContain('BarChart2');
    });

    it('verifies the redundant "Full Scoreboard" button at the bottom is completely removed', () => {
      const scoreFilePath = path.resolve(__dirname, '../app/matches/score/[matchId]/page.tsx');
      const scoreContent = fs.readFileSync(scoreFilePath, 'utf-8');

      // Check that "Full Scoreboard" does NOT exist
      expect(scoreContent).not.toContain('<span>Full Scoreboard</span>');
      expect(scoreContent).not.toContain('Full Match Scoreboard');
    });

    it('verifies that Scoreboard button is NOT in the main Scoreboard Area banner and is triggered from header', () => {
      const scoreFilePath = path.resolve(__dirname, '../app/matches/score/[matchId]/page.tsx');
      const scoreContent = fs.readFileSync(scoreFilePath, 'utf-8');

      // Scoreboard Area banners should only contain Theme selector/palette, NOT Scoreboard button
      expect(scoreContent).not.toContain('title="View Scoreboard"');
      // Scoreboard component is integrated when activeView === 'scoreboard'
      expect(scoreContent).toContain("activeView === 'scoreboard'");
      expect(scoreContent).toContain('<IntegratedScoreboard');
    });

    it('verifies that MatchesPanel contains the Scoreboard action for the currently scoring match', () => {
      const panelFilePath = path.resolve(__dirname, '../components/scoring/MatchesPanel.tsx');
      const panelContent = fs.readFileSync(panelFilePath, 'utf-8');

      expect(panelContent).toContain('onViewScoreboard');
      expect(panelContent).toContain('title="View Scoreboard"');
      expect(panelContent).toContain('<span>Scoreboard</span>');
    });
  });
});
