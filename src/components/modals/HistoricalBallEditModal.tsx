'use client';

import React, { useState, useEffect } from 'react';
import { X, Edit3, AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react';
import { DomainEvent, BallInput, DismissalType } from '@/domain/cricket/types';
import { PRIMARY_DISMISSAL_TYPES } from '@/domain/cricket/dismissals';
import { CompactDropdown } from '@/components/common/CompactDropdown';
import { UnifiedModal } from '@/components/overlay/UnifiedModal';
import { useLanguage } from '@/context/LanguageContext';

export interface HistoricalBallEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  ballEvent: DomainEvent | null;
  ballIndex: number;
  inningsNumber: number;
  onSave: (ballIndex: number, inningsNumber: number, updatedInput: BallInput) => void;
}

export function HistoricalBallEditModal({
  isOpen,
  onClose,
  ballEvent,
  ballIndex,
  inningsNumber,
  onSave,
}: HistoricalBallEditModalProps) {
  const { t } = useLanguage();
  const [runsScored, setRunsScored] = useState(0);
  const [deliveryType, setDeliveryType] = useState<'legal' | 'wide' | 'no_ball' | 'byes' | 'leg_byes'>('legal');
  const [isWicket, setIsWicket] = useState(false);
  const [dismissalType, setDismissalType] = useState<DismissalType>('Bowled');
  const [isStrikerOut, setIsStrikerOut] = useState(true);
  const [fielderName, setFielderName] = useState('');
  const [newBatsmanName, setNewBatsmanName] = useState('');

  // Pre-fill state when ballEvent changes
  useEffect(() => {
    if (!ballEvent || !ballEvent.payload) return;
    const p = ballEvent.payload;
    setRunsScored(p.runsScored ?? 0);

    if (p.isWide) setDeliveryType('wide');
    else if (p.isNoBall) setDeliveryType('no_ball');
    else if (p.isByes) setDeliveryType('byes');
    else if (p.isLegByes) setDeliveryType('leg_byes');
    else setDeliveryType('legal');

    setIsWicket(!!p.isWicket);
    setDismissalType(p.dismissalType || 'Bowled');
    setIsStrikerOut(p.isStrikerOut !== false);
    setFielderName(p.fielderName || '');
    setNewBatsmanName(p.newBatsmanName || '');
  }, [ballEvent]);

  const p = ballEvent?.payload || {};
  const overNumber = p.overNumber ?? 1;
  const ballNumber = p.ballNumber ?? (ballIndex + 1);

  const handleSave = () => {
    const updatedInput: BallInput = {
      runsScored,
      isWide: deliveryType === 'wide',
      isNoBall: deliveryType === 'no_ball',
      isByes: deliveryType === 'byes',
      isLegByes: deliveryType === 'leg_byes',
      isWicket,
      dismissalType: isWicket ? dismissalType : undefined,
      fielderName: isWicket && fielderName.trim() ? fielderName.trim() : undefined,
      newBatsmanName: isWicket && newBatsmanName.trim() ? newBatsmanName.trim() : undefined,
      isStrikerOut,
    };

    onSave(ballIndex, inningsNumber, updatedInput);
    onClose();
  };

  return (
    <UnifiedModal
      open={isOpen && !!ballEvent}
      onClose={onClose}
      overlayId="historical-ball-edit-modal"
      ariaLabel={t('hbe_edit_delivery', 'Edit delivery')}
      className="max-w-md p-4 sm:p-5 space-y-4"
    >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <div className="flex items-center gap-2.5">
              <div className="bg-emerald-500/15 border border-emerald-500/30 p-2 rounded-xl text-emerald-600 dark:text-emerald-400">
                <Edit3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base leading-tight">
                  {`${t('hbe_title_pre', 'Edit Delivery: Over')} ${overNumber}.${ballNumber}`}
                </h3>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {`${t('hbe_sub_pre', 'Innings')} ${inningsNumber} ${t('hbe_sub_mid', '• Ball #')}${ballIndex + 1}`}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              aria-label={t('hbe_close', 'Close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Notice Alert */}
          <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-2.5 flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="leading-snug">
              {t('hbe_notice', 'Deterministic Replay: Editing this delivery will recompute all subsequent overs, partnerships, bowler figures, and match totals.')}
            </p>
          </div>

          {/* Runs Scored Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--foreground)] block">
              {t('hbe_runs_scored', 'Runs Scored')}
            </label>
            <div className="grid grid-cols-7 gap-1">
              {[0, 1, 2, 3, 4, 5, 6].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setRunsScored(num)}
                  className={`py-2 rounded-xl font-black text-sm transition-all active:scale-95 ${
                    runsScored === num
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-xs scale-105'
                      : 'bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--border)]'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Delivery Type Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--foreground)] block">
              {t('delivery_type', 'Delivery Type')}
            </label>
            <div className="grid grid-cols-3 gap-1 text-xs">
              {[
                { id: 'legal', label: t('hbe_legal', 'Legal Ball') },
                { id: 'wide', label: t('hbe_wide', 'Wide (Wd)') },
                { id: 'no_ball', label: t('hbe_no_ball', 'No Ball (Nb)') },
                { id: 'byes', label: t('hbe_byes', 'Byes (B)') },
                { id: 'leg_byes', label: t('hbe_leg_byes', 'Leg Byes (LB)') },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setDeliveryType(item.id as 'legal' | 'wide' | 'no_ball' | 'byes' | 'leg_byes')}
                  className={`py-2 px-1 rounded-xl font-bold transition-all truncate text-center ${
                    deliveryType === item.id
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-xs'
                      : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Wicket Section */}
          <div className="space-y-2 border-t border-[var(--border)] pt-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[var(--foreground)] flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isWicket}
                  onChange={(e) => setIsWicket(e.target.checked)}
                  className="rounded w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                />
                <span>{t('hbe_wicket_delivery', 'Wicket on this delivery')}</span>
              </label>
              {isWicket && (
                <span className="text-[11px] font-bold text-red-500 uppercase tracking-wider">
                  {t('hbe_out', 'OUT')}
                </span>
              )}
            </div>

            {isWicket && (
              <div className="space-y-2.5 bg-muted/40 p-3 rounded-xl border border-red-500/20 text-xs">
                {/* Dismissal Type */}
                <div>
                  <label className="font-semibold text-[var(--muted-foreground)] block mb-1">
                    {t('hbe_dismissal_type', 'Dismissal Type')}
                  </label>
                  <CompactDropdown
                    value={dismissalType}
                    options={PRIMARY_DISMISSAL_TYPES.map((d) => ({ value: d, label: d }))}
                    onChange={(val) => setDismissalType(val as DismissalType)}
                    size="sm"
                    testId="historical-dismissal-dropdown"
                  />
                </div>

                {/* Who was out */}
                <div className="flex items-center gap-2">
                  <label className="font-semibold text-[var(--muted-foreground)] shrink-0">
                    {t('hbe_out_batter', 'Out Batter:')}
                  </label>
                  <div className="flex items-center gap-1.5 flex-1">
                    <button
                      type="button"
                      onClick={() => setIsStrikerOut(true)}
                      className={`flex-1 py-1 px-2 rounded-lg font-bold text-center ${
                        isStrikerOut
                          ? 'bg-red-600 text-white shadow-xs'
                          : 'bg-[var(--card)] border border-[var(--border)] text-[var(--muted-foreground)]'
                      }`}
                    >
                      {t('striker', 'Striker')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsStrikerOut(false)}
                      className={`flex-1 py-1 px-2 rounded-lg font-bold text-center ${
                        !isStrikerOut
                          ? 'bg-red-600 text-white shadow-xs'
                          : 'bg-[var(--card)] border border-[var(--border)] text-[var(--muted-foreground)]'
                      }`}
                    >
                      {t('non_striker', 'Non-Striker')}
                    </button>
                  </div>
                </div>

                {/* Fielder Name */}
                {['Caught', 'Run Out', 'Stumped'].includes(dismissalType) && (
                  <div>
                    <label className="font-semibold text-[var(--muted-foreground)] block mb-1">
                      {t('hbe_fielder_name', 'Fielder Name')}
                    </label>
                    <input
                      type="text"
                      value={fielderName}
                      onChange={(e) => setFielderName(e.target.value)}
                      placeholder={t('hbe_fielder_ph', 'Enter fielder name...')}
                      className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg p-2 font-medium text-xs"
                    />
                  </div>
                )}

                {/* Incoming Batter Name */}
                <div>
                  <label className="font-semibold text-[var(--muted-foreground)] block mb-1">
                    {t('hbe_new_batter', 'New Batter Name')}
                  </label>
                  <input
                    type="text"
                    value={newBatsmanName}
                    onChange={(e) => setNewBatsmanName(e.target.value)}
                    placeholder={t('hbe_new_batter_ph', 'Enter incoming batter name...')}
                    className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg p-2 font-medium text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--muted)] hover:bg-[var(--border)] font-bold text-xs text-[var(--foreground)] transition-colors active:scale-95"
            >
              {t('cancel', 'Cancel')}
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="flex-1 py-2.5 rounded-xl bg-[var(--primary)] hover:opacity-90 font-extrabold text-xs text-[var(--primary-foreground)] shadow-md shadow-emerald-600/30 transition-transform active:scale-95 flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{t('hbe_save_replay', 'Save & Replay')}</span>
            </button>
          </div>
    </UnifiedModal>
  );
}
