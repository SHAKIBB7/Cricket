'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserX, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { DismissalType } from '@/domain/cricket/types';
import {
  DISMISSAL_RULES,
  PRIMARY_DISMISSAL_TYPES,
  getDismissalRule,
  isAllowedOnNoBall,
  isAllowedOnWide,
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
  isNoBall?: boolean;
  isFreeHit?: boolean;
  isWide?: boolean;
}

/**
 * Universal Reusable Out / Dismissal Modal Component
 *
 * Driven by centralized International Cricket rules (MCC Laws).
 * Automatically handles eligible batter detection:
 * - Single eligible batter (Bowled, Caught, LBW, Stumped, etc.): Auto-selects striker without showing selector.
 * - Multiple eligible batters (Run Out, Obstructing the Field, etc.): Shows compact striker/non-striker selector.
 * - Fielder field: Dynamically rendered based on dismissal rule configuration.
 * - Enforces Law 21.18 (No-Ball / Free Hit restrictions) & Law 22.17 (Wide restrictions).
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
  isNoBall = false,
  isFreeHit = false,
  isWide = false,
}: OutModalProps) {
  const allowedDismissalTypes = PRIMARY_DISMISSAL_TYPES.filter((type) => {
    if (isNoBall || isFreeHit) {
      return isAllowedOnNoBall(type);
    }
    if (isWide) {
      return isAllowedOnWide(type);
    }
    return true;
  });

  const [dismissalType, setDismissalType] = useState<DismissalType>(initialDismissalType);
  const [isStrikerOut, setIsStrikerOut] = useState<boolean>(true);
  const [fielderName, setFielderName] = useState<string>('');
  const [newBatsmanName, setNewBatsmanName] = useState<string>('');
  const [runsScored, setRunsScored] = useState<number>(initialRuns);

  // Sync state whenever modal opens or initial props change
  useEffect(() => {
    if (isOpen) {
      const candidates = PRIMARY_DISMISSAL_TYPES.filter((t) => {
        if (isNoBall || isFreeHit) return isAllowedOnNoBall(t);
        if (isWide) return isAllowedOnWide(t);
        return true;
      });
      const initType = candidates.includes(initialDismissalType)
        ? initialDismissalType
        : candidates[0] || 'Run Out';
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
  }, [isOpen, initialDismissalType, initialRuns, isNoBall, isFreeHit, isWide]);

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
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <motion.div
            variants={MODAL_VARIANTS}
            className="overflow-y-auto bg-[var(--card)] border border-[var(--border)] shadow-floating-lg max-w-md max-h-[90vh] rounded-2xl w-full p-5 space-y-4 text-sm text-[var(--foreground)]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center border border-red-500/20 shrink-0">
                  <UserX className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base tracking-tight text-[var(--foreground)]">Record Wicket</h3>
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
                className="btn-icon rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5">
              {/* Delivery Rule Alert Banners */}
              {(isNoBall || isFreeHit) && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-semibold">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>
                    {isFreeHit ? 'Free Hit delivery:' : 'No-Ball delivery:'} Only Run Out, Obstructing the Field, and Hit the Ball Twice are permitted (Law 21.18).
                  </span>
                </div>
              )}
              {isWide && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-semibold">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>
                    Wide delivery: Bowled, Caught, and LBW are prohibited (Law 22.17).
                  </span>
                </div>
              )}

              {/* 1. Dismissal Type Selector */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-xs text-[var(--foreground)]">
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
                  className="w-full bg-[var(--muted)]/60 hover:bg-[var(--muted)] focus:bg-[var(--card)] border border-[var(--border)] font-bold px-3.5 py-2.5 rounded-xl text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-red-500/25 focus:border-red-500 transition-all"
                >
                  {allowedDismissalTypes.map((type) => (
                    <option key={type} value={type} className="bg-[var(--card)] text-[var(--foreground)]">
                      {DISMISSAL_RULES[type]?.label || type}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-[var(--muted-foreground)] leading-tight pt-0.5">
                  {currentRule.description}
                </p>
              </div>

              {/* 2. Batter Out Selection: Config-Driven UI */}
              {isMultiBatterEligible ? (
                /* Multiple batters eligible (e.g. Run Out, Obstructing the Field, Retired Out) -> Compact Selector */
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-bold text-xs text-[var(--foreground)]">
                      Who is Out? <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] text-amber-500 font-semibold">Select batter</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setIsStrikerOut(true)}
                      className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 min-h-[48px] select-none active:scale-[0.98] ${
                        isStrikerOut
                          ? 'bg-red-600 text-white border-red-600 shadow-xs'
                          : 'bg-[var(--muted)]/80 text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)] hover:border-red-500/40'
                      }`}
                    >
                      <span className="text-[10px] uppercase tracking-wider opacity-80 font-bold">Striker</span>
                      <span className="font-extrabold truncate max-w-full">
                        {cleanPlayerName(strikerName) || 'Striker'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsStrikerOut(false)}
                      className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 min-h-[48px] select-none active:scale-[0.98] ${
                        !isStrikerOut
                          ? 'bg-red-600 text-white border-red-600 shadow-xs'
                          : 'bg-[var(--muted)]/80 text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)] hover:border-red-500/40'
                      }`}
                    >
                      <span className="text-[10px] uppercase tracking-wider opacity-80 font-bold">Non-Striker</span>
                      <span className="font-extrabold truncate max-w-full">
                        {cleanPlayerName(nonStrikerName) || 'Non-Striker'}
                      </span>
                    </button>
                  </div>

                  {dismissalType === 'Run Out' && !isStrikerOut && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1 pt-0.5">
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                      Non-Striker&apos;s end run out (covers backing-up / Mankad).
                    </p>
                  )}
                </div>
              ) : (
                /* Exactly one batter eligible (Bowled, Caught, LBW, Stumped, Hit Wicket, Hit Ball Twice) */
                /* Auto-selected: No extra selection shown! Compact summary pill instead. */
                <div className="flex items-center justify-between px-3.5 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs">
                  <span className="text-[var(--muted-foreground)] font-medium">Batter Out:</span>
                  <span className="font-extrabold text-red-600 dark:text-red-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                    Striker: {cleanPlayerName(strikerName) || 'Striker'} (Auto-selected)
                  </span>
                </div>
              )}

              {/* 3. Fielder Input (Rendered ONLY if rule requires a fielder) */}
              {currentRule.hasFielder && (
                <div className="space-y-1">
                  <label className="font-bold text-xs text-[var(--foreground)]">
                    {currentRule.fielderLabel || 'Fielder Name'}
                  </label>
                  <input
                    type="text"
                    value={fielderName}
                    onChange={(e) => setFielderName(e.target.value)}
                    placeholder={currentRule.fielderPlaceholder || 'e.g. Fielder Name (Optional)'}
                    className="input-field focus:ring-red-500/25 focus:border-red-500"
                  />
                </div>
              )}

              {/* 4. Runs Completed on Delivery (For Run Out / Obstructing the Field) */}
              {(dismissalType === 'Run Out' || dismissalType === 'Obstructing the Field') && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-bold text-[var(--foreground)]">
                      Runs Completed on this Ball
                    </label>
                    <span className="font-black text-emerald-600 dark:text-emerald-400">
                      {runsScored} run{runsScored === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[0, 1, 2, 3].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRunsScored(r)}
                        className={`py-2 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                          runsScored === r
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-black'
                            : 'bg-[var(--muted)]/80 text-[var(--muted-foreground)] border-[var(--border)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]'
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
                  <label className="font-bold text-xs text-[var(--foreground)]">
                    Incoming Batter
                  </label>
                  <input
                    type="text"
                    value={newBatsmanName}
                    onChange={(e) => setNewBatsmanName(e.target.value)}
                    placeholder={defaultIncomingBatter || 'Next Batsman'}
                    className="input-field focus:ring-red-500/25 focus:border-red-500"
                  />
                </div>
              ) : (
                <div className="px-3.5 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  All Out: Last wicket of innings. No incoming batter required.
                </div>
              )}
            </div>

            {/* Confirm Action Button */}
            <button
              type="button"
              onClick={handleConfirm}
              className="btn-danger w-full py-3.5 text-sm min-h-btn active:scale-[0.98] shadow-sm font-black"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Confirm Wicket ({dismissalType})
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
