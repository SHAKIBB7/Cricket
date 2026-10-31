import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScorecardPdfGenerator } from '@/features/scoring/pdf/ScorecardPdfGenerator';
import { PdfLoadingOverlay } from '@/components/common/PdfLoadingOverlay';
import fs from 'fs';
import path from 'path';

describe('PDF Generation Bug Fix & Loading Animation Restoration Regression Suite', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. ELIMINATE BLACK-SCREEN / TAB HIJACKING IN SAFARI & MOBILE ──
  describe('1. triggerBlobDownload & Safari Black Screen Elimination', () => {
    it('sets target="_blank" and rel="noopener noreferrer" on iOS/Safari to avoid navigating the window and black screen', () => {
      const mockBlob = new Blob(['%PDF-1.4 test'], { type: 'application/pdf' });
      const createObjectURLSpy = vi.fn().mockReturnValue('blob:test-safari-url');
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
          body: {
            appendChild: vi.fn(),
            removeChild: vi.fn(),
          },
        };
        Object.defineProperty(globalThis.navigator, 'userAgent', {
          value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
          configurable: true,
        });
        (globalThis as any).URL = {
          createObjectURL: createObjectURLSpy,
          revokeObjectURL: revokeObjectURLSpy,
        };

        ScorecardPdfGenerator.triggerBlobDownload(mockBlob, 'Match_Report.pdf');

        expect(createObjectURLSpy).toHaveBeenCalledWith(mockBlob);
        expect(mockAnchor.download).toBe('Match_Report.pdf');
        // Crucial: Must be set to _blank to prevent current tab navigation & pitch-black screen
        expect(mockAnchor.target).toBe('_blank');
        expect(mockAnchor.rel).toBe('noopener noreferrer');
        expect(clickSpy).toHaveBeenCalled();
      } finally {
        (globalThis as any).window = originalWindow;
        (globalThis as any).document = originalDocument;
        if (originalUserAgent !== undefined) {
          Object.defineProperty(globalThis.navigator, 'userAgent', {
            value: originalUserAgent,
            configurable: true,
          });
        }
        (globalThis as any).URL = originalURL;
      }
    });

    it('retains object URL for a safe enterprise window (60s) rather than prematurely revoking at 2s', () => {
      vi.useFakeTimers();

      const mockBlob = new Blob(['%PDF-1.4 test'], { type: 'application/pdf' });
      const createObjectURLSpy = vi.fn().mockReturnValue('blob:test-retention-url');
      const revokeObjectURLSpy = vi.fn();

      const mockAnchor: any = {
        href: '',
        download: '',
        click: vi.fn(),
      };

      const originalWindow = (globalThis as any).window;
      const originalDocument = (globalThis as any).document;
      const originalURL = (globalThis as any).URL;

      try {
        (globalThis as any).window = {};
        (globalThis as any).document = {
          createElement: vi.fn().mockReturnValue(mockAnchor),
          body: {
            appendChild: vi.fn(),
            removeChild: vi.fn(),
          },
        };
        (globalThis as any).URL = {
          createObjectURL: createObjectURLSpy,
          revokeObjectURL: revokeObjectURLSpy,
        };

        ScorecardPdfGenerator.triggerBlobDownload(mockBlob, 'Match_Report.pdf');

        // At 2 seconds (the old bugged timeout), it should NOT be revoked yet
        vi.advanceTimersByTime(2000);
        expect(revokeObjectURLSpy).not.toHaveBeenCalled();

        // Advance to 60 seconds
        vi.advanceTimersByTime(58000);
        expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:test-retention-url');
      } finally {
        vi.useRealTimers();
        (globalThis as any).window = originalWindow;
        (globalThis as any).document = originalDocument;
        (globalThis as any).URL = originalURL;
      }
    });
  });

  // ── 2. ANIMATION RESTORATION & DYNAMIC STAGE MESSAGES ──
  describe('2. PdfLoadingOverlay Dynamic Action Messages & Step Visuals', () => {
    it('displays "Preparing match report..." when stage is preparing', () => {
      const html = renderToStaticMarkup(
        React.createElement(PdfLoadingOverlay, {
          isOpen: true,
          stage: 'preparing',
          status: 'loading',
        })
      );

      expect(html).toContain('Preparing match report...');
      expect(html).toContain('Preparing match data');
    });

    it('displays "Compiling player statistics..." when stage is generating', () => {
      const html = renderToStaticMarkup(
        React.createElement(PdfLoadingOverlay, {
          isOpen: true,
          stage: 'generating',
          status: 'loading',
        })
      );

      expect(html).toContain('Compiling player statistics...');
      expect(html).toContain('Generating scorecard');
    });

    it('displays "Generating PDF..." when stage is finalizing', () => {
      const html = renderToStaticMarkup(
        React.createElement(PdfLoadingOverlay, {
          isOpen: true,
          stage: 'finalizing',
          status: 'loading',
        })
      );

      expect(html).toContain('Generating PDF...');
      expect(html).toContain('Finalizing PDF');
    });

    it('displays "PDF Ready!" when stage is ready or status is success', () => {
      const html = renderToStaticMarkup(
        React.createElement(PdfLoadingOverlay, {
          isOpen: true,
          stage: 'ready',
          status: 'success',
          onClose: vi.fn(),
        })
      );

      expect(html).toContain('PDF Ready!');
      expect(html).toContain('Download Complete');
    });
  });

  // ── 3. ARCHITECTURAL ZERO-LATENCY IMPORT VERIFICATION ──
  describe('3. Score Page Static Import Verification (No dynamic chunk lag)', () => {
    it('verifies that score page imports PdfLoadingOverlay statically to prevent missing loading animation', () => {
      const scorePagePath = path.resolve(__dirname, '../app/matches/score/[matchId]/page.tsx');
      const content = fs.readFileSync(scorePagePath, 'utf-8');

      // Static import present
      expect(content).toMatch(/import\s+{\s*PdfLoadingOverlay\s*}\s+from\s+['"]@\/components\/common\/PdfLoadingOverlay['"]/);

      // Must NOT contain dynamic() for PdfLoadingOverlay
      expect(content).not.toMatch(/const\s+PdfLoadingOverlay\s*=\s*dynamic/);
    });

    it('verifies PDF download buttons on score page have disabled={isExportingPdf} and aria-busy', () => {
      const scorePagePath = path.resolve(__dirname, '../app/matches/score/[matchId]/page.tsx');
      const content = fs.readFileSync(scorePagePath, 'utf-8');

      expect(content).toContain('disabled={isExportingPdf}');
      expect(content).toContain('aria-busy={isExportingPdf}');
    });
  });
});
