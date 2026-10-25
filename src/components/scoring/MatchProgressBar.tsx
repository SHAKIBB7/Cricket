'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { MotionNumber } from '@/components/common/MotionNumber';

export interface MatchProgressBarProps {
  currentBalls: number;
  totalOvers: number;
  crr?: number;
  projectedRuns?: number;
  className?: string;
}

export const MatchProgressBar = React.memo(function MatchProgressBar({
  currentBalls,
  totalOvers,
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
      <div className="flex items-center justify-between text-xs font-bold leading-tight select-none">
        {/* Left: INNINGS PROGRESS and immediately to its right: OVER 0.5 / 5 Ov */}
        <div className="flex items-center gap-2.5 sm:gap-4 truncate">
          <span className="text-white/85 uppercase tracking-wider text-[11px] sm:text-xs font-extrabold">
            INNINGS PROGRESS
          </span>
          <div className="inline-flex items-center gap-1 num-font text-white text-[11px] sm:text-xs font-bold [font-variant-numeric:tabular-nums]">
            <span className="text-white/60 uppercase text-[10px] sm:text-xs tracking-wider">
              OVER
            </span>
            <span className="font-extrabold text-white">
              <MotionNumber value={oversBowledString} mode="cricket-overs" /> / {totalOvers} Ov
            </span>
          </div>
        </div>

        {/* Right: Actual Innings Completion Percentage (No duplicate CRR / Proj) */}
        <div className="flex items-center gap-1 num-font text-right shrink-0 [font-variant-numeric:tabular-nums]">
          <span className="text-emerald-300 font-extrabold text-[11px] sm:text-xs">
            <MotionNumber value={Math.round(percentage)} />%
          </span>
        </div>
      </div>

      {/* Progress Track & Animated Neon-Green Fill */}
      <div
        className="motion-progress-track relative h-2.5 bg-black/50 border border-emerald-500/20 rounded-full overflow-hidden mt-1.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)]"
        role="progressbar"
        aria-valuenow={Math.round(percentage)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Innings progress: ${Math.round(percentage)}%`}
      >
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-[#00E575] shadow-[0_0_10px_rgba(52,211,153,0.5)] transition-colors"
          initial={false}
          animate={{
            width: `${percentage}%`,
          }}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : {
                  type: 'spring',
                  stiffness: 160,
                  damping: 24,
                }
          }
        />
      </div>
    </div>
  );
});
