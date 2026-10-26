import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';
import { BatsmanProfileModal } from '@/components/modals/BatsmanProfileModal';
import { BowlerProfileModal } from '@/components/modals/BowlerProfileModal';
import { Player, Bowler, FallOfWicket } from '@/domain/cricket/types';

describe('Archived Match Scoreboard — Player Profile Modal React Portal & Visibility Suite', () => {
  const mockArchivedBatsman: Player = {
    id: 'center-inn-1-batter-0-tamim_iqbal',
    name: 'Tamim Iqbal',
    runs: 68,
    balls: 45,
    fours: 8,
    sixes: 2,
    dotBalls: 14,
    ballLog: ['0', '4', '1', '6', '0', '0', '4', '1'],
    battingHand: 'Left-hand Batsman',
    bowlersFaced: { 'Shaheen Afridi': 25, 'Haris Rauf': 20 },
    runsVsBowler: { 'Shaheen Afridi': 38, 'Haris Rauf': 30 },
    isDismissed: true,
    dismissalText: 'c Babar b Shaheen',
  };

  const mockArchivedBowler: Bowler = {
    id: 'center-inn-1-bowler-0-shaheen_afridi',
    name: 'Shaheen Afridi',
    ballsBowled: 24, // 4.0 overs
    maidens: 1,
    runs: 28,
    wickets: 3,
    overHistory: [
      { overNumber: 1, log: ['0', '0', '0', '0', '0', '0'] },
      { overNumber: 2, log: ['4', '1', 'W', '0', '6', '0'] },
      { overNumber: 3, log: ['1', '0', 'W', '1', '0', '0'] },
      { overNumber: 4, log: ['0', '4', 'W', '1', '1', '0'] },
    ],
  };

  describe('1. Static Code Analysis: React Portal Architecture & Z-Index Layering', () => {
    it('verifies BatsmanProfileModal imports createPortal from react-dom and portals into document.body', () => {
      const filePath = path.resolve(process.cwd(), 'src/components/modals/BatsmanProfileModal.tsx');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain("import { createPortal } from 'react-dom';");
      expect(content).toContain('createPortal(modalContent, document.body)');
      expect(content).toContain('z-[60]');
      expect(content).toContain('z-50');
      expect(content).toContain('role="dialog"');
      expect(content).toContain('aria-modal="true"');
      expect(content).toContain("document.body.style.overflow = 'hidden'");
      expect(content).toContain("document.body.style.overflow = 'unset'");
    });

    it('verifies BowlerProfileModal imports createPortal from react-dom and portals into document.body', () => {
      const filePath = path.resolve(process.cwd(), 'src/components/modals/BowlerProfileModal.tsx');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain("import { createPortal } from 'react-dom';");
      expect(content).toContain('createPortal(modalContent, document.body)');
      expect(content).toContain('z-[60]');
      expect(content).toContain('z-50');
      expect(content).toContain('role="dialog"');
      expect(content).toContain('aria-modal="true"');
      expect(content).toContain("document.body.style.overflow = 'hidden'");
      expect(content).toContain("document.body.style.overflow = 'unset'");
    });

    it('verifies MatchCenterPage defines resolveStableBatsman and resolveStableBowler with full defensive defaults', () => {
      const filePath = path.resolve(process.cwd(), 'src/app/matches/center/[matchId]/page.tsx');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('resolveStableBatsman');
      expect(content).toContain('resolveStableBowler');
      expect(content).toContain('runs: p.runs ?? 0');
      expect(content).toContain('ballsBowled: b.ballsBowled ?? 0');
      expect(content).toContain('selectedBatsman');
      expect(content).toContain('selectedBowler');
    });

    it('verifies PageTransition establishes containing block which necessitated React Portals', () => {
      const filePath = path.resolve(process.cwd(), 'src/components/layout/PageTransition.tsx');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('will-change-[transform,opacity]');
    });
  });

  describe('2. BatsmanProfileModal Markup & Display Metrics', () => {
    it('renders batsman profile with all key metrics (runs, balls, 4s, 6s, SR, dismissal)', () => {
      const html = renderToStaticMarkup(
        <BatsmanProfileModal
          player={mockArchivedBatsman}
          isOpen={true}
          onClose={() => {}}
          battingPosition={1}
        />
      );

      expect(html).toContain('Tamim Iqbal');
      expect(html).toContain('Player Profile');
      expect(html).toContain('>68<'); // Runs
      expect(html).toContain('>45<'); // Balls Faced
      expect(html).toContain('>8<');  // 4s
      expect(html).toContain('>2<');  // 6s
      expect(html).toContain('151.1'); // Strike Rate: (68 / 45) * 100 = 151.1
      expect(html).toContain('c Babar b Shaheen');
      expect(html).toContain('z-[60]');
      expect(html).toContain('z-50');
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
    });

    it('renders bowler dominance breakdown for batsmen who faced multiple bowlers', () => {
      const html = renderToStaticMarkup(
        <BatsmanProfileModal
          player={mockArchivedBatsman}
          isOpen={true}
          onClose={() => {}}
        />
      );

      expect(html).toContain('Encounter vs Bowlers');
      expect(html).toContain('Shaheen Afridi');
      expect(html).toContain('Haris Rauf');
      expect(html).toContain('>38<'); // runs vs Shaheen
      expect(html).toContain('>30<'); // runs vs Haris
    });

    it('renders clean fallback when not open or player is null', () => {
      const htmlClosed = renderToStaticMarkup(
        <BatsmanProfileModal
          player={mockArchivedBatsman}
          isOpen={false}
          onClose={() => {}}
        />
      );
      expect(htmlClosed).toBe('');

      const htmlNull = renderToStaticMarkup(
        <BatsmanProfileModal
          player={null}
          isOpen={true}
          onClose={() => {}}
        />
      );
      expect(htmlNull).toBe('');
    });
  });

  describe('3. BowlerProfileModal Markup & Spell Metrics', () => {
    it('renders bowler profile with 4 core metrics (Overs, Maidens, Runs, Wickets)', () => {
      const html = renderToStaticMarkup(
        <BowlerProfileModal
          bowler={mockArchivedBowler}
          isOpen={true}
          onClose={() => {}}
        />
      );

      expect(html).toContain('Shaheen Afridi');
      expect(html).toContain('Bowler Profile');
      expect(html).toContain('>4.0<'); // Overs
      expect(html).toContain('>1<');   // Maidens
      expect(html).toContain('>28<');  // Runs
      expect(html).toContain('>3<');   // Wickets
      expect(html).toContain('Econ 7.00'); // 28 / 4.0 = 7.00
      expect(html).toContain('z-[60]');
      expect(html).toContain('z-50');
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
    });

    it('renders over-by-over breakdown accurately', () => {
      const html = renderToStaticMarkup(
        <BowlerProfileModal
          bowler={mockArchivedBowler}
          isOpen={true}
          onClose={() => {}}
        />
      );

      expect(html).toContain('Over-by-Over Deliveries (4)');
      expect(html).toContain('Over 1');
      expect(html).toContain('Over 2');
      expect(html).toContain('Over 3');
      expect(html).toContain('Over 4');
      expect(html).toContain('MAIDEN'); // Over 1 was maiden
    });

    it('renders clean fallback when bowler modal is closed or bowler is null', () => {
      const htmlClosed = renderToStaticMarkup(
        <BowlerProfileModal
          bowler={mockArchivedBowler}
          isOpen={false}
          onClose={() => {}}
        />
      );
      expect(htmlClosed).toBe('');

      const htmlNull = renderToStaticMarkup(
        <BowlerProfileModal
          bowler={null}
          isOpen={true}
          onClose={() => {}}
        />
      );
      expect(htmlNull).toBe('');
    });
  });

  describe('4. Incomplete or Sparse Archived Data Resilience', () => {
    it('handles archived batsman with null/missing ballLog, dotBalls, and bowlersFaced without throwing', () => {
      const sparseBatsman: Player = {
        id: 'sparse-bat',
        name: 'Legacy Batter',
        battingHand: 'Right-hand Batsman',
        runs: 12,
        balls: 10,
        fours: 1,
        sixes: 0,
        dotBalls: (undefined as any),
        ballLog: (undefined as any),
        bowlersFaced: (undefined as any),
        runsVsBowler: (undefined as any),
        isDismissed: false,
      };

      const html = renderToStaticMarkup(
        <BatsmanProfileModal
          player={sparseBatsman}
          isOpen={true}
          onClose={() => {}}
          fallOfWickets={undefined}
        />
      );

      expect(html).toContain('Legacy Batter');
      expect(html).toContain('>12<');
      expect(html).toContain('>10<');
      expect(html).toContain('Run Production Sources');
    });

    it('handles archived bowler with null/missing overHistory without throwing', () => {
      const sparseBowler: Bowler = {
        id: 'sparse-bowl',
        name: 'Legacy Bowler',
        ballsBowled: 6,
        maidens: 0,
        runs: 8,
        wickets: 1,
        overHistory: (undefined as any),
      };

      const html = renderToStaticMarkup(
        <BowlerProfileModal
          bowler={sparseBowler}
          isOpen={true}
          onClose={() => {}}
          fallOfWickets={undefined}
        />
      );

      expect(html).toContain('Legacy Bowler');
      expect(html).toContain('>1.0<');
      expect(html).toContain('>8<');
      expect(html).toContain('>1<');
      expect(html).toContain('No overs completed yet in this spell.');
    });
  });
});
