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

    // Verify 4-stat single row container exists with grid-cols-4 and divide-x
    expect(html).toContain('grid-cols-4');
    expect(html).toContain('divide-x');

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

  it('renders Pressure & Discipline as a single compact horizontal container divided into two sections', () => {
    const html = renderToStaticMarkup(
      React.createElement(BowlerProfileModal, {
        bowler: mockBowler,
        isOpen: true,
        onClose: () => {},
      })
    );

    // Must have the single horizontal container with grid-cols-2 and divide-x
    expect(html).toContain('grid-cols-2');
    expect(html).toContain('aria-label="Pressure &amp; Discipline"');

    // Left section: Dot Deliveries
    expect(html).toContain('Dot Deliveries');
    // Dot ball count from overHistory: Over 1 (6) + Over 2 (2) + Over 3 (4) = 12 dots
    expect(html).toContain('12 dots');

    // Right section: Illegal / Extra Deliveries
    expect(html).toContain('Illegal / Extra Deliveries');
    // Extras: 1 wide + 1 noball = 2 extras
    expect(html).toContain('1w, 1nb');

    // Old nested two-box layout with redundant outer card should not exist
    expect(html).not.toContain('grid-cols-1 sm:grid-cols-2');
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

    // Current bowler badge
    expect(html).toContain('CURRENT BOWLER');
    // 12 dots + 2 ongoing dots = 14 dots
    expect(html).toContain('14 dots');
    // 1 wide + 1 noball + 1 ongoing wide = 3 extras (2w, 1nb)
    expect(html).toContain('2w, 1nb');
  });

  it('renders a compact minimal close area with pill-shaped button and mobile bottom-sheet handle in BowlerProfileModal', () => {
    const html = renderToStaticMarkup(
      React.createElement(BowlerProfileModal, {
        bowler: mockBowler,
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
});
