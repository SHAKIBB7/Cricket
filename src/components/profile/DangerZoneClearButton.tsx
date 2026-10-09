'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Trash2, RefreshCw } from 'lucide-react';

interface DangerZoneClearButtonProps {
  onConfirm: () => Promise<void> | void;
  isClearing?: boolean;
  className?: string;
  holdDurationMs?: number;
}

export function DangerZoneClearButton({
  onConfirm,
  isClearing = false,
  className = '',
  holdDurationMs = 3000,
}: DangerZoneClearButtonProps) {
  const [holdProgress, setHoldProgress] = useState(0); // 0.0 to 1.0
  const [isHolding, setIsHolding] = useState(false);

  const isHoldingRef = useRef(false);
  const startTimeRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const isClearingRef = useRef(isClearing);

  useEffect(() => {
    isClearingRef.current = isClearing;
  }, [isClearing]);

  const cancelHold = useCallback(() => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    isHoldingRef.current = false;
    startTimeRef.current = null;
    setIsHolding(false);
    setHoldProgress(0);
  }, []);

  const startHold = useCallback(() => {
    if (isClearingRef.current || isHoldingRef.current) return;

    isHoldingRef.current = true;
    setIsHolding(true);
    setHoldProgress(0);
    const start = performance.now();
    startTimeRef.current = start;

    const tick = (now: number) => {
      if (!isHoldingRef.current) return;

      const elapsed = now - start;
      const progress = Math.min(1, elapsed / holdDurationMs);
      setHoldProgress(progress);

      if (progress >= 1) {
        // 3 seconds complete!
        isHoldingRef.current = false;
        setIsHolding(false);
        setHoldProgress(0);
        rafIdRef.current = null;
        onConfirm();
      } else {
        rafIdRef.current = requestAnimationFrame(tick);
      }
    };

    rafIdRef.current = requestAnimationFrame(tick);
  }, [holdDurationMs, onConfirm]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  // Keyboard accessibility
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      if (!e.repeat && !isHoldingRef.current) {
        e.preventDefault();
        startHold();
      }
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      cancelHold();
    }
  };

  // SVG circular progress calculation
  // Radius = 11, Circumference = 2 * PI * 11 ≈ 69.115
  const radius = 11;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - holdProgress);

  return (
    <button
      type="button"
      onPointerDown={(e) => {
        if (e.button === 0) {
          startHold();
        }
      }}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      onTouchStart={startHold}
      onTouchEnd={cancelHold}
      onTouchCancel={cancelHold}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onBlur={cancelHold}
      onClick={(e) => {
        // Disallow standard quick click from deleting data
        e.preventDefault();
      }}
      onContextMenu={(e) => {
        // Prevent browser context menu on long-press
        e.preventDefault();
      }}
      onDragStart={(e) => e.preventDefault()}
      disabled={isClearing}
      aria-label="Clear Local Database (Press and hold for 3 seconds)"
      aria-busy={isClearing}
      aria-pressed={isHolding}
      className={`relative overflow-hidden bg-red-600 hover:bg-red-500 text-white font-bold transition-colors rounded-xl text-caption min-h-[38px] px-4 py-2 flex items-center justify-center gap-2.5 select-none touch-none active:scale-95 ${
        isClearing ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
      } ${className}`}
      style={{
        WebkitTouchCallout: 'none',
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      {/* Subtle background hold progression layer */}
      {isHolding && (
        <span
          className="absolute inset-y-0 left-0 bg-red-800/40 pointer-events-none transition-none"
          style={{ width: `${holdProgress * 100}%` }}
        />
      )}

      {/* Circular Progress Ring Indicator framing the Trash icon */}
      <div className="relative flex items-center justify-center w-5 h-5 shrink-0 z-10">
        <svg
          className="absolute -inset-1 w-7 h-7 -rotate-90 pointer-events-none"
          viewBox="0 0 28 28"
          aria-hidden="true"
        >
          {/* Subtle track ring */}
          <circle
            cx="14"
            cy="14"
            r={radius}
            stroke="currentColor"
            strokeWidth="2.5"
            className="text-white/25"
            fill="none"
          />
          {/* Animated circular progress indicator */}
          <circle
            cx="14"
            cy="14"
            r={radius}
            stroke="white"
            strokeWidth="2.5"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="none"
            style={{
              transition: isHolding ? 'none' : 'stroke-dashoffset 150ms ease-out',
            }}
          />
        </svg>

        {isClearing ? (
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
        ) : (
          <Trash2 className="w-3.5 h-3.5 text-white" />
        )}
      </div>

      <span className="relative z-10 whitespace-nowrap">
        {isClearing
          ? 'Clearing Database...'
          : isHolding
          ? `Hold to clear (${Math.max(0.1, 3 - holdProgress * 3).toFixed(1)}s)...`
          : 'Clear Local Database'}
      </span>
    </button>
  );
}
