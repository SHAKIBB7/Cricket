import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BatsmanProfileModal } from '../components/modals/BatsmanProfileModal';
import { Player } from '../domain/cricket/types';

describe('Batting Profile UI Readability & Layout Optimization', () => {
  const mockPlayer: Player = {
    id: 'batsman-1',
    name: 'Tamim Iqbal',
    runs: 54,
    balls: 32,
    fours: 6,
    sixes: 2,
    dotBalls: 10,
    ballLog: ['0', '4', '0', '1', '6', '0', '0', '0', '2', '4', '1', '0'],
    battingHand: 'Left-hand Batsman',
  };

  it('renders all five primary batting statistics (Runs, Balls Faced, Strike Rate, 4s, 6s) with responsive desktop & mobile support', () => {
    const html = renderToStaticMarkup(
      React.createElement(BatsmanProfileModal, {
        player: mockPlayer,
        isOpen: true,
        onClose: () => {},
        battingPosition: 1,
      })
    );

    // Verify 5-metric desktop layout container exists
    expect(html).toContain('sm:grid-cols-5');
    expect(html).toContain('sm:contents');

    // Verify all five metric labels exist clearly without clipping
    expect(html).toContain('Runs');
    expect(html).toContain('Balls Faced');
    expect(html).toContain('Strike Rate');
    expect(html).toContain('4s');
    expect(html).toContain('6s');

    // Verify dynamic values
    expect(html).toContain('>54<'); // Runs
    expect(html).toContain('>32<'); // Balls Faced
    expect(html).toContain('>168.8<'); // Strike Rate: (54 / 32) * 100 = 168.75 -> 168.8
    expect(html).toContain('>6<'); // 4s
    expect(html).toContain('>2<'); // 6s

    // Verify balls faced context is visible
    expect(html).toContain('32 balls');
    expect(html).toContain('deliveries');
    expect(html).toContain('24 runs'); // 6 * 4
    expect(html).toContain('12 runs'); // 2 * 6
  });

  it('renders Dot Ball & Shot Control Analysis with unclipped responsive 2x2 mobile and 4-column desktop layout', () => {
    const html = renderToStaticMarkup(
      React.createElement(BatsmanProfileModal, {
        player: mockPlayer,
        isOpen: true,
        onClose: () => {},
      })
    );

    // Section title
    expect(html).toContain('Dot Ball &amp; Shot Control Analysis');

    // Responsive grid
    expect(html).toContain('grid-cols-2');
    expect(html).toContain('sm:grid-cols-4');

    // Verify all four analysis labels are fully rendered without ellipsis
    expect(html).toContain('Dot Balls');
    expect(html).toContain('Scoring Balls');
    expect(html).toContain('Shot Control');
    expect(html).toContain('Max Dot Streak');

    // Verify analysis metrics subtexts
    expect(html).toContain('% of balls');
    expect(html).toContain('% score rate');
    expect(html).toContain('non-dot ratio');
    expect(html).toContain('consecutive balls');
  });

  it('ensures controlled mobile hierarchy without cramped 5-in-a-row or micro-typography', () => {
    const html = renderToStaticMarkup(
      React.createElement(BatsmanProfileModal, {
        player: mockPlayer,
        isOpen: true,
        onClose: () => {},
      })
    );

    // Mobile uses grid-cols-2 for row 1 and grid-cols-3 for row 2
    expect(html).toContain('grid-cols-2');
    expect(html).toContain('grid-cols-3');

    // Micro-typography text-[8.5px] and text-[9px] should be eliminated for clean readability
    expect(html).not.toContain('text-[8.5px]');
    expect(html).not.toContain('text-[9px]');
  });

  it('preserves existing player data, dismissal details, and batting position', () => {
    const html = renderToStaticMarkup(
      React.createElement(BatsmanProfileModal, {
        player: { ...mockPlayer, isDismissed: true, dismissalText: 'b Starc' },
        isOpen: true,
        onClose: () => {},
        battingPosition: 2,
        isStriker: true,
      })
    );

    expect(html).toContain('Tamim Iqbal');
    expect(html).toContain('#2');
    expect(html).toContain('★ STRIKER');
    expect(html).toContain('b Starc');
  });

  it('renders a compact minimal close area with pill-shaped button and mobile bottom-sheet handle', () => {
    const html = renderToStaticMarkup(
      React.createElement(BatsmanProfileModal, {
        player: mockPlayer,
        isOpen: true,
        onClose: () => {},
      })
    );

    // Pill-shaped Close Profile button
    expect(html).toContain('Close Profile');
    expect(html).toContain('rounded-full');

    // Minimal padding and safe-area support
    expect(html).toContain('pb-safe');
    expect(html).toContain('py-2.5');

    // Flush mobile docking (p-0 sm:p-4)
    expect(html).toContain('p-0');
    expect(html).toContain('sm:p-4');

    // Mobile drag indicator handle
    expect(html).toContain('cursor-grab');
  });

  it('renders Encounter vs Bowlers with vertically centered flex/grid layout, consistent row heights, and balanced padding', () => {
    const playerWithEncounters: Player = {
      ...mockPlayer,
      bowlersFaced: { 'Mitchell Starc': 14, 'Pat Cummins': 10 },
      runsVsBowler: { 'Mitchell Starc': 28, 'Pat Cummins': 18 },
    };

    const html = renderToStaticMarkup(
      React.createElement(BatsmanProfileModal, {
        player: playerWithEncounters,
        isOpen: true,
        onClose: () => {},
      })
    );

    // Section title and subtitle with vertically centered leading-none
    expect(html).toContain('Encounter vs Bowlers');
    expect(html).toContain('Sorted by runs scored');
    expect(html).toContain('min-h-[22px]');

    // Balanced card padding
    expect(html).toContain('p-3 sm:p-3.5');
    expect(html).toContain('space-y-2.5');

    // Grid layout with vertical center alignment
    expect(html).toContain('grid-cols-12 items-center');

    // Consistent row heights
    expect(html).toContain('min-h-[32px]'); // Header row
    expect(html).toContain('min-h-[36px]'); // Data rows

    // Column headers
    expect(html).toContain('Bowler');
    expect(html).toContain('Runs');
    expect(html).toContain('Balls');
    expect(html).toContain('Strike Rate');

    // Bowlers data and calculations
    expect(html).toContain('Mitchell Starc');
    expect(html).toContain('Pat Cummins');
    expect(html).toContain('>28<');
    expect(html).toContain('>14<');
    expect(html).toContain('>200.0<'); // (28 / 14) * 100 = 200.0
    expect(html).toContain('>18<');
    expect(html).toContain('>10<');
    expect(html).toContain('>180.0<'); // (18 / 10) * 100 = 180.0

    // Tabular numbers for clean numeric vertical alignment
    expect(html).toContain('num-font');
  });
});

