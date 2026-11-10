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
    battingPosition: '1',
    bowlersFaced: {},
    runsVsBowler: {},
    isDismissed: false,
  };

  it('renders all five primary batting statistics (Runs, Balls Faced, Strike Rate, 4s, 6s) in the compact strip', () => {
    const html = renderToStaticMarkup(
      React.createElement(BatsmanProfileModal, {
        player: mockPlayer,
        isOpen: true,
        onClose: () => {},
        battingPosition: 1,
      })
    );

    // Compact strip (redesign approved by TAIMUR 2026-11-10): the five
    // separate cards became ONE hairline-divided card.
    expect(html).toContain('grid-cols-[0.9fr_1.1fr_1.3fr_0.75fr_0.75fr]');
    expect(html).toContain('gap-px');

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

    // The 4s/6s run values stay (they appear nowhere else); the filler
    // subtexts that duplicated a neighbouring cell ('(32 balls)',
    // 'deliveries', 'runs/100b') were dropped in the compact redesign.
    expect(html).toContain('24 runs'); // 6 * 4
    expect(html).toContain('12 runs'); // 2 * 6
    expect(html).not.toContain('deliveries');
    expect(html).not.toContain('runs/100b');
  });

  it('renders Dot Ball & Shot Control Analysis as a four-across strip at all widths (TAIMUR pick, 2026-11-10)', () => {
    const html = renderToStaticMarkup(
      React.createElement(BatsmanProfileModal, {
        player: mockPlayer,
        isOpen: true,
        onClose: () => {},
      })
    );

    // Section title
    expect(html).toContain('Dot Ball &amp; Shot Control Analysis');

    // Four-across strip at every width (TAIMUR picked mockup 1,
    // 2026-11-10 — supersedes the 2x2-mobile / 4-column-desktop grid).
    // Weighted fractions give the long labels room on one line.
    expect(html).toContain('grid-cols-4');
    expect(html).not.toContain('sm:grid-cols-4');

    // Verify all four analysis labels are fully rendered without ellipsis
    expect(html).toContain('Dot Balls');
    expect(html).toContain('Scoring Balls');
    expect(html).toContain('Shot Control');
    expect(html).toContain('Max Dot Streak');

    // Verify analysis metrics subtexts
    expect(html).toContain('% of balls');
    expect(html).toContain('% score rate');
    expect(html).toContain('non-dot ratio');
    expect(html).toContain('balls in a row'); // was 'consecutive balls' — shortened 2026-11-10 so the equal-quarter strip fits 393px phones without wrapping
  });

  it('ensures controlled mobile hierarchy without cramped 5-in-a-row or micro-typography', () => {
    const html = renderToStaticMarkup(
      React.createElement(BatsmanProfileModal, {
        player: mockPlayer,
        isOpen: true,
        onClose: () => {},
      })
    );

    // Compact hierarchy: one 5-column strip for the primary stats and
    // a matching 4-column strip for the dot-ball analysis.
    expect(html).toContain('grid-cols-4');
    expect(html).toContain('grid-cols-[0.9fr_1.1fr_1.3fr_0.75fr_0.75fr]');

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

  it('has NO footer close bar — closing lives in the top bar / backdrop (TAIMUR, 2026-11-10)', () => {
    const html = renderToStaticMarkup(
      React.createElement(BatsmanProfileModal, {
        player: mockPlayer,
        isOpen: true,
        onClose: () => {},
      })
    );

    // Footer Close Profile bar, top-bar Done and the header X were
    // all removed at TAIMUR's direction: the back chevron is the
    // single explicit close control (backdrop tap / Escape remain).
    expect(html).not.toContain('Close Profile');
    expect(html).not.toContain('>Done<');
    expect(html).not.toContain('aria-label="Close"');

    // Safe-area support moved onto the scroll container
    expect(html).toContain('pb-safe');

    // Flush mobile docking (p-0 sm:p-4)
    expect(html).toContain('p-0');
    expect(html).toContain('sm:p-4');

    // The drag indicator handle is gone (clean app bar, TAIMUR 2026-11-10)
    expect(html).not.toContain('cursor-grab');
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
    expect(html).toContain('Econ'); // header shortened from 'Economy' at TAIMUR's direction, 2026-11-10
    expect(html).toContain('Strike Rate');

    // Bowlers data and calculations
    expect(html).toContain('Mitchell Starc');
    expect(html).toContain('Pat Cummins');
    expect(html).toContain('>28<');
    expect(html).toContain('>14<');
    expect(html).toContain('>200.0<'); // (28 / 14) * 100 = 200.0
    expect(html).toContain('>12.00<'); // Economy vs Starc: (28 / 14) * 6 = 12.00
    expect(html).toContain('>10.80<'); // Economy vs Cummins: (18 / 10) * 6 = 10.80
    expect(html).toContain('>18<');
    expect(html).toContain('>10<');
    expect(html).toContain('>180.0<'); // (18 / 10) * 100 = 180.0

    // Tabular numbers for clean numeric vertical alignment
    expect(html).toContain('num-font');
  });

  it('verifies Run Production Sources stacked progress bar acts as clean visual indicator without duplicate cursor tooltips', () => {
    const html = renderToStaticMarkup(
      React.createElement(BatsmanProfileModal, {
        player: mockPlayer,
        isOpen: true,
        onClose: () => {},
      })
    );

    // Verify progressbar semantics
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-label="Run Production Sources Distribution"');

    // Confirm that the progress bar segments DO NOT have duplicate title tooltips
    expect(html).not.toContain('title="Boundaries:');
    expect(html).not.toContain('title="Running:');

    // Confirm that information cards below serve as the clean, single location for percentage & runs
    expect(html).toContain('Boundaries');
    expect(html).toContain('Running');
    expect(html).toContain('>36r (67%)<'); // (6*4 + 2*6) = 36 runs out of 54 = 66.67% -> 67%
    expect(html).toContain('>18r (33%)<'); // 54 - 36 = 18 runs out of 54 = 33.33% -> 33%
  });

  it('compact redesign structure: slim header, one-line run production, intent banner untouched', () => {
    const html = renderToStaticMarkup(
      React.createElement(BatsmanProfileModal, {
        player: mockPlayer,
        isOpen: true,
        onClose: () => {},
        battingPosition: 1,
        isStriker: true,
      })
    );

    // Slimmer header: reduced padding, smaller avatar, ghost-circle close
    expect(html).toContain('px-4 py-3');
    expect(html).toContain('w-11 h-11');
    // Header V3c (TAIMUR, 2026-11-10): no X button; the at-crease dot
    // badge sits on the avatar corner for the striker, and the crease
    // status rides the meta line instead of a name-row pill.
    expect(html).toContain('bg-emerald-400 border-2 border-slate-950');
    expect(html).toContain('★ STRIKER');

    // Run Production legend is ONE flex line (Boundaries left, Running
    // right), not the old stacked two-row grid
    expect(html).toContain('flex gap-2 text-caption pt-1');
    expect(html).not.toContain('grid grid-cols-1 sm:grid-cols-2 gap-2 text-caption');

    // The Batting Intent banner is unchanged by the redesign
    expect(html).toContain('Batting Intent');
    expect(html).toContain('rounded-xl sm:rounded-2xl border');
  });
});

