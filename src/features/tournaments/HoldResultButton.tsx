'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * Hold-to-confirm button for manually recording a tournament result
 * (TAIMUR, 2026-11-11). A plain tap does nothing: the press must be
 * held for `duration` ms while a round timer ring sweeps shut on the
 * button's right edge. Releasing early cancels. Used with 3000 ms to
 * SET a result and 5000 ms on the already-set option to CLEAR it, so
 * a stray tap can neither record nor wipe a fixture result.
 */
export function HoldResultButton({
  duration,
  onComplete,
  className = '',
  title,
  tone = 'emerald',
  children,
}: {
  duration: number;
  onComplete: () => void;
  className?: string;
  title?: string;
  tone?: 'emerald' | 'amber' | 'red' | 'gold';
  children: React.ReactNode;
}) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [done, setDone] = useState(false);
  const [releaseAnim, setReleaseAnim] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(0);
  const doneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const RING_R = 7.5;
  const RING_C = 2 * Math.PI * RING_R;
  const ringStroke =
    tone === 'red'
      ? '#f87171'
      : tone === 'amber'
        ? '#f59e0b'
        : tone === 'gold'
          ? '#d97706'
          : '#10b981';

  const stopTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(
    () => () => {
      stopTimer();
      if (doneTimeoutRef.current) clearTimeout(doneTimeoutRef.current);
    },
    []
  );

  const cancel = () => {
    if (!holding) return;
    stopTimer();
    setHolding(false);
    // Let the ring sweep back instead of snapping.
    setReleaseAnim(true);
    setProgress(0);
    setTimeout(() => setReleaseAnim(false), 280);
  };

  const start = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (done) return;
    stopTimer();
    setReleaseAnim(false);
    setHolding(true);
    setProgress(0);
    startRef.current = performance.now();
    intervalRef.current = setInterval(() => {
      const elapsed = performance.now() - startRef.current;
      const p = Math.min(1, elapsed / duration);
      setProgress(p);
      if (p >= 1) {
        stopTimer();
        setHolding(false);
        setDone(true);
        onComplete();
        doneTimeoutRef.current = setTimeout(() => {
          setDone(false);
          setProgress(0);
        }, 450);
      }
    }, 16);
  };

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      data-holding={holding ? 'true' : undefined}
      data-done={done ? 'true' : undefined}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative select-none [-webkit-touch-callout:none] touch-pan-y ${
        holding ? 'scale-[0.98]' : ''
      } ${className}`}
    >
      <span className="relative z-10 block truncate">{children}</span>
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="pointer-events-none absolute right-1.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2"
        style={{ opacity: holding || done ? 1 : 0, transition: 'opacity 150ms' }}
      >
        <circle
          cx="10"
          cy="10"
          r={RING_R}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.25"
          strokeWidth="2.5"
        />
        <circle
          cx="10"
          cy="10"
          r={RING_R}
          fill="none"
          stroke={done ? ringStroke : ringStroke}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C * (1 - progress)}
          transform="rotate(-90 10 10)"
          style={{
            transition: releaseAnim
              ? 'stroke-dashoffset 250ms ease-out'
              : undefined,
          }}
        />
      </svg>
    </button>
  );
}
