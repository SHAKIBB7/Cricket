import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActiveBowlerTable } from '../components/scoring/ActiveBowlerTable';
import { Bowler } from '../domain/cricket/types';

describe('ActiveBowlerTable Component', () => {
  const mockBowler = {
    id: 'b1',
    name: 'Shaon',
    ballsBowled: 12, // 2.0 overs
    maidens: 0,
    runs: 18,
    wickets: 2,
    overHistory: [],
  } as Bowler;

  it('renders the international standard header row: BOWLER | O | M | R | W | ECO', () => {
    const html = renderToStaticMarkup(
      React.createElement(ActiveBowlerTable, {
        bowler: mockBowler,
        onSelectBowler: () => {},
      })
    );

    expect(html).toContain('BOWLER');
    expect(html).toContain('>O<');
    expect(html).toContain('>M<');
    expect(html).toContain('>R<');
    expect(html).toContain('>W<');
    expect(html).toContain('>ECO<');
  });

  it('ensures Maidens (M) is always visible across all viewports including mobile (not hidden)', () => {
    const html = renderToStaticMarkup(
      React.createElement(ActiveBowlerTable, {
        bowler: mockBowler,
        onSelectBowler: () => {},
      })
    );

    // M must be directly visible, without hidden sm:table-cell
    expect(html).not.toMatch(/<th[^>]*hidden[^>]*>M<\/th>/);
    expect(html).not.toMatch(/<td[^>]*hidden[^>]*>0<\/td>/);
    expect(html).toContain('>M<');
    expect(html).toContain('>0<');
  });

  it('correctly calculates and renders Bowler stats: Shaon, 2.0, 0, 18, 2, 9.00', () => {
    const html = renderToStaticMarkup(
      React.createElement(ActiveBowlerTable, {
        bowler: mockBowler,
        onSelectBowler: () => {},
      })
    );

    expect(html).toContain('Shaon');
    expect(html).toContain('>2.0<'); // Overs
    expect(html).toContain('>0<');   // Maidens
    expect(html).toContain('>18<');  // Runs
    expect(html).toContain('>2<');   // Wickets
    expect(html).toContain('9.00');  // Economy = (18 / 2) = 9.00
  });

  it('handles empty or missing bowler gracefully without crashing', () => {
    const html = renderToStaticMarkup(
      React.createElement(ActiveBowlerTable, {
        bowler: null,
        onSelectBowler: () => {},
      })
    );

    expect(html).toContain('BOWLER');
    expect(html).toContain('Bowler');
    expect(html).toContain('>0.0<');
    expect(html).toContain('0.00');
  });
});
