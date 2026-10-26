'use client';

import React, { useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { PAGE_TRANSITION_VARIANTS } from '@/lib/animations';

interface PageTransitionProps {
  children: React.ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();
  const shouldReduceMotion = useReducedMotion();
  const isFirstMountRef = useRef(true);

  useEffect(() => {
    isFirstMountRef.current = false;
  }, []);

  if (shouldReduceMotion) {
    return (
      <div className="flex-1 w-full flex flex-col min-w-0">
        {children}
      </div>
    );
  }

  return (
    <motion.div
      key={pathname}
      variants={PAGE_TRANSITION_VARIANTS}
      initial={isFirstMountRef.current ? false : "initial"}
      animate="animate"
      className="flex-1 w-full flex flex-col min-w-0 will-change-[transform,opacity]"
    >
      {children}
    </motion.div>
  );
}
