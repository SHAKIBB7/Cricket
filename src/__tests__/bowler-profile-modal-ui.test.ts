import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BowlerProfileModal } from '../components/modals/BowlerProfileModal';
import { Bowler } from '../domain/cricket/types';

describe('Bowling Profile UI Optimization', () => {
  const mockBowler: Bowler = {
    id: 'bowler-1',
    name: 'Mustafizur Rahman',
    ballsBowled: 18, // 3.0 overs
    maidens: 1,
    runs: 15,
    wickets: 3,
    overHistory: [
      {
        overNumber: 1,
        log: ['0', '0', '0', '0', '0', '0'], // Maiden over, 6 dots
      },
      {
        overNumber: 2,
        log: ['1', '4', 'W', '0', 'Wd', '2'], // 1 wide, 1 wicket, 1 dot
      },
      {
        overNumber: 3,
        log: ['0', 'W', '0', 'Nb', '4', 'W'], // 1 no-ball, 2 wickets, 2 dots
      },
    ],
  };

  it('renders all four bowling statistics (Overs, Maidens, Runs, Wickets) in a single horizontal row', () => {
    const html = renderToStaticMarkup(
      React.createElement(BowlerProfileModal, {
        bowler: mockBowler,
        isOpen: true,
        onClose: () => {},
      })
    );

    // Verify 4-stat single row container exists with grid-cols-4.
    // Master B (TAIMUR, 2026-11-10): the strip is a hairline grid
    // (gap-px), replacing the old divide-x shell.
    expect(html).toContain('grid-cols-4');
    expect(html).toContain('gap-px');

    // Verify all four labels are present
    expect(html).toContain('Overs');
    expect(html).toContain('Maidens');
    expect(html).toContain('Runs');
    expect(html).toContain('Wickets');

    // Verify dynamic values
    expect(html).toContain('>3.0<'); // 18 balls = 3.0 overs
    expect(html).toContain('>1<');   // 1 maiden
    expect(html).toContain('>15<');  // 15 runs
    expect(html).toContain('>3<');   // 3 wickets

    // Verify old 5-col / 6-col grid is not present
    expect(html).not.toContain('grid-cols-6');
    expect(html).not.toContain('sm:grid-cols-5');
  });

  it('removes the large Economy card while preserving Economy rate in the header bar', () => {
    const html = renderToStaticMarkup(
      React.createElement(BowlerProfileModal, {
        bowler: mockBowler,
        isOpen: true,
        onClose: () => {},
      })
    );

    // Large visual card with "r/over" must be removed
    expect(html).not.toContain('r/over');

    // Header bar must still preserve the calculated Economy rate (15 runs / 3 overs = 5.00)
    expect(html).toContain('Econ 5.00');
  });

  it('renders Pressure & Discipline as one four-across hairline strip (Master B)', () => {
    const html = renderToStaticMarkup(
      React.createElement(BowlerProfileModal, {
        bowler: mockBowler,
        isOpen: true,
        onClose: () => {},
      })
    );

    // Master B (TAIMUR, 2026-11-10): the two icon boxes became a
    // single four-across strip mirroring the batsman Dot Ball strip;
    // the region keeps its Pressure & Discipline label.
    expect(html).toContain('aria-label="Pressure &amp; Discipline"');
    expect(html).toContain('Dot Balls');
    expect(html).toContain('Dot %');
    expect(html).toContain('Wides');
    expect(html).toContain('No Balls');

    // Dot ball count from overHistory: Over 1 (6) + Over 2 (2) + Over 3 (4) = 12 dots; 12/18 = 67%
    expect(html).toContain('>12<');
    expect(html).toContain('67%');

    // The old two-box wording and layout are gone
    expect(html).not.toContain('Dot Deliveries');
    expect(html).not.toContain('Illegal / Extra Deliveries');
    expect(html).not.toContain('grid-cols-2');
  });

  it('ensures mobile responsiveness and prevents overflow with min-w-0 and truncate', () => {
    const html = renderToStaticMarkup(
      React.createElement(BowlerProfileModal, {
        bowler: mockBowler,
        isOpen: true,
        onClose: () => {},
      })
    );

    // Check truncation classes for preventing overflow and clipping
    expect(html).toContain('truncate');
    expect(html).toContain('min-w-0');
    expect(html).toContain('overflow-hidden');
  });

  it('dynamically reflects active match over in Dot and Extras calculation when bowler is currently bowling', () => {
    const html = renderToStaticMarkup(
      React.createElement(BowlerProfileModal, {
        bowler: mockBowler,
        isOpen: true,
        onClose: () => {},
        isCurrentlyBowling: true,
        ongoingOverLog: ['0', '0', 'Wd'],
        ongoingMatchOver: 4,
      })
    );

    // Current bowler status (now the meta line's final segment)
    expect(html).toContain('CURRENT BOWLER');
    // 12 dots + 2 ongoing dots = 14 in the Dot Balls cell
    expect(html).toContain('>14<');
    // Wides: 1 + 1 ongoing = 2, shown in the Wides cell
    expect(html).toContain('Wides');
  });

  it('mirrors the batsman profile close model: no footer bar, no Done, no drag handle (Master B)', () => {
    const html = renderToStaticMarkup(
      React.createElement(BowlerProfileModal, {
        bowler: mockBowler,
        isOpen: true,
        onClose: () => {},
      })
    );

    // Master B (TAIMUR, 2026-11-10): the footer Close Profile bar,
    // the top-bar Done button and the drag handle were removed; the
    // circular back button is the only explicit close control.
    expect(html).not.toContain('Close Profile');
    expect(html).not.toContain('cursor-grab');
    expect(html).not.toContain('>Done<');
    expect(html).toContain('rounded-full');

    // Safe-area support moved to the scroll container (footer gone)
    expect(html).toContain('pb-safe');

    // Flush mobile docking (p-0 sm:p-4)
    expect(html).toContain('p-0');
    expect(html).toContain('sm:p-4');
  });
});
