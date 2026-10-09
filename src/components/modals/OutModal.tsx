'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserX, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { DismissalType } from '@/domain/cricket/types';
import {
  DISMISSAL_RULES,
  PRIMARY_DISMISSAL_TYPES,
  getDismissalRule,
  BatterPosition,
} from '@/domain/cricket/dismissals';
import { cleanPlayerName } from '@/domain/cricket/formatters';
import { MODAL_VARIANTS, BACKDROP_VARIANTS } from '@/lib/animations';

export interface OutConfirmPayload {
  dismissalType: DismissalType;
  isStrikerOut: boolean;
  fielderName?: string;
  newBatsmanName?: string;
  runsScored: number;
}

export interface OutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (payload: OutConfirmPayload) => void;
  strikerName?: string;
  nonStrikerName?: string;
  bowlerName?: string;
  defaultIncomingBatter?: string;
  initialRuns?: number;
  initialDismissalType?: DismissalType;
  isLastWicket?: boolean;
}

/**
 * Universal Reusable Out / Dismissal Modal Component
 *
 * Driven by centralized International Cricket rules (MCC Laws).
 * Automatically handles eligible batter detection:
 * - Single eligible batter (Bowled, Caught, LBW, Stumped, etc.): Auto-selects striker without showing selector.
 * - Multiple eligible batters (Run Out, Obstructing the Field, etc.): Shows compact striker/non-striker selector.
 * - Fielder field: Dynamically rendered based on dismissal rule configuration.
 */
