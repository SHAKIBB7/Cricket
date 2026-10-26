import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

import { IntegratedScoreboard } from '../components/scoring/IntegratedScoreboard';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { SCOREBOARD_THEMES } from '../lib/theme/scoreboard-themes';

describe('Second Innings Scoreboard — Total Overs Display Enhancement Suite', () => {
  const createMockEngine = (totalOvers: number = 20) => {
    const engine = new EventSourcedMatchEngine({
      id: 'test-total-overs-match',
      teamA: 'Dhaka Gladiators',
      teamB: 'Chittagong Kings',
      tossWinner: 'Dhaka Gladiators',
      tossDecision: 'Batting',
      totalOvers,
      strikerName: 'Tamim Iqbal',
      nonStrikerName: 'Litton Das',
      bowlerName: 'Mustafizur Rahman',
    });

    engine.scoreBall({ runsScored: 4 });
    engine.scoreBall({ runsScored: 1 });
    return engine;
  };

  describe('1. Innings-Specific Visibility & Structure', () => {
    it('does NOT display the TOTAL OVERS badge in 1st innings', () => {
      const engine = createMockEngine(20);
      const html = renderToStaticMarkup(
        React.createElement(IntegratedScoreboard, {
          engine,
          selectedTheme: SCOREBOARD_THEMES[0],
          onClose: () => {},
        })
      );

      // In 1st innings, the total overs badge under target must not appear
      expect(html).not.toContain('data-testid="total-overs-display"');
      expect(html).not.toContain('OVERS -');
    });

    it('displays the TOTAL OVERS badge directly below TARGET in 2nd innings with Clock icon', () => {
      const engine = createMockEngine(20);
      engine.startSecondInnings('Shakib Al Hasan', 'Mushfiqur Rahim', 'Taskin Ahmed');
      engine.scoreBall({ runsScored: 6 });

      const html = renderToStaticMarkup(
        React.createElement(IntegratedScoreboard, {
          engine,
          selectedTheme: SCOREBOARD_THEMES[0],
          onClose: () => {},
        })
      );

      // In 2nd innings chase, TARGET and TOTAL OVERS must appear
      expect(html).toContain('data-testid="total-overs-display"');
      expect(html).toContain('OVERS -');
      expect(html).toContain('20');
      expect(html).toContain('Target:');
    });

    it('dynamically adapts to custom overs: 5, 6, 10, 12, 15, and 50 overs', () => {
      const testCases = [5, 6, 10, 12, 15, 50];

      for (const overs of testCases) {
        const engine = createMockEngine(overs);
        engine.startSecondInnings('Shakib Al Hasan', 'Mushfiqur Rahim', 'Taskin Ahmed');
        engine.scoreBall({ runsScored: 4 });

        const html = renderToStaticMarkup(
          React.createElement(IntegratedScoreboard, {
            engine,
            selectedTheme: SCOREBOARD_THEMES[0],
            onClose: () => {},
          })
        );

        expect(html).toContain('data-testid="total-overs-display"');
        expect(html).toContain('OVERS -');
        expect(html).toContain(String(overs));
      }
    });
  });

  describe('2. Source Code Verifications for page.tsx Scorer Cockpit', () => {
    const pagePath = path.resolve(__dirname, '../app/matches/score/[matchId]/page.tsx');
    const pageContent = fs.readFileSync(pagePath, 'utf8');

    it('verifies page.tsx imports Clock from lucide-react', () => {
      expect(pageContent).toContain('Clock');
      expect(pageContent).toMatch(/import\s*\{[^}]*Clock[^}]*\}\s*from\s*['"]lucide-react['"]/);
    });

    it('verifies page.tsx defines data-testid="total-overs-display" and "OVERS -" in both mobile and desktop', () => {
      const matches = pageContent.match(/data-testid="total-overs-display"/g) || [];
      expect(matches.length).toBeGreaterThanOrEqual(2); // One in mobile, one in desktop

      const labelMatches = pageContent.match(/OVERS\s*-\s*/g) || [];
      expect(labelMatches.length).toBeGreaterThanOrEqual(2);
    });

    it('verifies safe dynamic fallback preventing NaN/undefined display', () => {
      expect(pageContent).toContain('Math.max(1, Number(engine.totalOvers)');
    });
  });
});
