// @vitest-environment jsdom
/**
 * Feature: Select Bowler — full-page enterprise grid (approved design
 * 2026-11-10, TAIMUR picked the Enterprise Grid mockup, then its
 * full-page polished variant).
 *
 * Pins:
 *  - the economy / balls / overs-remaining maths behind the grid cells;
 *  - UnifiedSheet's opt-in 'page' presentation (full viewport, no
 *    backdrop, no drag handle) and the bowler branch opting into it;
 *  - the grid structure in the rendered DOM (column headers, economy
 *    values, overs-left line, live strip) with the batter branch left
 *    on the established sheet + list.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToHtml } from './helpers/render-dom';
import {
  PlayerSelectionModal,
  bowlerBallsBowled,
  bowlerEconomy,
  bowlerOversRemaining,
  type BowlerFigureInfo,
} from '../components/modals/PlayerSelectionModal';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const fig = (overs: string, runs: number, wickets = 0, maidens = 0): BowlerFigureInfo => ({
  overs,
  runs,
  wickets,
  maidens,
});

describe('bowler grid maths', () => {
  it('converts cricket overs notation to balls', () => {
    expect(bowlerBallsBowled(fig('0.0', 0))).toBe(0);
    expect(bowlerBallsBowled(fig('3.0', 0))).toBe(18);
    expect(bowlerBallsBowled(fig('3.2', 0))).toBe(20);
    expect(bowlerBallsBowled(fig('10.5', 0))).toBe(65);
  });

  it('computes economy per six balls, null before a ball is bowled', () => {
    expect(bowlerEconomy(fig('2.0', 31, 1))).toBe(15.5);
    expect(bowlerEconomy(fig('3.0', 18, 2))).toBe(6);
    expect(bowlerEconomy(fig('0.0', 0))).toBeNull();
    expect(bowlerEconomy(fig('0.3', 6))?.toFixed(2)).toBe('12.00');
  });

  it('counts overs remaining with a part-bowled over consuming its slot', () => {
    expect(bowlerOversRemaining(fig('2.0', 31), 3)).toBe(1);
    expect(bowlerOversRemaining(fig('2.3', 31), 3)).toBe(0);
    expect(bowlerOversRemaining(fig('0.0', 0), 3)).toBe(3);
    expect(bowlerOversRemaining(fig('4.0', 32), 4)).toBe(0);
  });
});

describe('page presentation wiring (source pins)', () => {
  it('UnifiedSheet offers an opt-in page presentation on the same plumbing', () => {
    const sheet = read('src/components/overlay/UnifiedSheet.tsx');
    expect(sheet).toContain("presentation?: 'sheet' | 'page'");
    expect(sheet).toContain('isPage ? [1] : detents');
    expect(sheet).toContain('drag={isPage ? false :');
    expect(sheet).toContain('{!isPage && (');
  });

  it('the bowler branch is a page with the enterprise grid; the batter branch stays a sheet', () => {
    const modal = read('src/components/modals/PlayerSelectionModal.tsx');
    expect(modal).toContain('presentation="page"');
    expect(modal).toContain('BOWLER_GRID_COLS');
    expect(modal).toContain("t('psm_bowling_now', 'Bowling now')");
    expect(modal).toContain("t('psm_col_econ', 'Econ')");
    expect(modal).toContain('mt-auto sticky bottom-0');
    expect(modal).toContain('detents={[0.5, 0.92]}');
  });

  it('the score page feeds the live strip only for bowler selection', () => {
    const page = read('src/app/matches/score/[matchId]/page.tsx');
    expect(page).toContain('liveStrip={');
    expect(page).toContain("playerSelectType === 'bowler'");
  });

  it('status pills can never overflow into the ECON column (alignment fix 2026-11-10)', () => {
    const modal = read('src/components/modals/PlayerSelectionModal.tsx');
    // The status track is wide enough for "Max Limit (2/2 ov)" and the
    // pills wrap inside it instead of spilling left over the economy
    // figure (the first grid shipped a 4.2rem track + nowrap pills).
    expect(modal).toContain('5.3rem]');
    expect(modal).toContain('max-w-full whitespace-normal break-words');
    // The score page no longer appends the percentage to the strip's
    // over text (it truncated on phones; the bar carries the pct).
    const page = read('src/app/matches/score/[matchId]/page.tsx');
    expect(page).toContain("${t('mp_ov', 'Ov')}`");
  });
});

describe('bowler grid rendering', () => {
  it('renders headers, economy, overs-left and the live strip from real props', () => {
    const html = renderToHtml(
      React.createElement(PlayerSelectionModal, {
        isOpen: true,
        onClose: () => {},
        type: 'bowler',
        title: 'Select Bowler',
        teamName: 'PALASH',
        squadMembers: ['Mahir', 'Alamin'],
        currentSelectedName: 'Mahir',
        ineligiblePlayers: [{ name: 'Mahir', reason: 'Prev Over' }],
        bowlerFiguresMap: {
          mahir: { overs: '2.0', maidens: 0, runs: 31, wickets: 1 },
          alamin: { overs: '1.0', maidens: 0, runs: 9, wickets: 0 },
        },
        maxOversLimit: 3,
        liveStrip: { overText: 'OVER 3.0 / 10 Ov — 30%', pct: 30, scoreText: 'PALASH 86/3' },
        onSelectPlayer: () => {},
      })
    );

    // Grid column headers
    for (const h of ['Player', 'Ov', 'Runs', 'Wkts', 'Econ', 'Status']) {
      expect(html).toContain(h);
    }
    // Economy column: Mahir 31 off 2.0 = 15.50, Alamin 9 off 1.0 = 9.00
    expect(html).toContain('15.50');
    expect(html).toContain('9.00');
    // Overs-left lines under the names (limit 3)
    expect(html).toContain('1 ov left');
    expect(html).toContain('2 ov left');
    // Status: current bowler pill + his Prev Over reason stays visible
    expect(html).toContain('Bowling now');
    expect(html).toContain('Prev Over');
    // Live strip content
    expect(html).toContain('INNINGS PROGRESS');
    expect(html).toContain('OVER 3.0 / 10 Ov — 30%');
    expect(html).toContain('PALASH 86/3');
    // Manual entry still present in the sticky bar
    expect(html).toContain('Enter Player Name Manually');
  });

  it('shows a yet-to-bowl row with dashes for a bowler without figures', () => {
    const html = renderToHtml(
      React.createElement(PlayerSelectionModal, {
        isOpen: true,
        onClose: () => {},
        type: 'bowler',
        teamName: 'PALASH',
        squadMembers: ['Shakib'],
        bowlerFiguresMap: {},
        maxOversLimit: 3,
        onSelectPlayer: () => {},
      })
    );
    expect(html).toContain('Yet to bowl');
    expect(html).toContain('—');
    expect(html).toContain('0.0');
  });
});
