import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { DlsEngine } from '../domain/cricket/dls/DlsEngine';
import { IntegratedScoreboard } from '../components/scoring/IntegratedScoreboard';
import { DlsModal } from '../components/modals/DlsModal';
import { SCOREBOARD_THEMES } from '../lib/theme/scoreboard-themes';
import { db } from '../infrastructure/database/dexie-db';
import { MatchRepository } from '../infrastructure/storage/MatchRepository';

describe('Conditional DLS Visibility on Scoreboard Test Suite', () => {
  beforeEach(async () => {
    await db.matches.clear();
    await db.match_events.clear();
    await db.app_metadata.clear();
    await db.sync_queue.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createTestEngine = (id = 'match_test_01', totalOvers = 20) => {
    const engine = new EventSourcedMatchEngine({
      id,
      teamA: 'Dhaka Gladiators',
      teamB: 'Chittagong Kings',
      tossWinner: 'Dhaka Gladiators',
      tossDecision: 'Batting',
      totalOvers,
      strikerName: 'Tamim Iqbal',
      nonStrikerName: 'Litton Das',
      bowlerName: 'Mustafizur Rahman',
    });
    return engine;
  };

  const setupSecondInningsChase = (engine: EventSourcedMatchEngine, firstInningsRuns = 150) => {
    // 1st innings finishes
    engine.firstInnings.totalRuns = firstInningsRuns;
    engine.firstInnings.totalBalls = engine.totalOvers * 6;
    engine.firstInnings.totalWickets = 7;

    // Start 2nd innings chase
    engine.startSecondInnings('Shakib Al Hasan', 'Mushfiqur Rahim', 'Taskin Ahmed');
    return engine;
  };

  describe('1. Default State: Normal matches never display DLS UI elements on Scoreboard', () => {
    it('does not display any DLS, DLS Par Score, or Revised Target in 1st innings of normal match', () => {
      const engine = createTestEngine('normal-match-inn1');
      engine.scoreBall({ runsScored: 4 });
      engine.scoreBall({ runsScored: 1 });

      const html = renderToStaticMarkup(
        React.createElement(IntegratedScoreboard, {
          engine,
          selectedTheme: SCOREBOARD_THEMES[0],
          onClose: () => {},
          initialInnings: 1,
        })
      );

      expect(html).not.toContain('DLS');
      expect(html).not.toContain('DLS PAR');
      expect(html).not.toContain('Revised Target');
      expect(html).not.toContain('Par Score');
      expect(html).toContain('Projected:');
    });

    it('does not display any DLS elements in 2nd innings chase of normal match', () => {
      const engine = createTestEngine('normal-match-inn2');
      setupSecondInningsChase(engine, 160);

      // Score 3 overs in 2nd innings
      for (let i = 0; i < 18; i++) {
        engine.scoreBall({ runsScored: i % 2 === 0 ? 1 : 2 });
      }

      // Assert engine state
      expect(engine.advancedSettings?.dlsApplied).toBeFalsy();
      expect(engine.targetScore).toBe(161);

      const html = renderToStaticMarkup(
        React.createElement(IntegratedScoreboard, {
          engine,
          selectedTheme: SCOREBOARD_THEMES[0],
          onClose: () => {},
          initialInnings: 2,
        })
      );

      // Verify normal Target is rendered
      expect(html).toContain('Target:');
      expect(html).toContain('161');

      // Verify DLS elements are completely absent
      expect(html).not.toContain('Revised Target (DLS)');
      expect(html).not.toContain('DLS PAR');
      expect(html).not.toContain('Ahead');
      expect(html).not.toContain('Behind');
    });
  });

  describe('2. State-Based Rendering: Opening modal or calculating does NOT activate DLS on match', () => {
    it('keeps DLS hidden on scoreboard when DlsModal is opened or inputs altered without applying to match', () => {
      const engine = createTestEngine('dls-modal-cancelled');
      setupSecondInningsChase(engine, 150);

      let appliedTarget: number | null = null;
      let appliedOvers: number | null = null;

      // Simulate rendering DlsModal
      const modalHtml = renderToStaticMarkup(
        React.createElement(DlsModal, {
          isOpen: true,
          onClose: () => {},
          originalOvers: 20,
          team1Score: 150,
          currentOversBowled: 5,
          currentWicketsLost: 1,
          currentRuns: 35,
          isDlsApplied: Boolean(engine.advancedSettings?.dlsApplied),
          onApplyTarget: (t, o) => {
            appliedTarget = t;
            appliedOvers = o;
          },
        })
      );

      // Modal rendered internal calculations for preview
      expect(modalHtml).toContain('DLS Rain Interruption Calculator');

      // User closed modal without clicking "Apply to Match"
      expect(appliedTarget).toBeNull();
      expect(appliedOvers).toBeNull();
      expect(engine.advancedSettings?.dlsApplied).toBeFalsy();

      // Scoreboard remains standard without DLS
      const scoreboardHtml = renderToStaticMarkup(
        React.createElement(IntegratedScoreboard, {
          engine,
          selectedTheme: SCOREBOARD_THEMES[0],
          onClose: () => {},
          initialInnings: 2,
        })
      );

      expect(scoreboardHtml).toContain('Target:');
      expect(scoreboardHtml).not.toContain('Revised Target (DLS)');
      expect(scoreboardHtml).not.toContain('DLS PAR');
    });

    it('renders "Disable DLS" option in DlsModal only when DLS is active, omitting it on standard matches', () => {
      // 1. Standard Match
      const modalStandard = renderToStaticMarkup(
        React.createElement(DlsModal, {
          isOpen: true,
          onClose: () => {},
          originalOvers: 20,
          team1Score: 160,
          isDlsApplied: false,
        })
      );
      expect(modalStandard).not.toContain('Disable DLS');
      expect(modalStandard).not.toContain('DLS is currently applied to this match');

      // 2. DLS Active Match
      const modalActive = renderToStaticMarkup(
        React.createElement(DlsModal, {
          isOpen: true,
          onClose: () => {},
          originalOvers: 20,
          team1Score: 160,
          isDlsApplied: true,
          onResetDls: () => {},
        })
      );
      expect(modalActive).toContain('Disable DLS');
      expect(modalActive).toContain('DLS is currently applied to this match');
    });
  });

  describe('3. DLS Apply to Match: Successfully applying DLS renders DLS section on Scoreboard', () => {
    it('displays Revised Target (DLS) and live DLS Par Score once applyDlsTarget is called', () => {
      const engine = createTestEngine('dls-applied-match');
      setupSecondInningsChase(engine, 160);

      // Score 6 overs in 2nd innings: 45/1
      for (let i = 0; i < 36; i++) {
        engine.scoreBall({ runsScored: 1, isWicket: i === 12, dismissalType: i === 12 ? 'Bowled' : undefined });
      }

      // Rain occurs: DLS target calculated for 15 overs (revised target = 128)
      const dlsCalc = DlsEngine.calculate({
        originalOvers: 20,
        team1TotalRuns: 160,
        team2OversAvailable: 15,
        team2WicketsLost: engine.secondInnings!.totalWickets,
        team2CurrentOversBowled: engine.secondInnings!.totalBalls / 6,
        team2CurrentRuns: engine.secondInnings!.totalRuns,
        matchType: 'T20',
      });

      // User clicks "Apply to Match"
      engine.applyDlsTarget(dlsCalc.revisedTarget, 15);

      expect(engine.advancedSettings?.dlsApplied).toBe(true);
      expect(engine.targetScore).toBe(dlsCalc.revisedTarget);
      expect(engine.totalOvers).toBe(15);
      expect(engine.advancedSettings?.originalTotalOvers).toBe(20);

      const html = renderToStaticMarkup(
        React.createElement(IntegratedScoreboard, {
          engine,
          selectedTheme: SCOREBOARD_THEMES[0],
          onClose: () => {},
          initialInnings: 2,
        })
      );

      // DLS section is now visible
      expect(html).toContain('Revised Target (DLS):');
      expect(html).toContain(String(dlsCalc.revisedTarget));
      expect(html).toContain('DLS PAR');
    });

    it('correctly reports Ahead or Behind status on the DLS Par Score pill', () => {
      const engine = createTestEngine('dls-ahead-behind-match');
      setupSecondInningsChase(engine, 140);
      engine.applyDlsTarget(110, 15);

      // Score 6 overs: 60/0 (well ahead of par for 140/110)
      for (let i = 0; i < 36; i++) {
        engine.scoreBall({ runsScored: i % 3 === 0 ? 2 : 1 });
      }

      const htmlAhead = renderToStaticMarkup(
        React.createElement(IntegratedScoreboard, {
          engine,
          selectedTheme: SCOREBOARD_THEMES[0],
          onClose: () => {},
          initialInnings: 2,
        })
      );

      expect(htmlAhead).toContain('DLS PAR');
      expect(htmlAhead).toContain('Ahead');

      // Now create a collapsed innings: 15/5 in 6 overs (well behind par)
      const engineBehind = createTestEngine('dls-behind-match');
      setupSecondInningsChase(engineBehind, 180);
      engineBehind.applyDlsTarget(150, 15);

      for (let i = 0; i < 36; i++) {
        const isWkt = i === 5 || i === 10 || i === 15 || i === 20 || i === 25;
        engineBehind.scoreBall({ runsScored: isWkt ? 0 : 0, isWicket: isWkt, dismissalType: isWkt ? 'Bowled' : undefined });
      }

      const htmlBehind = renderToStaticMarkup(
        React.createElement(IntegratedScoreboard, {
          engine: engineBehind,
          selectedTheme: SCOREBOARD_THEMES[0],
          onClose: () => {},
          initialInnings: 2,
        })
      );

      expect(htmlBehind).toContain('DLS PAR');
      expect(htmlBehind).toContain('Behind');
    });

    it('indicates minimum overs required warning when overs bowled is less than 5 in T20', () => {
      const engine = createTestEngine('dls-min-overs-match');
      setupSecondInningsChase(engine, 150);
      engine.applyDlsTarget(120, 15);

      // Only 2 overs bowled
      for (let i = 0; i < 12; i++) {
        engine.scoreBall({ runsScored: 1 });
      }

      const html = renderToStaticMarkup(
        React.createElement(IntegratedScoreboard, {
          engine,
          selectedTheme: SCOREBOARD_THEMES[0],
          onClose: () => {},
          initialInnings: 2,
        })
      );

      expect(html).toContain('DLS PAR');
      expect(html).toContain('5 ov min');
    });
  });

  describe('4. Persistence: DLS state survives page reloads / reconstructions correctly', () => {
    it('restores DLS visibility from IndexedDB persistence for DLS matches and stays hidden for normal matches', async () => {
      // Create and persist DLS Match
      const dlsEngine = createTestEngine('persistent-dls-match');
      setupSecondInningsChase(dlsEngine, 175);
      dlsEngine.applyDlsTarget(135, 14);
      await MatchRepository.saveMatchWithEvents(dlsEngine.toScorecard(), dlsEngine.events, 0);

      // Create and persist Normal Match
      const normalEngine = createTestEngine('persistent-normal-match');
      setupSecondInningsChase(normalEngine, 175);
      await MatchRepository.saveMatchWithEvents(normalEngine.toScorecard(), normalEngine.events, 0);

      // Reload DLS Match from storage
      const reloadedDlsScorecard = await MatchRepository.getMatch('persistent-dls-match');
      expect(reloadedDlsScorecard).toBeDefined();
      const reconstructedDls = EventSourcedMatchEngine.fromScorecard(reloadedDlsScorecard!);

      expect(reconstructedDls.advancedSettings?.dlsApplied).toBe(true);
      expect(reconstructedDls.targetScore).toBe(135);
      expect(reconstructedDls.totalOvers).toBe(14);

      const dlsHtml = renderToStaticMarkup(
        React.createElement(IntegratedScoreboard, {
          engine: reconstructedDls,
          selectedTheme: SCOREBOARD_THEMES[0],
          onClose: () => {},
          initialInnings: 2,
        })
      );
      expect(dlsHtml).toContain('Revised Target (DLS):');
      expect(dlsHtml).toContain('DLS PAR');

      // Reload Normal Match from storage
      const reloadedNormalScorecard = await MatchRepository.getMatch('persistent-normal-match');
      expect(reloadedNormalScorecard).toBeDefined();
      const reconstructedNormal = EventSourcedMatchEngine.fromScorecard(reloadedNormalScorecard!);

      expect(reconstructedNormal.advancedSettings?.dlsApplied).toBeFalsy();
      expect(reconstructedNormal.targetScore).toBe(176);

      const normalHtml = renderToStaticMarkup(
        React.createElement(IntegratedScoreboard, {
          engine: reconstructedNormal,
          selectedTheme: SCOREBOARD_THEMES[0],
          onClose: () => {},
          initialInnings: 2,
        })
      );
      expect(normalHtml).toContain('Target:');
      expect(normalHtml).not.toContain('Revised Target (DLS)');
      expect(normalHtml).not.toContain('DLS PAR');
    });
  });

  describe('5. Reset / Disable DLS: Restores standard match rules and hides DLS section', () => {
    it('completely reverts match state and hides DLS from scoreboard when resetDls is called', () => {
      const engine = createTestEngine('reset-dls-match');
      setupSecondInningsChase(engine, 170);

      // Apply DLS
      engine.applyDlsTarget(140, 15);
      expect(engine.advancedSettings?.dlsApplied).toBe(true);
      expect(engine.totalOvers).toBe(15);
      expect(engine.targetScore).toBe(140);

      // Now reset / disable DLS
      engine.resetDls();

      // State is restored to standard match rules
      expect(engine.advancedSettings?.dlsApplied).toBe(false);
      expect(engine.advancedSettings?.dlsRevisedTarget).toBeUndefined();
      expect(engine.advancedSettings?.dlsRevisedOvers).toBeUndefined();
      expect(engine.totalOvers).toBe(20);
      expect(engine.targetScore).toBe(171); // 170 + 1

      // DLS event recorded
      const resetEvent = engine.events.find((e) => e.type === 'DLS_RESET');
      expect(resetEvent).toBeDefined();
      expect(resetEvent?.payload.originalOvers).toBe(20);
      expect(resetEvent?.payload.restoredTarget).toBe(171);

      // Scoreboard now completely hides DLS section
      const html = renderToStaticMarkup(
        React.createElement(IntegratedScoreboard, {
          engine,
          selectedTheme: SCOREBOARD_THEMES[0],
          onClose: () => {},
          initialInnings: 2,
        })
      );

      expect(html).toContain('Target:');
      expect(html).not.toContain('Revised Target (DLS)');
      expect(html).not.toContain('DLS PAR');
    });

    it('replay via fromEvents deterministically preserves resetDls', () => {
      const engine = createTestEngine('replay-reset-dls');
      setupSecondInningsChase(engine, 180);

      engine.applyDlsTarget(130, 14);
      engine.scoreBall({ runsScored: 2 });
      engine.resetDls();
      engine.scoreBall({ runsScored: 1 });

      const replayed = EventSourcedMatchEngine.fromEvents(engine.events);
      expect(replayed.advancedSettings?.dlsApplied).toBe(false);
      expect(replayed.totalOvers).toBe(20);
      expect(replayed.targetScore).toBe(181);
    });
  });

  describe('6. Match Isolation: DLS on one match never affects another match', () => {
    it('isolates DLS state between different matches concurrently', () => {
      const matchA = createTestEngine('match-A-dls');
      setupSecondInningsChase(matchA, 150);
      matchA.applyDlsTarget(120, 15);

      const matchB = createTestEngine('match-B-normal');
      setupSecondInningsChase(matchB, 150);

      expect(matchA.advancedSettings?.dlsApplied).toBe(true);
      expect(matchB.advancedSettings?.dlsApplied).toBeFalsy();

      const htmlA = renderToStaticMarkup(
        React.createElement(IntegratedScoreboard, {
          engine: matchA,
          selectedTheme: SCOREBOARD_THEMES[0],
          onClose: () => {},
          initialInnings: 2,
        })
      );

      const htmlB = renderToStaticMarkup(
        React.createElement(IntegratedScoreboard, {
          engine: matchB,
          selectedTheme: SCOREBOARD_THEMES[0],
          onClose: () => {},
          initialInnings: 2,
        })
      );

      // Match A displays DLS
      expect(htmlA).toContain('Revised Target (DLS):');
      expect(htmlA).toContain('DLS PAR');

      // Match B displays standard Target, no DLS
      expect(htmlB).toContain('Target:');
      expect(htmlB).not.toContain('Revised Target (DLS)');
      expect(htmlB).not.toContain('DLS PAR');
    });
  });

  describe('7. Business Logic Integrity: Mathematical DLS calculations remain fully intact', () => {
    it('preserves accurate standard DLS target calculations according to ICC standard resource tables', () => {
      // 20 overs, 160 runs, curtailed to 15 overs
      const res = DlsEngine.calculate({
        originalOvers: 20,
        team1TotalRuns: 160,
        team2OversAvailable: 15,
        team2WicketsLost: 0,
        team2CurrentOversBowled: 0,
      });

      expect(res.team1ResourcePct).toBe(56.6);
      expect(res.team2ResourcePct).toBe(45.2);
      expect(res.revisedTarget).toBe(128); // floor(160 * (45.2 / 56.6)) + 1 = 127 + 1 = 128
      expect(res.isMinimumOversMet).toBe(true);
    });
  });
});
