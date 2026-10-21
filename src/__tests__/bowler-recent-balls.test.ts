import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { ActiveBowlerTable } from '../components/scoring/ActiveBowlerTable';
import { Bowler } from '../domain/cricket/types';

describe('Bowler Recent 4 Balls Display Suite', () => {
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

  /**
   * Helper that mirrors the application's Recent 4 Deliveries calculation logic
   */
  const getBowlerRecentFourDeliveries = (engine: EventSourcedMatchEngine): string[] => {
    const inn = engine.currentInnings;
    const currentBowler = inn.bowlers[inn.currentBowlerIdx];
    if (!currentBowler) return [];

    const pastDeliveries = (currentBowler.overHistory || []).flatMap((o) => o.log);
    const ongoingDeliveries = inn.thisOverLog;
    const allDeliveries = [...pastDeliveries, ...ongoingDeliveries];

    return allDeliveries.slice(-4);
  };

  describe('1. 4-Ball Sliding Window (FIFO Queue)', () => {
    it('starts empty with 0 deliveries bowled', () => {
      const engine = setupEngine();
      const recent = getBowlerRecentFourDeliveries(engine);
      expect(recent).toEqual([]);
    });

    it('accumulates balls 1 through 4 sequentially: 0 -> 1 -> 4 -> W', () => {
      const engine = setupEngine();

      // Ball 1: 0 runs (Dot ball)
      engine.scoreBall({ runsScored: 0 });
      expect(getBowlerRecentFourDeliveries(engine)).toEqual(['0']);

      // Ball 2: 1 run
      engine.scoreBall({ runsScored: 1 });
      expect(getBowlerRecentFourDeliveries(engine)).toEqual(['0', '1']);

      // Ball 3: 4 runs (Boundary)
      engine.scoreBall({ runsScored: 4 });
      expect(getBowlerRecentFourDeliveries(engine)).toEqual(['0', '1', '4']);

      // Ball 4: Wicket
      engine.scoreBall({
        runsScored: 0,
        isWicket: true,
        dismissalType: 'Bowled',
        newBatsmanName: 'Towhid Hridoy',
        isStrikerOut: true,
      });
      expect(getBowlerRecentFourDeliveries(engine)).toEqual(['0', '1', '4', 'W']);
    });

    it('on 5th ball (2 runs), removes the oldest ball (0) and displays strictly [1, 4, W, 2]', () => {
      const engine = setupEngine();

      // Balls 1-4: 0, 1, 4, W
      engine.scoreBall({ runsScored: 0 });
      engine.scoreBall({ runsScored: 1 });
      engine.scoreBall({ runsScored: 4 });
      engine.scoreBall({
        runsScored: 0,
        isWicket: true,
        dismissalType: 'Bowled',
        newBatsmanName: 'Towhid Hridoy',
        isStrikerOut: true,
      });

      expect(getBowlerRecentFourDeliveries(engine)).toEqual(['0', '1', '4', 'W']);

      // Ball 5: 2 runs
      engine.scoreBall({ runsScored: 2 });

      // EXPECTED: Oldest ball '0' dropped, exactly 4 balls displayed: ['1', '4', 'W', '2']
      const recentAfter5 = getBowlerRecentFourDeliveries(engine);
      expect(recentAfter5).toHaveLength(4);
      expect(recentAfter5).toEqual(['1', '4', 'W', '2']);
    });

    it('on 6th ball (0 runs), removes the oldest ball (1) and displays strictly [4, W, 2, 0]', () => {
      const engine = setupEngine();

      // Deliveries: 0, 1, 4, W, 2
      engine.scoreBall({ runsScored: 0 });
      engine.scoreBall({ runsScored: 1 });
      engine.scoreBall({ runsScored: 4 });
      engine.scoreBall({
        runsScored: 0,
        isWicket: true,
        dismissalType: 'Bowled',
        newBatsmanName: 'Towhid Hridoy',
        isStrikerOut: true,
      });
      engine.scoreBall({ runsScored: 2 });

      // Ball 6: 0 runs
      engine.scoreBall({ runsScored: 0 });

      const recentAfter6 = getBowlerRecentFourDeliveries(engine);
      expect(recentAfter6).toHaveLength(4);
      expect(recentAfter6).toEqual(['4', 'W', '2', '0']);
    });
  });

  describe('2. Extra Deliveries & Legal Ball Independence', () => {
    it('includes Wide (Wd) as a delivery event in the recent 4 balls while maintaining legal ball separation', () => {
      const engine = setupEngine();

      // Deliveries: 0, 1, Wd, 4, 6
      engine.scoreBall({ runsScored: 0 });
      engine.scoreBall({ runsScored: 1 });
      engine.scoreBall({ runsScored: 0, isWide: true }); // Wide delivery (Wd)

      expect(getBowlerRecentFourDeliveries(engine)).toEqual(['0', '1', 'Wd']);
      // Overs should only count legal deliveries (2 balls = 0.2)
      expect(engine.currentInnings.oversString).toBe('0.2');

      engine.scoreBall({ runsScored: 4 });
      expect(getBowlerRecentFourDeliveries(engine)).toEqual(['0', '1', 'Wd', '4']);

      // 5th event: 6 runs
      engine.scoreBall({ runsScored: 6 });
      // Oldest '0' is dropped: ['1', 'Wd', '4', '6']
      expect(getBowlerRecentFourDeliveries(engine)).toEqual(['1', 'Wd', '4', '6']);
      // Legal balls: 4 legal deliveries (0, 1, 4, 6) = 0.4
      expect(engine.currentInnings.oversString).toBe('0.4');
    });

    it('includes No Ball (Nb) as a delivery event in the recent 4 balls', () => {
      const engine = setupEngine();

      engine.scoreBall({ runsScored: 1 });
      engine.scoreBall({ runsScored: 4, isNoBall: true }); // Nb4
      engine.scoreBall({ runsScored: 0 });
      engine.scoreBall({ runsScored: 2 });
      engine.scoreBall({ runsScored: 6 });

      // 5 deliveries: 1, Nb4, 0, 2, 6 -> recent 4: [Nb4, 0, 2, 6]
      const recent = getBowlerRecentFourDeliveries(engine);
      expect(recent).toEqual(['Nb4', '0', '2', '6']);
    });
  });

  describe('3. Dot Ball Explicit "0" Representation', () => {
    it('ensures dot ball is represented explicitly by string "0", not bullet "•"', () => {
      const engine = setupEngine();
      engine.scoreBall({ runsScored: 0 });

      const recent = getBowlerRecentFourDeliveries(engine);
      expect(recent[0]).toBe('0');
      expect(recent[0]).not.toBe('•');
    });
  });

  describe('4. State Consistency with Undo and Over Transitions', () => {
    it('restores previous 4 balls accurately when Undo is clicked', () => {
      const engine = setupEngine();

      engine.scoreBall({ runsScored: 0 });
      engine.scoreBall({ runsScored: 1 });
      engine.scoreBall({ runsScored: 4 });
      engine.scoreBall({ runsScored: 0 }); // Ball 4
      expect(getBowlerRecentFourDeliveries(engine)).toEqual(['0', '1', '4', '0']);

      engine.scoreBall({ runsScored: 6 }); // Ball 5 -> ['1', '4', '0', '6']
      expect(getBowlerRecentFourDeliveries(engine)).toEqual(['1', '4', '0', '6']);

      // Undo ball 5
      engine.undo();
      expect(getBowlerRecentFourDeliveries(engine)).toEqual(['0', '1', '4', '0']);

      // Undo ball 4
      engine.undo();
      expect(getBowlerRecentFourDeliveries(engine)).toEqual(['0', '1', '4']);
    });

    it('retains previous over spell deliveries when the same bowler returns for a subsequent over', () => {
      const engine = setupEngine();
      const bowler1 = engine.currentInnings.bowlers[0].name;

      // Over 1 (Hasan Mahmud): 6 balls [1, 2, 4, 0, 6, 1]
      [1, 2, 4, 0, 6, 1].forEach((r) => engine.scoreBall({ runsScored: r }));
      expect(engine.currentInnings.isOverComplete).toBe(true);

      // Over 2: Shakib Al Hasan takes the ball
      engine.changeBowler('Shakib Al Hasan');
      // Shakib has bowled 0 balls so far
      expect(getBowlerRecentFourDeliveries(engine)).toEqual([]);

      // Shakib bowls 2 balls [0, 4]
      engine.scoreBall({ runsScored: 0 });
      engine.scoreBall({ runsScored: 4 });
      expect(getBowlerRecentFourDeliveries(engine)).toEqual(['0', '4']);

      // Over 2 completed (4 more balls)
      [0, 1, 2, 0].forEach((r) => engine.scoreBall({ runsScored: r }));
      expect(engine.currentInnings.isOverComplete).toBe(true);

      // Over 3: Hasan Mahmud returns
      engine.changeBowler(bowler1);
      // Hasan Mahmud's recent deliveries from his previous over were [4, 0, 6, 1]
      expect(getBowlerRecentFourDeliveries(engine)).toEqual(['4', '0', '6', '1']);

      // Hasan Mahmud bowls first ball of over 3: 2 runs
      engine.scoreBall({ runsScored: 2 });
      // Oldest '4' drops off, recent 4 becomes [0, 6, 1, 2]
      expect(getBowlerRecentFourDeliveries(engine)).toEqual(['0', '6', '1', '2']);
    });

    it('corrects recent 4 balls deterministically when a historical ball is edited', () => {
      const engine = setupEngine();

      // Score 4 balls: [0, 1, 4, 2]
      engine.scoreBall({ runsScored: 0 });
      engine.scoreBall({ runsScored: 1 });
      engine.scoreBall({ runsScored: 4 });
      engine.scoreBall({ runsScored: 2 });
      expect(getBowlerRecentFourDeliveries(engine)).toEqual(['0', '1', '4', '2']);

      // Edit delivery #3 (index 2: 4 runs -> changed to 6 runs)
      const edited = engine.editHistoricalBall(2, 1, { runsScored: 6 });
      expect(edited).toBe(true);

      // Recent balls should now be [0, 1, 6, 2]
      expect(getBowlerRecentFourDeliveries(engine)).toEqual(['0', '1', '6', '2']);
    });
  });

  describe('5. ActiveBowlerTable Component recentBalls Prop Integration', () => {
    it('renders exactly 4 delivery badges when recentBalls prop is supplied', () => {
      const mockBowler: Bowler = {
        id: 'b1',
        name: 'Mustafizur Rahman',
        ballsBowled: 6,
        maidens: 0,
        runs: 7,
        wickets: 1,
        overHistory: [],
      };

      const html = renderToStaticMarkup(
        React.createElement(ActiveBowlerTable, {
          bowler: mockBowler,
          onSelectBowler: () => {},
          recentBalls: ['1', '4', 'W', '2'],
        })
      );

      expect(html).toContain('Mustafizur Rahman');
      expect(html).toContain('data-testid="bowler-recent-balls"');
      expect(html).toContain('>1<');
      expect(html).toContain('>4<');
      expect(html).toContain('>W<');
      expect(html).toContain('>2<');
    });

    it('renders "0" instead of "•" for dot ball in ActiveBowlerTable recentBalls', () => {
      const mockBowler: Bowler = {
        id: 'b1',
        name: 'Taskin Ahmed',
        ballsBowled: 5,
        maidens: 0,
        runs: 3,
        wickets: 0,
        overHistory: [],
      };

      const html = renderToStaticMarkup(
        React.createElement(ActiveBowlerTable, {
          bowler: mockBowler,
          onSelectBowler: () => {},
          recentBalls: ['0', '1', '0', '2'],
        })
      );

      expect(html).toContain('>0<');
      expect(html).not.toContain('•');
    });

    it('limits to latest 4 deliveries when 5 or more deliveries are passed in recentBalls prop', () => {
      const mockBowler: Bowler = {
        id: 'b1',
        name: 'Shoriful Islam',
        ballsBowled: 5,
        maidens: 0,
        runs: 8,
        wickets: 1,
        overHistory: [],
      };

      // 5 items passed: ['0', '1', '4', 'W', '2']
      const html = renderToStaticMarkup(
        React.createElement(ActiveBowlerTable, {
          bowler: mockBowler,
          onSelectBowler: () => {},
          recentBalls: ['0', '1', '4', 'W', '2'],
        })
      );

      // Must display 1, 4, W, 2 (the 0 is sliced out)
      expect(html).toContain('>1<');
      expect(html).toContain('>4<');
      expect(html).toContain('>W<');
      expect(html).toContain('>2<');
    });
  });
});
