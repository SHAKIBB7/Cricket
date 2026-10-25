'use client';

import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { WicketLottieAnimation } from './WicketLottieAnimation';

export type CelebrationEvent = 'four' | 'six' | 'wicket' | null;

export interface BoundaryCelebrationBannerProps {
  event: CelebrationEvent;
  runs?: number;
  batterName?: string;
  className?: string;
}

export const BoundaryCelebrationBanner = React.memo(
  function BoundaryCelebrationBanner({
    event,
    runs,
    batterName,
    className = '',
  }: BoundaryCelebrationBannerProps) {
    const shouldReduceMotion = useReducedMotion();

    if (!event) return null;

    const config = {
      four: {
        title: 'FOUR!',
        subtitle: 'Boundary hit to the fence',
        badgeBg: 'bg-blue-600/90 border-blue-400/50 text-white shadow-blue-500/30',
        textColor: 'text-blue-400',
      },
      six: {
        title: 'SIX!',
        subtitle: 'Maximum! Sent out of the park',
        badgeBg: 'bg-purple-600/90 border-purple-400/50 text-white shadow-purple-500/30',
        textColor: 'text-purple-400',
      },
      wicket: {
        title: 'WICKET!',
        subtitle: 'Batsman dismissed',
        badgeBg: 'bg-red-600/90 border-red-400/50 text-white shadow-red-500/30',
        textColor: 'text-red-400',
      },
    }[event];

    return (
      <AnimatePresence>
        <div
          className={`pointer-events-none fixed top-16 left-0 right-0 z-40 flex justify-center px-4 ${className}`}
          aria-live="polite"
        >
          <motion.div
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.94 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.96 }}
            transition={{
              type: 'spring',
              stiffness: 420,
              damping: 26,
            }}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl backdrop-blur-xl border shadow-xl ${config.badgeBg}`}
          >
            {event === 'wicket' ? (
              <WicketLottieAnimation size="sm" />
            ) : (
              <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-black text-sm tracking-tighter">
                {event === 'four' ? '4' : '6'}
              </span>
            )}

            <div className="flex flex-col text-left leading-tight">
              <span className="font-black text-base tracking-wide uppercase drop-shadow-xs">
                {config.title}
              </span>
              <span className="text-[11px] font-medium text-white/90">
                {batterName ? `${batterName} • ` : ''}
                {config.subtitle}
              </span>
            </div>
          </motion.div>
        </div>
      </AnimatePresence>
    );
  }
);
