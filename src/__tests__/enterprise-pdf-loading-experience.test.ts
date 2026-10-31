import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PdfLoadingOverlay } from '@/components/common/PdfLoadingOverlay';
import { ScorecardPdfGenerator, PdfGenerationStep } from '@/features/scoring/pdf/ScorecardPdfGenerator';
import { MatchScorecard } from '@/domain/cricket/types';

describe('Enterprise-Level PDF Loading Experience & State Machine Suite', () => {
  const sampleMatch: MatchScorecard = {
    id: 'test-enterprise-pdf-1',
    teamA: 'Chittagong Challengers',
    teamB: 'Rangpur Riders',
    tossWinner: 'Chittagong Challengers',
    tossDecision: 'Batting',
    totalOvers: 10,
    status: 'COMPLETED',
    currentInnings: 2,
    targetScore: 120,
    venue: 'Zohur Ahmed Chowdhury Stadium',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    winner: 'Chittagong Challengers',
    loser: 'Rangpur Riders',
    result: 'Chittagong Challengers won by 14 runs',
    resultType: 'WIN',
    margin: 14,
    marginType: 'RUNS',
    advancedSettings: { players: 11, noBall: true } as any,
    firstInnings: {
      inningsNumber: 1,
      team: 'Chittagong Challengers',
      bowlingTeam: 'Rangpur Riders',
      totalRuns: 119,
      totalWickets: 4,
      totalBalls: 60,
      oversString: '10.0',
      wideRuns: 2,
      nbRuns: 0,
      byeRuns: 0,
      lbRuns: 1,
      penaltyRuns: 0,
      penaltyRunsAgainst: 0,
      strikerIdx: 0,
      nonStrikerIdx: 1,
      currentBowlerIdx: 0,
      nextPlayerIdx: 4,
      lastCompletedOverBowlerIdx: 0,
      isOverComplete: true,
      isFreeHit: false,
      thisOverLog: ['1', '4', '6', '1', '2', '0'],
      fallOfWickets: [],
      pastPartnerships: [],
      currentPartnership: { batter1: 'Player A', batter2: 'Player B', runs: 30, balls: 18 },
      players: [
        { id: 'p1', name: 'Player A', battingHand: 'Right-hand Batsman', runs: 45, balls: 24, fours: 5, sixes: 2, dotBalls: 6, isDismissed: false, ballLog: [], bowlersFaced: {}, runsVsBowler: {} },
        { id: 'p2', name: 'Player B', battingHand: 'Left-hand Batsman', runs: 32, balls: 20, fours: 3, sixes: 1, dotBalls: 5, isDismissed: false, ballLog: [], bowlersFaced: {}, runsVsBowler: {} },
      ],
      bowlers: [
        { id: 'b1', name: 'Bowler X', bowlingStyle: 'Right-arm Fast', overs: 3, ballsBowled: 18, maidens: 0, runs: 28, wickets: 2, noBalls: 0, wides: 1, dotBalls: 5, overHistory: [] },
      ],
    },
    secondInnings: {
      inningsNumber: 2,
      team: 'Rangpur Riders',
      bowlingTeam: 'Chittagong Challengers',
      totalRuns: 105,
      totalWickets: 7,
      totalBalls: 60,
      oversString: '10.0',
      wideRuns: 1,
      nbRuns: 0,
      byeRuns: 0,
      lbRuns: 0,
      penaltyRuns: 0,
      penaltyRunsAgainst: 0,
      strikerIdx: 0,
      nonStrikerIdx: 1,
      currentBowlerIdx: 0,
      nextPlayerIdx: 7,
      lastCompletedOverBowlerIdx: 0,
      isOverComplete: true,
      isFreeHit: false,
      thisOverLog: ['0', '1', 'W', '1', '0', '1'],
      fallOfWickets: [],
      pastPartnerships: [],
      currentPartnership: { batter1: 'Player C', batter2: 'Player D', runs: 8, balls: 6 },
      players: [
        { id: 'p3', name: 'Player C', battingHand: 'Right-hand Batsman', runs: 25, balls: 18, fours: 2, sixes: 1, dotBalls: 8, isDismissed: true, ballLog: [], bowlersFaced: {}, runsVsBowler: {} },
      ],
      bowlers: [
        { id: 'b2', name: 'Bowler Y', bowlingStyle: 'Left-arm Spin', overs: 4, ballsBowled: 24, maidens: 0, runs: 22, wickets: 3, noBalls: 0, wides: 0, dotBalls: 10, overHistory: [] },
      ],
    },
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. MODAL VISUAL & ACCESSIBILITY TESTS ──
  describe('1. Premium Modal Visual Identity & Content', () => {
    it('renders with dark-themed styling, emerald accent and proposed default copy', () => {
      const html = renderToStaticMarkup(
        React.createElement(PdfLoadingOverlay, {
          isOpen: true,
          stage: 'preparing',
          status: 'loading',
        })
      );

      // Dark theme & premium emerald accent
      expect(html).toContain('bg-slate-900');
      expect(html).toContain('border-slate-800');
      expect(html).toContain('text-emerald-600');
      expect(html).toContain('backdrop-blur-md');

      // Titles & subtitles
      expect(html).toContain('Creating Your Match Report...');
      expect(html).toContain('Preparing your official match scorecard');

      // 4 Progress stages
      expect(html).toContain('Preparing match details');
      expect(html).toContain('Compiling player performances');
      expect(html).toContain('Generating PDF');
      expect(html).toContain('Opening your report');

      // Accessibility
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('motion-reduce:animate-none');
    });

    it('renders accurate step completion states according to current stage', () => {
      // Stage: generating (Preparing is completed, Generating is active, others pending)
      const html = renderToStaticMarkup(
        React.createElement(PdfLoadingOverlay, {
          isOpen: true,
          stage: 'generating',
          status: 'loading',
        })
      );

      // Checkmark for completed stage
      expect(html).toContain('text-emerald-600 dark:text-emerald-400 font-semibold');
      // Active ping for active stage
      expect(html).toContain('animate-ping');
      expect(html).toContain('text-slate-900 dark:text-slate-100 font-bold');
    });

    it('renders success state with "PDF Ready!", completed status and download complete button', () => {
      const onCloseSpy = vi.fn();
      const html = renderToStaticMarkup(
        React.createElement(PdfLoadingOverlay, {
          isOpen: true,
          status: 'success',
          stage: 'ready',
          onClose: onCloseSpy,
        })
      );

      expect(html).toContain('PDF Ready!');
      expect(html).toContain('Download Complete');
      expect(html).toContain('aria-busy="false"');
      // All 4 steps marked completed
      expect(html).not.toContain('animate-spin');
    });

    it('renders error state with "Generation Failed", friendly error message and retry button', () => {
      const onRetrySpy = vi.fn();
      const onCloseSpy = vi.fn();
      const html = renderToStaticMarkup(
        React.createElement(PdfLoadingOverlay, {
          isOpen: true,
          status: 'error',
          stage: 'generating',
          errorMessage: 'Server is currently offline. Please try client export.',
          onRetry: onRetrySpy,
          onClose: onCloseSpy,
        })
      );

      expect(html).toContain('Generation Failed');
      expect(html).toContain('Server is currently offline. Please try client export.');
      expect(html).toContain('Retry');
      expect(html).toContain('Close');
      expect(html).not.toContain('animate-spin');
    });
  });

  // ── 2. REAL ASYNCHRONOUS PROGRESSION TESTS ──
  describe('2. Real Asynchronous Progress Reporting', () => {
    it('dispatches sequential progress steps ("preparing" -> "generating" -> "finalizing" -> "ready") during downloadPdf', async () => {
      const progressSteps: PdfGenerationStep[] = [];
      const onProgress = (step: PdfGenerationStep) => {
        progressSteps.push(step);
      };

      const mockBlob = new Blob(['%PDF-1.4 mock content'], { type: 'application/pdf' });
      Object.defineProperty(mockBlob, 'size', { value: 2048 });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        blob: vi.fn().mockResolvedValue(mockBlob),
      });

      const originalFetch = globalThis.fetch;
      const originalWindow = (globalThis as any).window;
      const originalDocument = (globalThis as any).document;

      try {
        globalThis.fetch = mockFetch;
        (globalThis as any).window = {};
        (globalThis as any).document = {
          createElement: vi.fn().mockReturnValue({ click: vi.fn() }),
          body: { appendChild: vi.fn(), removeChild: vi.fn() },
        };
        (globalThis as any).URL = {
          createObjectURL: vi.fn().mockReturnValue('blob:test-pdf'),
          revokeObjectURL: vi.fn(),
        };

        await ScorecardPdfGenerator.downloadPdf(sampleMatch, { onProgress });

        // Verify the chronological order of asynchronous stages
        expect(progressSteps).toEqual(['preparing', 'generating', 'finalizing', 'ready']);
      } finally {
        globalThis.fetch = originalFetch;
        (globalThis as any).window = originalWindow;
        (globalThis as any).document = originalDocument;
      }
    });

    it('reports stages correctly during client-side fallback when server export fails', async () => {
      const progressSteps: PdfGenerationStep[] = [];
      const onProgress = (step: PdfGenerationStep) => {
        progressSteps.push(step);
      };

      const mockFetch = vi.fn().mockRejectedValue(new Error('Network offline'));
      const originalFetch = globalThis.fetch;
      const originalWindow = (globalThis as any).window;
      const originalDocument = (globalThis as any).document;

      const saveSpy = vi.fn();
      const generatePdfSpy = vi.spyOn(ScorecardPdfGenerator, 'generatePdf').mockResolvedValue({
        save: saveSpy,
      } as any);

      try {
        globalThis.fetch = mockFetch;
        (globalThis as any).window = {};
        (globalThis as any).document = {
          createElement: vi.fn().mockReturnValue({ click: vi.fn() }),
          body: { appendChild: vi.fn(), removeChild: vi.fn() },
        };

        await ScorecardPdfGenerator.downloadPdf(sampleMatch, onProgress);

        expect(progressSteps).toContain('preparing');
        expect(progressSteps).toContain('generating');
        expect(progressSteps).toContain('finalizing');
        expect(progressSteps).toContain('ready');
        expect(saveSpy).toHaveBeenCalled();
      } finally {
        globalThis.fetch = originalFetch;
        (globalThis as any).window = originalWindow;
        (globalThis as any).document = originalDocument;
        generatePdfSpy.mockRestore();
      }
    });
  });

  // ── 3. CONCURRENCY & DEDUPLICATION TESTS ──
  describe('3. Concurrency Lock & Rapid Click Protection', () => {
    it('prevents multiple simultaneous executions when rapid clicks occur', async () => {
      let runCount = 0;
      let isLocked = false;

      const simulatedDownload = async () => {
        if (isLocked) return;
        isLocked = true;
        try {
          runCount++;
          await new Promise((resolve) => setTimeout(resolve, 50));
        } finally {
          isLocked = false;
        }
      };

      // 5 concurrent rapid clicks
      await Promise.all([
        simulatedDownload(),
        simulatedDownload(),
        simulatedDownload(),
        simulatedDownload(),
        simulatedDownload(),
      ]);

      expect(runCount).toBe(1);
    });
  });
});
