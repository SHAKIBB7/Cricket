import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActiveBatsmenTable } from '../components/scoring/ActiveBatsmenTable';
import { StrikerLottieAnimation } from '../components/scoring/StrikerLottieAnimation';
import { Player } from '../domain/cricket/types';
import fs from 'fs';
import path from 'path';

describe('Striker Lottie Animation Integration', () => {
  const mockPlayer1 = {
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

  const mockPlayer2 = {
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

  it('cricket.json file exists and is valid Lottie animation', () => {
    const filePath = path.resolve(process.cwd(), 'animations/cricket.json');
    expect(fs.existsSync(filePath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(content.v).toBeDefined(); // Lottie version
    expect(content.w).toBe(500);
    expect(content.h).toBe(500);
    expect(content.layers).toBeDefined();
    expect(content.layers.length).toBeGreaterThan(0);
  });

  it('renders StrikerLottieAnimation ONLY inside active striker batsman box', () => {
    const html = renderToStaticMarkup(
      React.createElement(ActiveBatsmenTable, {
        striker: mockPlayer1,
        nonStriker: mockPlayer2,
        strikerIdx: 0,
        nonStrikerIdx: 1,
        accentColor: '#34C759',
        onSelectBatsman: () => {},
      })
    );

    // Striker (mockPlayer1) should have Active Striker Animation indicator
    expect(html).toContain('Virat Kohli');
    expect(html).toContain('Rohit Sharma');
    expect(html).toContain('aria-label="Active Striker Animation"');

    // Exactly one animation instance should exist in the table
    const matches = html.match(/aria-label="Active Striker Animation"/g);
    expect(matches).not.toBeNull();
    expect(matches?.length).toBe(1);
  });

  it('transfers StrikerLottieAnimation when strike rotates', () => {
    // Before strike swap: Player 1 is striker
    const htmlBefore = renderToStaticMarkup(
      React.createElement(ActiveBatsmenTable, {
        striker: mockPlayer1,
        nonStriker: mockPlayer2,
        strikerIdx: 0,
        nonStrikerIdx: 1,
        accentColor: '#34C759',
        onSelectBatsman: () => {},
      })
    );

    // After strike swap: Player 2 is striker
    const htmlAfter = renderToStaticMarkup(
      React.createElement(ActiveBatsmenTable, {
        striker: mockPlayer2,
        nonStriker: mockPlayer1,
        strikerIdx: 1,
        nonStrikerIdx: 0,
        accentColor: '#34C759',
        onSelectBatsman: () => {},
      })
    );

    // In htmlBefore, the striker section contains Virat Kohli and animation
    expect(htmlBefore).toContain('Virat Kohli');
    // In htmlAfter, the striker section contains Rohit Sharma and animation
    expect(htmlAfter).toContain('Rohit Sharma');

    // Both render exactly 1 instance of the animation
    expect(htmlBefore.match(/aria-label="Active Striker Animation"/g)?.length).toBe(1);
    expect(htmlAfter.match(/aria-label="Active Striker Animation"/g)?.length).toBe(1);
  });

  it('StrikerLottieAnimation component mounts cleanly with custom accentColor', () => {
    const html = renderToStaticMarkup(
      React.createElement(StrikerLottieAnimation, {
        accentColor: '#1B7A4E',
      })
    );

    expect(html).toContain('aria-label="Active Striker Animation"');
    expect(html).toContain('title="Active Striker Indicator"');
  });
});
