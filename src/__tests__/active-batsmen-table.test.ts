import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActiveBatsmenTable } from '../components/scoring/ActiveBatsmenTable';
import { Player } from '../domain/cricket/types';

describe('ActiveBatsmenTable Component', () => {
  const mockStriker = {
    id: 'p1',
    name: 'Taimur',
    runs: 24,
    balls: 18,
    fours: 2,
    sixes: 1,
    dotBalls: 6,
    isDismissed: false,
    battingHand: 'Right-hand Batsman',
    battingPosition: '1',
    ballLog: [],
    bowlersFaced: {},
    runsVsBowler: {},
  } as Player;

  const mockNonStriker = {
    id: 'p2',
    name: 'Siam',
    runs: 12,
    balls: 10,
    fours: 1,
    sixes: 0,
    dotBalls: 4,
    isDismissed: false,
    battingHand: 'Right-hand Batsman',
    battingPosition: '2',
    ballLog: [],
    bowlersFaced: {},
    runsVsBowler: {},
  } as Player;

  it('renders the exact international standard header columns: BATSMAN, R, B, 4s, 6s, SR', () => {
    const html = renderToStaticMarkup(
      React.createElement(ActiveBatsmenTable, {
        striker: mockStriker,
        nonStriker: mockNonStriker,
        strikerIdx: 0,
        nonStrikerIdx: 1,
        onSelectBatsman: () => {},
      })
    );

    expect(html).toContain('BATSMAN');
    expect(html).toContain('>R<');
    expect(html).toContain('>B<');
    expect(html).toContain('>4s<');
    expect(html).toContain('>6s<');
    expect(html).toContain('>SR<');

    // Confirm DOT column is completely removed
    expect(html).not.toContain('>DOT<');
    expect(html).not.toContain('>Dot<');
    expect(html).not.toContain('>dot<');
  });

  it('renders the striker with ★ indicator and correct stats', () => {
    const html = renderToStaticMarkup(
      React.createElement(ActiveBatsmenTable, {
        striker: mockStriker,
        nonStriker: mockNonStriker,
        strikerIdx: 0,
        nonStrikerIdx: 1,
        onSelectBatsman: () => {},
      })
    );

    // Striker name and star
    expect(html).toContain('★');
    expect(html).toContain('Taimur');
    expect(html).toContain('>24<'); // runs
    expect(html).toContain('>18<'); // balls
    expect(html).toContain('>2<');  // 4s
    expect(html).toContain('>1<');  // 6s
    expect(html).toContain('133.3'); // Strike Rate = (24/18)*100
  });

  it('renders the non-striker without star indicator and correct stats', () => {
    const html = renderToStaticMarkup(
      React.createElement(ActiveBatsmenTable, {
        striker: mockStriker,
        nonStriker: mockNonStriker,
        strikerIdx: 0,
        nonStrikerIdx: 1,
        onSelectBatsman: () => {},
      })
    );

    expect(html).toContain('Siam');
    expect(html).toContain('>12<'); // runs
    expect(html).toContain('>10<'); // balls
    expect(html).toContain('>1<');  // 4s
    expect(html).toContain('>0<');  // 6s
    expect(html).toContain('120.0'); // Strike Rate = (12/10)*100
  });

  it('handles empty or missing batsmen gracefully without crashing', () => {
    const html = renderToStaticMarkup(
      React.createElement(ActiveBatsmenTable, {
        striker: undefined,
        nonStriker: undefined,
        strikerIdx: 0,
        nonStrikerIdx: 1,
        onSelectBatsman: () => {},
      })
    );

    expect(html).toContain('BATSMAN');
    expect(html).toContain('Striker');
    expect(html).toContain('Non-Striker');
    expect(html).toContain('0.0');
  });
});
