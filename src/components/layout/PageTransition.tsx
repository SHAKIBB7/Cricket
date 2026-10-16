'use client';

import React from 'react';
import { usePathname } from 'next/navigation';

interface PageTransitionProps {
  children: React.ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="flex-1 w-full flex flex-col min-w-0 animate-fade-in">
      {children}
    </div>
  );
}
