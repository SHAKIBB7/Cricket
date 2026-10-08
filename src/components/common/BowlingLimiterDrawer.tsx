'use client';

import React, { useState } from 'react';
import { ChevronDown, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BowlingLimitMode } from '@/domain/cricket/bowling-limiter/BowlingLimiter';

export interface BowlingLimiterDrawerProps {
  overs: number;
  bowlingLimitMode: BowlingLimitMode;
  onBowlingLimitModeChange: (mode: BowlingLimitMode) => void;
  customOverLimit: number;
  onCustomOverLimitChange: (limit: number) => void;
  effectiveMaxOvers: number;
  isUnder10Overs: boolean;
  defaultExpanded?: boolean;
  isExpanded?: boolean;
  onToggle?: () => void;
}

export function BowlingLimiterDrawer({
  overs,
  bowlingLimitMode,
  onBowlingLimitModeChange,
  customOverLimit,
  onCustomOverLimitChange,
  effectiveMaxOvers,
  isUnder10Overs,
  defaultExpanded = false,
  isExpanded: controlledExpanded,
  onToggle,
}: BowlingLimiterDrawerProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;

  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalExpanded(!internalExpanded);
    }
  };

  const statusLabel = isUnder10Overs
    ? '4 Overs/Bowler'
    : bowlingLimitMode === 'international'
    ? `${effectiveMaxOvers} Overs/Bowler`
    : bowlingLimitMode === 'default'
    ? '4 Overs/Bowler'
    : `${customOverLimit} Overs/Bowler`;

  return (
    <div className="floating-card overflow-hidden">
      {/* ── COMPACT HEADER ROW (DEFAULT COLLAPSED STATE) ── */}
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center justify-between font-bold hover:bg-[var(--muted)]/50 transition-colors p-3 sm:px-3.5 sm:py-2.5 text-body-small min-h-[42px] w-full text-left select-none"
        aria-expanded={isExpanded}
        data-testid="bowling-limiter-toggle"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm select-none shrink-0 leading-none">⚾</span>
          <span className="font-bold text-body-small text-[var(--foreground)] truncate">
            Bowling Limiter
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className="text-caption font-semibold text-[var(--muted-foreground)]"
            data-testid="bowling-limiter-status"
          >
            {statusLabel}
          </span>
          <ChevronDown
            className={`w-4 h-4 text-[var(--muted-foreground)] transition-transform duration-200 ease-out ${
              isExpanded ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>

      {/* ── SMOOTH ACCORDION DRAWER ── */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="bowling-limiter-drawer-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="overflow-hidden"
            data-testid="bowling-limiter-drawer-content"
          >
            <div className="border-t border-[var(--border)] px-3.5 py-3 space-y-2.5 text-body-small bg-[var(--muted)]/20">
              {isUnder10Overs ? (
                /* UNDER 10 OVERS EXPANDED STATE */
                <div className="space-y-2" data-testid="bowling-limiter-under-10-section">
                  <div className="flex items-center justify-between text-body-small">
                    <span className="text-[var(--muted-foreground)] text-caption">Match Overs</span>
                    <span className="font-bold text-[var(--foreground)]" data-testid="bowling-limiter-match-overs">
                      {overs} Overs
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-body-small">
                    <span className="text-[var(--muted-foreground)] text-caption">Rule</span>
                    <span className="font-bold text-[var(--foreground)]">Default</span>
                  </div>
                  <div className="flex items-center justify-between text-body-small">
                    <span className="text-[var(--muted-foreground)] text-caption">Maximum / Bowler</span>
                    <span className="font-extrabold text-emerald-600 dark:text-emerald-400" data-testid="bowling-limiter-max-display">
                      4 Overs
                    </span>
                  </div>
                  <div className="pt-0.5">
                    <div
                      className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 rounded-lg"
                      data-testid="bowling-limiter-auto-applied"
                    >
                      <Lock className="w-3.5 h-3.5 shrink-0" />
                      <span>Automatically applied</span>
                    </div>
                  </div>
                </div>
              ) : (
                /* 10+ OVERS EXPANDED STATE */
                <div className="space-y-2.5" data-testid="bowling-limiter-10-plus-section">
                  <div className="flex items-center justify-between text-body-small">
                    <span className="text-[var(--muted-foreground)] text-caption">Match Overs</span>
                    <span className="font-bold text-[var(--foreground)]" data-testid="bowling-limiter-match-overs">
                      {overs} Overs
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3 text-body-small">
                    <span className="text-[var(--muted-foreground)] text-caption shrink-0">Limit Mode</span>
                    <div className="relative">
                      <select
                        value={bowlingLimitMode}
                        onChange={(e) => onBowlingLimitModeChange(e.target.value as BowlingLimitMode)}
                        className="appearance-none bg-[var(--card)] hover:bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] font-bold text-caption rounded-lg pl-3 pr-7 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer text-right sm:text-left"
                        data-testid="bowling-limiter-mode-select"
                      >
                        <option value="international">International Rule</option>
                        <option value="default">Default Rule</option>
                        <option value="custom">Custom Rule</option>
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-[var(--muted-foreground)] pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 text-body-small">
                    <span className="text-[var(--muted-foreground)] text-caption shrink-0">Maximum / Bowler</span>
                    {bowlingLimitMode === 'custom' ? (
                      <div className="relative">
                        <select
                          value={customOverLimit}
                          onChange={(e) => onCustomOverLimitChange(Number(e.target.value))}
                          className="appearance-none bg-[var(--card)] hover:bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] font-bold text-caption rounded-lg pl-3 pr-7 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer text-right"
                          data-testid="bowling-limiter-custom-select"
                        >
                          {Array.from({ length: Math.min(overs, 50) }, (_, i) => i + 1).map((val) => (
                            <option key={val} value={val}>
                              {val} {val === 1 ? 'Over' : 'Overs'}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-[var(--muted-foreground)] pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
                      </div>
                    ) : (
                      <span
                        className="font-extrabold text-emerald-600 dark:text-emerald-400 text-caption"
                        data-testid="bowling-limiter-max-display"
                      >
                        {bowlingLimitMode === 'international' ? 'Auto' : `${effectiveMaxOvers} Overs`}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
