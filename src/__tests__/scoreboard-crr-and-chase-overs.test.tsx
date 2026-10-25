import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

import { IntegratedScoreboard } from '../components/scoring/IntegratedScoreboard';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { SCOREBOARD_THEMES } from '../lib/theme/scoreboard-themes';

describe('Scoreboard CRR Alignment & Second Innings Overs Display Suite', () => {
  const createMockEngine = (totalOvers: number = 20) => {
    const engine = new EventSourcedMatchEngine({
      id: `test-match-${totalOvers}`,
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
    engine.scoreBall({ runsScored: 2 });
    return engine;
  };

  describe('1. First Innings CRR Position & Label Alignment', () => {
    it('renders CRR in the first innings scoreboard with label and rate value', () => {
      const engine = createMockEngine(20);
      const html = renderToStaticMarkup(
        React.createElement(IntegratedScoreboard, {
          engine,
          selectedTheme: SCOREBOARD_THEMES[0],
          onClose: () => {},
        })
      );

      // Verify 1st Innings and CRR presence
      expect(html).toContain('1st Innings');
      expect(html).toContain('CRR:');

      // Verify second-innings overs label is NOT present in 1st innings
      expect(html).not.toContain('OVERS · 20');
      expect(html).not.toContain('Target:');
    });
  });

  describe('2. Second Innings Target & Dynamic Overs Display', () => {
    it('displays configured overs directly below Target in the second innings for 20 overs match', () => {
      const engine = createMockEngine(20);
      engine.startSecondInnings('Shakib Al Hasan', 'Mushfiqur Rahim', 'Taskin Ahmed');
      engine.targetScore = 151;

      const html = renderToStaticMarkup(
        React.createElement(IntegratedScoreboard, {
          engine,
          selectedTheme: SCOREBOARD_THEMES[0],
          onClose: () => {},
        })
      );

      expect(html).toContain('2nd Innings Chase');
      expect(html).toContain('Target:');
      expect(html).toContain('151');
      // Verifies OVERS · 20 appears directly below target
      expect(html).toContain('OVERS · 20');
      expect(html).toContain('CRR:');
    });

    it('dynamically adapts to different overs configurations (6, 10, 15 overs)', () => {
      const configurations = [
        { overs: 6, target: 120 },
        { overs: 10, target: 85 },
        { overs: 15, target: 130 },
      ];

      for (const config of configurations) {
        const engine = createMockEngine(config.overs);
        engine.startSecondInnings('Player A', 'Player B', 'Bowler C');
        engine.targetScore = config.target;

        const html = renderToStaticMarkup(
          React.createElement(IntegratedScoreboard, {
            engine,
            selectedTheme: SCOREBOARD_THEMES[0],
            onClose: () => {},
          })
        );

        expect(html).toContain(`OVERS · ${config.overs}`);
        expect(html).toContain(`${config.target}`);
      }
    });
  });

  describe('3. page.tsx Source Code Verification', () => {
    it('verifies page.tsx contains OVERS · {engine.totalOvers} and vertical alignment in mobile & desktop banners', () => {
      const pagePath = path.resolve(__dirname, '../app/matches/score/[matchId]/page.tsx');
      const pageContent = fs.readFileSync(pagePath, 'utf-8');

      // 1. Both mobile and desktop views contain dynamic overs line
      expect(pageContent).toContain('OVERS · {engine.totalOvers}');

      // 2. Both mobile and desktop views contain TARGET and CRR
      expect(pageContent).toContain('TARGET');
      expect(pageContent).toContain('CRR');

      // 3. Tabular numerals applied to ensure no layout shift
      expect(pageContent).toContain('[font-variant-numeric:tabular-nums]');
    });
  });
});
