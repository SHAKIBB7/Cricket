'use client';

import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Sparkles, ShieldCheck, HardDrive } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface GoogleConnectionStatusBadgeProps {
  user: User | null;
  isOnline?: boolean;
  className?: string;
}

export function GoogleConnectionStatusBadge({
  user,
  isOnline = true,
  className = '',
}: GoogleConnectionStatusBadgeProps) {
  const isGoogleUser = Boolean(
    user?.providerData?.some((p) => p.providerId === 'google.com')
  );

  const [phase, setPhase] = useState<'GOOGLE_CONNECTED' | 'PRO_MODE'>('GOOGLE_CONNECTED');

  useEffect(() => {
    if (!isGoogleUser) return;

    // Step 1: Immediately show "Google Connected" upon login
    setPhase('GOOGLE_CONNECTED');

    let intervalId: NodeJS.Timeout | null = null;

    // Step 2: After 3.5s, transition to "Pro Mode Activated"
    const timeoutId = setTimeout(() => {
      setPhase('PRO_MODE');

      // Step 3: Thereafter, rhythmically alternate in synchronized presentation
      intervalId = setInterval(() => {
        setPhase((prev) => (prev === 'GOOGLE_CONNECTED' ? 'PRO_MODE' : 'GOOGLE_CONNECTED'));
      }, 4000);
    }, 3500);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [isGoogleUser, user?.uid]);

  // Genuine status presentation based on real authentication state
  if (!user) {
    return (
      <span
        className={`font-semibold bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-500/30 px-2.5 py-0.5 rounded-full text-caption inline-flex items-center gap-1.5 shrink-0 select-none ${className}`}
        title="Local storage mode active"
      >
        <HardDrive className="w-3 h-3 text-slate-400" />
        <span>Local &amp; Offline Mode</span>
      </span>
    );
  }

  if (!isGoogleUser) {
    return (
      <span
        className={`font-semibold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full text-caption inline-flex items-center gap-1.5 shrink-0 select-none ${className}`}
        title="Firebase Auth Profile Synced"
      >
        <ShieldCheck className="w-3 h-3 text-emerald-500" />
        <span>Firebase Synced</span>
      </span>
    );
  }

  const isGooglePhase = phase === 'GOOGLE_CONNECTED';

  return (
    <span
      className={`font-semibold px-2.5 py-0.5 rounded-full text-caption inline-flex items-center justify-center shrink-0 min-w-[165px] h-[26px] transition-colors duration-500 border select-none ${
        isGooglePhase
          ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30'
          : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
      } ${className}`}
      aria-live="polite"
    >
      <AnimatePresence mode="wait" initial={false}>
        {isGooglePhase ? (
          <motion.span
            key="google-connected"
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Google Connected</span>
          </motion.span>
        ) : (
          <motion.span
            key="pro-mode-activated"
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Sparkles className="w-3 h-3 text-emerald-500 animate-pulse" />
            <span>Pro Mode Activated</span>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
