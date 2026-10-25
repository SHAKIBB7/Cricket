'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { MotionNumber } from '@/components/common/MotionNumber';

export interface MatchProgressBarProps {
  currentBalls: number;
  totalOvers: number;
  crr: number;
  projectedRuns?: number;
  className?: string;
}

export const MatchProgressBar = React.memo(function MatchProgressBar({
  currentBalls,
  totalOvers,
  crr,
  projectedRuns,
  className = '',
}: MatchProgressBarProps) {
  const shouldReduceMotion = useReducedMotion();

  const totalMatchBalls = Number.isFinite(totalOvers) && totalOvers > 0 ? totalOvers * 6 : 120;
  const safeBalls = Number.isFinite(currentBalls) && currentBalls > 0 ? currentBalls : 0;
  const percentage = Math.min(100, Math.max(0, (safeBalls / totalMatchBalls) * 100));

  const oversBowledString = `${Math.floor(safeBalls / 6)}.${safeBalls % 6}`;

  return (
    <div
      className={`w-full flex flex-col gap-1.5 select-none ${className}`}
      role="region"
      aria-label="Match Overs Progress"
    >
      {/* Top Stat Row */}
      <div className="flex items-center justify-between text-xs font-bold leading-tight">
        <div className="flex items-center gap-1.5 truncate">
          <span className="text-white/80 uppercase tracking-wider text-[10px] sm:text-xs">
            Innings Progress
          </span>
          <span className="text-white/40">•</span>
          <span className="num-font text-white text-[11px] sm:text-xs font-bold">
            <MotionNumber value={oversBowledString} mode="cricket-overs" /> / {totalOvers} Ov
          </span>
        </div>

        <div className="flex items-center gap-2 num-font text-right shrink-0">
          <span className="text-white/70 text-[10px] sm:text-xs">CRR</span>
          <span className="text-white font-black text-[11px] sm:text-xs">
            <MotionNumber value={crr.toFixed(2)} mode="decimal" />
          </span>
          {typeof projectedRuns === 'number' && projectedRuns > 0 && (
            <>
              <span className="text-white/40 px-0.5">•</span>
              <span className="text-white/70 text-[10px] sm:text-xs">Proj</span>
              <span className="text-emerald-300 font-black text-[11px] sm:text-xs">
                <MotionNumber value={projectedRuns} />
              </span>
            </>
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
        aria-label={`Innings progress: ${Math.round(percentage)}%`}
      >
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-[#34C759] transition-colors"
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
