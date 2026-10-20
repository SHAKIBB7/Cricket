'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Edit3, AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react';
import { DomainEvent, BallInput, DismissalType } from '@/domain/cricket/types';
import { PRIMARY_DISMISSAL_TYPES } from '@/domain/cricket/dismissals';
import { MODAL_VARIANTS, BACKDROP_VARIANTS } from '@/lib/animations';
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
  const { language } = useLanguage();
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

  if (!isOpen || !ballEvent) return null;

  const p = ballEvent.payload || {};
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
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          variants={BACKDROP_VARIANTS}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={onClose}
          className="fixed inset-0 bg-black/65 backdrop-blur-xs"
        />

        {/* Modal Window */}
        <motion.div
          variants={MODAL_VARIANTS}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="relative bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-md p-4 sm:p-5 z-10 text-[var(--foreground)] space-y-4 max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <div className="flex items-center gap-2.5">
              <div className="bg-emerald-500/15 border border-emerald-500/30 p-2 rounded-xl text-emerald-600 dark:text-emerald-400">
                <Edit3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base leading-tight">
                  {language === 'bn' ? `ডেলিভারি সংশোধন: ওভার ${overNumber}.${ballNumber}` : `Edit Delivery: Over ${overNumber}.${ballNumber}`}
                </h3>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {language === 'bn' ? `ইনিংস ${inningsNumber} • বল নম্বর #${ballIndex + 1}` : `Innings ${inningsNumber} • Ball #${ballIndex + 1}`}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Notice Alert */}
          <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-2.5 flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="leading-snug">
              {language === 'bn'
                ? 'এই ডেলিভারিটি পরিবর্তন করলে পরবর্তী সব রান, উইকেট, ওভার এবং পার্টনারশিপ স্বয়ংক্রিয়ভাবে পুনর্গণনা করা হবে।'
                : 'Deterministic Replay: Editing this delivery will recompute all subsequent overs, partnerships, bowler figures, and match totals.'}
            </p>
          </div>

          {/* Runs Scored Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--foreground)] block">
              {language === 'bn' ? 'রান সংখ্যা' : 'Runs Scored'}
            </label>
            <div className="grid grid-cols-7 gap-1">
              {[0, 1, 2, 3, 4, 5, 6].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setRunsScored(num)}
                  className={`py-2 rounded-xl font-black text-sm transition-all active:scale-95 ${
                    runsScored === num
                      ? 'bg-emerald-600 text-white shadow-xs scale-105'
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
              {language === 'bn' ? 'ডেলিভারির ধরন' : 'Delivery Type'}
            </label>
            <div className="grid grid-cols-3 gap-1 text-xs">
              {[
                { id: 'legal', label: language === 'bn' ? 'সাধারণ বল' : 'Legal Ball' },
                { id: 'wide', label: language === 'bn' ? 'ওয়াইড' : 'Wide (Wd)' },
                { id: 'no_ball', label: language === 'bn' ? 'নো বল' : 'No Ball (Nb)' },
                { id: 'byes', label: language === 'bn' ? 'বাই রান' : 'Byes (B)' },
                { id: 'leg_byes', label: language === 'bn' ? 'লেগ বাই' : 'Leg Byes (LB)' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setDeliveryType(item.id as any)}
                  className={`py-2 px-1 rounded-xl font-bold transition-all truncate text-center ${
                    deliveryType === item.id
                      ? 'bg-emerald-600 text-white shadow-xs'
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
                <span>{language === 'bn' ? 'এই বলে উইকেট পড়েছিল' : 'Wicket on this delivery'}</span>
              </label>
              {isWicket && (
                <span className="text-[11px] font-bold text-red-500 uppercase tracking-wider">
                  OUT
                </span>
              )}
            </div>

            {isWicket && (
              <div className="space-y-2.5 bg-[var(--muted)]/40 p-3 rounded-xl border border-red-500/20 text-xs">
                {/* Dismissal Type */}
                <div>
                  <label className="font-semibold text-[var(--muted-foreground)] block mb-1">
                    {language === 'bn' ? 'আউটের ধরন' : 'Dismissal Type'}
                  </label>
                  <select
                    value={dismissalType}
                    onChange={(e) => setDismissalType(e.target.value as DismissalType)}
                    className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg p-2 font-bold text-xs"
                  >
                    {PRIMARY_DISMISSAL_TYPES.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Who was out */}
                <div className="flex items-center gap-2">
                  <label className="font-semibold text-[var(--muted-foreground)] shrink-0">
                    {language === 'bn' ? 'কে আউট:' : 'Out Batter:'}
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
                      {language === 'bn' ? 'স্ট্রাইকার' : 'Striker'}
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
                      {language === 'bn' ? 'নন-স্ট্রাইকার' : 'Non-Striker'}
                    </button>
                  </div>
                </div>

                {/* Fielder Name */}
                {['Caught', 'Run Out', 'Stumped'].includes(dismissalType) && (
                  <div>
                    <label className="font-semibold text-[var(--muted-foreground)] block mb-1">
                      {language === 'bn' ? 'ফিল্ডারের নাম' : 'Fielder Name'}
                    </label>
                    <input
                      type="text"
                      value={fielderName}
                      onChange={(e) => setFielderName(e.target.value)}
                      placeholder={language === 'bn' ? 'ফিল্ডারের নাম লিখুন...' : 'Enter fielder name...'}
                      className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg p-2 font-medium text-xs"
                    />
                  </div>
                )}

                {/* Incoming Batter Name */}
                <div>
                  <label className="font-semibold text-[var(--muted-foreground)] block mb-1">
                    {language === 'bn' ? 'পরবর্তী ব্যাটার' : 'New Batter Name'}
                  </label>
                  <input
                    type="text"
                    value={newBatsmanName}
                    onChange={(e) => setNewBatsmanName(e.target.value)}
                    placeholder={language === 'bn' ? 'নতুন ব্যাটারের নাম...' : 'Enter incoming batter name...'}
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
              {language === 'bn' ? 'বাতিল' : 'Cancel'}
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-extrabold text-xs text-white shadow-md shadow-emerald-600/30 transition-transform active:scale-95 flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{language === 'bn' ? 'সংরক্ষণ ও পুনর্গণনা' : 'Save & Replay'}</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
