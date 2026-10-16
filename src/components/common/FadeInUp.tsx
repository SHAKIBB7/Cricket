'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CONTENT_FADE_UP_VARIANTS, EASINGS } from '@/lib/animations';

interface FadeInUpProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
}

export function FadeInUp({
  children,
  className = '',
  delay = 0,
  duration = 0.25,
}: FadeInUpProps) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration,
        delay,
        ease: EASINGS.easeOut,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
