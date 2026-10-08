import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

import { StrikerLottieAnimation } from '../components/scoring/StrikerLottieAnimation';
import { StadiumLottieAnimation } from '../components/common/StadiumLottieAnimation';
import { PlaneLottieAnimation } from '../components/common/PlaneLottieAnimation';
import { TeamBadgeIcon } from '../components/common/TeamBadgeIcon';
import { ActiveBatsmenTable } from '../components/scoring/ActiveBatsmenTable';
import { Player } from '../domain/cricket/types';

describe('Cricket Animation System — Full Integration Validation', () => {
  const mockStriker = {
    id: 'p1',
    name: 'Virat Kohli',
    runs: 45,
    balls: 32,
    fours: 4,
    sixes: 2,
    dotBalls: 10,
    isDismissed: false,
    battingHand: 'Right-hand Batsman',
    battingPosition: '1',
    ballLog: [],
    bowlersFaced: {},
    runsVsBowler: {},
  } as Player;

  const mockNonStriker = {
    id: 'p2',
    name: 'Rohit Sharma',
    runs: 28,
    balls: 20,
    fours: 3,
    sixes: 1,
    dotBalls: 8,
    isDismissed: false,
    battingHand: 'Right-hand Batsman',
    battingPosition: '2',
    ballLog: [],
    bowlersFaced: {},
    runsVsBowler: {},
  } as Player;

  describe('1. Lottie JSON Files Integrity', () => {
    it('cricket.json exists and is valid Lottie JSON', () => {
      const filePath = path.resolve(process.cwd(), 'animations/cricket.json');
      expect(fs.existsSync(filePath)).toBe(true);
      const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      expect(json.v).toBeDefined();
      expect(json.w).toBe(500);
      expect(json.h).toBe(500);
      expect(json.layers.length).toBeGreaterThan(0);
    });

    it('stadium.json exists and is valid Lottie JSON', () => {
      const filePath = path.resolve(process.cwd(), 'animations/stadium.json');
      expect(fs.existsSync(filePath)).toBe(true);
      const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      expect(json.v).toBeDefined();
      expect(json.w).toBe(300);
      expect(json.h).toBe(300);
      expect(json.layers.length).toBeGreaterThan(0);
    });

    it('plane.json exists and is valid Lottie JSON', () => {
      const filePath = path.resolve(process.cwd(), 'animations/plane.json');
      expect(fs.existsSync(filePath)).toBe(true);
      const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      expect(json.v).toBeDefined();
      expect(json.w).toBe(1000);
      expect(json.h).toBe(1000);
      expect(json.layers.length).toBeGreaterThan(0);
    });
  });

  describe('2. Active Striker Batsman -> cricket.json', () => {
    it('renders StrikerLottieAnimation ONLY inside active striker batsman box', () => {
      const html = renderToStaticMarkup(
        React.createElement(ActiveBatsmenTable, {
          striker: mockStriker,
          nonStriker: mockNonStriker,
          strikerIdx: 0,
          nonStrikerIdx: 1,
          accentColor: '#34C759',
          onSelectBatsman: () => {},
        })
      );

      // Batsman names are visible
      expect(html).toContain('Virat Kohli');
      expect(html).toContain('Rohit Sharma');

      // Only one active striker animation instance rendered
      const matches = html.match(/aria-label="Active Striker Animation"/g);
      expect(matches).not.toBeNull();
      expect(matches?.length).toBe(1);
    });

    it('transfers StrikerLottieAnimation when strike rotates', () => {
      // Striker is Virat Kohli
      const html1 = renderToStaticMarkup(
        React.createElement(ActiveBatsmenTable, {
          striker: mockStriker,
          nonStriker: mockNonStriker,
          strikerIdx: 0,
          nonStrikerIdx: 1,
          accentColor: '#34C759',
          onSelectBatsman: () => {},
        })
      );
      expect(html1).toContain('Virat Kohli');

      // Strike rotates to Rohit Sharma
      const html2 = renderToStaticMarkup(
        React.createElement(ActiveBatsmenTable, {
          striker: mockNonStriker,
          nonStriker: mockStriker,
          strikerIdx: 1,
          nonStrikerIdx: 0,
          accentColor: '#34C759',
          onSelectBatsman: () => {},
        })
      );
      expect(html2).toContain('Rohit Sharma');
      expect(html2.match(/aria-label="Active Striker Animation"/g)?.length).toBe(1);
    });
  });

  describe('3. Home / Current / Running Team -> stadium.json', () => {
    it('renders StadiumLottieAnimation for home / host / running / current team', () => {
      const html = renderToStaticMarkup(
        React.createElement(TeamBadgeIcon, {
          type: 'home',
          size: 'sm',
          showLabel: true,
        })
      );

      expect(html).toContain('aria-label="Stadium Animation"');
      expect(html).toContain('HOST');
      expect(html).not.toContain('aria-label="Plane Animation"');
    });

    it('renders StadiumLottieAnimation for type="running" and type="current"', () => {
      const htmlRunning = renderToStaticMarkup(
        React.createElement(TeamBadgeIcon, {
          type: 'running',
          size: 'xs',
        })
      );
      expect(htmlRunning).toContain('aria-label="Stadium Animation"');

      const htmlCurrent = renderToStaticMarkup(
        React.createElement(TeamBadgeIcon, {
          type: 'current',
          size: 'md',
        })
      );
      expect(htmlCurrent).toContain('aria-label="Stadium Animation"');
    });

    it('StadiumLottieAnimation standalone mounts cleanly with custom accentColor', () => {
      const html = renderToStaticMarkup(
        React.createElement(StadiumLottieAnimation, {
          size: 'hero',
          accentColor: '#34C759',
        })
      );

      expect(html).toContain('aria-label="Stadium Animation"');
      expect(html).toContain('title="Stadium / Host Venue Indicator"');
    });
  });

  describe('4. Away / Visitor Team -> plane.json', () => {
    it('renders PlaneLottieAnimation for away / visitor team', () => {
      const html = renderToStaticMarkup(
        React.createElement(TeamBadgeIcon, {
          type: 'away',
          size: 'sm',
          showLabel: true,
        })
      );

      expect(html).toContain('aria-label="Plane Animation"');
      expect(html).toContain('VISITOR');
      expect(html).not.toContain('aria-label="Stadium Animation"');
    });

    it('PlaneLottieAnimation standalone mounts cleanly with custom accentColor', () => {
      const html = renderToStaticMarkup(
        React.createElement(PlaneLottieAnimation, {
          size: 'md',
          accentColor: '#3B82F6',
        })
      );

      expect(html).toContain('aria-label="Plane Animation"');
      expect(html).toContain('title="Visiting Team / Flight Indicator"');
    });
  });

  describe('5. First Scene / Opening Scene visual identity', () => {
    it('renders StadiumLottieAnimation with size="hero" without layout disruption', () => {
      const html = renderToStaticMarkup(
        React.createElement(StadiumLottieAnimation, {
          size: 'hero',
          accentColor: '#34C759',
        })
      );

      expect(html).toContain('aria-label="Stadium Animation"');
      expect(html).toContain('pointer-events-none');
    });
  });

  describe('6. Fallback and SSR safety', () => {
    it('renders static SVG when animate={false}', () => {
      const htmlHome = renderToStaticMarkup(
        React.createElement(TeamBadgeIcon, {
          type: 'home',
          animate: false,
        })
      );
      expect(htmlHome).not.toContain('aria-label="Stadium Animation"');
      expect(htmlHome).toContain('<svg');

      const htmlAway = renderToStaticMarkup(
        React.createElement(TeamBadgeIcon, {
          type: 'away',
          animate: false,
        })
      );
      expect(htmlAway).not.toContain('aria-label="Plane Animation"');
      expect(htmlAway).toContain('<svg');
    });
  });

  describe('7. Toss Section Specification', () => {
    it('verifies new match setup source has Winner and HOST/VISITOR removed from toss buttons', () => {
      const filePath = path.resolve(process.cwd(), 'src/app/matches/new/page.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      // 'Winner' UI label must be removed from toss buttons
      expect(content).not.toContain('>Winner<');

      // HOST and VISITOR labels are removed from toss buttons
      expect(content).not.toContain('>HOST</span>');
      expect(content).not.toContain('>VISITOR</span>');

      // HOME TEAM and AWAY TEAM watermark visuals present
      expect(content).toContain('HOME TEAM');
      expect(content).toContain('AWAY TEAM');

      // Redundant 'Home Team' / 'Away Team' text after HOST/VISITOR badge removed
      expect(content).not.toContain(": 'Home Team'}");
      expect(content).not.toContain(": 'Away Team'}");
    });
  });
});
