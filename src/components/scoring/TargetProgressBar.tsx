'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { MotionNumber } from '@/components/common/MotionNumber';

export interface TargetProgressBarProps {
  currentRuns: number;
  targetRuns: number;
  ballsRemaining: number;
  totalOvers: number;
  rrr: number;
  isDlsApplied?: boolean;
  isMatchCompleted?: boolean;
  className?: string;
}

export const TargetProgressBar = React.memo(function TargetProgressBar({
  currentRuns,
  targetRuns,
  ballsRemaining,
  totalOvers,
  rrr,
  isDlsApplied = false,
  isMatchCompleted = false,
  className = '',
}: TargetProgressBarProps) {
  const shouldReduceMotion = useReducedMotion();

  const safeTarget = Number.isFinite(targetRuns) && targetRuns > 0 ? targetRuns : 0;
  const safeCurrent = Number.isFinite(currentRuns) && currentRuns > 0 ? currentRuns : 0;
  const safeBalls = Number.isFinite(ballsRemaining) && ballsRemaining > 0 ? ballsRemaining : 0;
  const neededRuns = Math.max(0, safeTarget - safeCurrent);

  const percentage = safeTarget > 0 ? Math.min(100, Math.max(0, (safeCurrent / safeTarget) * 100)) : 0;
  const isTargetAchieved = safeTarget > 0 && safeCurrent >= safeTarget;

  return (
    <div
      className={`w-full flex flex-col gap-1.5 select-none ${className}`}
      role="region"
      aria-label="Target Chase Progress"
    >
      {/* Top Stat Row */}
      <div className="flex items-center justify-between text-xs font-bold leading-tight">
        <div className="flex items-center gap-1.5 truncate">
          <span className="text-white/80 uppercase tracking-wider text-[10px] sm:text-xs">
            {isDlsApplied ? 'DLS Chase' : 'Chase Progress'}
          </span>
          <span className="text-white/40">•</span>
          <span className="num-font text-white text-[11px] sm:text-xs font-black">
            <MotionNumber value={Math.round(percentage)} />%
          </span>
        </div>

        <div className="flex items-center gap-2 num-font text-right shrink-0">
          {isMatchCompleted ? (
            <span className="text-white/80 text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full bg-white/15">
              Innings Concluded
            </span>
          ) : isTargetAchieved ? (
            <span className="text-emerald-300 text-[10px] sm:text-xs font-black px-2 py-0.5 rounded-full bg-emerald-500/25 border border-emerald-400/30">
              Target Achieved
            </span>
          ) : (
            <span className="text-white/90 text-[10px] sm:text-xs">
              Need <span className="text-emerald-300 font-black"><MotionNumber value={neededRuns} /></span> from{' '}
              <span className="text-white font-black"><MotionNumber value={safeBalls} /></span>b
              <span className="text-white/50 px-1 font-light">|</span>
              <span className="text-white/70">RRR</span>{' '}
              <span className="text-emerald-300 font-black"><MotionNumber value={rrr.toFixed(2)} mode="decimal" /></span>
            </span>
          )}
        </div>
      </div>

      {/* Progress Track & Animated Fill */}
      <div
        className="motion-progress-track relative h-2 bg-white/20 dark:bg-white/15 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(percentage)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Target progress: ${Math.round(percentage)}%`}
      >
        <motion.div
          className={`h-full rounded-full transition-colors ${
            isTargetAchieved
              ? 'bg-gradient-to-r from-emerald-400 to-green-300 shadow-[0_0_8px_rgba(52,199,89,0.5)]'
              : percentage >= 80
              ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
              : percentage >= 50
              ? 'bg-gradient-to-r from-teal-500 to-emerald-400'
              : 'bg-gradient-to-r from-blue-500 to-teal-400'
          }`}
          initial={false}
          animate={{
            width: `${percentage}%`,
          }}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : {
                  type: 'spring',
                  stiffness: 180,
                  damping: 24,
                }
          }
        />
      </div>
    </div>
  );
});
