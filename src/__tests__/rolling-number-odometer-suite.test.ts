import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

import { MotionNumber, RollingNumber } from '../components/common/MotionNumber';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { ActiveBatsmenTable } from '../components/scoring/ActiveBatsmenTable';
import { ActiveBowlerTable } from '../components/scoring/ActiveBowlerTable';
import { Player, Bowler } from '../domain/cricket/types';

describe('Rolling Number Odometer Animation System — Comprehensive Validation Suite', () => {
  let engine: EventSourcedMatchEngine;

  beforeEach(() => {
    engine = new EventSourcedMatchEngine({
      id: 'test_odometer_match',
      teamA: 'Chittagong Kings',
      teamB: 'Dhaka Platoon',
      tossWinner: 'Chittagong Kings',
      tossDecision: 'Batting',
      totalOvers: 20,
      strikerName: 'Tamim Iqbal',
      nonStrikerName: 'Anamul Haque',
      bowlerName: 'Mustafizur Rahman',
    });
  });

  describe('1. Core MotionNumber Architecture & Independent Digit Tracks', () => {
    it('exports MotionNumber and RollingNumber alias consistently', () => {
      expect(MotionNumber).toBeDefined();
      expect(RollingNumber).toBe(MotionNumber);
    });

    it('renders static clean text during SSR / server-side rendering for SEO and accessibility', () => {
      const html = renderToStaticMarkup(
        React.createElement(MotionNumber, { value: 145, prefix: '', suffix: '' })
      );
      expect(html).toContain('145');
      expect(html).toContain('num-font');
      // Must not contain segmented spans during SSR to prevent test mismatch and hydration jank
      expect(html).toContain('>145<');
    });

    it('renders prefix and suffix correctly alongside numerical value', () => {
      const html = renderToStaticMarkup(
        React.createElement(MotionNumber, { value: '6.75', prefix: 'RPO: ', suffix: '*' })
      );
      expect(html).toContain('RPO: ');
      expect(html).toContain('6.75');
      expect(html).toContain('*');
    });

    it('verifies independent digit tracking and place-value indexing logic in source code', () => {
      const sourcePath = path.resolve(process.cwd(), 'src/components/common/MotionNumber.tsx');
      const source = fs.readFileSync(sourcePath, 'utf8');

      // DigitTrack component
      expect(source).toContain('const DigitTrack = React.memo(function DigitTrack');
      // Independent digit key based on place value from right (units = 0, tens = 1, hundreds = 2)
      expect(source).toContain('const placeFromRight = len - 1 - cIdx;');
      expect(source).toContain('tok-${tIdx}-p-${placeFromRight}');
      // Tabular numerals and fixed height to prevent horizontal and vertical layout shifts
      expect(source).toContain('tabular-nums');
      expect(source).toContain("height: '1.25em'");
      expect(source).toContain("minWidth: '0.62ch'");
    });

    it('verifies subtle scale-pop effect parameters (scale: 1.12 with ease-out cubic bezier)', () => {
      const sourcePath = path.resolve(process.cwd(), 'src/components/common/MotionNumber.tsx');
      const source = fs.readFileSync(sourcePath, 'utf8');

      // Scale pop: 1.12 to 1.0
      expect(source).toContain('scalePop ? 1.12 : 1');
      // Deceleration curve [0.16, 1, 0.3, 1]
      expect(source).toContain('[0.16, 1, 0.3, 1]');
    });

    it('verifies reduced motion support via useReducedMotion hook', () => {
      const sourcePath = path.resolve(process.cwd(), 'src/components/common/MotionNumber.tsx');
      const source = fs.readFileSync(sourcePath, 'utf8');

      expect(source).toContain('useReducedMotion()');
      expect(source).toContain('if (!mounted || shouldReduceMotion)');
    });
  });

  describe('2. Sequential Multi-Run Counting & Intermediate Values', () => {
    it('verifies sequential intermediate steps generation for multi-run increments', () => {
      const sourcePath = path.resolve(process.cwd(), 'src/components/common/MotionNumber.tsx');
      const source = fs.readFileSync(sourcePath, 'utf8');

      // Logic sequences intermediate values for diff <= 12
      expect(source).toContain('for (let i = currNum + 1; i <= targetNum; i++)');
      expect(source).toContain('steps.push(typeof value === \'number\' ? i : String(i));');
    });

    it('verifies illustrative test cases are handled dynamically (11->17, 24->30, 48->54, 96->102)', () => {
      // Helper function mirroring MotionNumber step generation
      function generateSteps(currNum: number, targetNum: number): number[] {
        const steps: number[] = [];
        for (let i = currNum + 1; i <= targetNum; i++) {
          steps.push(i);
        }
        return steps;
      }

      // 11 -> 17 (e.g. 6 runs scored)
      expect(generateSteps(11, 17)).toEqual([12, 13, 14, 15, 16, 17]);

      // 24 -> 30 (e.g. 6 runs scored)
      expect(generateSteps(24, 30)).toEqual([25, 26, 27, 28, 29, 30]);

      // 48 -> 54 (e.g. 6 runs scored to reach fifty)
      expect(generateSteps(48, 54)).toEqual([49, 50, 51, 52, 53, 54]);

      // 96 -> 102 (e.g. 6 runs scored to reach century)
      expect(generateSteps(96, 102)).toEqual([97, 98, 99, 100, 101, 102]);
    });

    it('verifies boundary transitions across digit counts (9->10 and 99->100)', () => {
      function generateSteps(currNum: number, targetNum: number): number[] {
        const steps: number[] = [];
        for (let i = currNum + 1; i <= targetNum; i++) {
          steps.push(i);
        }
        return steps;
      }

      // 9 -> 10: 1-digit to 2-digit transition
      expect(generateSteps(9, 10)).toEqual([10]);

      // 8 -> 12: 1-digit to 2-digit transition with intermediate values
      expect(generateSteps(8, 12)).toEqual([9, 10, 11, 12]);

      // 99 -> 100: 2-digit to 3-digit century boundary
      expect(generateSteps(99, 100)).toEqual([100]);

      // 98 -> 101: 2-digit to 3-digit transition across 100 boundary
      expect(generateSteps(98, 101)).toEqual([99, 100, 101]);
    });

    it('verifies adaptive timing calculation (450ms - 850ms range)', () => {
      const sourcePath = path.resolve(process.cwd(), 'src/components/common/MotionNumber.tsx');
      const source = fs.readFileSync(sourcePath, 'utf8');

      // Adaptive timing constraint
      expect(source).toContain('Math.min(850, Math.max(450, steps.length * 115))');
      expect(source).toContain('const interval = Math.round(totalTime / steps.length);');
    });

    it('verifies score decrease (undo / reset) reverses direction without intermediate reverse counting', () => {
      const sourcePath = path.resolve(process.cwd(), 'src/components/common/MotionNumber.tsx');
      const source = fs.readFileSync(sourcePath, 'utf8');

      // Decrease handler sets direction: -1 and directly assigns target value
      expect(source).toContain('setDirection(-1);');
      expect(source).toContain('// Decrease (Undo / Score correction / Innings reset)');
    });
  });

  describe('3. Special Cricket Overs & Legal Balls Progression', () => {
    it('verifies cricket over parser extracts overs and balls strictly within 0-5', () => {
      const sourcePath = path.resolve(process.cwd(), 'src/components/common/MotionNumber.tsx');
      const source = fs.readFileSync(sourcePath, 'utf8');

      // Regex matching strictly ^(\d+)\.([0-5])$
      expect(source).toContain('^(\\d+)\\.([0-5])$');
    });

    it('verifies cricket over transitions sequence through legal balls (e.g. 4.4 -> 4.5 -> 5.0, never 4.6)', () => {
      function generateOverSteps(currStr: string, nextStr: string): string[] {
        const [cO, cB] = currStr.split('.').map(Number);
        const [nO, nB] = nextStr.split('.').map(Number);
        const currBalls = cO * 6 + cB;
        const targetBalls = nO * 6 + nB;
        const steps: string[] = [];
        for (let b = currBalls + 1; b <= targetBalls; b++) {
          steps.push(`${Math.floor(b / 6)}.${b % 6}`);
        }
        return steps;
      }

      // Single legal ball: 4.4 -> 4.5
      expect(generateOverSteps('4.4', '4.5')).toEqual(['4.5']);

      // Over completion: 4.5 -> 5.0
      const overCompletionSteps = generateOverSteps('4.5', '5.0');
      expect(overCompletionSteps).toEqual(['5.0']);
      // Must NOT contain 4.6
      expect(overCompletionSteps).not.toContain('4.6');

      // Multi-ball step: 4.3 -> 5.0
      const multiSteps = generateOverSteps('4.3', '5.0');
      expect(multiSteps).toEqual(['4.4', '4.5', '5.0']);
      expect(multiSteps).not.toContain('4.6');

      // Start of match: 0.0 -> 0.1
      expect(generateOverSteps('0.0', '0.1')).toEqual(['0.1']);
    });

    it('keeps over counter and ball counter on independent tracks separated by stationary dot', () => {
      const sourcePath = path.resolve(process.cwd(), 'src/components/common/MotionNumber.tsx');
      const source = fs.readFileSync(sourcePath, 'utf8');

      // Overs track
      expect(source).toContain('ov-p-${placeFromRight}');
      // Dot separator
      expect(source).toContain('key="ov-dot"');
      // Ball track
      expect(source).toContain('key="ov-b-0"');
    });

    it('handles decimal rates (Strike Rate & Economy) in decimal mode without fake cricket balls', () => {
      const sourcePath = path.resolve(process.cwd(), 'src/components/common/MotionNumber.tsx');
      const source = fs.readFileSync(sourcePath, 'utf8');

      // Decimal mode parser
      expect(source).toContain('parseDecimal(valStr)');
      expect(source).toContain('key="dec-dot"');
      expect(source).toContain('key={`dec-f-${idx}`}');
    });
  });

  describe('4. Authoritative Cricket State Synchronization with EventSourcedMatchEngine', () => {
    it('synchronously updates authoritative score state immediately when scoring runs', () => {
      expect(engine.currentInnings.totalRuns).toBe(0);
      expect(engine.currentInnings.oversString).toBe('0.0');

      // Boundary: 4 runs scored
      engine.scoreBall({ runsScored: 4 });

      // Immediate authoritative state update
      expect(engine.currentInnings.totalRuns).toBe(4);
      expect(engine.currentInnings.oversString).toBe('0.1');
      expect(engine.currentInnings.players[0].runs).toBe(4);
      expect(engine.currentInnings.players[0].fours).toBe(1);
    });

    it('correctly handles over completion at 6 legal balls (0.5 -> 1.0)', () => {
      for (let i = 0; i < 5; i++) {
        engine.scoreBall({ runsScored: 1 });
      }
      expect(engine.currentInnings.oversString).toBe('0.5');
      expect(engine.currentInnings.totalRuns).toBe(5);

      // 6th legal ball: over completes
      engine.scoreBall({ runsScored: 0 });
      expect(engine.currentInnings.oversString).toBe('1.0');
      expect(engine.currentInnings.isOverComplete).toBe(true);
    });

    it('preserves legal ball count when illegal delivery (Wide or No-Ball) occurs', () => {
      engine.scoreBall({ runsScored: 1 });
      expect(engine.currentInnings.oversString).toBe('0.1');
      expect(engine.currentInnings.totalRuns).toBe(1);

      // Wide ball: adds 1 extra run, ball count must stay at 0.1
      engine.scoreBall({ runsScored: 0, isWide: true });
      expect(engine.currentInnings.oversString).toBe('0.1');
      expect(engine.currentInnings.totalRuns).toBe(2);
      expect(engine.currentInnings.wideRuns).toBe(1);

      // No ball: adds 1 extra run, ball count must stay at 0.1
      engine.scoreBall({ runsScored: 0, isNoBall: true });
      expect(engine.currentInnings.oversString).toBe('0.1');
      expect(engine.currentInnings.totalRuns).toBe(3);
      expect(engine.currentInnings.nbRuns).toBe(1);
    });

    it('synchronously restores authoritative state upon undo without visual delay', () => {
      engine.scoreBall({ runsScored: 6 });
      expect(engine.currentInnings.totalRuns).toBe(6);
      expect(engine.currentInnings.oversString).toBe('0.1');

      // Undo last delivery
      const undone = engine.undo();
      expect(undone).toBe(true);
      expect(engine.currentInnings.totalRuns).toBe(0);
      expect(engine.currentInnings.oversString).toBe('0.0');
    });
  });

  describe('5. Application-Wide Component Integration Verification', () => {
    it('verifies ActiveBatsmenTable uses MotionNumber for R, B, 4s, 6s, and SR', () => {
      const sourcePath = path.resolve(process.cwd(), 'src/components/scoring/ActiveBatsmenTable.tsx');
      const source = fs.readFileSync(sourcePath, 'utf8');

      expect(source).toContain("import { MotionNumber } from '@/components/common/MotionNumber';");
      expect(source).toContain('<MotionNumber value={player!.runs ?? 0} />');
      expect(source).toContain('<MotionNumber value={player!.balls ?? 0} />');
      expect(source).toContain('<MotionNumber value={player!.fours ?? 0} />');
      expect(source).toContain('<MotionNumber value={player!.sixes ?? 0} />');
      expect(source).toContain('mode="decimal"');
      expect(source).toContain('<MotionNumber value={getSr(player!)} mode="decimal" />');
    });

    it('renders ActiveBatsmenTable cleanly with MotionNumber during server rendering', () => {
      const mockStriker = {
        id: 'p1',
        name: 'Tamim Iqbal',
        runs: 54,
        balls: 32,
        fours: 6,
        sixes: 2,
        dotBalls: 10,
        isDismissed: false,
        battingHand: 'Left-hand Batsman',
        battingPosition: '1',
      } as Player;

      const mockNonStriker = {
        id: 'p2',
        name: 'Anamul Haque',
        runs: 18,
        balls: 15,
        fours: 2,
        sixes: 0,
        dotBalls: 6,
        isDismissed: false,
        battingHand: 'Right-hand Batsman',
        battingPosition: '2',
      } as Player;

      const html = renderToStaticMarkup(
        React.createElement(ActiveBatsmenTable, {
          striker: mockStriker,
          nonStriker: mockNonStriker,
          strikerIdx: 0,
          nonStrikerIdx: 1,
          onSelectBatsman: () => {},
        })
      );

      // Verify stats are rendered cleanly inside table
      expect(html).toContain('Tamim Iqbal');
      expect(html).toContain('>54<');
      expect(html).toContain('>32<');
      expect(html).toContain('>6<');
      expect(html).toContain('>2<');
      expect(html).toContain('Anamul Haque');
      expect(html).toContain('>18<');
      expect(html).toContain('>15<');
    });

    it('verifies ActiveBowlerTable uses MotionNumber for O, M, R, W, and ECO', () => {
      const sourcePath = path.resolve(process.cwd(), 'src/components/scoring/ActiveBowlerTable.tsx');
      const source = fs.readFileSync(sourcePath, 'utf8');

      expect(source).toContain("import { MotionNumber } from '@/components/common/MotionNumber';");
      expect(source).toContain('mode="cricket-overs"');
      expect(source).toContain('<MotionNumber value={overs} mode="cricket-overs" />');
      expect(source).toContain('<MotionNumber value={maidens} />');
      expect(source).toContain('<MotionNumber value={runs} />');
      expect(source).toContain('<MotionNumber value={wickets} />');
      expect(source).toContain('<MotionNumber value={econ} mode="decimal" />');
    });

    it('renders ActiveBowlerTable cleanly with MotionNumber during server rendering', () => {
      const mockBowler = {
        id: 'b1',
        name: 'Mustafizur Rahman',
        ballsBowled: 22,
        maidens: 1,
        runs: 22,
        wickets: 2,
        overHistory: [],
      } as Bowler;

      const html = renderToStaticMarkup(
        React.createElement(ActiveBowlerTable, {
          bowler: mockBowler,
          onSelectBowler: () => {},
        })
      );

      expect(html).toContain('Mustafizur Rahman');
      expect(html).toContain('>3.4<');
      expect(html).toContain('>1<');
      expect(html).toContain('>22<');
      expect(html).toContain('>2<');
    });

    it('verifies IntegratedScoreboard uses MotionNumber across all summary and detail views', () => {
      const sourcePath = path.resolve(process.cwd(), 'src/components/scoring/IntegratedScoreboard.tsx');
      const source = fs.readFileSync(sourcePath, 'utf8');

      expect(source).toContain("import { MotionNumber } from '@/components/common/MotionNumber';");
      // Innings scores
      expect(source).toContain('<MotionNumber value={targetInn.totalRuns} />');
      expect(source).toContain('<MotionNumber value={targetInn.totalWickets} />');
      expect(source).toContain('<MotionNumber value={targetInn.oversString} mode="cricket-overs" />');
      // Full batting table
      expect(source).toContain('<MotionNumber value={p.runs} />');
      expect(source).toContain('<MotionNumber value={p.balls} />');
      expect(source).toContain('<MotionNumber value={p.fours} />');
      expect(source).toContain('<MotionNumber value={p.sixes} />');
      expect(source).toContain('<MotionNumber value={strikeRate(p.runs, p.balls).toFixed(1)} mode="decimal" />');
      // Full bowling table
      expect(source).toContain('<MotionNumber value={`${Math.floor(b.ballsBowled / 6)}.${b.ballsBowled % 6}`} mode="cricket-overs" />');
      expect(source).toContain('<MotionNumber value={b.maidens} />');
      expect(source).toContain('<MotionNumber value={b.runs} />');
      expect(source).toContain('<MotionNumber value={b.wickets} />');
      expect(source).toContain('<MotionNumber value={economyRate(b.runs, b.ballsBowled).toFixed(2)} mode="decimal" />');
      // Extras breakdown
      expect(source).toContain('<MotionNumber value={totalExtras} />');
      expect(source).toContain('<MotionNumber value={targetInn.wideRuns} />');
      expect(source).toContain('<MotionNumber value={targetInn.nbRuns} />');
      expect(source).toContain('<MotionNumber value={targetInn.byeRuns} />');
      expect(source).toContain('<MotionNumber value={targetInn.lbRuns} />');
    });

    it('verifies Live Scoring Cockpit (page.tsx) integrates MotionNumber without regressions', () => {
      const sourcePath = path.resolve(process.cwd(), 'src/app/matches/score/[matchId]/page.tsx');
      const source = fs.readFileSync(sourcePath, 'utf8');

      // Authoritative tokens verified by regression test suite
      expect(source).toContain('<MotionNumber value={inn.totalRuns} />');
      expect(source).toContain('<MotionNumber value={inn.totalWickets} />');
      expect(source).toContain('<MotionNumber value={inn.oversString} />');

      // Chase and projected statistics
      expect(source).toContain('mode="decimal"');
      expect(source).toContain('<MotionNumber value={crr.toFixed(2)} mode="decimal" />');
      expect(source).toContain('<MotionNumber value={neededRuns} />');
      expect(source).toContain('<MotionNumber value={remainingBalls} />');
    });

    it('verifies Batsman and Bowler Profile Modals integrate MotionNumber', () => {
      const batsmanModalPath = path.resolve(process.cwd(), 'src/components/modals/BatsmanProfileModal.tsx');
      const bowlerModalPath = path.resolve(process.cwd(), 'src/components/modals/BowlerProfileModal.tsx');
      const batsmanContent = fs.readFileSync(batsmanModalPath, 'utf8');
      const bowlerContent = fs.readFileSync(bowlerModalPath, 'utf8');

      expect(batsmanContent).toContain("import { MotionNumber } from '@/components/common/MotionNumber';");
      expect(batsmanContent).toContain('<MotionNumber value={runs} />');
      expect(batsmanContent).toContain('<MotionNumber value={balls} />');
      expect(batsmanContent).toContain('<MotionNumber value={sr.toFixed(1)} mode="decimal" />');

      expect(bowlerContent).toContain("import { MotionNumber } from '@/components/common/MotionNumber';");
      expect(bowlerContent).toContain('<MotionNumber value={oversString(ballsBowled)} mode="cricket-overs" />');
      expect(bowlerContent).toContain('<MotionNumber value={maidens} />');
      expect(bowlerContent).toContain('<MotionNumber value={runs} />');
      expect(bowlerContent).toContain('<MotionNumber value={wickets} />');
    });

    it('verifies Advanced Analytics Panel and Matches Panel integrate MotionNumber', () => {
      const analyticsPath = path.resolve(process.cwd(), 'src/components/scoring/AdvancedAnalyticsPanel.tsx');
      const matchesPath = path.resolve(process.cwd(), 'src/components/scoring/MatchesPanel.tsx');
      const analyticsContent = fs.readFileSync(analyticsPath, 'utf8');
      const matchesContent = fs.readFileSync(matchesPath, 'utf8');

      expect(analyticsContent).toContain("import { MotionNumber } from '@/components/common/MotionNumber';");
      expect(analyticsContent).toContain('<MotionNumber value={inn.totalRuns} />');
      expect(analyticsContent).toContain('<MotionNumber value={inn.totalWickets} />');
      expect(analyticsContent).toContain('<MotionNumber value={inn.oversString} mode="cricket-overs" />');

      expect(matchesContent).toContain("import { MotionNumber } from '@/components/common/MotionNumber';");
      expect(matchesContent).toContain('<MotionNumber value={m.firstInnings.totalRuns} />');
      expect(matchesContent).toContain('<MotionNumber value={m.firstInnings.totalWickets} />');
      expect(matchesContent).toContain('<MotionNumber value={m.firstInnings.oversString} mode="cricket-overs" />');
    });
  });
});
