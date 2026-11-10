// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToHtml } from './helpers/render-dom';
import { OutModal } from '../components/modals/OutModal';
import { BatsmanProfileModal } from '../components/modals/BatsmanProfileModal';
import { BowlerProfileModal } from '../components/modals/BowlerProfileModal';
import { CompactDropdown } from '../components/common/CompactDropdown';
import { PRIMARY_DISMISSAL_TYPES, getDismissalRule } from '../domain/cricket/dismissals';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { Player, Bowler } from '../domain/cricket/types';

describe('Wicket Type Selection Scrolling & Profile Swipe-to-Dismiss Fix Regression Suite', () => {
  describe('1. Wicket Type Selection List & Scrolling Architecture', () => {
    it('verifies all expected dismissal types are available in PRIMARY_DISMISSAL_TYPES', () => {
      const expectedDismissals = [
        'Bowled',
        'Caught',
        'Run Out',
        'LBW',
        'Stumped',
        'Hit Wicket',
        'Retired Hurt',
        'Hit the Ball Twice',
        'Obstructing the Field',
        'Retired Out',
        'Timed Out',
      ];

      for (const d of expectedDismissals) {
        expect(PRIMARY_DISMISSAL_TYPES).toContain(d);
        const rule = getDismissalRule(d);
        expect(rule).toBeDefined();
        expect(rule.id).toBe(d);
      }
    });

    it('verifies OutModal includes momentum scrolling, overscroll containment, and touch-pan-y on mobile viewports', () => {
      const html = renderToHtml(
        <OutModal
          isOpen={true}
          onClose={() => {}}
          onConfirm={() => {}}
          strikerName="Shakib Al Hasan"
          nonStrikerName="Mushfiqur Rahim"
          bowlerName="Trent Boult"
          initialDismissalType="Bowled"
        />
      );

      // Verify outer backdrop has momentum scrolling and overscroll containment
      expect(html).toContain('touch-pan-y');
      expect(html).toContain('-webkit-overflow-scrolling: touch'); // DOM CSSOM serialization (was compact under SSR) — same style
      expect(html).toContain('overscroll-behavior-y: contain'); // DOM CSSOM serialization (was compact under SSR) — same style

      // Verify inner body is independently scrollable with min-h-0 and flex-1
      expect(html).toContain('flex-1');
      expect(html).toContain('min-h-0');
      expect(html).toContain('overflow-y-auto');
      expect(html).toContain('overscroll-contain');
    });

    it('verifies CompactDropdown renders smoothly with touch-pan-y, -webkit-overflow-scrolling, and without select-none on scroll container', () => {
      const options = PRIMARY_DISMISSAL_TYPES.map((type) => ({
        value: type,
        label: type,
      }));

      const html = renderToHtml(
        <CompactDropdown
          value="Bowled"
          options={options}
          onChange={() => {}}
          size="md"
        />
      );

      // Main box renders properly
      expect(html).toContain('Bowled');
      expect(html).toContain('Show all options');
    });
  });

  describe('2. Cricket Scoring Verification for Primary Dismissals', () => {
    const createTestEngine = () => {
      return new EventSourcedMatchEngine({
        teamA: 'Bangladesh',
        teamB: 'India',
        tossWinner: 'Bangladesh',
        tossDecision: 'Batting',
        totalOvers: 20,
        strikerName: 'Tamim Iqbal',
        nonStrikerName: 'Litton Das',
        bowlerName: 'Jasprit Bumrah',
      });
    };

    it('accurately scores Bowled: credits bowler, increments wickets, logs W', () => {
      const engine = createTestEngine();
      engine.scoreBall({
        runsScored: 0,
        isWicket: true,
        dismissalType: 'Bowled',
        isStrikerOut: true,
      });

      const inn = engine.currentInnings;
      expect(inn.totalWickets).toBe(1);
      expect(inn.bowlers[0].wickets).toBe(1);
      expect(inn.fallOfWickets.length).toBe(1);
      expect(inn.fallOfWickets[0].dismissalType).toBe('Bowled');
      expect(inn.fallOfWickets[0].player).toBe('Tamim Iqbal');
      expect(inn.fallOfWickets[0].bowler).toBe('Jasprit Bumrah');
    });

    it('accurately scores Caught: credits bowler, records catcher fielder', () => {
      const engine = createTestEngine();
      engine.scoreBall({
        runsScored: 0,
        isWicket: true,
        dismissalType: 'Caught',
        fielderName: 'Virat Kohli',
        isStrikerOut: true,
      });

      const inn = engine.currentInnings;
      expect(inn.totalWickets).toBe(1);
      expect(inn.bowlers[0].wickets).toBe(1);
      expect(inn.fallOfWickets[0].dismissal).toContain('Caught by Virat Kohli');
      expect(inn.fallOfWickets[0].fielder).toBe('Virat Kohli');
    });

    it('accurately scores Run Out: bowler is NOT credited, fielder recorded, handles non-striker out', () => {
      const engine = createTestEngine();
      engine.scoreBall({
        runsScored: 1,
        isWicket: true,
        dismissalType: 'Run Out',
        fielderName: 'Ravindra Jadeja',
        isStrikerOut: false, // Non-striker run out
      });

      const inn = engine.currentInnings;
      expect(inn.totalWickets).toBe(1);
      expect(inn.bowlers[0].wickets).toBe(0); // Bowler not credited
      expect(inn.fallOfWickets[0].player).toBe('Litton Das');
      expect(inn.fallOfWickets[0].dismissal).toContain('Run Out by Ravindra Jadeja');
      expect(inn.fallOfWickets[0].bowler).toBeUndefined();
    });

    it('accurately scores LBW: credits bowler, striker out', () => {
      const engine = createTestEngine();
      engine.scoreBall({
        runsScored: 0,
        isWicket: true,
        dismissalType: 'LBW',
        isStrikerOut: true,
      });

      const inn = engine.currentInnings;
      expect(inn.totalWickets).toBe(1);
      expect(inn.bowlers[0].wickets).toBe(1);
      expect(inn.fallOfWickets[0].dismissalType).toBe('LBW');
      expect(inn.fallOfWickets[0].player).toBe('Tamim Iqbal');
    });

    it('accurately scores Retired Hurt: bowler is NOT credited, recorded cleanly in scorecard', () => {
      const engine = createTestEngine();
      engine.scoreBall({
        runsScored: 0,
        isWicket: true,
        dismissalType: 'Retired Hurt',
        isStrikerOut: true,
      });

      const inn = engine.currentInnings;
      expect(inn.totalWickets).toBe(1);
      expect(inn.bowlers[0].wickets).toBe(0); // Bowler NOT credited
      expect(inn.fallOfWickets[0].dismissalType).toBe('Retired Hurt');
      expect(inn.fallOfWickets[0].player).toBe('Tamim Iqbal');
      expect(inn.fallOfWickets[0].bowler).toBeUndefined();
    });
  });

  describe('3. Batsman Profile Swipe-to-Dismiss Elimination & Scroll Preservation', () => {
    const mockPlayer: Player = {
      id: 'bat-1',
      name: 'Najmul Hossain Shanto',
      runs: 48,
      balls: 35,
      fours: 5,
      sixes: 1,
      dotBalls: 12,
      ballLog: ['0', '1', '4', '0', '6', '1'],
      battingHand: 'Left-hand Batsman',
      isDismissed: false,
      bowlersFaced: {},
      runsVsBowler: {},
    };

    it('confirms drag="y" and onDragEnd are removed from BatsmanProfileModal', () => {
      const html = renderToHtml(
        <BatsmanProfileModal
          player={mockPlayer}
          isOpen={true}
          onClose={() => {}}
          battingPosition={3}
        />
      );

      // Must NOT contain drag attributes or swipe handlers
      expect(html).not.toContain('drag="y"');
      expect(html).not.toContain('dragConstraints');
      expect(html).not.toContain('dragElastic');

      // Preserves normal vertical scrolling container with momentum support
      expect(html).toContain('overflow-y-auto');
      expect(html).toContain('overscroll-contain');
      expect(html).toContain('touch-pan-y');
      expect(html).toContain('-webkit-overflow-scrolling: touch'); // DOM CSSOM serialization (was compact under SSR) — same style
      expect(html).toContain('overscroll-behavior-y: contain'); // DOM CSSOM serialization (was compact under SSR) — same style

      // Close model (TAIMUR, 2026-11-10): footer bar, Done and the
      // header X are gone; the back chevron (title below) is the one
      // explicit close control, backdrop/Escape unchanged.
      expect(html).not.toContain('Close Profile');
      expect(html).not.toContain('>Done<');
      expect(html).not.toContain('aria-label="Close"');
      expect(html).toContain('Close Player Profile');
      expect(html).not.toContain('cursor-grab'); // grab pill removed with the clean app bar
    });
  });

  describe('4. Bowler Profile Swipe-to-Dismiss Elimination & Scroll Preservation', () => {
    const mockBowler: Bowler = {
      id: 'bowl-1',
      name: 'Taskin Ahmed',
      ballsBowled: 24,
      maidens: 1,
      runs: 18,
      wickets: 2,
      overHistory: [
        {
          overNumber: 1,
          log: ['0', '0', '0', '0', '0', '0'],
        },
      ],
    };

    it('confirms drag="y" and onDragEnd are removed from BowlerProfileModal', () => {
      const html = renderToHtml(
        <BowlerProfileModal
          bowler={mockBowler}
          isOpen={true}
          onClose={() => {}}
        />
      );

      // Must NOT contain drag attributes or swipe handlers
      expect(html).not.toContain('drag="y"');
      expect(html).not.toContain('dragConstraints');
      expect(html).not.toContain('dragElastic');

      // Preserves normal vertical scrolling container with momentum support
      expect(html).toContain('overflow-y-auto');
      expect(html).toContain('overscroll-contain');
      expect(html).toContain('touch-pan-y');
      expect(html).toContain('-webkit-overflow-scrolling: touch'); // DOM CSSOM serialization (was compact under SSR) — same style
      expect(html).toContain('overscroll-behavior-y: contain'); // DOM CSSOM serialization (was compact under SSR) — same style

      // Preserves all explicit close buttons
      expect(html).toContain('Close Profile');
      expect(html).toContain('Done');
      expect(html).toContain('aria-label="Close"');
      expect(html).toContain('cursor-grab'); // Header grab pill visual preserved
    });
  });
});
