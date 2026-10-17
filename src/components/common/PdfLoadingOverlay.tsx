'use client';

import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { FileText } from 'lucide-react';
import { BACKDROP_VARIANTS, MODAL_VARIANTS } from '@/lib/animations';

export interface PdfLoadingOverlayProps {
  isOpen: boolean;
  title?: string;
  message?: string;
}

/**
 * Enterprise-grade full-viewport loading overlay for PDF generation.
 * Features:
 * - Subtle translucent backdrop with restrained blur.
 * - Emerald circular animated spinner framing a crisp document icon.
 * - Primary & supporting status messages.
 * - Light and dark mode support with accessible contrast.
 * - Full reduced-motion accommodation (prefers-reduced-motion).
 * - ARIA live region and status semantics for screen readers.
 * - Z-index stacking above all page elements to prevent unintended interactions.
 */
export function PdfLoadingOverlay({
  isOpen,
  title = 'Generating PDF...',
  message = 'Preparing your official match scorecard. Please wait a moment while the report is generated.',
}: PdfLoadingOverlayProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="pdf-loading-overlay-backdrop"
          variants={shouldReduceMotion ? undefined : BACKDROP_VARIANTS}
          initial={shouldReduceMotion ? { opacity: 1 } : 'hidden'}
          animate={shouldReduceMotion ? { opacity: 1 } : 'visible'}
          exit={shouldReduceMotion ? { opacity: 0 } : 'exit'}
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label="Generating PDF Scorecard"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white/85 dark:bg-slate-950/80 backdrop-blur-md select-none touch-none"
        >
          <motion.div
            key="pdf-loading-overlay-card"
            variants={shouldReduceMotion ? undefined : MODAL_VARIANTS}
            initial={shouldReduceMotion ? { opacity: 1, scale: 1 } : 'hidden'}
            animate={shouldReduceMotion ? { opacity: 1, scale: 1 } : 'visible'}
            exit={shouldReduceMotion ? { opacity: 0, scale: 0.98 } : 'exit'}
            className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 shadow-2xl rounded-2xl p-6 sm:p-8 max-w-sm w-full mx-auto flex flex-col items-center justify-center text-center gap-4"
          >
            {/* Emerald Circular Spinner framing the Document Icon */}
            <div
              className="relative flex items-center justify-center w-16 h-16 shrink-0"
              aria-hidden="true"
            >
              <svg
                className="w-16 h-16 animate-spin motion-reduce:animate-none text-emerald-600 dark:text-emerald-500"
                viewBox="0 0 48 48"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  className="opacity-20"
                />
                <path
                  d="M24 4a20 20 0 0 1 20 20"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <FileText className="w-6 h-6 text-emerald-600 dark:text-emerald-400 motion-reduce:animate-none animate-pulse" />
              </div>
            </div>

            {/* Clear Primary & Supporting Messages */}
            <div className="flex flex-col items-center gap-1.5">
              <h3 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-slate-100 tracking-tight leading-snug">
                {title}
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-[280px]">
                {message}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
