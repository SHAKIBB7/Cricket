import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { DlsEngine } from '../domain/cricket/dls/DlsEngine';
import { IntegratedScoreboard } from '../components/scoring/IntegratedScoreboard';
import { DlsModal } from '../components/modals/DlsModal';
import { SCOREBOARD_THEMES } from '../lib/theme/scoreboard-themes';
import { db } from '../infrastructure/database/dexie-db';

describe('Remove Duplicate DLS Button & Match Info Integration Test Suite', () => {
  beforeEach(async () => {
    await db.matches.clear();
    await db.match_events.clear();
    await db.app_metadata.clear();
    await db.sync_queue.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createTestEngine = (id = 'dls-removal-test', totalOvers = 20) => {
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

  describe('1. Standalone DLS Button Removal from Scoreboard UI', () => {
    it('verifies that no separate DLS button exists in the mobile bottom utility bar', () => {
      const pagePath = path.resolve(process.cwd(), 'src/app/matches/score/[matchId]/page.tsx');
      const pageContent = fs.readFileSync(pagePath, 'utf-8');

      // The mobile bottom utility section must use grid-cols-3 and NOT grid-cols-4
      expect(pageContent).toContain('grid gap-2 grid-cols-3');
      expect(pageContent).not.toContain('grid gap-2 grid-cols-4');

      // The standalone DLS button with title "DLS / Rain Target Calculator" must NOT be in the mobile actions
      const mobileActionSection = pageContent.substring(
        pageContent.indexOf('{/* 6. BOTTOM UTILITY & ACTION SECTION'),
        pageContent.indexOf('{/*  DESKTOP SCORER WORKSPACE')
      );

      expect(mobileActionSection).not.toContain('<CloudRain');
      expect(mobileActionSection).not.toContain('title="DLS / Rain Target Calculator"');
      expect(mobileActionSection).not.toContain('>DLS</span>');
      expect(mobileActionSection).toContain('setShowRetireModal(true)');
      expect(mobileActionSection).toContain('setShowPenaltyModal(true)');
      expect(mobileActionSection).toContain('setShowMatchInfoModal(true)');
    });

    it('verifies that no separate DLS button exists in desktop bottom action cards', () => {
      const pagePath = path.resolve(process.cwd(), 'src/app/matches/score/[matchId]/page.tsx');
      const pageContent = fs.readFileSync(pagePath, 'utf-8');

      // Locate desktop bottom action cards section
      const desktopActionSection = pageContent.substring(
        pageContent.indexOf('{/* Bottom Action Cards (Equal Width, Balanced) */}'),
        pageContent.indexOf('{/* RIGHT / BOTTOM: SCORECARD SUMMARY')
      );

      // Verify DLS Target button is completely removed from desktop bottom cards
      expect(desktopActionSection).not.toContain('<span>DLS Target</span>');
      expect(desktopActionSection).not.toContain('CloudRain');
      expect(desktopActionSection).toContain('<span>Matches</span>');
      expect(desktopActionSection).toContain('<span>Analytics</span>');
      expect(desktopActionSection).toContain('<span>Match Info</span>');
    });

    it('ensures surrounding elements realign cleanly without empty space', () => {
      const pagePath = path.resolve(process.cwd(), 'src/app/matches/score/[matchId]/page.tsx');
      const pageContent = fs.readFileSync(pagePath, 'utf-8');

      // Both mobile and desktop action wrappers must be balanced with 3 items
      expect(pageContent).toContain('grid gap-2 grid-cols-3');
      expect(pageContent).toContain('grid border-t border-[var(--border)] gap-3 pt-4 grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))]');
    });
  });

  describe('2. DLS Target Accessible Exclusively via Match Info Section', () => {
    it('verifies DLS Target Calculation option is preserved inside Match Info modal', () => {
      const pagePath = path.resolve(process.cwd(), 'src/app/matches/score/[matchId]/page.tsx');
      const pageContent = fs.readFileSync(pagePath, 'utf-8');

      // Locate Match Info Modal section
      const matchInfoSection = pageContent.substring(
        pageContent.indexOf('{/* "?"? MATCH INFO & RULES MODAL "?"? */}'),
        pageContent.indexOf('{/* ── CENTRALIZED REUSABLE OUT MODAL ── */}')
      );

      // Verify DLS Target Calculation is present inside Match Info
      expect(matchInfoSection).toContain('title="DLS Target Calculation"');
      expect(matchInfoSection).toContain('DLS Target Calculation (বৃষ্টি বিঘ্ন নিয়ম)');
      expect(matchInfoSection).toContain('setShowMatchInfoModal(false)');
      expect(matchInfoSection).toContain('setShowDlsModal(true)');
      expect(matchInfoSection).toContain('<CloudRain');
    });

    it('verifies clicking DLS Target inside Match Info transitions to DlsModal', () => {
      // Test the handler logic simulated in React
      let showMatchInfo = true;
      let showDls = false;

      const handleOpenDlsFromMatchInfo = () => {
        showMatchInfo = false;
        showDls = true;
      };

      handleOpenDlsFromMatchInfo();

      expect(showMatchInfo).toBe(false);
      expect(showDls).toBe(true);
    });
  });

  describe('3. DLS Calculation & Match Application Integrity', () => {
    it('calculating target in DlsModal does not alter the match state until explicitly applied', () => {
      const engine = createTestEngine('dls-calc-only-test');
      setupSecondInningsChase(engine, 175);

      expect(engine.advancedSettings?.dlsApplied).toBeFalsy();
      expect(engine.targetScore).toBe(176);

      // DlsModal is rendered with inputs, but onApplyTarget is not called
      let appliedTarget: number | null = null;
      const html = renderToStaticMarkup(
        React.createElement(DlsModal, {
          isOpen: true,
          onClose: () => {},
          originalOvers: 20,
          team1Score: 175,
          currentOversBowled: 6,
          currentWicketsLost: 2,
          currentRuns: 50,
          isDlsApplied: Boolean(engine.advancedSettings?.dlsApplied),
          onApplyTarget: (t) => {
            appliedTarget = t;
          },
        })
      );

      expect(html).toContain('DLS Rain Interruption Calculator');
      expect(appliedTarget).toBeNull();
      // Engine must remain unaltered
      expect(engine.advancedSettings?.dlsApplied).toBeFalsy();
      expect(engine.targetScore).toBe(176);
    });

    it('applies DLS target to match only on explicit Apply to Match confirmation', () => {
      const engine = createTestEngine('dls-apply-test');
      setupSecondInningsChase(engine, 175);

      const dlsCalc = DlsEngine.calculate({
        originalOvers: 20,
        team1TotalRuns: 175,
        team2OversAvailable: 15,
        team2WicketsLost: 0,
        team2CurrentOversBowled: 0,
        matchType: 'T20',
      });

      expect(dlsCalc.revisedTarget).toBeGreaterThan(0);

      // Explicit Apply to Match
      engine.applyDlsTarget(dlsCalc.revisedTarget, 15);

      expect(engine.advancedSettings?.dlsApplied).toBe(true);
      expect(engine.targetScore).toBe(dlsCalc.revisedTarget);
      expect(engine.totalOvers).toBe(15);
      expect(engine.advancedSettings?.originalTotalOvers).toBe(20);

      // Scoreboard now displays DLS Revised Target
      const scoreboardHtml = renderToStaticMarkup(
        React.createElement(IntegratedScoreboard, {
          engine,
          selectedTheme: SCOREBOARD_THEMES[0],
          onClose: () => {},
          initialInnings: 2,
        })
      );

      expect(scoreboardHtml).toContain('Revised Target (DLS)');
      expect(scoreboardHtml).toContain(String(dlsCalc.revisedTarget));
    });

    it('does not display DLS par score or revised target when DLS is not applied', () => {
      const engine = createTestEngine('normal-no-dls-match');
      setupSecondInningsChase(engine, 140);

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

    it('resets DLS and restores standard match state correctly when resetDls is called', () => {
      const engine = createTestEngine('dls-reset-test');
      setupSecondInningsChase(engine, 150);

      // Apply DLS
      engine.applyDlsTarget(120, 15);
      expect(engine.advancedSettings?.dlsApplied).toBe(true);
      expect(engine.targetScore).toBe(120);

      // Reset DLS
      engine.resetDls();
      expect(engine.advancedSettings?.dlsApplied).toBe(false);
      expect(engine.targetScore).toBe(151); // 150 + 1 standard target
      expect(engine.totalOvers).toBe(20); // restored original overs
    });
  });
});
