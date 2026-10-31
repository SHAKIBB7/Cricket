'use client';

import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import type { MatchScorecard } from '@/domain/cricket/types';
import type { PdfGenerationStep } from '@/features/scoring/pdf/ScorecardPdfGenerator';
import { PdfLoadingOverlay, PdfOverlayStatus } from '@/components/common/PdfLoadingOverlay';

export type PdfDeliveryAction = 'download' | 'open' | 'share';

export interface PdfGenerationContextValue {
  isOpen: boolean;
  isGenerating: boolean;
  status: PdfOverlayStatus;
  stage: PdfGenerationStep;
  error: string | null;
  downloadPdf: (match: MatchScorecard) => Promise<void>;
  openPdf: (match: MatchScorecard) => Promise<void>;
  sharePdf: (match: MatchScorecard) => Promise<void>;
  generateAndDeliverPdf: (match: MatchScorecard, action?: PdfDeliveryAction) => Promise<void>;
  retry: () => Promise<void>;
  close: () => void;
}

const PdfGenerationContext = createContext<PdfGenerationContextValue | null>(null);

/**
 * Enterprise Centralized Global PDF Generation Provider
 *
 * Coordinates all PDF export, creation, viewing, and sharing across Cricket Scorer Pro.
 * Guarantees:
 * - Single source of truth for PDF modal state across all screens and routes.
 * - Concurrency protection preventing race conditions or duplicate clicks.
 * - Real asynchronous stage progression ('preparing' -> 'generating' -> 'finalizing' -> 'ready').
 * - Automatic portal mounting to document.body, eliminating trapped container transforms and black/gray screens.
 * - Smooth auto-close on success and persistent retry handling on failure.
 */
export function PdfGenerationProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<PdfOverlayStatus>('idle');
  const [stage, setStage] = useState<PdfGenerationStep>('preparing');
  const [error, setError] = useState<string | null>(null);

  const isGeneratingRef = useRef(false);
  const isMountedRef = useRef(true);
  const currentMatchRef = useRef<MatchScorecard | null>(null);
  const currentActionRef = useRef<PdfDeliveryAction>('download');
  const autoCloseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeRequestIdRef = useRef<number>(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }
    };
  }, []);

  const close = useCallback(() => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    setIsOpen(false);
    setStatus('idle');
    setError(null);
  }, []);

  const generateAndDeliverPdf = useCallback(
    async (match: MatchScorecard, action: PdfDeliveryAction = 'download'): Promise<void> => {
      // 1. Guard against duplicate rapid clicks or empty payload
      if (isGeneratingRef.current || !match) return;

      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }

      currentMatchRef.current = match;
      currentActionRef.current = action;
      isGeneratingRef.current = true;
      const requestId = ++activeRequestIdRef.current;

      // 2. Immediately activate modal and initial stage
      setIsOpen(true);
      setStatus('loading');
      setStage('preparing');
      setError(null);

      // 3. Give browser rendering opportunity to paint modal immediately
      await new Promise<void>((resolve) => {
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(() => setTimeout(resolve, 0));
        } else {
          setTimeout(resolve, 0);
        }
      });

      try {
        const { ScorecardPdfGenerator } = await import('@/features/scoring/pdf/ScorecardPdfGenerator');

        const onProgress = (newStage: PdfGenerationStep) => {
          if (isMountedRef.current && activeRequestIdRef.current === requestId) {
            setStage(newStage);
          }
        };

        if (action === 'open') {
          await ScorecardPdfGenerator.openPdf(match, { onProgress });
        } else if (action === 'share') {
          await ScorecardPdfGenerator.sharePdf(match, { onProgress });
        } else {
          await ScorecardPdfGenerator.downloadPdf(match, { onProgress });
        }

        if (isMountedRef.current && activeRequestIdRef.current === requestId) {
          setStage('ready');
          setStatus('success');

          // Smooth auto-dismiss after completion, allowing the user to observe the success state
          autoCloseTimerRef.current = setTimeout(() => {
            if (isMountedRef.current && activeRequestIdRef.current === requestId) {
              setIsOpen(false);
              setStatus('idle');
            }
          }, 1800);
        }
      } catch (err: any) {
        console.error('[PdfGenerationProvider] PDF generation error:', err);
        if (isMountedRef.current && activeRequestIdRef.current === requestId) {
          setStatus('error');
          const userMsg =
            err?.message && typeof err.message === 'string' && !err.message.includes('Error:')
              ? err.message
              : 'Unable to generate PDF scorecard. Please check your connection or try again.';
          setError(userMsg);
        }
      } finally {
        if (activeRequestIdRef.current === requestId) {
          isGeneratingRef.current = false;
        }
      }
    },
    []
  );

  const downloadPdf = useCallback(
    (match: MatchScorecard) => generateAndDeliverPdf(match, 'download'),
    [generateAndDeliverPdf]
  );

  const openPdf = useCallback(
    (match: MatchScorecard) => generateAndDeliverPdf(match, 'open'),
    [generateAndDeliverPdf]
  );

  const sharePdf = useCallback(
    (match: MatchScorecard) => generateAndDeliverPdf(match, 'share'),
    [generateAndDeliverPdf]
  );

  const retry = useCallback(async (): Promise<void> => {
    if (currentMatchRef.current) {
      await generateAndDeliverPdf(currentMatchRef.current, currentActionRef.current);
    }
  }, [generateAndDeliverPdf]);

  const value: PdfGenerationContextValue = {
    isOpen,
    isGenerating: status === 'loading',
    status,
    stage,
    error,
    downloadPdf,
    openPdf,
    sharePdf,
    generateAndDeliverPdf,
    retry,
    close,
  };

  return (
    <PdfGenerationContext.Provider value={value}>
      {children}
      <PdfLoadingOverlay
        isOpen={isOpen}
        stage={stage}
        status={status}
        errorMessage={error}
        onRetry={retry}
        onClose={close}
      />
    </PdfGenerationContext.Provider>
  );
}

export function usePdfGeneration(): PdfGenerationContextValue {
  const context = useContext(PdfGenerationContext);
  if (!context) {
    throw new Error('usePdfGeneration must be used within a PdfGenerationProvider');
  }
  return context;
}

export function useOptionalPdfGeneration(): PdfGenerationContextValue | null {
  return useContext(PdfGenerationContext);
}