export function OutModal({
  isOpen,
  onClose,
  onConfirm,
  strikerName = 'Striker',
  nonStrikerName = 'Non-Striker',
  bowlerName,
  defaultIncomingBatter,
  initialRuns = 0,
  initialDismissalType = 'Bowled',
  isLastWicket = false,
}: OutModalProps) {
  const [dismissalType, setDismissalType] = useState<DismissalType>(initialDismissalType);
  const [isStrikerOut, setIsStrikerOut] = useState<boolean>(true);
  const [fielderName, setFielderName] = useState<string>('');
  const [newBatsmanName, setNewBatsmanName] = useState<string>('');
  const [runsScored, setRunsScored] = useState<number>(initialRuns);

  // Sync state whenever modal opens or initial props change
  useEffect(() => {
    if (isOpen) {
      const initType = initialDismissalType || 'Bowled';
      setDismissalType(initType);

      const rule = getDismissalRule(initType);
      if (rule.eligibleBatters.length === 1) {
        setIsStrikerOut(rule.eligibleBatters[0] === 'striker');
      } else {
        setIsStrikerOut(true);
      }

      setFielderName('');
      setNewBatsmanName('');
      setRunsScored(initialRuns || 0);
    }
  }, [isOpen, initialDismissalType, initialRuns]);

  // Handle dismissal type selection & auto-assign eligible batter
  const handleDismissalChange = (newType: DismissalType) => {
    setDismissalType(newType);
    const rule = getDismissalRule(newType);

    if (rule.eligibleBatters.length === 1) {
      // Auto-select the only eligible batter position (no manual choice required)
      setIsStrikerOut(rule.eligibleBatters[0] === 'striker');
    } else {
      // If current selection is not among eligible, default to the first eligible position
      const currentRole: BatterPosition = isStrikerOut ? 'striker' : 'non_striker';
      if (!rule.eligibleBatters.includes(currentRole)) {
        setIsStrikerOut(rule.eligibleBatters[0] === 'striker');
      }
    }
  };

  const currentRule = getDismissalRule(dismissalType);
  const isMultiBatterEligible = currentRule.eligibleBatters.length > 1;

  const handleConfirm = () => {
    onConfirm({
      dismissalType,
      isStrikerOut,
      fielderName: currentRule.hasFielder ? fielderName.trim() || undefined : undefined,
      newBatsmanName: !isLastWicket ? newBatsmanName.trim() || undefined : undefined,
      runsScored,
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          variants={BACKDROP_VARIANTS}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
        >
          <motion.div
            variants={MODAL_VARIANTS}
            className="overflow-y-auto bg-[var(--card)] border border-[var(--border)] shadow-2xl max-w-md max-h-[90vh] rounded-2xl w-full p-5 space-y-4 text-sm"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center border border-red-500/20">
                  <UserX className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-[var(--foreground)]">Record Wicket</h3>
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    {currentRule.bowlerCredited
                      ? `Credited to bowler: ${cleanPlayerName(bowlerName) || 'Current Bowler'}`
                      : 'Field / Non-bowler dismissal'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close Out Modal"
                className="hover:bg-[var(--muted)] rounded-lg p-1.5 transition-colors text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5">
              {/* 1. Dismissal Type Selector */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-xs text-[var(--foreground)]">
                    Dismissal Type
                  </label>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                      currentRule.bowlerCredited
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20'
                    }`}
                  >
                    {currentRule.bowlerCredited ? 'Bowler Wicket' : 'Field Dismissal'}
                  </span>
                </div>
                <select
                  value={dismissalType}
                  onChange={(e) => handleDismissalChange(e.target.value as DismissalType)}
                  className="bg-[var(--muted)] border border-[var(--border)] font-bold px-3.5 py-2.5 rounded-xl w-full text-sm text-[var(--foreground)] focus:outline-none focus:border-red-500 transition-colors"
                >
                  {PRIMARY_DISMISSAL_TYPES.map((type) => (
                    <option key={type} value={type} className="bg-[var(--card)] text-[var(--foreground)]">
                      {DISMISSAL_RULES[type]?.label || type}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-[var(--muted-foreground)] leading-tight">
                  {currentRule.description}
                </p>
              </div>

              {/* 2. Batter Out Selection: Config-Driven UI */}
              {isMultiBatterEligible ? (
                /* Multiple batters eligible (e.g. Run Out, Obstructing the Field, Retired Out) -> Compact Selector */
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-xs text-[var(--foreground)]">
                      Who is Out? <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] text-amber-500 font-medium">Select batter</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setIsStrikerOut(true)}
                      className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 min-h-[46px] select-none ${
                        isStrikerOut
                          ? 'bg-red-600 text-white border-red-600 shadow-sm shadow-red-600/30'
                          : 'bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)] hover:border-red-500/40'
                      }`}
                    >
                      <span className="text-[10px] uppercase tracking-wider opacity-80">Striker</span>
                      <span className="font-extrabold truncate max-w-full">
                        {cleanPlayerName(strikerName) || 'Striker'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsStrikerOut(false)}
                      className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 min-h-[46px] select-none ${
                        !isStrikerOut
                          ? 'bg-red-600 text-white border-red-600 shadow-sm shadow-red-600/30'
                          : 'bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)] hover:border-red-500/40'
                      }`}
                    >
                      <span className="text-[10px] uppercase tracking-wider opacity-80">Non-Striker</span>
                      <span className="font-extrabold truncate max-w-full">
                        {cleanPlayerName(nonStrikerName) || 'Non-Striker'}
                      </span>
                    </button>
                  </div>

                  {dismissalType === 'Run Out' && !isStrikerOut && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                      Non-Striker&apos;s end run out (covers backing-up / Mankad).
                    </p>
                  )}
                </div>
              ) : (
                /* Exactly one batter eligible (Bowled, Caught, LBW, Stumped, Hit Wicket, Hit Ball Twice) */
                /* Auto-selected: No extra selection shown! Compact summary pill instead. */
                <div className="flex items-center justify-between px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-xs">
                  <span className="text-[var(--muted-foreground)] font-medium">Batter Out:</span>
                  <span className="font-extrabold text-red-600 dark:text-red-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    Striker: {cleanPlayerName(strikerName) || 'Striker'} (Auto-selected)
                  </span>
                </div>
              )}

              {/* 3. Fielder Input (Rendered ONLY if rule requires a fielder) */}
              {currentRule.hasFielder && (
                <div className="space-y-1">
                  <label className="font-semibold text-xs text-[var(--foreground)]">
                    {currentRule.fielderLabel || 'Fielder Name'}
                  </label>
                  <input
                    type="text"
                    value={fielderName}
                    onChange={(e) => setFielderName(e.target.value)}
                    placeholder={currentRule.fielderPlaceholder || 'e.g. Fielder Name (Optional)'}
                    className="bg-[var(--muted)] border border-[var(--border)] font-medium px-3.5 py-2.5 rounded-xl w-full text-sm text-[var(--foreground)] focus:outline-none focus:border-red-500 transition-colors"
                  />
                </div>
              )}

              {/* 4. Runs Completed on Delivery (For Run Out / Obstructing the Field) */}
              {(dismissalType === 'Run Out' || dismissalType === 'Obstructing the Field') && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-[var(--foreground)]">
                      Runs Completed on this Ball
                    </label>
                    <span className="font-extrabold text-emerald-600">
                      {runsScored} run{runsScored === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[0, 1, 2, 3].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRunsScored(r)}
                        className={`py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                          runsScored === r
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)] hover:bg-[var(--muted)]/80 hover:text-[var(--foreground)]'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 5. Incoming Batter Input */}
              {!isLastWicket ? (
                <div className="space-y-1">
                  <label className="font-semibold text-xs text-[var(--foreground)]">
                    Incoming Batter
                  </label>
                  <input
                    type="text"
                    value={newBatsmanName}
                    onChange={(e) => setNewBatsmanName(e.target.value)}
                    placeholder={defaultIncomingBatter || 'Next Batsman'}
                    className="bg-[var(--muted)] border border-[var(--border)] font-medium px-3.5 py-2.5 rounded-xl w-full text-sm text-[var(--foreground)] focus:outline-none focus:border-red-500 transition-colors"
                  />
                </div>
              ) : (
                <div className="px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  All Out: Last wicket of innings. No incoming batter required.
                </div>
              )}
            </div>

            {/* Confirm Action Button */}
            <button
              type="button"
              onClick={handleConfirm}
              className="bg-red-600 hover:bg-red-500 text-white font-extrabold shadow-lg shadow-red-600/30 rounded-xl text-sm min-h-btn w-full py-3 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              Confirm Wicket ({dismissalType})
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
