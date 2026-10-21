'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CloudRain, CheckCircle2, AlertTriangle, Info, Scale, ShieldCheck, RotateCcw } from 'lucide-react';
import { DlsEngine } from '@/domain/cricket/dls/DlsEngine';
import { MODAL_VARIANTS, BACKDROP_VARIANTS } from '@/lib/animations';
import { useLanguage } from '@/context/LanguageContext';
import { BackButton } from '@/components/navigation';

export interface DlsModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalOvers: number;
  team1Score: number;
  currentOversBowled?: number;
  currentWicketsLost?: number;
  currentRuns?: number;
  isDlsApplied?: boolean;
  onApplyTarget?: (revisedTarget: number, revisedTotalOvers: number) => void;
  onResetDls?: () => void;
  onConcludeDls?: () => void;
}

export function DlsModal({
  isOpen,
  onClose,
  originalOvers,
  team1Score,
  currentOversBowled = 0,
  currentWicketsLost = 0,
  currentRuns = 0,
  isDlsApplied = false,
  onApplyTarget,
  onResetDls,
  onConcludeDls,
}: DlsModalProps) {
  const { language } = useLanguage();

  // Tab State: '2nd_innings_curtailed' | '1st_innings_interruption' | 'live_par_score'
  const [calculationMode, setCalculationMode] = useState<
    '2nd_innings_curtailed' | '1st_innings_interruption' | 'live_par_score'
  >('2nd_innings_curtailed');

  // Input states
  const [t1Score, setT1Score] = useState<number>(team1Score);
  const [matchOvers, setMatchOvers] = useState<number>(originalOvers);
  const [t1Bowled, setT1Bowled] = useState<number>(originalOvers);
  const [t1Wkts, setT1Wkts] = useState<number>(0);
  const [revisedOvers, setRevisedOvers] = useState<number>(Math.max(5, originalOvers - 5));
  const [t2Bowled, setT2Bowled] = useState<number>(currentOversBowled);
  const [wktsLost, setWktsLost] = useState<number>(currentWicketsLost);
  const [t2Runs, setT2Runs] = useState<number>(currentRuns);

  // Sync state if props update when modal opens
  React.useEffect(() => {
    setT1Score(team1Score);
    setMatchOvers(originalOvers);
    setT2Bowled(currentOversBowled);
    setWktsLost(currentWicketsLost);
    setT2Runs(currentRuns);
  }, [team1Score, originalOvers, currentOversBowled, currentWicketsLost, currentRuns]);

  // Compute DLS reactively
  const dlsResult = useMemo(() => {
    return DlsEngine.calculate({
      originalOvers: matchOvers,
      team1TotalRuns: t1Score,
      team1OversBowled: calculationMode === '1st_innings_interruption' ? t1Bowled : matchOvers,
      team1WicketsLost: calculationMode === '1st_innings_interruption' ? t1Wkts : 0,
      team2OversAvailable: calculationMode === 'live_par_score' ? matchOvers : revisedOvers,
      team2WicketsLost: wktsLost,
      team2CurrentOversBowled: t2Bowled,
      team2CurrentRuns: t2Runs,
      matchType: matchOvers <= 20 ? 'T20' : 'ODI',
    });
  }, [calculationMode, matchOvers, t1Score, t1Bowled, t1Wkts, revisedOvers, wktsLost, t2Bowled, t2Runs]);

  if (!isOpen) return null;

  const handleApply = () => {
    if (onApplyTarget) {
      onApplyTarget(dlsResult.revisedTarget, dlsResult.oversAvailable);
    }
    onClose();
  };

  const handleReset = () => {
    if (onResetDls) {
      onResetDls();
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
          className="relative bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-xl p-4 sm:p-6 z-10 text-[var(--foreground)] space-y-4 max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <div className="flex items-center gap-2.5">
              <div className="bg-blue-500/15 border border-blue-500/30 p-2 rounded-xl text-blue-600 dark:text-blue-400">
                <CloudRain className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-extrabold text-base leading-tight">
                    {language === 'bn' ? 'ডিএলএস রেইন ক্যালকুলেটর' : 'DLS Rain Interruption Calculator'}
                  </h3>
                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                    Standard
                  </span>
                </div>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {language === 'bn' ? 'আইসিসি অনুমোদিত স্ট্যান্ডার্ড ডাকওয়ার্থ-লুইস-স্টার্ন পদ্ধতি' : 'ICC Approved Duckworth-Lewis-Stern Standard Method'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <BackButton
                onClick={onClose}
                label="Done"
                size="sm"
                variant="tinted"
                title="Close DLS Calculator"
              />
            </div>
          </div>

          {/* Active DLS Status Banner */}
          {isDlsApplied && (
            <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 rounded-xl text-xs text-emerald-600 dark:text-emerald-400 font-bold">
              <div className="flex items-center gap-1.5 min-w-0">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                <span className="truncate">
                  {language === 'bn' ? 'এই ম্যাচে DLS বর্তমানে সক্রিয় রয়েছে' : 'DLS is currently applied to this match'}
                </span>
              </div>
              {onResetDls && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 font-extrabold text-[11px] transition-colors border border-rose-500/30 shrink-0 ml-2 active:scale-95"
                >
                  {language === 'bn' ? 'DLS নিষ্ক্রিয় করুন' : 'Disable DLS'}
                </button>
              )}
            </div>
          )}

          {/* Mode Switcher Tabs */}
          <div className="flex bg-[var(--muted)]/70 p-1 rounded-xl border border-[var(--border)] gap-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setCalculationMode('2nd_innings_curtailed')}
              className={`flex-1 py-1.5 px-2 rounded-lg transition-all text-center truncate ${
                calculationMode === '2nd_innings_curtailed'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              {language === 'bn' ? '২য় ইনিংস ওভার হ্রাস' : '2nd Innings Reduced'}
            </button>
            <button
              type="button"
              onClick={() => setCalculationMode('1st_innings_interruption')}
              className={`flex-1 py-1.5 px-2 rounded-lg transition-all text-center truncate ${
                calculationMode === '1st_innings_interruption'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              {language === 'bn' ? '১ম ইনিংসে বৃষ্টি' : '1st Innings Rain'}
            </button>
            <button
              type="button"
              onClick={() => setCalculationMode('live_par_score')}
              className={`flex-1 py-1.5 px-2 rounded-lg transition-all text-center truncate ${
                calculationMode === 'live_par_score'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              {language === 'bn' ? 'লাইভ পার স্কোর' : 'Live Par Score'}
            </button>
          </div>

          {/* Revised Target / Par Score Hero Box */}
          <div className="bg-gradient-to-tr from-blue-600/15 via-blue-500/5 to-transparent border border-blue-500/30 rounded-2xl p-4 text-center space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 block">
              {calculationMode === 'live_par_score'
                ? language === 'bn'
                  ? 'বর্তমান পার স্কোর (Par Score)'
                  : 'Current DLS Par Score'
                : language === 'bn'
                ? 'সংশোধিত টার্গেট (Revised Target)'
                : 'Revised Target Score'}
            </span>

            <div className="flex items-baseline justify-center gap-2">
              <span className="text-3xl sm:text-4xl font-black num-font text-blue-600 dark:text-blue-400">
                {calculationMode === 'live_par_score' ? dlsResult.parScore : dlsResult.revisedTarget}
              </span>
              <span className="text-sm font-semibold text-[var(--muted-foreground)]">
                {calculationMode === 'live_par_score'
                  ? language === 'bn'
                    ? `${t2Bowled} ওভারে সমতা করার রান`
                    : `runs at ${t2Bowled} ov`
                  : language === 'bn'
                  ? `${dlsResult.oversAvailable} ওভারে প্রয়োজন`
                  : `from ${dlsResult.oversAvailable} overs`}
              </span>
            </div>

            <p className="text-xs text-[var(--muted-foreground)] leading-relaxed pt-1">
              {language === 'bn' ? dlsResult.explanationBn : dlsResult.explanationEn}
            </p>

            {/* Resource comparison pills */}
            <div className="flex items-center justify-center flex-wrap gap-2 pt-1 text-xs">
              <span className="inline-flex items-center gap-1 bg-[var(--muted)] px-2.5 py-1 rounded-lg font-medium text-[var(--foreground)] border border-[var(--border)]">
                <span className="text-[var(--muted-foreground)]">Team 1 (R1):</span>
                <span className="font-bold num-font text-emerald-600 dark:text-emerald-400">{dlsResult.team1ResourcePct}%</span>
              </span>
              <span className="inline-flex items-center gap-1 bg-[var(--muted)] px-2.5 py-1 rounded-lg font-medium text-[var(--foreground)] border border-[var(--border)]">
                <span className="text-[var(--muted-foreground)]">Team 2 (R2):</span>
                <span className="font-bold num-font text-blue-600 dark:text-blue-400">{dlsResult.team2ResourcePct}%</span>
              </span>
              {dlsResult.runsAdjustment !== 0 && (
                <span className="inline-flex items-center gap-1 bg-[var(--muted)] px-2.5 py-1 rounded-lg font-medium text-[var(--foreground)] border border-[var(--border)]">
                  <span className="text-[var(--muted-foreground)]">Adjustment:</span>
                  <span className={`font-bold num-font ${dlsResult.runsAdjustment > 0 ? 'text-purple-600 dark:text-purple-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {dlsResult.runsAdjustment > 0 ? `+${dlsResult.runsAdjustment}` : dlsResult.runsAdjustment} runs
                  </span>
                </span>
              )}
            </div>

            {/* Minimum Overs Warning */}
            {!dlsResult.isMinimumOversMet && (
              <div className="mt-2 flex items-center justify-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 py-1.5 px-3 rounded-xl">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  {language === 'bn'
                    ? `সতর্কতা: আইসিসি নিয়ম অনুযায়ী ন্যূনতম ${dlsResult.minimumOversRequired} ওভার প্রয়োজন।`
                    : `Warning: ICC requires at least ${dlsResult.minimumOversRequired} overs per side for a result.`}
                </span>
              </div>
            )}
          </div>

          {/* Interactive Input Parameters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Team 1 Total Runs */}
            <div className="space-y-1">
              <label className="font-bold text-[var(--foreground)]">
                {language === 'bn' ? '১ম ইনিংসের মোট রান' : 'Team 1 Total Score'}
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
                {language === 'bn' ? 'মূল ওভার সংখ্যা (Original Overs)' : 'Original Match Overs'}
              </label>
              <input
                type="number"
                min="5"
                max="50"
                value={matchOvers}
                onChange={(e) => setMatchOvers(Math.max(5, Math.min(50, parseInt(e.target.value, 10) || 20)))}
                className="w-full bg-[var(--muted)] border border-[var(--border)] rounded-xl p-2.5 font-black text-sm"
              />
            </div>

            {/* Conditional Input based on Mode */}
            {calculationMode === '1st_innings_interruption' ? (
              <>
                <div className="space-y-1">
                  <label className="font-bold text-[var(--foreground)]">
                    {language === 'bn' ? '১ম ইনিংস সমাপ্ত ওভার' : 'Team 1 Overs Batted'}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    max={matchOvers}
                    value={t1Bowled}
                    onChange={(e) => setT1Bowled(Math.max(1, Math.min(matchOvers, parseFloat(e.target.value) || 1)))}
                    className="w-full bg-[var(--muted)] border border-[var(--border)] rounded-xl p-2.5 font-black text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[var(--foreground)]">
                    {language === 'bn' ? '১ম ইনিংসে উইকেট পতন' : 'Team 1 Wickets Lost'}
                  </label>
                  <select
                    value={t1Wkts}
                    onChange={(e) => setT1Wkts(parseInt(e.target.value, 10))}
                    className="w-full bg-[var(--muted)] border border-[var(--border)] rounded-xl p-2.5 font-bold text-sm"
                  >
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((w) => (
                      <option key={w} value={w}>
                        {w} {w === 1 ? 'Wicket' : 'Wickets'}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <>
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
                    {language === 'bn' ? 'বিঘ্নের সময় উইকেট পতন' : 'Team 2 Wickets Lost'}
                  </label>
                  <select
                    value={wktsLost}
                    onChange={(e) => setWktsLost(parseInt(e.target.value, 10))}
                    className="w-full bg-[var(--muted)] border border-[var(--border)] rounded-xl p-2.5 font-bold text-sm"
                  >
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((w) => (
                      <option key={w} value={w}>
                        {w} {w === 1 ? 'Wicket' : 'Wickets'}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Team 2 Current Overs & Runs (for Live Par Score or mid-innings interruption) */}
            <div className="space-y-1">
              <label className="font-bold text-[var(--foreground)]">
                {language === 'bn' ? '২য় ইনিংস বর্তমান ওভার' : 'Team 2 Overs Bowled So Far'}
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max={revisedOvers}
                value={t2Bowled}
                onChange={(e) => setT2Bowled(Math.max(0, Math.min(revisedOvers, parseFloat(e.target.value) || 0)))}
                className="w-full bg-[var(--muted)] border border-[var(--border)] rounded-xl p-2.5 font-black text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-[var(--foreground)]">
                {language === 'bn' ? '২য় ইনিংস বর্তমান রান' : 'Team 2 Current Runs'}
              </label>
              <input
                type="number"
                min="0"
                value={t2Runs}
                onChange={(e) => setT2Runs(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-full bg-[var(--muted)] border border-[var(--border)] rounded-xl p-2.5 font-black text-sm"
              />
            </div>
          </div>

          {/* Quick Reduction Preset Buttons (for 2nd innings) */}
          {calculationMode === '2nd_innings_curtailed' && (
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
          )}

          {/* Professional DLS Disclaimer Note as required by International Standards */}
          <div className="flex items-start gap-2 bg-[var(--muted)]/50 border border-[var(--border)]/60 rounded-xl p-2.5 text-[11px] text-[var(--muted-foreground)] leading-tight">
            <Info className="w-3.5 h-3.5 shrink-0 text-blue-500 mt-0.5" />
            <span>
              {language === 'bn'
                ? 'এটি আইসিসির উন্মুক্ত ও অনুমোদিত ডাকওয়ার্থ-লুইস স্ট্যান্ডার্ড সংস্করণ। আন্তর্জাতিক পেশাদার সংস্করণের মালিকানা আইসিসির সংরক্ষিত।'
                : 'This implements the official ICC Duckworth-Lewis Standard Edition model for non-international & club fixtures. Proprietary Professional Edition is licensed separately by the ICC.'}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center flex-wrap gap-2 pt-2 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--muted)] hover:bg-[var(--border)] font-bold text-xs text-[var(--foreground)] transition-colors active:scale-95"
            >
              {language === 'bn' ? 'বাতিল' : 'Cancel'}
            </button>

            {isDlsApplied && onResetDls && (
              <button
                type="button"
                onClick={handleReset}
                className="py-2.5 px-3 rounded-xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-extrabold text-xs transition-colors active:scale-95 flex items-center justify-center gap-1.5"
                title={language === 'bn' ? 'DLS প্রত্যাহার করে সাধারণ ম্যাচে ফিরে যান' : 'Reset DLS and restore standard match target'}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{language === 'bn' ? 'DLS নিষ্ক্রিয় করুন' : 'Disable DLS'}</span>
              </button>
            )}

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

            {onConcludeDls && calculationMode === 'live_par_score' && (
              <button
                type="button"
                onClick={() => {
                  onConcludeDls();
                  onClose();
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 font-extrabold text-xs text-white shadow-md shadow-rose-600/30 transition-transform active:scale-95 flex items-center justify-center gap-1.5"
              >
                <CloudRain className="w-4 h-4" />
                <span>{language === 'bn' ? 'ম্যাচ সমাপ্ত ও ডিএলএস রেজাল্ট' : 'Conclude via DLS Result'}</span>
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
