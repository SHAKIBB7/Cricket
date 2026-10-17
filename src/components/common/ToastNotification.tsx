'use client';

import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { TOAST_VARIANTS } from '@/lib/animations';

interface ToastNotificationProps {
  show: boolean;
  children?: React.ReactNode;
  className?: string;
  onClose?: () => void;
}

export function ToastNotification({
  show,
  children,
  className = '',
}: ToastNotificationProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          variants={shouldReduceMotion ? undefined : TOAST_VARIANTS}
          initial={shouldReduceMotion ? { opacity: 1 } : 'initial'}
          animate={shouldReduceMotion ? { opacity: 1 } : 'animate'}
          exit={shouldReduceMotion ? { opacity: 0 } : 'exit'}
          className={className}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
