'use client';

import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { EASINGS } from '@/lib/animations';

interface MotionNumberProps {
  value: number | string;
  className?: string;
  prefix?: string;
  suffix?: string;
}

export const MotionNumber = React.memo(function MotionNumber({
  value,
  className = '',
  prefix = '',
  suffix = '',
}: MotionNumberProps) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return (
      <span className={`inline-flex items-center justify-center num-font ${className}`}>
        {prefix && <span>{prefix}</span>}
        <span>{value}</span>
        {suffix && <span>{suffix}</span>}
      </span>
    );
  }

  return (
    <span className={`inline-flex overflow-hidden items-center justify-center num-font ${className}`}>
      {prefix && <span>{prefix}</span>}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={String(value)}
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -8, opacity: 0 }}
          transition={{ duration: 0.18, ease: EASINGS.easeOut }}
          className="inline-block"
        >
          {value}
        </motion.span>
      </AnimatePresence>
      {suffix && <span>{suffix}</span>}
    </span>
  );
});
