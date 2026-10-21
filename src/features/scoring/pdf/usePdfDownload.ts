'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { MatchScorecard } from '@/domain/cricket/types';
import { ScorecardPdfGenerator, PdfGenerationStep } from './ScorecardPdfGenerator';

export type PdfGenerationStatus = 'idle' | 'loading' | 'success' | 'error';

export interface UsePdfDownloadReturn {
  isOpen: boolean;
  isGenerating: boolean;
  status: PdfGenerationStatus;
  stage: PdfGenerationStep;
  error: string | null;
  downloadPdf: (match: MatchScorecard) => Promise<void>;
  retry: () => Promise<void>;
  close: () => void;
}

/**
 * Enterprise React hook managing the full lifecycle of PDF generation & download.
 * Features:
 * - Immediate UI state transition with main-thread yield before heavy async tasks.
 * - Strict duplicate-click concurrency lock via ref.
 * - Real asynchronous stage progression ('preparing' -> 'generating' -> 'finalizing' -> 'ready').
 * - Automatic component unmount safety to eliminate memory leaks and state updates after unmount.
 * - Built-in retry and auto-close timer management.
 */
export function usePdfDownload(): UsePdfDownloadReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<PdfGenerationStatus>('idle');
  const [stage, setStage] = useState<PdfGenerationStep>('preparing');
  const [error, setError] = useState<string | null>(null);

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

  const close = useCallback(() => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    setIsOpen(false);
    setStatus('idle');
    setError(null);
  }, []);

  const downloadPdf = useCallback(async (match: MatchScorecard): Promise<void> => {
    // 1. Guard against duplicate rapid clicks or empty payload
    if (isGeneratingRef.current || !match) return;

    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }

    currentMatchRef.current = match;
    isGeneratingRef.current = true;

    // 2. Immediately activate modal and initial stage
    setIsOpen(true);
    setStatus('loading');
    setStage('preparing');
    setError(null);

    // 3. Give the browser at least one rendering opportunity to paint the modal
    await new Promise<void>((resolve) => {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => setTimeout(resolve, 0));
      } else {
        setTimeout(resolve, 0);
      }
    });

    try {
      await ScorecardPdfGenerator.downloadPdf(match, {
        onProgress: (newStage: PdfGenerationStep) => {
          if (isMountedRef.current) {
            setStage(newStage);
          }
        },
      });

      if (isMountedRef.current) {
        setStage('ready');
        setStatus('success');

        // Smooth auto-dismiss after completion, allowing the user to observe the success state
        autoCloseTimerRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            setIsOpen(false);
            setStatus('idle');
          }
        }, 1800);
      }
    } catch (err: any) {
      console.error('[usePdfDownload] PDF generation error:', err);
      if (isMountedRef.current) {
        setStatus('error');
        const userMsg =
          err?.message && typeof err.message === 'string' && !err.message.includes('Error:')
            ? err.message
            : 'Unable to generate PDF scorecard. Please check your connection or try again.';
        setError(userMsg);
      }
    } finally {
      isGeneratingRef.current = false;
    }
  }, []);

  const retry = useCallback(async (): Promise<void> => {
    if (currentMatchRef.current) {
      await downloadPdf(currentMatchRef.current);
    }
  }, [downloadPdf]);

  return {
    isOpen,
    isGenerating: status === 'loading',
    status,
    stage,
    error,
    downloadPdf,
    retry,
    close,
  };
}
