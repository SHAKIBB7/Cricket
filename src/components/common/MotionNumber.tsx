import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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
  return (
    <span className={`inline-flex overflow-hidden items-center justify-center ${className}`}>
      {prefix && <span>{prefix}</span>}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: 15, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -15, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
          className="inline-block will-change-[transform,opacity]"
        >
          {value}
        </motion.span>
      </AnimatePresence>
      {suffix && <span>{suffix}</span>}
    </span>
  );
});
