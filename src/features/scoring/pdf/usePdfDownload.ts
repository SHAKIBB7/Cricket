'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { MatchScorecard } from '@/domain/cricket/types';
import type { PdfGenerationStep } from './ScorecardPdfGenerator';
import { useOptionalPdfGeneration } from '@/context/PdfGenerationContext';

export type PdfGenerationStatus = 'idle' | 'loading' | 'success' | 'error';

export interface UsePdfDownloadReturn {
  isOpen: boolean;
  isGenerating: boolean;
  status: PdfGenerationStatus;
  stage: PdfGenerationStep;
  error: string | null;
  downloadPdf: (match: MatchScorecard) => Promise<void>;
  openPdf?: (match: MatchScorecard) => Promise<void>;
  sharePdf?: (match: MatchScorecard) => Promise<void>;
  retry: () => Promise<void>;
  close: () => void;
}

/**
 * Enterprise React hook managing the full lifecycle of PDF generation & download.
 * Features:
 * - Automatically connects to the global PdfGenerationProvider when present.
 * - Seamless standalone fallback for isolated components or unit test environments.
 * - Immediate UI state transition with main-thread yield before heavy async tasks.
 * - Strict duplicate-click concurrency lock via ref.
 * - Real asynchronous stage progression ('preparing' -> 'generating' -> 'finalizing' -> 'ready').
 * - Automatic component unmount safety to eliminate memory leaks and state updates after unmount.
 * - Built-in retry and auto-close timer management.
 */
export function usePdfDownload(): UsePdfDownloadReturn {
  const context = useOptionalPdfGeneration();

  const [localIsOpen, setLocalIsOpen] = useState(false);
  const [localStatus, setLocalStatus] = useState<PdfGenerationStatus>('idle');
  const [localStage, setLocalStage] = useState<PdfGenerationStep>('preparing');
  const [localError, setLocalError] = useState<string | null>(null);

  const isGeneratingRef = useRef(false);
  const isMountedRef = useRef(true);
  const currentMatchRef = useRef<MatchScorecard | null>(null);
  const autoCloseTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  const localClose = useCallback(() => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    setLocalIsOpen(false);
    setLocalStatus('idle');
    setLocalError(null);
  }, []);

  const localDownloadPdf = useCallback(async (match: MatchScorecard): Promise<void> => {
    // 1. Guard against duplicate rapid clicks or empty payload
    if (isGeneratingRef.current || !match) return;

    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }

    currentMatchRef.current = match;
    isGeneratingRef.current = true;

    // 2. Immediately activate modal and initial stage
    setLocalIsOpen(true);
    setLocalStatus('loading');
    setLocalStage('preparing');
    setLocalError(null);

    // 3. Give the browser at least one rendering opportunity to paint the modal
    await new Promise<void>((resolve) => {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => setTimeout(resolve, 0));
      } else {
        setTimeout(resolve, 0);
      }
    });

    try {
      const { ScorecardPdfGenerator } = await import('./ScorecardPdfGenerator');
      await ScorecardPdfGenerator.downloadPdf(match, {
        onProgress: (newStage: PdfGenerationStep) => {
          if (isMountedRef.current) {
            setLocalStage(newStage);
          }
        },
      });

      if (isMountedRef.current) {
        setLocalStage('ready');
        setLocalStatus('success');

        // Smooth auto-dismiss after completion, allowing the user to observe the success state
        autoCloseTimerRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            setLocalIsOpen(false);
            setLocalStatus('idle');
          }
        }, 1800);
      }
    } catch (err: any) {
      console.error('[usePdfDownload] PDF generation error:', err);
      if (isMountedRef.current) {
        setLocalStatus('error');
        const userMsg =
          err?.message && typeof err.message === 'string' && !err.message.includes('Error:')
            ? err.message
            : 'Unable to generate PDF scorecard. Please check your connection or try again.';
        setLocalError(userMsg);
      }
    } finally {
      isGeneratingRef.current = false;
    }
  }, []);

  const localRetry = useCallback(async (): Promise<void> => {
    if (currentMatchRef.current) {
      await localDownloadPdf(currentMatchRef.current);
    }
  }, [localDownloadPdf]);

  // When mounted inside the global PdfGenerationProvider, synchronize with shared state!
  if (context) {
    return {
      isOpen: context.isOpen,
      isGenerating: context.isGenerating,
      status: context.status,
      stage: context.stage,
      error: context.error,
      downloadPdf: context.downloadPdf,
      openPdf: context.openPdf,
      sharePdf: context.sharePdf,
      retry: context.retry,
      close: context.close,
    };
  }

  return {
    isOpen: localIsOpen,
    isGenerating: localStatus === 'loading',
    status: localStatus,
    stage: localStage,
    error: localError,
    downloadPdf: localDownloadPdf,
    retry: localRetry,
    close: localClose,
  };
}
