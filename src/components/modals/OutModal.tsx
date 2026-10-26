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
import { CompactDropdown } from '@/components/common/CompactDropdown';
import { WicketLottieAnimation } from '@/components/scoring/WicketLottieAnimation';

export interface OutConfirmPayload {
  dismissalType: DismissalType;
  isStrikerOut: boolean;
  fielderName?: string;
  newBatsmanName?: string;
  runsScored: number;
  isWide?: boolean;
  isNoBall?: boolean;
  isByes?: boolean;
  isLegByes?: boolean;
}

export interface OutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (payload: OutConfirmPayload) => void;
  strikerName?: string;
  nonStrikerName?: string;
  bowlerName?: string;
  defaultIncomingBatter?: string;
  availableSquadMembers?: string[];
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
  availableSquadMembers,
}: OutModalProps) {
  const [deliveryType, setDeliveryType] = useState<'normal' | 'wide' | 'no_ball'>(() => {
    if (isWide) return 'wide';
    if (isNoBall || isFreeHit) return 'no_ball';
    return 'normal';
  });

  const effectiveIsNoBall = deliveryType === 'no_ball' || isNoBall || isFreeHit;
  const effectiveIsWide = deliveryType === 'wide' || isWide;

  const allowedDismissalTypes = PRIMARY_DISMISSAL_TYPES.filter((type) => {
    if (effectiveIsNoBall) {
      return isAllowedOnNoBall(type);
    }
    if (effectiveIsWide) {
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
      const initDeliv = isWide ? 'wide' : (isNoBall || isFreeHit ? 'no_ball' : 'normal');
      setDeliveryType(initDeliv);

      const isNb = initDeliv === 'no_ball';
      const isWd = initDeliv === 'wide';

      const candidates = PRIMARY_DISMISSAL_TYPES.filter((t) => {
        if (isNb) return isAllowedOnNoBall(t);
        if (isWd) return isAllowedOnWide(t);
        return true;
      });

      const initType = candidates.includes(initialDismissalType)
        ? initialDismissalType
        : (isWd ? 'Stumped' : (candidates[0] || 'Run Out'));
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

  const handleDeliveryTypeChange = (newDeliv: 'normal' | 'wide' | 'no_ball') => {
    setDeliveryType(newDeliv);
    const isNb = newDeliv === 'no_ball' || isFreeHit;
    const isWd = newDeliv === 'wide';

    const candidates = PRIMARY_DISMISSAL_TYPES.filter((t) => {
      if (isNb) return isAllowedOnNoBall(t);
      if (isWd) return isAllowedOnWide(t);
      return true;
    });

    if (!candidates.includes(dismissalType)) {
      const fallback = isWd ? 'Stumped' : (candidates[0] || 'Run Out');
      handleDismissalChange(fallback);
    }
  };

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
      isWide: deliveryType === 'wide' || isWide,
      isNoBall: deliveryType === 'no_ball' || isNoBall,
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
          className="fixed inset-0 !m-0 bg-slate-950/70 backdrop-blur-sm z-50 overflow-y-auto overscroll-contain flex justify-center items-start sm:items-center p-2.5 sm:p-4 min-h-full touch-pan-y"
          style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorY: 'contain' }}
        >
          <motion.div
            variants={MODAL_VARIANTS}
            className="overflow-hidden bg-[var(--card)] border border-[var(--border)] shadow-floating-lg max-w-md rounded-2xl w-full flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[90vh] text-sm text-[var(--foreground)] my-auto animate-scale-in"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 sm:px-5 py-3 shrink-0 bg-[var(--card)]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center border border-red-500/20 shrink-0 overflow-hidden">
                  <WicketLottieAnimation size="xs" />
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

            <div
              className="overflow-y-auto overscroll-contain flex-1 min-h-0 px-4 sm:px-5 py-3.5 space-y-3.5 touch-pan-y"
              style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorY: 'contain' }}
            >
              {/* Delivery Rule Alert Banners */}
              {(isNoBall || isFreeHit || deliveryType === 'no_ball') && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-semibold">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>
                    {isFreeHit ? 'Free Hit delivery:' : 'No-Ball delivery:'} Only Run Out, Obstructing the Field, and Hit the Ball Twice are permitted (Law 21.18).
                  </span>
                </div>
              )}
              {(isWide || deliveryType === 'wide') && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-semibold">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>
                    Wide delivery: Bowled, Caught, and LBW are prohibited (Law 22.17). Stumped and Run Out are allowed.
                  </span>
                </div>
              )}

              {/* Delivery Type Selector */}
              <div className="space-y-1">
                <label className="font-bold text-xs text-[var(--foreground)]">
                  Delivery Type
                </label>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-[var(--muted)]/50 rounded-xl border border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => handleDeliveryTypeChange('normal')}
                    disabled={isFreeHit}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all ${
                      deliveryType === 'normal'
                        ? 'bg-[var(--card)] text-[var(--foreground)] shadow-xs font-black'
                        : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    Legal Ball
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeliveryTypeChange('wide')}
                    disabled={isFreeHit}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all ${
                      deliveryType === 'wide'
                        ? 'bg-amber-500 text-white shadow-xs font-black'
                        : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    Wide Ball
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeliveryTypeChange('no_ball')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all ${
                      deliveryType === 'no_ball'
                        ? 'bg-red-500 text-white shadow-xs font-black'
                        : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    No Ball
                  </button>
                </div>
              </div>

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
                <CompactDropdown
                  value={dismissalType}
                  options={allowedDismissalTypes.map((type) => ({
                    value: type,
                    label: DISMISSAL_RULES[type]?.label || type,
                    badge: DISMISSAL_RULES[type]?.bowlerCredited ? 'Bowler Wicket' : undefined,
                  }))}
                  onChange={(val) => handleDismissalChange(val as DismissalType)}
                  size="md"
                  testId="dismissal-type-dropdown"
                />
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

              {/* 5. Incoming Batter Input with Available Squad Members Chips */}
              {!isLastWicket ? (
                <div className="space-y-1.5">
                  <label className="font-bold text-xs text-[var(--foreground)]">
                    Incoming Batter
                  </label>
                  {availableSquadMembers && availableSquadMembers.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] text-[var(--muted-foreground)]">Select from squad:</span>
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 bg-[var(--muted)]/40 rounded-xl border border-[var(--border)]">
                        {availableSquadMembers.map((member) => (
                          <button
                            key={member}
                            type="button"
                            onClick={() => setNewBatsmanName(member)}
                            className={`text-xs px-2.5 py-1 rounded-lg border transition-all active:scale-95 ${
                              newBatsmanName === member
                                ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-xs'
                                : 'bg-[var(--card)] border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)]'
                            }`}
                          >
                            {member}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <CompactDropdown
                    value={newBatsmanName}
                    options={(availableSquadMembers || []).map((m) => ({
                      value: m,
                      label: m,
                      badge: 'Squad Player',
                    }))}
                    onChange={(val) => setNewBatsmanName(String(val))}
                    allowCustomInput
                    placeholder={defaultIncomingBatter || 'Next Batsman'}
                    inputPlaceholder={defaultIncomingBatter || 'Next Batsman'}
                    size="sm"
                    emptyMessage="Type batter name or pick from squad."
                    testId="incoming-batter-dropdown"
                  />
                </div>
              ) : (
                <div className="px-3.5 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  All Out: Last wicket of innings. No incoming batter required.
                </div>
              )}
            </div>

            {/* Confirm Action Button Sticky Footer */}
            <div className="border-t border-[var(--border)] bg-[var(--card)] px-4 sm:px-5 py-3 shrink-0 pb-safe">
              <button
                type="button"
                onClick={handleConfirm}
                className="btn-danger w-full py-3 text-sm min-h-btn active:scale-[0.98] shadow-sm font-black flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Confirm Wicket ({dismissalType})</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
