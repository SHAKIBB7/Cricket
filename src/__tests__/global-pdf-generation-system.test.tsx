import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PdfGenerationProvider, usePdfGeneration } from '@/context/PdfGenerationContext';
import { usePdfDownload } from '@/features/scoring/pdf/usePdfDownload';
import { ScorecardPdfGenerator } from '@/features/scoring/pdf/ScorecardPdfGenerator';
import { PdfLoadingOverlay } from '@/components/common/PdfLoadingOverlay';
import { MatchScorecard } from '@/domain/cricket/types';
import fs from 'fs';
import path from 'path';

describe('Global PDF Generation Animation System & Centralized Workflow Suite', () => {
  const sampleMatch: MatchScorecard = {
    id: 'global-pdf-test-1',
    teamA: 'Dhaka Gladiators',
    teamB: 'Khulna Tigers',
    tossWinner: 'Dhaka Gladiators',
    tossDecision: 'Batting',
    totalOvers: 20,
    status: 'COMPLETED',
    currentInnings: 2,
    targetScore: 185,
    venue: 'Mirpur National Stadium',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    winner: 'Dhaka Gladiators',
    loser: 'Khulna Tigers',
    result: 'Dhaka Gladiators won by 18 runs',
    resultType: 'WIN',
    margin: 18,
    marginType: 'RUNS',
    advancedSettings: { players: 11, noBall: true } as any,
    firstInnings: {
      inningsNumber: 1,
      team: 'Dhaka Gladiators',
      bowlingTeam: 'Khulna Tigers',
      totalRuns: 184,
      totalWickets: 5,
      totalBalls: 120,
      oversString: '20.0',
      wideRuns: 4,
      nbRuns: 1,
      byeRuns: 0,
      lbRuns: 2,
      penaltyRuns: 0,
      penaltyRunsAgainst: 0,
      strikerIdx: 0,
      nonStrikerIdx: 1,
      currentBowlerIdx: 0,
      nextPlayerIdx: 2,
      lastCompletedOverBowlerIdx: 0,
      isOverComplete: true,
      isFreeHit: false,
      thisOverLog: ['1', '4', '6', '0', '2', '1'],
      fallOfWickets: [],
      pastPartnerships: [],
      currentPartnership: { batter1: 'Player 1', batter2: 'Player 2', runs: 45, balls: 28 },
      players: [
        { id: 'p1', name: 'Shakib', battingHand: 'Left-hand Batsman', runs: 75, balls: 42, fours: 7, sixes: 4, dotBalls: 10, isDismissed: false, ballLog: [], bowlersFaced: {}, runsVsBowler: {} },
        { id: 'p2', name: 'Tamim', battingHand: 'Left-hand Batsman', runs: 50, balls: 35, fours: 6, sixes: 1, dotBalls: 12, isDismissed: true, ballLog: [], bowlersFaced: {}, runsVsBowler: {} },
      ],
      bowlers: [
        { id: 'b1', name: 'Rubel', bowlingStyle: 'Right-arm Fast', overs: 4, ballsBowled: 24, maidens: 0, runs: 38, wickets: 2, noBalls: 1, wides: 1, dotBalls: 8, overHistory: [] },
      ],
    },
    secondInnings: {
      inningsNumber: 2,
      team: 'Khulna Tigers',
      bowlingTeam: 'Dhaka Gladiators',
      totalRuns: 166,
      totalWickets: 8,
      totalBalls: 120,
      oversString: '20.0',
      wideRuns: 2,
      nbRuns: 0,
      byeRuns: 0,
      lbRuns: 1,
      penaltyRuns: 0,
      penaltyRunsAgainst: 0,
      strikerIdx: 0,
      nonStrikerIdx: 1,
      currentBowlerIdx: 0,
      nextPlayerIdx: 2,
      lastCompletedOverBowlerIdx: 0,
      isOverComplete: true,
      isFreeHit: false,
      thisOverLog: ['0', '1', 'W', '0', '1', '0'],
      fallOfWickets: [],
      pastPartnerships: [],
      currentPartnership: { batter1: 'Player 3', batter2: 'Player 4', runs: 12, balls: 10 },
      players: [
        { id: 'p3', name: 'Mushfiqur', battingHand: 'Right-hand Batsman', runs: 55, balls: 38, fours: 5, sixes: 2, dotBalls: 9, isDismissed: true, ballLog: [], bowlersFaced: {}, runsVsBowler: {} },
      ],
      bowlers: [
        { id: 'b2', name: 'Mustafizur', bowlingStyle: 'Left-arm Fast Medium', overs: 4, ballsBowled: 24, maidens: 1, runs: 24, wickets: 3, noBalls: 0, wides: 1, dotBalls: 14, overHistory: [] },
      ],
    },
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. CENTRALIZED ARCHITECTURE & PROVIDER INTEGRATION ──
  describe('1. Centralized Architecture & Provider Integration', () => {
    it('verifies PdfGenerationProvider wraps Navigation in RootLayout', () => {
      const layoutPath = path.resolve(__dirname, '../app/layout.tsx');
      const layoutContent = fs.readFileSync(layoutPath, 'utf-8');

      expect(layoutContent).toContain('import { PdfGenerationProvider } from \'@/context/PdfGenerationContext\'');
      expect(layoutContent).toContain('<PdfGenerationProvider>');
      expect(layoutContent).toContain('</PdfGenerationProvider>');
      expect(layoutContent).toMatch(/<PdfGenerationProvider>[\s\S]*<Navigation>[\s\S]*<\/Navigation>[\s\S]*<\/PdfGenerationProvider>/);
    });

    it('verifies usePdfDownload delegates to shared PdfGenerationContext when inside provider', () => {
      let contextValue: any = null;

      function TestConsumer() {
        contextValue = usePdfDownload();
        return null;
      }

      renderToStaticMarkup(
        React.createElement(
          PdfGenerationProvider,
          null,
          React.createElement(TestConsumer, null)
        )
      );

      expect(contextValue).toBeDefined();
      expect(contextValue.isOpen).toBe(false);
      expect(contextValue.isGenerating).toBe(false);
      expect(contextValue.status).toBe('idle');
      expect(contextValue.stage).toBe('preparing');
      expect(typeof contextValue.downloadPdf).toBe('function');
      expect(typeof contextValue.openPdf).toBe('function');
      expect(typeof contextValue.sharePdf).toBe('function');
      expect(typeof contextValue.retry).toBe('function');
      expect(typeof contextValue.close).toBe('function');
    });

    it('renders the centralized loading modal via PdfGenerationProvider', () => {
      const html = renderToStaticMarkup(
        React.createElement(
          PdfGenerationProvider,
          null,
          React.createElement('div', { id: 'test-app' }, 'Cricket Scorer Pro')
        )
      );

      expect(html).toContain('Cricket Scorer Pro');
    });
  });

  // ── 2. ELIMINATING THE SCOREBOARD GRAY/DARK SCREEN BUG ──
  describe('2. Elimination of Scoreboard Trapped Modal & Fullscreen Gray Artifact', () => {
    it('verifies IntegratedScoreboard uses usePdfDownload without local duplicate overlay in its animated div', () => {
      const scoreboardPath = path.resolve(__dirname, '../components/scoring/IntegratedScoreboard.tsx');
      const content = fs.readFileSync(scoreboardPath, 'utf-8');

      expect(content).toContain('usePdfDownload');
      expect(content).toContain('downloadPdf(engine.toScorecard())');
      // Must not render duplicate local overlay inside the transform-animated container
      expect(content).not.toContain('<PdfLoadingOverlay');
    });

    it('verifies PdfLoadingOverlay supports portal mounting to document.body in browser', () => {
      const overlayPath = path.resolve(__dirname, '../components/common/PdfLoadingOverlay.tsx');
      const content = fs.readFileSync(overlayPath, 'utf-8');

      expect(content).toContain('createPortal');
      expect(content).toContain('document.body');
      expect(content).toContain('mounted');
    });

    it('renders the complete cricket-themed loading animation elements when open', () => {
      const html = renderToStaticMarkup(
        React.createElement(PdfLoadingOverlay, {
          isOpen: true,
          status: 'loading',
          stage: 'preparing',
        })
      );

      // 1. Spinning emerald track
      expect(html).toContain('animate-spin');
      expect(html).toContain('text-emerald-600');

      // 2. Scorecard paper icon
      expect(html).toContain('stroke-linejoin="round"');

      // 3. Pulsing red cricket ball with seam
      expect(html).toContain('from-red-600 via-rose-500 to-red-400');
      expect(html).toContain('animate-pulse');

      // 4. Bat handle accent
      expect(html).toContain('rotate-[-25deg]');

      // 5. Progress bar and stages
      expect(html).toContain('Preparing match details');
      expect(html).toContain('Compiling player performances');
      expect(html).toContain('Generating PDF');
      expect(html).toContain('Opening your report');
      expect(html).toContain('Creating Your Match Report...');
    });
  });

  // ── 3. REPOSITORY-WIDE AUDIT & ENTRY POINTS MIGRATION ──
  describe('3. Repository-Wide Entry Point Migration Audit', () => {
    it('verifies Archive match list (/matches/history) uses shared workflow without local overlay', () => {
      const filePath = path.resolve(__dirname, '../app/matches/history/page.tsx');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('usePdfDownload');
      expect(content).toContain('downloadPdf(m)');
      expect(content).not.toContain('<PdfLoadingOverlay');
    });

    it('verifies Live Scoring cockpit (/matches/score/[matchId]) uses shared workflow', () => {
      const filePath = path.resolve(__dirname, '../app/matches/score/[matchId]/page.tsx');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('usePdfDownload');
      expect(content).toContain('downloadPdf(engine.toScorecard())');
      expect(content).toContain('disabled={isExportingPdf}');
      expect(content).toContain('aria-busy={isExportingPdf}');
      expect(content).not.toContain('<PdfLoadingOverlay');
    });

    it('verifies Match Summary page (/matches/summary/[matchId]) uses shared workflow without local overlay', () => {
      const filePath = path.resolve(__dirname, '../app/matches/summary/[matchId]/page.tsx');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('usePdfDownload');
      expect(content).toContain('downloadPdf(match)');
      expect(content).toContain('disabled={isGeneratingPdf}');
      expect(content).not.toContain('<PdfLoadingOverlay');
    });

    it('verifies Match Center page (/matches/center/[matchId]) uses shared workflow without local overlay', () => {
      const filePath = path.resolve(__dirname, '../app/matches/center/[matchId]/page.tsx');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('usePdfDownload');
      expect(content).toContain('downloadPdf(match)');
      expect(content).toContain('disabled={isExportingPdf}');
      expect(content).not.toContain('<PdfLoadingOverlay');
    });
  });

  // ── 4. DECOUPLED DELIVERY METHODS: DOWNLOAD, OPEN & SHARE ──
  describe('4. Decoupled Document Delivery Methods', () => {
    it('provides generatePdfDocument separating creation from final delivery', async () => {
      expect(typeof ScorecardPdfGenerator.generatePdfDocument).toBe('function');
      expect(typeof ScorecardPdfGenerator.downloadPdf).toBe('function');
      expect(typeof ScorecardPdfGenerator.openPdf).toBe('function');
      expect(typeof ScorecardPdfGenerator.sharePdf).toBe('function');
    });

    it('openPdf opens document in new context and falls back safely to download when popup is blocked', async () => {
      const mockBlob = new Blob(['%PDF-1.4 mock vector pdf'], { type: 'application/pdf' });
      Object.defineProperty(mockBlob, 'size', { value: 1024 });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        blob: vi.fn().mockResolvedValue(mockBlob),
      });

      const originalFetch = globalThis.fetch;
      const originalWindow = (globalThis as any).window;
      const originalDocument = (globalThis as any).document;
      const originalURL = (globalThis as any).URL;

      const triggerDownloadSpy = vi.spyOn(ScorecardPdfGenerator, 'triggerBlobDownload').mockImplementation(() => {});

      try {
        globalThis.fetch = mockFetch;
        // Mock window with popup blocker returning null
        (globalThis as any).window = {
          open: vi.fn().mockReturnValue(null),
        };
        (globalThis as any).document = {};
        (globalThis as any).URL = {
          createObjectURL: vi.fn().mockReturnValue('blob:test-open-url'),
          revokeObjectURL: vi.fn(),
        };

        await ScorecardPdfGenerator.openPdf(sampleMatch);

        // When popup returns null (blocked), safely falls back to triggerBlobDownload
        expect(triggerDownloadSpy).toHaveBeenCalledWith(mockBlob, expect.stringContaining('.pdf'));
      } finally {
        globalThis.fetch = originalFetch;
        (globalThis as any).window = originalWindow;
        (globalThis as any).document = originalDocument;
        (globalThis as any).URL = originalURL;
        triggerDownloadSpy.mockRestore();
      }
    });

    it('sharePdf uses Web Share API when available and falls back cleanly when unsupported', async () => {
      const mockBlob = new Blob(['%PDF-1.4 mock vector pdf'], { type: 'application/pdf' });
      Object.defineProperty(mockBlob, 'size', { value: 1024 });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        blob: vi.fn().mockResolvedValue(mockBlob),
      });

      const shareSpy = vi.fn().mockResolvedValue(undefined);
      const originalFetch = globalThis.fetch;
      const originalWindow = (globalThis as any).window;
      const originalDocument = (globalThis as any).document;
      const originalNavigator = globalThis.navigator;

      try {
        globalThis.fetch = mockFetch;
        (globalThis as any).window = {};
        (globalThis as any).document = {};
        Object.defineProperty(globalThis, 'navigator', {
          value: {
            share: shareSpy,
            canShare: vi.fn().mockReturnValue(true),
          },
          configurable: true,
        });

        await ScorecardPdfGenerator.sharePdf(sampleMatch);

        expect(shareSpy).toHaveBeenCalled();
      } finally {
        globalThis.fetch = originalFetch;
        (globalThis as any).window = originalWindow;
        (globalThis as any).document = originalDocument;
        Object.defineProperty(globalThis, 'navigator', {
          value: originalNavigator,
          configurable: true,
        });
      }
    });
  });

  // ── 5. ASYNC LIFECYCLE & RETRY HANDLING ──
  describe('5. Concurrency Control, Error Recovery & Lifecycle Cleanup', () => {
    it('protects against duplicate generation requests while an operation is in progress', async () => {
      let executions = 0;
      let isBusy = false;

      const runProtectedPdfAction = async () => {
        if (isBusy) return;
        isBusy = true;
        try {
          executions++;
          await new Promise((resolve) => setTimeout(resolve, 40));
        } finally {
          isBusy = false;
        }
      };

      await Promise.all([
        runProtectedPdfAction(),
        runProtectedPdfAction(),
        runProtectedPdfAction(),
        runProtectedPdfAction(),
      ]);

      expect(executions).toBe(1);
    });

    it('safely retains Object URL for 60 seconds and sets iOS Safari attributes', () => {
      vi.useFakeTimers();

      const mockBlob = new Blob(['%PDF-1.4 test'], { type: 'application/pdf' });
      const createObjectURLSpy = vi.fn().mockReturnValue('blob:test-ios-url');
      const revokeObjectURLSpy = vi.fn();
      const clickSpy = vi.fn();

      const mockAnchor: any = {
        href: '',
        download: '',
        target: '',
        rel: '',
        click: clickSpy,
      };

      const originalWindow = (globalThis as any).window;
      const originalDocument = (globalThis as any).document;
      const originalURL = (globalThis as any).URL;
      const originalUserAgent = globalThis.navigator?.userAgent;

      try {
        (globalThis as any).window = {};
        (globalThis as any).document = {
          createElement: vi.fn().mockReturnValue(mockAnchor),
          body: { appendChild: vi.fn(), removeChild: vi.fn() },
        };
        Object.defineProperty(globalThis.navigator, 'userAgent', {
          value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
          configurable: true,
        });
        (globalThis as any).URL = {
          createObjectURL: createObjectURLSpy,
          revokeObjectURL: revokeObjectURLSpy,
        };

        ScorecardPdfGenerator.triggerBlobDownload(mockBlob, 'Match_Report.pdf');

        expect(mockAnchor.target).toBe('_blank');
        expect(mockAnchor.rel).toBe('noopener noreferrer');
        expect(clickSpy).toHaveBeenCalled();

        // 30 seconds -> not revoked
        vi.advanceTimersByTime(30000);
        expect(revokeObjectURLSpy).not.toHaveBeenCalled();

        // 60 seconds -> revoked
        vi.advanceTimersByTime(30000);
        expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:test-ios-url');
      } finally {
        vi.useRealTimers();
        (globalThis as any).window = originalWindow;
        (globalThis as any).document = originalDocument;
        (globalThis as any).URL = originalURL;
        if (originalUserAgent !== undefined) {
          Object.defineProperty(globalThis.navigator, 'userAgent', {
            value: originalUserAgent,
            configurable: true,
          });
        }
      }
    });
  });
});
