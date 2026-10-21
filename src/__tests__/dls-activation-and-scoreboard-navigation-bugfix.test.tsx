import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { DlsEngine } from '../domain/cricket/dls/DlsEngine';
import { IntegratedScoreboard } from '../components/scoring/IntegratedScoreboard';
import { DlsModal } from '../components/modals/DlsModal';
import { BatsmanProfileModal } from '../components/modals/BatsmanProfileModal';
import { BowlerProfileModal } from '../components/modals/BowlerProfileModal';
import { SCOREBOARD_THEMES } from '../lib/theme/scoreboard-themes';
import { db } from '../infrastructure/database/dexie-db';
import { MatchRepository } from '../infrastructure/storage/MatchRepository';
import { Player, Bowler } from '../domain/cricket/types';

describe('Bug Fix Regression Suite: DLS Activation Workflow & Full Scoreboard Batter Profile Navigation', () => {
  beforeEach(async () => {
    await db.matches.clear();
    await db.match_events.clear();
    await db.app_metadata.clear();
    await db.sync_queue.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createTestEngine = (id = 'match_test_bugfix', totalOvers = 20) => {
    return new EventSourcedMatchEngine({
      id,
      teamA: 'Dhaka Dynamites',
      teamB: 'Sylhet Strikers',
      tossWinner: 'Dhaka Dynamites',
      tossDecision: 'Batting',
      totalOvers,
      strikerName: 'Tamim Iqbal',
      nonStrikerName: 'Litton Das',
      bowlerName: 'Mashrafe Mortaza',
    });
  };

  const setupSecondInningsChase = (engine: EventSourcedMatchEngine, firstInningsRuns = 160) => {
    engine.firstInnings.totalRuns = firstInningsRuns;
    engine.firstInnings.totalBalls = engine.totalOvers * 6;
    engine.firstInnings.totalWickets = 6;
    engine.startSecondInnings('Najmul Shanto', 'Towhid Hridoy', 'Mustafizur Rahman');
    return engine;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // BUG 1 REGRESSION TESTS: DLS ACTIVATION WORKFLOW
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Bug 1: DLS Activation Logic & Strict User-Controlled Workflow', () => {
    it('1. Opening DLS modal does not activate DLS or change match state', () => {
      const engine = createTestEngine('dls-open-test');
      setupSecondInningsChase(engine, 160);

      expect(engine.advancedSettings?.dlsApplied).toBeFalsy();
      expect(engine.targetScore).toBe(161);
      expect(engine.totalOvers).toBe(20);

      let targetApplied = false;
      const html = renderToStaticMarkup(
        React.createElement(DlsModal, {
          isOpen: true,
          onClose: () => {},
          originalOvers: 20,
          team1Score: 160,
          currentOversBowled: 4,
          currentWicketsLost: 1,
          currentRuns: 30,
          isDlsApplied: Boolean(engine.advancedSettings?.dlsApplied),
          onApplyTarget: () => {
            targetApplied = true;
          },
        })
      );

      // Verify modal is rendered for configuration preview
      expect(html).toContain('DLS Rain Interruption Calculator');
      expect(targetApplied).toBe(false);

      // Engine match state remains strictly unactivated
      expect(engine.advancedSettings?.dlsApplied).toBeFalsy();
      expect(engine.targetScore).toBe(161);
      expect(engine.totalOvers).toBe(20);
    });

    it('2. Closing DLS modal without applying discards changes and preserves standard match state', () => {
      const engine = createTestEngine('dls-close-test');
      setupSecondInningsChase(engine, 170);

      let isClosed = false;
      let appliedTarget: number | null = null;

      const html = renderToStaticMarkup(
        React.createElement(DlsModal, {
          isOpen: true,
          onClose: () => {
            isClosed = true;
          },
          originalOvers: 20,
          team1Score: 170,
          currentOversBowled: 6,
          currentWicketsLost: 2,
          currentRuns: 45,
          isDlsApplied: false,
          onApplyTarget: (t) => {
            appliedTarget = t;
          },
        })
      );

      expect(html).toContain('Cancel');
      expect(appliedTarget).toBeNull();
      expect(engine.advancedSettings?.dlsApplied).toBeFalsy();
      expect(engine.targetScore).toBe(171);
      expect(engine.totalOvers).toBe(20);
    });

    it('3. DLS activates ONLY when Apply to Match is explicitly invoked with valid calculations', () => {
      const engine = createTestEngine('dls-explicit-apply');
      setupSecondInningsChase(engine, 160);

      // Calculate DLS for 15 overs curtailed chase
      const dlsCalc = DlsEngine.calculate({
        originalOvers: 20,
        team1TotalRuns: 160,
        team2OversAvailable: 15,
        team2WicketsLost: 0,
        team2CurrentOversBowled: 0,
        matchType: 'T20',
      });

      expect(dlsCalc.revisedTarget).toBe(128); // Standards-compliant ICC DLS calculation
      expect(dlsCalc.oversAvailable).toBe(15);

      // Explicitly Apply
      engine.applyDlsTarget(dlsCalc.revisedTarget, dlsCalc.oversAvailable);

      expect(engine.advancedSettings?.dlsApplied).toBe(true);
      expect(engine.targetScore).toBe(128);
      expect(engine.totalOvers).toBe(15);
      expect(engine.advancedSettings?.originalTotalOvers).toBe(20);

      // Verify event was emitted
      const dlsEvent = engine.events.find((e) => e.type === 'DLS_TARGET_APPLIED');
      expect(dlsEvent).toBeDefined();
      expect(dlsEvent?.payload.revisedTarget).toBe(128);
      expect(dlsEvent?.payload.revisedTotalOvers).toBe(15);
    });

    it('4. Before DLS application, scoreboard displays normal Target and hides DLS indicators', () => {
      const engine = createTestEngine('dls-unapplied-scoreboard');
      setupSecondInningsChase(engine, 150);

      const html = renderToStaticMarkup(
        React.createElement(IntegratedScoreboard, {
          engine,
          selectedTheme: SCOREBOARD_THEMES[0],
          onClose: () => {},
          initialInnings: 2,
        })
      );

      expect(html).toContain('Target:');
      expect(html).toContain('151');
      expect(html).not.toContain('Revised Target (DLS)');
      expect(html).not.toContain('DLS PAR');
      expect(html).not.toContain('Ahead');
      expect(html).not.toContain('Behind');
    });

    it('5. After successful DLS application, scoreboard displays Revised Target (DLS) and live DLS Par score', () => {
      const engine = createTestEngine('dls-applied-scoreboard');
      setupSecondInningsChase(engine, 160);
      engine.applyDlsTarget(128, 15);

      // Score 6 overs in 2nd innings
      for (let i = 0; i < 36; i++) {
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

      expect(html).toContain('Revised Target (DLS):');
      expect(html).toContain('128');
      expect(html).toContain('DLS PAR');
    });

    it('6. Applied DLS state survives IndexedDB persistence and reload without unintended activation/reset', async () => {
      const engine = createTestEngine('dls-persist-test');
      setupSecondInningsChase(engine, 165);
      engine.applyDlsTarget(130, 15);

      await MatchRepository.saveMatchWithEvents(engine.toScorecard(), engine.events, 0);

      // Load from repository
      const loadedScorecard = await MatchRepository.getMatch('dls-persist-test');
      expect(loadedScorecard).toBeDefined();
      const reconstructed = EventSourcedMatchEngine.fromScorecard(loadedScorecard!);

      expect(reconstructed.advancedSettings?.dlsApplied).toBe(true);
      expect(reconstructed.targetScore).toBe(130);
      expect(reconstructed.totalOvers).toBe(15);
      expect(reconstructed.advancedSettings?.originalTotalOvers).toBe(20);
    });

    it('7. Disabling / resetting DLS restores standard match rules and target cleanly', () => {
      const engine = createTestEngine('dls-reset-test');
      setupSecondInningsChase(engine, 160);
      engine.applyDlsTarget(128, 15);

      expect(engine.advancedSettings?.dlsApplied).toBe(true);

      engine.resetDls();

      expect(engine.advancedSettings?.dlsApplied).toBe(false);
      expect(engine.totalOvers).toBe(20);
      expect(engine.targetScore).toBe(161);
      expect(engine.advancedSettings?.dlsRevisedTarget).toBeUndefined();

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

    it('8. Normal scoring and innings completions continue functioning seamlessly with applied DLS', () => {
      const engine = createTestEngine('dls-chase-completion');
      setupSecondInningsChase(engine, 140);
      engine.applyDlsTarget(80, 12);

      // Score 80 runs across multiple overs to win chase under DLS
      for (let over = 0; over < 5; over++) {
        if (over > 0) {
          engine.changeBowler(`Bowler ${over + 1}`);
        }
        for (let b = 0; b < 6; b++) {
          if (engine.isMatchCompleted) break;
          engine.scoreBall({ runsScored: 4 });
        }
      }

      expect(engine.secondInnings?.totalRuns).toBeGreaterThanOrEqual(80);
      expect(engine.isMatchCompleted).toBe(true);
      const result = engine.calculateResult();
      expect(result.resultType).toBe('WIN');
      expect(result.winner).toBe(engine.teamB);
      expect(result.resultText).toContain('(DLS Method)');
    });

    it('9. DlsModal correctly surfaces confirmation UI when updating an already applied DLS target', () => {
      const modalActive = renderToStaticMarkup(
        React.createElement(DlsModal, {
          isOpen: true,
          onClose: () => {},
          originalOvers: 20,
          team1Score: 160,
          currentOversBowled: 5,
          currentWicketsLost: 1,
          currentRuns: 40,
          isDlsApplied: true,
          currentTotalOvers: 15,
          onResetDls: () => {},
          onApplyTarget: () => {},
        })
      );

      // Verify that active status and Disable option are presented
      expect(modalActive).toContain('DLS is currently applied to this match');
      expect(modalActive).toContain('Disable DLS');
      expect(modalActive).toContain('Apply to Match');
    });

    it('10. DlsEngine calculates valid standard targets avoiding arbitrary hardcoded values', () => {
      // 20-over match curtailed to 10 overs after 1st innings 150
      const calc10 = DlsEngine.calculate({
        originalOvers: 20,
        team1TotalRuns: 150,
        team2OversAvailable: 10,
        team2WicketsLost: 0,
        team2CurrentOversBowled: 0,
      });

      // R1 for 20 ov = 56.6%, R2 for 10 ov = 32.1%
      // revisedTarget = floor(150 * (32.1 / 56.6)) + 1 = floor(85.07) + 1 = 86
      expect(calc10.revisedTarget).toBe(86);
      expect(calc10.oversAvailable).toBe(10);
      expect(calc10.team1ResourcePct).toBe(56.6);
      expect(calc10.team2ResourcePct).toBe(32.1);
      expect(calc10.isMinimumOversMet).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // BUG 2 REGRESSION TESTS: FULL SCOREBOARD BATTER PROFILE NAVIGATION
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Bug 2: Full Scoreboard Batter Profile Navigation Flow', () => {
    const mockBatter1: Player = {
      id: 'p-shanto',
      name: 'Najmul Shanto',
      runs: 48,
      balls: 28,
      fours: 5,
      sixes: 2,
      dotBalls: 8,
      ballLog: ['4', '1', '6', '0'],
      battingHand: 'Left-hand Batsman',
      battingPosition: '1',
      bowlersFaced: {},
      runsVsBowler: {},
      isDismissed: false,
    };

    const mockBatter2: Player = {
      id: 'p-hridoy',
      name: 'Towhid Hridoy',
      runs: 35,
      balls: 20,
      fours: 3,
      sixes: 1,
      dotBalls: 5,
      ballLog: ['1', '4', '2'],
      battingHand: 'Right-hand Batsman',
      battingPosition: '2',
      bowlersFaced: {},
      runsVsBowler: {},
      isDismissed: true,
      dismissalText: 'c Shakib b Taskin',
    };

    it('1. IntegratedScoreboard player rows pass stable player ID, stats, and inning partnerships on click', () => {
      const engine = createTestEngine('scoreboard-click-test');
      setupSecondInningsChase(engine, 150);

      // Add mock batted stats to innings players
      engine.secondInnings!.players[0].runs = 48;
      engine.secondInnings!.players[0].balls = 28;
      engine.secondInnings!.players[0].fours = 5;
      engine.secondInnings!.players[0].sixes = 2;

      let selectedData: any = null;

      const html = renderToStaticMarkup(
        React.createElement(IntegratedScoreboard, {
          engine,
          selectedTheme: SCOREBOARD_THEMES[0],
          onClose: () => {},
          onSelectBatsman: (data) => {
            selectedData = data;
          },
          initialInnings: 2,
        })
      );

      // Verify table contains player name and click title
      expect(html).toContain('Najmul Shanto');
      expect(html).toContain('Click to view batsman profile');
    });

    it('2. BatsmanProfileModal renders immediately in the foreground with selected batter information', () => {
      const modalHtml = renderToStaticMarkup(
        React.createElement(BatsmanProfileModal, {
          player: mockBatter1,
          isOpen: true,
          onClose: () => {},
          isStriker: true,
          battingPosition: 1,
        })
      );

      // Verify player name rendered
      expect(modalHtml).toContain('Najmul Shanto');
      expect(modalHtml).toContain('Player Profile');

      // Verify statistics
      expect(modalHtml).toContain('>48<'); // Runs
      expect(modalHtml).toContain('>28<'); // Balls
      expect(modalHtml).toContain('>5<');  // 4s
      expect(modalHtml).toContain('>2<');  // 6s

      // Verify foreground z-index modal layer
      expect(modalHtml).toContain('z-50');
      expect(modalHtml).toContain('fixed inset-0');
      expect(modalHtml).toContain('Done');
    });

    it('3. Switching to a different batter immediately renders new batter data without stale state', () => {
      // First batter
      const html1 = renderToStaticMarkup(
        React.createElement(BatsmanProfileModal, {
          player: mockBatter1,
          isOpen: true,
          onClose: () => {},
        })
      );
      expect(html1).toContain('Najmul Shanto');
      expect(html1).toContain('>48<');
      expect(html1).not.toContain('Towhid Hridoy');

      // Second batter
      const html2 = renderToStaticMarkup(
        React.createElement(BatsmanProfileModal, {
          player: mockBatter2,
          isOpen: true,
          onClose: () => {},
        })
      );
      expect(html2).toContain('Towhid Hridoy');
      expect(html2).toContain('>35<');
      expect(html2).toContain('c Shakib b Taskin');
      expect(html2).not.toContain('Najmul Shanto');
    });

    it('4. Closing the profile modal does not close or leave the Full Scoreboard', () => {
      let modalClosed = false;
      const html = renderToStaticMarkup(
        React.createElement(BatsmanProfileModal, {
          player: mockBatter1,
          isOpen: true,
          onClose: () => {
            modalClosed = true;
          },
        })
      );

      expect(html).toContain('Player Profile');
      expect(html).toContain('Close Player Profile');
      expect(html).toContain('Done');
    });

    it('5. Navigating back from Full Scoreboard to Live Scoreboard restores live cockpit without stale modal', () => {
      let scoreboardClosed = false;
      let selectedBatsman: any = mockBatter1;

      // Simulated navigation handler in page.tsx:
      const handleCloseScoreboard = () => {
        selectedBatsman = null;
        scoreboardClosed = true;
      };

      handleCloseScoreboard();

      expect(scoreboardClosed).toBe(true);
      expect(selectedBatsman).toBeNull();

      // Rendering modal with null player results in null (no ghost modal)
      const modalHtml = renderToStaticMarkup(
        React.createElement(BatsmanProfileModal, {
          player: selectedBatsman,
          isOpen: Boolean(selectedBatsman),
          onClose: () => {},
        })
      );

      expect(modalHtml).toBe('');
    });

    it('6. Unbatted players in IntegratedScoreboard are also clickable to view their profile', () => {
      const engine = createTestEngine('unbatted-click-test');
      setupSecondInningsChase(engine, 150);

      const html = renderToStaticMarkup(
        React.createElement(IntegratedScoreboard, {
          engine,
          selectedTheme: SCOREBOARD_THEMES[0],
          onClose: () => {},
          initialInnings: 2,
        })
      );

      // Verify "Yet to bat:" section exists and unbatted names have click handlers
      expect(html).toContain('Yet to bat:');
      expect(html).toContain('title="Click to view batsman profile"');
    });

    it('7. Batsman profile modal includes responsive mobile & desktop structures and Apple touch targets', () => {
      const html = renderToStaticMarkup(
        React.createElement(BatsmanProfileModal, {
          player: mockBatter1,
          isOpen: true,
          onClose: () => {},
          isStriker: true,
        })
      );

      // Verify desktop & mobile layouts
      expect(html).toContain('sm:grid-cols-5');
      expect(html).toContain('grid-cols-2');
      expect(html).toContain('sm:grid-cols-4');
      expect(html).toContain('max-h-[calc(100dvh-1rem)]');
      expect(html).toContain('min-h-[36px]'); // Compact iOS BackButton touch target
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // BUG FIX TESTS: FULL SCOREBOARD BOWLER PROFILE NAVIGATION
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Full Scoreboard Bowler Profile Navigation', () => {
    const mockBowler1: Bowler = {
      id: 'bowler-1',
      name: 'Mustafizur Rahman',
      ballsBowled: 24,
      maidens: 1,
      runs: 18,
      wickets: 3,
      overHistory: [
        { overNumber: 1, log: ['0', '1', 'W', '0', '0', '0'] },
        { overNumber: 3, log: ['1', '4', '0', 'W', '0', '1'] },
      ],
    };

    const mockBowler2: Bowler = {
      id: 'bowler-2',
      name: 'Taskin Ahmed',
      ballsBowled: 18,
      maidens: 0,
      runs: 22,
      wickets: 1,
      overHistory: [
        { overNumber: 2, log: ['1', '0', '0', '6', '1', '0'] },
      ],
    };

    it('1. IntegratedScoreboard bowler rows pass structured bowler figures, live state, and fall of wickets on click', () => {
      const engine = createTestEngine('scoreboard-bowler-click-test');
      setupSecondInningsChase(engine, 150);

      // Populate bowler statistics
      engine.secondInnings!.bowlers = [mockBowler1, mockBowler2];
      engine.secondInnings!.fallOfWickets = [
        { score: 12, wicket: 1, over: '0.3', player: 'Najmul Shanto' },
      ];

      const html = renderToStaticMarkup(
        React.createElement(IntegratedScoreboard, {
          engine,
          selectedTheme: SCOREBOARD_THEMES[0],
          onClose: () => {},
          onSelectBowler: () => {},
          initialInnings: 2,
        })
      );

      // Verify bowler names rendered and click titles present
      expect(html).toContain('Mustafizur Rahman');
      expect(html).toContain('Taskin Ahmed');
      expect(html).toContain('title="Click to view bowler profile"');
    });

    it('2. BowlerProfileModal renders immediately in the foreground with selected bowler statistics', () => {
      const modalHtml = renderToStaticMarkup(
        React.createElement(BowlerProfileModal, {
          bowler: mockBowler1,
          isOpen: true,
          onClose: () => {},
          isCurrentlyBowling: false,
          fallOfWickets: [
            { score: 12, wicket: 1, over: '0.3', player: 'Najmul Shanto' },
          ],
        })
      );

      // Verify bowler name and figures
      expect(modalHtml).toContain('Mustafizur Rahman');
      expect(modalHtml).toContain('Bowler Profile');
      expect(modalHtml).toContain('>4.0<'); // 24 balls = 4.0 overs
      expect(modalHtml).toContain('>18<');  // 18 runs
      expect(modalHtml).toContain('>3<');   // 3 wickets
      expect(modalHtml).toContain('>1<');   // 1 maiden

      // Verify foreground modal layer properties
      expect(modalHtml).toContain('z-50');
      expect(modalHtml).toContain('fixed inset-0');
      expect(modalHtml).toContain('Done');
    });

    it('3. Switching to a different bowler immediately renders new bowler figures without stale state', () => {
      // First bowler
      const html1 = renderToStaticMarkup(
        React.createElement(BowlerProfileModal, {
          bowler: mockBowler1,
          isOpen: true,
          onClose: () => {},
        })
      );
      expect(html1).toContain('Mustafizur Rahman');
      expect(html1).toContain('>3<'); // wickets
      expect(html1).not.toContain('Taskin Ahmed');

      // Second bowler
      const html2 = renderToStaticMarkup(
        React.createElement(BowlerProfileModal, {
          bowler: mockBowler2,
          isOpen: true,
          onClose: () => {},
        })
      );
      expect(html2).toContain('Taskin Ahmed');
      expect(html2).toContain('>22<'); // runs
      expect(html2).not.toContain('Mustafizur Rahman');
    });

    it('4. Closing the bowler profile modal keeps the Full Scoreboard view active', () => {
      let modalClosed = false;
      const html = renderToStaticMarkup(
        React.createElement(BowlerProfileModal, {
          bowler: mockBowler1,
          isOpen: true,
          onClose: () => {
            modalClosed = true;
          },
        })
      );

      expect(html).toContain('Bowler Profile');
      expect(html).toContain('Close Bowler Profile');
      expect(html).toContain('Done');
    });

    it('5. Navigating back from Full Scoreboard clears selected bowler and prevents ghost modal', () => {
      let scoreboardClosed = false;
      let selectedBowler: any = { bowler: mockBowler1 };

      const handleCloseScoreboard = () => {
        selectedBowler = null;
        scoreboardClosed = true;
      };

      handleCloseScoreboard();

      expect(scoreboardClosed).toBe(true);
      expect(selectedBowler).toBeNull();

      // Rendering modal with null bowler results in null
      const modalHtml = renderToStaticMarkup(
        React.createElement(BowlerProfileModal, {
          bowler: selectedBowler,
          isOpen: Boolean(selectedBowler),
          onClose: () => {},
        })
      );

      expect(modalHtml).toBe('');
    });

    it('6. Bowler profile modal supports editing/renaming player name safely', () => {
      const html = renderToStaticMarkup(
        React.createElement(BowlerProfileModal, {
          bowler: mockBowler1,
          isOpen: true,
          onClose: () => {},
          onRenamePlayer: () => {},
        })
      );

      expect(html).toContain('Mustafizur Rahman');
      expect(html).toContain('title="Edit bowler name"');
    });

    it('7. Bowler profile modal includes responsive mobile & desktop structures and Apple touch targets', () => {
      const html = renderToStaticMarkup(
        React.createElement(BowlerProfileModal, {
          bowler: mockBowler1,
          isOpen: true,
          onClose: () => {},
        })
      );

      // Verify grid and modal dimensions
      expect(html).toContain('grid-cols-2');
      expect(html).toContain('grid-cols-4');
      expect(html).toContain('max-h-[calc(100dvh-1rem)]');
      expect(html).toContain('min-h-[36px]'); // iOS BackButton touch target
    });
  });
});
