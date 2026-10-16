import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { ActiveBatsmenTable } from '../components/scoring/ActiveBatsmenTable';
import { ActiveBowlerTable } from '../components/scoring/ActiveBowlerTable';
import { IntegratedScoreboard } from '../components/scoring/IntegratedScoreboard';
import { SCOREBOARD_THEMES } from '../lib/theme/scoreboard-themes';

describe('Real-Time Batsman Individual Runs & Stats Update Test Suite', () => {
  let engine: EventSourcedMatchEngine;

  beforeEach(() => {
    engine = new EventSourcedMatchEngine({
      id: 'test_realtime_match',
      teamA: 'Dhaka Dynamites',
      teamB: 'Sylhet Strikers',
      tossWinner: 'Dhaka Dynamites',
      tossDecision: 'Batting',
      totalOvers: 5,
      strikerName: 'Tamim Iqbal',
      nonStrikerName: 'Litton Das',
      bowlerName: 'Mashrafe Mortaza',
    });
  });

  describe('1. Engine Immutability & Decoupling via clone()', () => {
    it('creates completely independent cloned engine instances with fresh object references', () => {
      const cloned = engine.clone();

      expect(cloned).not.toBe(engine);
      expect(cloned.firstInnings).not.toBe(engine.firstInnings);
      expect(cloned.firstInnings.players).not.toBe(engine.firstInnings.players);
      expect(cloned.firstInnings.bowlers).not.toBe(engine.firstInnings.bowlers);
      expect(cloned.firstInnings.players[0]).not.toBe(engine.firstInnings.players[0]);
      expect(cloned.firstInnings.bowlers[0]).not.toBe(engine.firstInnings.bowlers[0]);

      // Mutating cloned does not mutate original
      cloned.scoreBall({ runsScored: 4 });
      expect(cloned.firstInnings.totalRuns).toBe(4);
      expect(cloned.firstInnings.players[0].runs).toBe(4);
      expect(engine.firstInnings.totalRuns).toBe(0);
      expect(engine.firstInnings.players[0].runs).toBe(0);
    });

    it('scoreBall produces immutable fresh references for current striker and bowler', () => {
      const initialStriker = engine.currentInnings.players[engine.currentInnings.strikerIdx];
      const initialBowler = engine.currentInnings.bowlers[engine.currentInnings.currentBowlerIdx];

      engine.scoreBall({ runsScored: 2 });

      const updatedStriker = engine.currentInnings.players[engine.currentInnings.strikerIdx];
      const updatedBowler = engine.currentInnings.bowlers[engine.currentInnings.currentBowlerIdx];

      // Must be new object references to satisfy React dependency checks & state comparison
      expect(updatedStriker).not.toBe(initialStriker);
      expect(updatedBowler).not.toBe(initialBowler);
      expect(updatedStriker.runs).toBe(2);
      expect(updatedStriker.balls).toBe(1);
    });
  });

  describe('2. Real-Time Sequential Scoring on Non-Rotating Deliveries (0, 2, 4, 6)', () => {
    it('immediately updates batsman runs and balls on dot ball (0 runs) without strike change', () => {
      engine.scoreBall({ runsScored: 0 });

      const inn = engine.currentInnings;
      const striker = inn.players[inn.strikerIdx];

      expect(inn.totalRuns).toBe(0);
      expect(striker.runs).toBe(0);
      expect(striker.balls).toBe(1);
      expect(striker.dotBalls).toBe(1);
      expect(inn.strikerIdx).toBe(0); // Strike remains with Tamim

      const html = renderToStaticMarkup(
        React.createElement(ActiveBatsmenTable, {
          striker,
          nonStriker: inn.players[inn.nonStrikerIdx],
          strikerIdx: inn.strikerIdx,
          nonStrikerIdx: inn.nonStrikerIdx,
          onSelectBatsman: () => {},
        })
      );

      expect(html).toContain('Tamim Iqbal');
      expect(html).toContain('>0<');  // runs
      expect(html).toContain('>1<');  // balls faced
      expect(html).toContain('0.0');  // SR
    });

    it('immediately updates batsman runs on boundary four (4 runs) and matches main score', () => {
      engine.scoreBall({ runsScored: 4 });

      const inn = engine.currentInnings;
      const striker = inn.players[inn.strikerIdx];

      expect(inn.totalRuns).toBe(4);
      expect(striker.runs).toBe(4);
      expect(striker.balls).toBe(1);
      expect(striker.fours).toBe(1);
      expect(inn.strikerIdx).toBe(0); // 4 runs => even, strike does not change

      const html = renderToStaticMarkup(
        React.createElement(ActiveBatsmenTable, {
          striker,
          nonStriker: inn.players[inn.nonStrikerIdx],
          strikerIdx: inn.strikerIdx,
          nonStrikerIdx: inn.nonStrikerIdx,
          onSelectBatsman: () => {},
        })
      );

      expect(html).toContain('Tamim Iqbal');
      expect(html).toContain('>4<');   // 4 runs
      expect(html).toContain('>1<');   // 1 ball
      expect(html).toContain('>1<');   // 1 four
      expect(html).toContain('400.0'); // SR
    });

    it('immediately updates batsman runs on consecutive boundaries (4 then 6) for same striker', () => {
      // Ball 1: 4
      engine.scoreBall({ runsScored: 4 });
      let inn = engine.currentInnings;
      let striker = inn.players[inn.strikerIdx];

      expect(striker.runs).toBe(4);
      expect(striker.balls).toBe(1);
      expect(striker.fours).toBe(1);

      // Ball 2: 6
      engine.scoreBall({ runsScored: 6 });
      inn = engine.currentInnings;
      striker = inn.players[inn.strikerIdx];

      expect(inn.totalRuns).toBe(10);
      expect(striker.runs).toBe(10);
      expect(striker.balls).toBe(2);
      expect(striker.fours).toBe(1);
      expect(striker.sixes).toBe(1);
      expect(inn.strikerIdx).toBe(0);

      const html = renderToStaticMarkup(
        React.createElement(ActiveBatsmenTable, {
          striker,
          nonStriker: inn.players[inn.nonStrikerIdx],
          strikerIdx: inn.strikerIdx,
          nonStrikerIdx: inn.nonStrikerIdx,
          onSelectBatsman: () => {},
        })
      );

      expect(html).toContain('>10<');  // 10 runs
      expect(html).toContain('>2<');   // 2 balls
      expect(html).toContain('500.0'); // SR = (10/2)*100
    });

    it('immediately updates batsman runs on two runs (2) and preserves striker identity', () => {
      engine.scoreBall({ runsScored: 2 });

      const inn = engine.currentInnings;
      const striker = inn.players[inn.strikerIdx];

      expect(inn.totalRuns).toBe(2);
      expect(striker.runs).toBe(2);
      expect(striker.balls).toBe(1);
      expect(inn.strikerIdx).toBe(0);

      const html = renderToStaticMarkup(
        React.createElement(ActiveBatsmenTable, {
          striker,
          nonStriker: inn.players[inn.nonStrikerIdx],
          strikerIdx: inn.strikerIdx,
          nonStrikerIdx: inn.nonStrikerIdx,
          onSelectBatsman: () => {},
        })
      );

      expect(html).toContain('>2<');   // 2 runs
      expect(html).toContain('>1<');   // 1 ball
      expect(html).toContain('200.0'); // SR
    });
  });

  describe('3. Strike Rotation, Over Completion & Wickets', () => {
    it('properly rotates strike on single (1) and maintains accurate individual stats for both batters', () => {
      // Ball 1: Tamim scores 1 (Tamim: 1 off 1, Litton on strike)
      engine.scoreBall({ runsScored: 1 });
      let inn = engine.currentInnings;
      expect(inn.strikerIdx).toBe(1); // Litton is now striker
      expect(inn.players[0].runs).toBe(1);
      expect(inn.players[0].balls).toBe(1);

      // Ball 2: Litton scores 4 (Litton: 4 off 1, Litton stays on strike)
      engine.scoreBall({ runsScored: 4 });
      inn = engine.currentInnings;
      expect(inn.strikerIdx).toBe(1); // Litton still striker
      expect(inn.players[1].runs).toBe(4);
      expect(inn.players[1].balls).toBe(1);

      const html = renderToStaticMarkup(
        React.createElement(ActiveBatsmenTable, {
          striker: inn.players[inn.strikerIdx],
          nonStriker: inn.players[inn.nonStrikerIdx],
          strikerIdx: inn.strikerIdx,
          nonStrikerIdx: inn.nonStrikerIdx,
          onSelectBatsman: () => {},
        })
      );

      // Litton is active striker with 4 (1)
      expect(html).toContain('Litton Das');
      expect(html).toContain('>4<');
      // Tamim is non-striker with 1 (1)
      expect(html).toContain('Tamim Iqbal');
      expect(html).toContain('>1<');
    });

    it('handles entire 6-ball over with mix of 0, 4, 2, 6, 1 and over completion strike swap', () => {
      // Ball 1: 0 (Tamim 0 off 1)
      engine.scoreBall({ runsScored: 0 });
      // Ball 2: 4 (Tamim 4 off 2)
      engine.scoreBall({ runsScored: 4 });
      // Ball 3: 2 (Tamim 6 off 3)
      engine.scoreBall({ runsScored: 2 });
      // Ball 4: 6 (Tamim 12 off 4)
      engine.scoreBall({ runsScored: 6 });
      // Ball 5: 1 (Tamim 13 off 5, strike swaps to Litton)
      engine.scoreBall({ runsScored: 1 });
      // Ball 6: 0 (Litton 0 off 1, over completes!)
      engine.scoreBall({ runsScored: 0 });

      const inn = engine.currentInnings;

      expect(inn.totalRuns).toBe(13);
      expect(inn.totalBalls).toBe(6);
      expect(inn.oversString).toBe('1.0');
      expect(inn.isOverComplete).toBe(true);

      // Tamim's individual stats
      expect(inn.players[0].runs).toBe(13);
      expect(inn.players[0].balls).toBe(5);
      expect(inn.players[0].fours).toBe(1);
      expect(inn.players[0].sixes).toBe(1);

      // Litton's individual stats
      expect(inn.players[1].runs).toBe(0);
      expect(inn.players[1].balls).toBe(1);

      // Under MCC rules, at over completion strike swaps:
      // After ball 6 (Litton on strike), over completion swaps strike back to Tamim!
      expect(inn.strikerIdx).toBe(0);
      expect(inn.nonStrikerIdx).toBe(1);

      const html = renderToStaticMarkup(
        React.createElement(ActiveBatsmenTable, {
          striker: inn.players[inn.strikerIdx],
          nonStriker: inn.players[inn.nonStrikerIdx],
          strikerIdx: inn.strikerIdx,
          nonStrikerIdx: inn.nonStrikerIdx,
          onSelectBatsman: () => {},
        })
      );

      expect(html).toContain('Tamim Iqbal');
      expect(html).toContain('>13<'); // 13 runs
      expect(html).toContain('>5<');  // 5 balls
      expect(html).toContain('260.0'); // SR = (13/5)*100
    });

    it('correctly attributes extras without falsely inflating batsman runs', () => {
      // Wide ball: 1 run to team, 0 to batsman, 0 balls faced
      engine.scoreBall({ runsScored: 0, isWide: true });
      expect(engine.currentInnings.totalRuns).toBe(1);
      expect(engine.currentInnings.players[0].runs).toBe(0);
      expect(engine.currentInnings.players[0].balls).toBe(0);

      // Byes: 2 runs to team, 0 to batsman, 1 ball faced
      engine.scoreBall({ runsScored: 2, isByes: true });
      expect(engine.currentInnings.totalRuns).toBe(3);
      expect(engine.currentInnings.players[0].runs).toBe(0);
      expect(engine.currentInnings.players[0].balls).toBe(1);

      // Leg Byes: 1 run to team, 0 to batsman, 1 ball faced, strike rotates
      engine.scoreBall({ runsScored: 1, isLegByes: true });
      expect(engine.currentInnings.totalRuns).toBe(4);
      expect(engine.currentInnings.players[0].runs).toBe(0);
      expect(engine.currentInnings.players[0].balls).toBe(2);
      expect(engine.currentInnings.strikerIdx).toBe(1); // Rotated to Litton

      // No ball + 4 off the bat: 5 runs to team (1 extra + 4 bat), 4 to batsman, 1 ball faced
      engine.scoreBall({ runsScored: 4, isNoBall: true });
      expect(engine.currentInnings.totalRuns).toBe(9);
      expect(engine.currentInnings.players[1].runs).toBe(4);
      expect(engine.currentInnings.players[1].balls).toBe(1);
      expect(engine.currentInnings.players[1].fours).toBe(1);
    });

    it('preserves batsman stats upon wicket and introduces new batsman with 0 runs and 0 balls', () => {
      engine.scoreBall({ runsScored: 4 });
      engine.scoreBall({
        runsScored: 0,
        isWicket: true,
        dismissalType: 'Caught',
        fielderName: 'Taskin Ahmed',
        newBatsmanName: 'Mushfiqur Rahim',
        isStrikerOut: true,
      });

      const inn = engine.currentInnings;
      // Tamim was dismissed with 4 runs off 2 balls
      expect(inn.players[0].runs).toBe(4);
      expect(inn.players[0].balls).toBe(2);
      expect(inn.players[0].isDismissed).toBe(true);

      // Mushfiqur Rahim is the new striker at index 2
      expect(inn.strikerIdx).toBe(2);
      expect(inn.players[2].name).toBe('Mushfiqur Rahim');
      expect(inn.players[2].runs).toBe(0);
      expect(inn.players[2].balls).toBe(0);

      const html = renderToStaticMarkup(
        React.createElement(ActiveBatsmenTable, {
          striker: inn.players[inn.strikerIdx],
          nonStriker: inn.players[inn.nonStrikerIdx],
          strikerIdx: inn.strikerIdx,
          nonStrikerIdx: inn.nonStrikerIdx,
          onSelectBatsman: () => {},
        })
      );

      expect(html).toContain('Mushfiqur Rahim');
      expect(html).toContain('>0<');
      expect(html).toContain('0.0');
    });
  });

  describe('4. ActiveBowlerTable & IntegratedScoreboard Real-Time Figures', () => {
    it('updates ActiveBowlerTable figures in real time after every ball', () => {
      engine.scoreBall({ runsScored: 4 });
      let currentBowler = engine.currentInnings.bowlers[0];

      let html = renderToStaticMarkup(
        React.createElement(ActiveBowlerTable, {
          bowler: currentBowler,
          onSelectBowler: () => {},
        })
      );

      expect(html).toContain('Mashrafe Mortaza');
      expect(html).toContain('>0.1<'); // 0.1 overs
      expect(html).toContain('>4<');   // 4 runs conceded

      engine.scoreBall({ runsScored: 0 });
      currentBowler = engine.currentInnings.bowlers[0];

      html = renderToStaticMarkup(
        React.createElement(ActiveBowlerTable, {
          bowler: currentBowler,
          onSelectBowler: () => {},
        })
      );

      expect(html).toContain('>0.2<'); // 0.2 overs
      expect(html).toContain('>4<');   // still 4 runs conceded
    });

    it('IntegratedScoreboard re-evaluates batted players and active bowlers in real time', () => {
      engine.scoreBall({ runsScored: 4 });

      const html = renderToStaticMarkup(
        React.createElement(IntegratedScoreboard, {
          engine: engine.clone(),
          selectedTheme: SCOREBOARD_THEMES[0],
          onClose: () => {},
        })
      );

      expect(html).toContain('Tamim Iqbal');
      expect(html).toContain('>4<');
      expect(html).toContain('Mashrafe Mortaza');
    });
  });
});
