'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CloudRain, CheckCircle2, AlertTriangle, ArrowRight, Calculator } from 'lucide-react';
import { DlsEngine } from '@/domain/cricket/dls/DlsEngine';
import { MODAL_VARIANTS, BACKDROP_VARIANTS } from '@/lib/animations';
import { useLanguage } from '@/context/LanguageContext';

export interface DlsModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalOvers: number;
  team1Score: number;
  currentOversBowled?: number;
  currentWicketsLost?: number;
  onApplyTarget?: (revisedTarget: number, revisedTotalOvers: number) => void;
}

export function DlsModal({
  isOpen,
  onClose,
  originalOvers,
  team1Score,
  currentOversBowled = 0,
  currentWicketsLost = 0,
  onApplyTarget,
}: DlsModalProps) {
  const { language } = useLanguage();

  const [t1Score, setT1Score] = useState<number>(team1Score);
  const [matchOvers, setMatchOvers] = useState<number>(originalOvers);
  const [revisedOvers, setRevisedOvers] = useState<number>(Math.max(5, originalOvers - 5));
  const [wktsLost, setWktsLost] = useState<number>(currentWicketsLost);
  const [t2Bowled, setT2Bowled] = useState<number>(currentOversBowled);

  // Compute DLS reactively
  const dlsResult = useMemo(() => {
    return DlsEngine.calculate({
      originalOvers: matchOvers,
      team1TotalRuns: t1Score,
      team2OversAvailable: revisedOvers,
      team2WicketsLost: wktsLost,
      team2CurrentOversBowled: t2Bowled,
    });
  }, [matchOvers, t1Score, revisedOvers, wktsLost, t2Bowled]);

  if (!isOpen) return null;

  const handleApply = () => {
    if (onApplyTarget) {
      onApplyTarget(dlsResult.revisedTarget, dlsResult.oversAvailable);
    }
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

        {/* Modal Card */}
        <motion.div
          variants={MODAL_VARIANTS}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="relative bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-lg p-4 sm:p-5 z-10 text-[var(--foreground)] space-y-4 max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <div className="flex items-center gap-2.5">
              <div className="bg-blue-500/15 border border-blue-500/30 p-2 rounded-xl text-blue-600 dark:text-blue-400">
                <CloudRain className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base leading-tight">
                  {language === 'bn' ? 'ডিএলএস রেইন ক্যালকুলেটর' : 'DLS Rain Interruption Calculator'}
                </h3>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {language === 'bn' ? 'আইসিসি স্ট্যান্ডার্ড ডাকওয়ার্থ-লুইস-স্টার্ন পদ্ধতি' : 'ICC Standard Duckworth-Lewis-Stern Method'}
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

          {/* Revised Target Result Hero Box */}
          <div className="bg-gradient-to-tr from-blue-600/15 via-blue-500/5 to-transparent border border-blue-500/30 rounded-2xl p-4 text-center space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 block">
              {language === 'bn' ? 'সংশোধিত টার্গেট (Revised Target)' : 'Revised Target Score'}
            </span>
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-3xl sm:text-4xl font-black num-font text-blue-600 dark:text-blue-400">
                {dlsResult.revisedTarget}
              </span>
              <span className="text-sm font-semibold text-[var(--muted-foreground)]">
                {language === 'bn' ? `${dlsResult.oversAvailable} ওভারে প্রয়োজন` : `from ${dlsResult.oversAvailable} overs`}
              </span>
            </div>
            <p className="text-xs text-[var(--muted-foreground)] leading-relaxed pt-1">
              {language === 'bn' ? dlsResult.explanationBn : dlsResult.explanationEn}
            </p>
            {dlsResult.parScore > 0 && (
              <div className="mt-2 inline-flex items-center gap-2 bg-blue-500/10 px-3 py-1 rounded-full text-xs font-bold text-blue-600 dark:text-blue-400">
                <span>{language === 'bn' ? 'বর্তমান পার স্কোর:' : 'Current Par Score:'}</span>
                <span className="num-font text-sm">{dlsResult.parScore} runs</span>
              </div>
            )}
          </div>

          {/* Interactive Parameters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Team 1 Total Runs */}
            <div className="space-y-1">
              <label className="font-bold text-[var(--foreground)]">
                {language === 'bn' ? '১ম ইনিংসের রান' : 'Team 1 Score'}
              </label>
              <input
                type="number"
                min="0"
                value={t1Score}
                onChange={(e) => setT1Score(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-full bg-[var(--muted)] border border-[var(--border)] rounded-xl p-2.5 font-black text-sm"
              />
            </div>

            {/* Original Match Overs */}
            <div className="space-y-1">
              <label className="font-bold text-[var(--foreground)]">
                {language === 'bn' ? 'মূল ওভার সংখ্যা' : 'Original Overs'}
              </label>
              <input
                type="number"
                min="5"
                max="50"
                value={matchOvers}
                onChange={(e) => setMatchOvers(Math.max(5, parseInt(e.target.value, 10) || 20))}
                className="w-full bg-[var(--muted)] border border-[var(--border)] rounded-xl p-2.5 font-black text-sm"
              />
            </div>

            {/* Revised 2nd Innings Overs Available */}
            <div className="space-y-1">
              <label className="font-bold text-[var(--foreground)]">
                {language === 'bn' ? '২য় ইনিংসের সংশোধিত ওভার' : 'Revised 2nd Innings Overs'}
              </label>
              <input
                type="number"
                min="1"
                max={matchOvers}
                value={revisedOvers}
                onChange={(e) => setRevisedOvers(Math.max(1, Math.min(matchOvers, parseInt(e.target.value, 10) || 1)))}
                className="w-full bg-[var(--muted)] border border-[var(--border)] rounded-xl p-2.5 font-black text-sm text-blue-600 dark:text-blue-400"
              />
            </div>

            {/* Wickets lost at interruption */}
            <div className="space-y-1">
              <label className="font-bold text-[var(--foreground)]">
                {language === 'bn' ? 'বিঘ্নের সময় উইকেট পতন' : 'Wickets Lost at Interruption'}
              </label>
              <select
                value={wktsLost}
                onChange={(e) => setWktsLost(parseInt(e.target.value, 10))}
                className="w-full bg-[var(--muted)] border border-[var(--border)] rounded-xl p-2.5 font-bold text-sm"
              >
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((w) => (
                  <option key={w} value={w}>
                    {w} {w === 1 ? 'Wicket' : 'Wickets'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Reduction Preset Buttons */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[11px] font-semibold text-[var(--muted-foreground)] block">
              {language === 'bn' ? 'কুইক ওভার নির্বাচন:' : 'Quick Overs Presets:'}
            </span>
            <div className="flex items-center flex-wrap gap-1.5">
              {[5, 8, 10, 12, 15, 18, 20].filter((o) => o <= matchOvers).map((ov) => (
                <button
                  key={ov}
                  type="button"
                  onClick={() => setRevisedOvers(ov)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    revisedOvers === ov
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {ov} ov
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-3 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--muted)] hover:bg-[var(--border)] font-bold text-xs text-[var(--foreground)] transition-colors active:scale-95"
            >
              {language === 'bn' ? 'বাতিল' : 'Cancel'}
            </button>

            {onApplyTarget && (
              <button
                type="button"
                onClick={handleApply}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-extrabold text-xs text-white shadow-md shadow-blue-600/30 transition-transform active:scale-95 flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{language === 'bn' ? 'টার্গেট প্রয়োগ করুন' : 'Apply to Match'}</span>
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
