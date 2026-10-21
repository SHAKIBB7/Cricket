import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { BatsmanProfileModal } from '../components/modals/BatsmanProfileModal';
import { BowlerProfileModal } from '../components/modals/BowlerProfileModal';
import { ActiveBowlerTable } from '../components/scoring/ActiveBowlerTable';
import { Player, Bowler } from '../domain/cricket/types';

describe('Over Deliveries, Bowler Recent Balls & Dot Ball Display Suite', () => {
  const setupEngine = () => {
    return new EventSourcedMatchEngine({
      teamA: 'Sylhet Strikers',
      teamB: 'Rangpur Riders',
      tossWinner: 'Sylhet Strikers',
      tossDecision: 'Batting',
      totalOvers: 5,
      strikerName: 'Najmul Shanto',
      nonStrikerName: 'Mushfiqur Rahim',
      bowlerName: 'Hasan Mahmud',
    });
  };

  describe('1. Over Deliveries Timeline Display (inn.thisOverLog)', () => {
    it('starts with an empty over log', () => {
      const engine = setupEngine();
      expect(engine.currentInnings.thisOverLog).toEqual([]);
    });

    it('records dot balls as "0" in thisOverLog', () => {
      const engine = setupEngine();
      engine.scoreBall({ runsScored: 0 });
      expect(engine.currentInnings.thisOverLog).toEqual(['0']);
    });

    it('accumulates deliveries sequentially in thisOverLog without sliding truncation', () => {
      const engine = setupEngine();

      // Ball 1: 0 (dot)
      engine.scoreBall({ runsScored: 0 });
      // Ball 2: 1
      engine.scoreBall({ runsScored: 1 });
      // Ball 3: 4 (four)
      engine.scoreBall({ runsScored: 4 });
      // Ball 4: Wicket
      engine.scoreBall({
        runsScored: 0,
        isWicket: true,
        dismissalType: 'Bowled',
        newBatsmanName: 'Towhid Hridoy',
        isStrikerOut: true,
      });
      // Ball 5: 2
      engine.scoreBall({ runsScored: 2 });
      // Ball 6: 6
      engine.scoreBall({ runsScored: 6 });

      expect(engine.currentInnings.thisOverLog).toEqual(['0', '1', '4', 'W', '2', '6']);
      expect(engine.currentInnings.thisOverLog).toHaveLength(6);
    });

    it('records wide and no-ball deliveries alongside legal balls', () => {
      const engine = setupEngine();

      engine.scoreBall({ runsScored: 0, isWide: true }); // Wd
      engine.scoreBall({ runsScored: 0 }); // 0
      engine.scoreBall({ runsScored: 4, isNoBall: true }); // Nb4

      expect(engine.currentInnings.thisOverLog).toEqual(['Wd', '0', 'Nb4']);
      // Only 1 legal ball
      expect(engine.currentInnings.totalBalls).toBe(1);
      expect(engine.currentInnings.oversString).toBe('0.1');
    });

    it('undoes delivery and restores thisOverLog accurately', () => {
      const engine = setupEngine();

      engine.scoreBall({ runsScored: 0 });
      engine.scoreBall({ runsScored: 4 });
      expect(engine.currentInnings.thisOverLog).toEqual(['0', '4']);

      engine.undo();
      expect(engine.currentInnings.thisOverLog).toEqual(['0']);
    });
  });

  describe('2. Dot Ball Render Value (0 instead of bullet)', () => {
    it('maps dot ball token "0" to display text "0" rather than bullet dot', () => {
      const overLog = ['0', '1', '4', '0', 'W'];
      const renderedLabels = overLog.map((ball) => (ball === '0' ? '0' : ball));

      expect(renderedLabels).toEqual(['0', '1', '4', '0', 'W']);
      expect(renderedLabels.includes('•')).toBe(false);
    });

    it('renders "0" for dot balls in BatsmanProfileModal ballLog', () => {
      const mockPlayer: Player = {
        id: 'p1',
        name: 'Najmul Shanto',
        battingHand: 'Left-hand Batsman',
        runs: 5,
        balls: 4,
        fours: 1,
        sixes: 0,
        dotBalls: 2,
        ballLog: ['0', '4', '0', '1'],
        bowlersFaced: {},
        runsVsBowler: {},
        isDismissed: false,
      };

      const html = renderToStaticMarkup(
        React.createElement(BatsmanProfileModal, {
          isOpen: true,
          onClose: () => {},
          player: mockPlayer,
        })
      );

      // Must render explicit '0' for dot balls
      expect(html).toContain('>0<');
      expect(html).toContain('Ball 1: 0');
    });

    it('renders "0" for dot balls in BowlerProfileModal overHistory', () => {
      const mockBowler: Bowler = {
        id: 'b1',
        name: 'Hasan Mahmud',
        ballsBowled: 6,
        maidens: 0,
        runs: 5,
        wickets: 1,
        overHistory: [
          {
            overNumber: 1,
            log: ['0', '1', '4', '0', 'W', '0'],
          },
        ],
      };

      const html = renderToStaticMarkup(
        React.createElement(BowlerProfileModal, {
          isOpen: true,
          onClose: () => {},
          bowler: mockBowler,
        })
      );

      // Must render explicit '0' for dot balls in ball items
      expect(html).toContain('title="Ball 1: 0">0</div>');
      expect(html).toContain('title="Ball 4: 0">0</div>');
      expect(html).toContain('title="Ball 6: 0">0</div>');
    });
  });

  describe('3. Bowler Box & Dedicated Over Deliveries Section Separation', () => {
    it('ensures ActiveBowlerTable does NOT render any timeline or recent balls badges', () => {
      const mockBowler: Bowler = {
        id: 'b1',
        name: 'Mustafizur Rahman',
        ballsBowled: 5,
        maidens: 0,
        runs: 7,
        wickets: 1,
        overHistory: [],
      };

      const html = renderToStaticMarkup(
        React.createElement(ActiveBowlerTable, {
          bowler: mockBowler,
          onSelectBowler: () => {},
        })
      );

      // Must not contain any recent ball test id or inline timeline badges
      expect(html).not.toContain('data-testid="bowler-recent-balls"');
      expect(html).not.toContain('Recent delivery');
      // Must contain bowler name and core bowling figures
      expect(html).toContain('Mustafizur Rahman');
      expect(html).toContain('>0.5<');
      expect(html).toContain('>7<');
      expect(html).toContain('>1<');
    });

    it('ensures ActiveBowlerTable cleanly renders quota limit without timeline clutter', () => {
      const mockBowler: Bowler = {
        id: 'b1',
        name: 'Taskin Ahmed',
        ballsBowled: 24, // 4.0 overs
        maidens: 1,
        runs: 16,
        wickets: 3,
        overHistory: [],
      };

      const html = renderToStaticMarkup(
        React.createElement(ActiveBowlerTable, {
          bowler: mockBowler,
          onSelectBowler: () => {},
          maxOversLimit: 4,
        })
      );

      // Quota reached badge is rendered
      expect(html).toContain('Quota Reached');
      // No recent balls timeline rendered inside Bowler Box
      expect(html).not.toContain('data-testid="bowler-recent-balls"');
    });

    it('manages real match over deliveries in thisOverLog with illegal balls and dot balls as "0"', () => {
      const engine = setupEngine();

      // Ball 1: 0 (dot)
      engine.scoreBall({ runsScored: 0 });
      // Ball 2: Wide (illegal delivery)
      engine.scoreBall({ runsScored: 0, isWide: true });
      // Ball 3: 4
      engine.scoreBall({ runsScored: 4 });
      // Ball 4: Wicket
      engine.scoreBall({
        runsScored: 0,
        isWicket: true,
        dismissalType: 'Bowled',
        newBatsmanName: 'Anamul Haque',
        isStrikerOut: true,
      });

      // Total legal balls = 3 (0, 4, W); Wide is not a legal ball
      expect(engine.currentInnings.totalBalls).toBe(3);
      // thisOverLog contains real sequential delivery tokens
      expect(engine.currentInnings.thisOverLog).toEqual(['0', 'Wd', '4', 'W']);

      // Add a 5th delivery: 2
      engine.scoreBall({ runsScored: 2 });
      expect(engine.currentInnings.thisOverLog).toEqual(['0', 'Wd', '4', 'W', '2']);
      expect(engine.currentInnings.totalBalls).toBe(4);

      // Confirm all dot balls are formatted as '0'
      const formatted = engine.currentInnings.thisOverLog.map((b) => (b === '0' ? '0' : b));
      expect(formatted).toEqual(['0', 'Wd', '4', 'W', '2']);
      expect(formatted.includes('•')).toBe(false);
    });
  });
});
