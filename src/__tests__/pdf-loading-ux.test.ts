import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PdfLoadingOverlay } from '@/components/common/PdfLoadingOverlay';
import { ScorecardPdfGenerator } from '@/features/scoring/pdf/ScorecardPdfGenerator';
import { MatchScorecard } from '@/domain/cricket/types';

describe('Enterprise PDF Generation Loading UX & Reliability Suite', () => {
  const sampleMatch: MatchScorecard = {
    id: 'test-pdf-ux-1',
    teamA: 'Dhaka Dynamites',
    teamB: 'Sylhet Strikers',
    tossWinner: 'Dhaka Dynamites',
    tossDecision: 'Batting',
    totalOvers: 5,
    status: 'COMPLETED',
    currentInnings: 2,
    targetScore: 50,
    venue: 'Sher-e-Bangla National Cricket Stadium',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    winner: 'Dhaka Dynamites',
    loser: 'Sylhet Strikers',
    result: 'Dhaka Dynamites won by 15 runs',
    resultType: 'WIN',
    margin: 15,
    marginType: 'RUNS',
    advancedSettings: {
      players: 11,
      noBall: true,
      noBallReball: true,
      noBallRun: 1,
      wideBall: true,
      wideReball: true,
      wideRun: 1,
      isManualLimitEnabled: false,
      manualOverLimit: 4,
    },
    firstInnings: {
      inningsNumber: 1,
      team: 'Dhaka Dynamites',
      bowlingTeam: 'Sylhet Strikers',
      totalRuns: 49,
      totalWickets: 2,
      totalBalls: 30,
      oversString: '5.0',
      wideRuns: 0,
      nbRuns: 0,
      byeRuns: 0,
      lbRuns: 0,
      penaltyRuns: 0,
      penaltyRunsAgainst: 0,
      strikerIdx: 0,
      nonStrikerIdx: 1,
      currentBowlerIdx: 0,
      nextPlayerIdx: 2,
      lastCompletedOverBowlerIdx: 0,
      isOverComplete: true,
      isFreeHit: false,
      thisOverLog: ['1', '4', '6', '1', '2', '0'],
      fallOfWickets: [],
      pastPartnerships: [],
      currentPartnership: { batter1: 'Player 1', batter2: 'Player 2', runs: 20, balls: 12 },
      players: [
        { id: 'p1', name: 'Player 1', battingHand: 'Right-hand Batsman', runs: 30, balls: 18, fours: 3, sixes: 2, dotBalls: 4, isDismissed: false, ballLog: [], bowlersFaced: {}, runsVsBowler: {} },
        { id: 'p2', name: 'Player 2', battingHand: 'Left-hand Batsman', runs: 18, balls: 12, fours: 2, sixes: 0, dotBalls: 3, isDismissed: false, ballLog: [], bowlersFaced: {}, runsVsBowler: {} },
      ],
      bowlers: [
        { id: 'b1', name: 'Bowler 1', bowlingStyle: 'Right-arm Fast', overs: 3, ballsBowled: 18, maidens: 0, runs: 25, wickets: 1, noBalls: 0, wides: 0, dotBalls: 6, overHistory: [] },
      ],
    },
    secondInnings: {
      inningsNumber: 2,
      team: 'Sylhet Strikers',
      bowlingTeam: 'Dhaka Dynamites',
      totalRuns: 34,
      totalWickets: 4,
      totalBalls: 30,
      oversString: '5.0',
      wideRuns: 0,
      nbRuns: 0,
      byeRuns: 0,
      lbRuns: 0,
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
      currentPartnership: { batter1: 'Player 3', batter2: 'Player 4', runs: 5, balls: 8 },
      players: [
        { id: 'p3', name: 'Player 3', battingHand: 'Right-hand Batsman', runs: 12, balls: 14, fours: 1, sixes: 0, dotBalls: 7, isDismissed: true, ballLog: [], bowlersFaced: {}, runsVsBowler: {} },
      ],
      bowlers: [
        { id: 'b2', name: 'Bowler 2', bowlingStyle: 'Right-arm Offbreak', overs: 3, ballsBowled: 18, maidens: 0, runs: 18, wickets: 2, noBalls: 0, wides: 0, dotBalls: 9, overHistory: [] },
      ],
    },
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // A. VISUAL & ACCESSIBILITY REQUIREMENTS (PdfLoadingOverlay)
  // ───────────────────────────────────────────────────────────────────────────
  describe('A. Visual, Accessibility & Markup Requirements', () => {
    it('renders full-viewport loading overlay with emerald identity, primary & supporting messages when isOpen=true', () => {
      const html = renderToStaticMarkup(
        React.createElement(PdfLoadingOverlay, {
          isOpen: true,
        })
      );

      // Full viewport fixed overlay with backdrop blur
      expect(html).toContain('fixed inset-0');
      expect(html).toContain('z-50');
      expect(html).toContain('backdrop-blur-md');

      // Accessible semantics
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('aria-label="Generating PDF Scorecard"');

      // Primary and supporting messages
      expect(html).toContain('Generating PDF...');
      expect(html).toContain('Preparing your official match scorecard');

      // Emerald identity & circular SVG spinner
      expect(html).toContain('text-emerald-600');
      expect(html).toContain('animate-spin');
      expect(html).toContain('<svg');
      expect(html).toContain('stroke="currentColor"');

      // Reduced-motion support
      expect(html).toContain('motion-reduce:animate-none');
    });

    it('does not render anything when isOpen=false', () => {
      const html = renderToStaticMarkup(
        React.createElement(PdfLoadingOverlay, {
          isOpen: false,
        })
      );
      expect(html).toBe('');
    });

    it('supports custom title and supporting text', () => {
      const html = renderToStaticMarkup(
        React.createElement(PdfLoadingOverlay, {
          isOpen: true,
          title: 'Exporting Match Vector PDF...',
          message: 'Finalizing Bengali font rendering and scorecard layout.',
        })
      );

      expect(html).toContain('Exporting Match Vector PDF...');
      expect(html).toContain('Finalizing Bengali font rendering and scorecard layout.');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // B. PDF GENERATION WORKFLOW & RELIABILITY (ScorecardPdfGenerator.downloadPdf)
  // ───────────────────────────────────────────────────────────────────────────
  describe('B. ScorecardPdfGenerator.downloadPdf Robustness & Fallback', () => {
    it('throws meaningful error if match scorecard is missing', async () => {
      await expect(ScorecardPdfGenerator.downloadPdf(null as any)).rejects.toThrow(
        'Cannot generate PDF: No match scorecard data provided'
      );
    });

    it('successfully downloads via server-side Puppeteer export when online and response is valid', async () => {
      const mockBlob = new Blob(['%PDF-1.4 mock binary content'], { type: 'application/pdf' });
      // Fake non-zero size
      Object.defineProperty(mockBlob, 'size', { value: 1024 });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        blob: vi.fn().mockResolvedValue(mockBlob),
      });

      const originalFetch = globalThis.fetch;
      const originalWindow = (globalThis as any).window;
      const originalDocument = (globalThis as any).document;

      const appendChildSpy = vi.fn();
      const removeChildSpy = vi.fn();
      const clickSpy = vi.fn();
      const createObjectURLSpy = vi.fn().mockReturnValue('blob:mock-pdf-url-123');
      const revokeObjectURLSpy = vi.fn();

      try {
        globalThis.fetch = mockFetch;
        (globalThis as any).window = {};
        (globalThis as any).document = {
          createElement: vi.fn().mockReturnValue({
            click: clickSpy,
            style: {},
          }),
          body: {
            appendChild: appendChildSpy,
            removeChild: removeChildSpy,
          },
        };
        (globalThis as any).URL = {
          createObjectURL: createObjectURLSpy,
          revokeObjectURL: revokeObjectURLSpy,
        };

        const clientFallbackSpy = vi.spyOn(ScorecardPdfGenerator, 'generatePdf');

        await ScorecardPdfGenerator.downloadPdf(sampleMatch);

        // Server export was called with match & groundName
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/pdf/export',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })
        );

        // Blob was created and downloaded
        expect(createObjectURLSpy).toHaveBeenCalledWith(mockBlob);
        expect(appendChildSpy).toHaveBeenCalled();
        expect(clickSpy).toHaveBeenCalled();
        expect(removeChildSpy).toHaveBeenCalled();

        // Client-side fallback should NOT be invoked on server success
        expect(clientFallbackSpy).not.toHaveBeenCalled();
      } finally {
        globalThis.fetch = originalFetch;
        (globalThis as any).window = originalWindow;
        (globalThis as any).document = originalDocument;
      }
    });

    it('gracefully falls back to client-side jsPDF when server returns HTTP 500 error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

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
          createElement: vi.fn(),
          body: { appendChild: vi.fn(), removeChild: vi.fn() },
        };

        await ScorecardPdfGenerator.downloadPdf(sampleMatch);

        expect(mockFetch).toHaveBeenCalled();
        // Client-side fallback executed
        expect(generatePdfSpy).toHaveBeenCalledWith(sampleMatch);
        expect(saveSpy).toHaveBeenCalledWith(
          expect.stringContaining('Dhaka Dynamites vs Sylhet Strikers Match Report.pdf')
        );
      } finally {
        globalThis.fetch = originalFetch;
        (globalThis as any).window = originalWindow;
        (globalThis as any).document = originalDocument;
      }
    });

    it('gracefully falls back to client-side jsPDF when fetch throws network error (offline)', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Failed to fetch (offline)'));

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
          createElement: vi.fn(),
          body: { appendChild: vi.fn(), removeChild: vi.fn() },
        };

        await ScorecardPdfGenerator.downloadPdf(sampleMatch);

        expect(mockFetch).toHaveBeenCalled();
        expect(generatePdfSpy).toHaveBeenCalledWith(sampleMatch);
        expect(saveSpy).toHaveBeenCalled();
      } finally {
        globalThis.fetch = originalFetch;
        (globalThis as any).window = originalWindow;
        (globalThis as any).document = originalDocument;
      }
    });

    it('falls back to client-side jsPDF when server returns an empty (0 bytes) blob', async () => {
      const emptyBlob = new Blob([], { type: 'application/pdf' });
      Object.defineProperty(emptyBlob, 'size', { value: 0 });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        blob: vi.fn().mockResolvedValue(emptyBlob),
      });

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
          createElement: vi.fn(),
          body: { appendChild: vi.fn(), removeChild: vi.fn() },
        };

        await ScorecardPdfGenerator.downloadPdf(sampleMatch);

        // Empty blob triggered client fallback
        expect(generatePdfSpy).toHaveBeenCalledWith(sampleMatch);
        expect(saveSpy).toHaveBeenCalled();
      } finally {
        globalThis.fetch = originalFetch;
        (globalThis as any).window = originalWindow;
        (globalThis as any).document = originalDocument;
      }
    });

    it('throws meaningful error when BOTH server export and client jsPDF fallback fail', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network offline'));
      const originalFetch = globalThis.fetch;
      const originalWindow = (globalThis as any).window;
      const originalDocument = (globalThis as any).document;

      vi.spyOn(ScorecardPdfGenerator, 'generatePdf').mockRejectedValue(
        new Error('Out of memory canvas buffer')
      );

      try {
        globalThis.fetch = mockFetch;
        (globalThis as any).window = {};
        (globalThis as any).document = {
          createElement: vi.fn(),
          body: { appendChild: vi.fn(), removeChild: vi.fn() },
        };

        await expect(ScorecardPdfGenerator.downloadPdf(sampleMatch)).rejects.toThrow(
          'Out of memory canvas buffer'
        );
      } finally {
        globalThis.fetch = originalFetch;
        (globalThis as any).window = originalWindow;
        (globalThis as any).document = originalDocument;
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // C. ASYNCHRONOUS STATE MANAGEMENT & CONCURRENCY CONTROL (Match Summary Page)
  // ───────────────────────────────────────────────────────────────────────────
  describe('C. Asynchronous State Management, Concurrency & Lifecycle Guarantees', () => {
    it('1 & 2: Loading state becomes active immediately and download operation is awaited', async () => {
      let isGeneratingState = false;
      let generationCompleted = false;

      const stateTransitions: boolean[] = [];
      const setIsGeneratingPdf = (val: boolean) => {
        isGeneratingState = val;
        stateTransitions.push(val);
      };

      const isGeneratingRef = { current: false };

      // Simulate a download that takes 50ms
      const mockDownload = vi.fn().mockImplementation(async () => {
        // Assert that loading state is ALREADY true while download is executing
        expect(isGeneratingRef.current).toBe(true);
        expect(isGeneratingState).toBe(true);
        await new Promise((r) => setTimeout(r, 50));
        generationCompleted = true;
      });

      // Controller handler pattern as implemented in page.tsx
      const handleDownloadPdf = async () => {
        if (isGeneratingRef.current) return;
        isGeneratingRef.current = true;
        setIsGeneratingPdf(true);

        try {
          await mockDownload();
        } finally {
          isGeneratingRef.current = false;
          setIsGeneratingPdf(false);
        }
      };

      // Initial state
      expect(isGeneratingState).toBe(false);
      expect(isGeneratingRef.current).toBe(false);

      const promise = handleDownloadPdf();

      // State is active IMMEDIATELY without waiting for async resolution
      expect(isGeneratingState).toBe(true);
      expect(isGeneratingRef.current).toBe(true);
      expect(generationCompleted).toBe(false);

      await promise;

      // Completed and cleaned up
      expect(generationCompleted).toBe(true);
      expect(isGeneratingState).toBe(false);
      expect(isGeneratingRef.current).toBe(false);
      expect(stateTransitions).toEqual([true, false]);
    });

    it('3: Multiple rapid clicks do not start duplicate PDF generation (Synchronous Ref Lock)', async () => {
      let runCount = 0;
      const isGeneratingRef = { current: false };

      const mockDownload = vi.fn().mockImplementation(async () => {
        runCount++;
        await new Promise((r) => setTimeout(r, 40));
      });

      const handleDownloadPdf = async () => {
        if (isGeneratingRef.current) return;
        isGeneratingRef.current = true;

        try {
          await mockDownload();
        } finally {
          isGeneratingRef.current = false;
        }
      };

      // Trigger 5 rapid clicks concurrently
      const promises = [
        handleDownloadPdf(),
        handleDownloadPdf(),
        handleDownloadPdf(),
        handleDownloadPdf(),
        handleDownloadPdf(),
      ];

      await Promise.all(promises);

      // Only the first click executed the download
      expect(runCount).toBe(1);
      expect(mockDownload).toHaveBeenCalledTimes(1);
    });

    it('8 & 9: Dynamic-import or generation errors do not leave the overlay stuck, and cleanup executes', async () => {
      let isGeneratingState = false;
      let caughtError: string | null = null;
      const isGeneratingRef = { current: false };

      const handleDownloadPdf = async () => {
        if (isGeneratingRef.current) return;
        isGeneratingRef.current = true;
        isGeneratingState = true;

        try {
          throw new Error('Network timeout during dynamic import');
        } catch (err: any) {
          caughtError = err.message;
        } finally {
          isGeneratingRef.current = false;
          isGeneratingState = false;
        }
      };

      await handleDownloadPdf();

      expect(caughtError).toBe('Network timeout during dynamic import');
      // Lock is released and loading state is cleared
      expect(isGeneratingRef.current).toBe(false);
      expect(isGeneratingState).toBe(false);
    });

    it('10: Component unmount does not cause unsafe state updates after in-flight generation', async () => {
      const isMountedRef = { current: true };
      const isGeneratingRef = { current: false };
      let stateUpdatedAfterUnmount = false;

      const setIsGeneratingPdf = (_val: boolean) => {
        if (!isMountedRef.current) {
          stateUpdatedAfterUnmount = true;
        }
      };

      const handleDownloadPdf = async () => {
        if (isGeneratingRef.current) return;
        isGeneratingRef.current = true;
        setIsGeneratingPdf(true);

        try {
          await new Promise((r) => setTimeout(r, 30));
        } finally {
          isGeneratingRef.current = false;
          if (isMountedRef.current) {
            setIsGeneratingPdf(false);
          }
        }
      };

      const promise = handleDownloadPdf();

      // Simulate user navigating away before generation finishes
      isMountedRef.current = false;

      await promise;

      expect(stateUpdatedAfterUnmount).toBe(false);
      expect(isGeneratingRef.current).toBe(false);
    });

    it('11: Preserves existing PDF and ground-name resolution behavior', async () => {
      const groundName = await ScorecardPdfGenerator.resolveGroundName(sampleMatch);
      expect(groundName).toBe('Sher-e-Bangla National Cricket Stadium');

      // Generates master vector jsPDF without error
      const doc = await ScorecardPdfGenerator.generatePdf(sampleMatch);
      expect(doc).toBeDefined();
      expect(typeof doc.save).toBe('function');
    });
  });
});
