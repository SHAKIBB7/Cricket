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
    it('renders with clean action buttons at the top without redundant Scoreboard title or duplicate download buttons', () => {
      const engine = createMockEngine();
      const html = renderToStaticMarkup(
        React.createElement(IntegratedScoreboard, {
          engine,
          selectedTheme: SCOREBOARD_THEMES[0],
          onClose: () => {},
        })
      );

      // Must have exactly ONE "Back to Live Scoring" and ONE "Download PDF" button label
      const backMatches = html.match(/<span[^>]*>Back to Live Scoring<\/span>/g) || [];
      const downloadMatches = html.match(/<span[^>]*>Download PDF<\/span>/g) || [];
      expect(backMatches.length).toBe(1);
      expect(downloadMatches.length).toBe(1);

      // Must NOT contain redundant header title "Scoreboard" or subtitle "Dhaka Gladiators vs Chittagong Kings"
      expect(html).not.toContain('<h2 class="font-extrabold tracking-tight truncate text-card-title leading-tight">Scoreboard</h2>');
      expect(html).not.toContain('Dhaka Gladiators vs Chittagong Kings • 20 Overs');

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
      expect(html).toContain('Back to Live Scoring');
      expect(html).not.toContain('Back to Scoring');
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

  describe('3. Premium Cricket Scoreboard Redesign Specifications', () => {
    it('verifies team name and innings label hierarchy, with Projected Score completely hidden in 1st innings', () => {
      const engine = createMockEngine();
      const html = renderToStaticMarkup(
        React.createElement(IntegratedScoreboard, {
          engine,
          selectedTheme: SCOREBOARD_THEMES[0],
          onClose: () => {},
        })
      );

      // 1. Team name and innings label in correct hierarchy
      expect(html).toContain('Dhaka Gladiators');
      expect(html).toContain('1st Innings');

      // 2. Projected score must be completely hidden
      expect(html).not.toContain('Projected:');
      expect(html).not.toContain('Proj:');
      expect(html).not.toContain('Projected Score');

      // 3. Overs & Balls left in main score panel
      expect(html).toContain('OVER');
      expect(html).toContain('BALLS LEFT');
    });

    it('verifies RRR replaces CRR in header statistics area when chase is active', () => {
      const engine = createMockEngine();
      // Start 2nd innings chase
      engine.startSecondInnings('Shakib Al Hasan', 'Mushfiqur Rahim', 'Taskin Ahmed');
      engine.scoreBall({ runsScored: 6 });

      const html = renderToStaticMarkup(
        React.createElement(IntegratedScoreboard, {
          engine,
          selectedTheme: SCOREBOARD_THEMES[0],
          onClose: () => {},
        })
      );

      // In chase mode: RRR is displayed in header stats area, not CRR
      expect(html).toContain('2nd Innings Chase');
      expect(html).toContain('RRR:');
      expect(html).toContain('Target:');
      expect(html).not.toContain('Projected:');
    });

    it('verifies page.tsx banners implement BALLS LEFT, OVER before overs count, and hide Projected Score', () => {
      const scoreFilePath = path.resolve(__dirname, '../app/matches/score/[matchId]/page.tsx');
      const scoreContent = fs.readFileSync(scoreFilePath, 'utf-8');

      // 1. BALLS LEFT label present in main score area
      expect(scoreContent).toContain('BALLS LEFT');

      // 2. OVER label present in main score and progress bar
      expect(scoreContent).toContain('OVER');

      // 3. RRR in chase header stats
      expect(scoreContent).toContain('RRR');

      // 4. Projected Score feature completely disabled & hidden (no Proj / Projected Score in score banners)
      expect(scoreContent).not.toContain('Proj:');
      expect(scoreContent).not.toContain('Projected Score');
      expect(scoreContent).not.toContain('Math.round(crr * engine.totalOvers)');
    });
  });
});
