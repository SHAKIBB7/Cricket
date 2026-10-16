'use client';

import React from 'react';

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
}: FadeInUpProps) {
  const style = delay > 0 ? { animationDelay: `${delay}s` } : undefined;

  return (
    <div style={style} className={`animate-fade-up ${className}`}>
      {children}
    </div>
  );
}
