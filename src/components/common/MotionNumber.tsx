import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface MotionNumberProps {
  value: number | string;
  className?: string;
  prefix?: string;
  suffix?: string;
}

export function MotionNumber({ value, className = '', prefix = '', suffix = '' }: MotionNumberProps) {
  return (
    <span className={`inline-flex overflow-hidden items-center justify-center ${className}`}>
      {prefix && <span>{prefix}</span>}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: 15, opacity: 0, filter: 'blur(2px)' }}
          animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
          exit={{ y: -15, opacity: 0, filter: 'blur(2px)' }}
          transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
          className="inline-block"
        >
          {value}
        </motion.span>
      </AnimatePresence>
      {suffix && <span>{suffix}</span>}
    </span>
  );
}
