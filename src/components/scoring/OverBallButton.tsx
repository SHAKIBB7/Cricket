'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useLongPress } from '@/hooks/useLongPress';

export interface OverBallButtonProps {
  ball: string;
  idx: number;
  onEdit: (idx: number) => void;
  isDesktop?: boolean;
}

export function OverBallButton({
  ball,
  idx,
  onEdit,
  isDesktop = false,
}: OverBallButtonProps) {
  const { handlers, isPressing } = useLongPress(() => onEdit(idx), {
    threshold: 1000,
    moveThreshold: 10,
    hapticFeedback: true,
    hapticPattern: 50,
  });

  const isWkt = ball === 'W' || ball.includes('Out') || ball.includes('+W');
  const isSix = ball === '6' || ball.endsWith('6');
  const isFour = ball === '4' || ball.endsWith('4');
  const isExtra = ball.startsWith('Wd') || ball.startsWith('Nb');
  const isDot = ball === '0';
  const isMultiChar = ball.length > 1;

  const colorClasses = isWkt
    ? 'bg-red-600 text-white border-red-500 shadow-red-600/20'
    : isSix
    ? 'bg-purple-600 text-white border-purple-500 shadow-purple-600/20'
    : isFour
    ? 'bg-blue-600 text-white border-blue-500 shadow-blue-600/20'
    : isExtra
    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-amber-500/20'
    : isDot
    ? 'bg-[var(--muted)] text-[var(--foreground)] border-[var(--border)]'
    : 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-600/20';

  const sizeClasses = isDesktop
    ? `h-9 ${
        isMultiChar
          ? 'min-w-[36px] px-2.5 text-xs'
          : 'w-9 aspect-square text-sm'
      }`
    : `h-8 sm:h-9 ${
        isMultiChar
          ? 'min-w-[32px] sm:min-w-[36px] px-2 text-[11px] sm:text-xs'
          : 'w-8 sm:w-9 aspect-square text-xs sm:text-sm'
      }`;

  const titleText = isDesktop
    ? `Delivery ${idx + 1}: ${ball} (Long press to edit)`
    : `Ball ${idx + 1}: ${ball} (Long press to edit)`;

  const ariaLabel = `${isDesktop ? 'Delivery' : 'Ball'} ${idx + 1}: ${ball}. Long press for 1 second to edit.`;

  return (
    <motion.button
      layout="position"
      data-testid={isDesktop ? `desktop-over-ball-${idx}` : `over-ball-${idx}`}
      initial={{ opacity: 0, scale: 0.7, x: isDesktop ? 15 : 12 }}
      animate={{
        opacity: 1,
        scale: isPressing ? 0.92 : 1,
        x: 0,
      }}
      exit={{ opacity: 0, scale: 0.7, x: isDesktop ? -15 : -12 }}
      transition={{ duration: isPressing ? 0.15 : 0.18, ease: 'easeOut' }}
      type="button"
      {...handlers}
      title={titleText}
      aria-label={ariaLabel}
      style={{
        WebkitTouchCallout: 'none',
        userSelect: 'none',
        touchAction: 'pan-x',
      }}
      className={`${sizeClasses} rounded-full flex items-center justify-center font-black shrink-0 leading-none text-center hover:scale-105 active:scale-95 transition-transform cursor-pointer shadow-xs select-none border relative before:content-[''] before:absolute before:-inset-1.5 before:min-w-[44px] before:min-h-[44px] before:pointer-events-auto ${colorClasses} ${
        isPressing ? 'scale-95 brightness-110 shadow-md' : ''
      }`}
    >
      {ball === '0' ? '0' : ball}
    </motion.button>
  );
}
