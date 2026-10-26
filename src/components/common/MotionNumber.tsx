'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion, type Variants } from 'framer-motion';

export interface MotionNumberProps {
  value: number | string;
  className?: string;
  prefix?: string;
  suffix?: string;
  mode?: 'auto' | 'standard' | 'cricket-overs' | 'decimal';
  animateIntermediate?: boolean;
  scalePop?: boolean;
  duration?: number;
  ariaLabel?: string;
}

interface DigitTrackProps {
  digit: string;
  direction?: number;
  duration?: number;
  scalePop?: boolean;
}

/**
 * DigitTrack renders an independent vertical rolling track for a single digit (0-9).
 * Unchanged digits stay stationary without triggering re-animation.
 * Changing digits roll in the specified direction with a subtle scale-pop.
 */
const DigitTrack = React.memo(function DigitTrack({
  digit,
  direction = 1,
  duration = 0.24,
  scalePop = true,
}: DigitTrackProps) {
  const variants: Variants = {
    initial: (dir: number) => ({
      y: dir > 0 ? '100%' : dir < 0 ? '-100%' : '0%',
      opacity: 0,
      scale: scalePop ? 1.12 : 1,
    }),
    animate: {
      y: '0%',
      opacity: 1,
      scale: 1,
      transition: {
        y: { duration, ease: [0.16, 1, 0.3, 1] as const },
        opacity: { duration: duration * 0.6, ease: 'easeOut' },
        scale: { duration: duration * 1.15, ease: [0.16, 1, 0.3, 1] as const },
      },
    },
    exit: (dir: number) => ({
      y: dir > 0 ? '-100%' : dir < 0 ? '100%' : '0%',
      opacity: 0,
      scale: 0.98,
      transition: {
        y: { duration: duration * 0.85, ease: [0.4, 0, 1, 1] as const },
        opacity: { duration: duration * 0.5 },
      },
    }),
  };

  return (
    <span
      className="relative inline-flex items-center justify-center overflow-hidden tabular-nums select-none"
      style={{
        height: '1.25em',
        lineHeight: '1.25em',
        verticalAlign: 'baseline',
        minWidth: '0.62ch',
      }}
    >
      <AnimatePresence mode="popLayout" initial={false} custom={direction}>
        <motion.span
          key={digit}
          custom={direction}
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="inline-block tabular-nums text-center"
        >
          {digit}
        </motion.span>
      </AnimatePresence>
    </span>
  );
});

function parseCricketOvers(val: number | string): { overs: string; balls: string } | null {
  const str = String(val).trim();
  const match = str.match(/^(\d+)\.([0-5])$/);
  if (!match) return null;
  return { overs: match[1], balls: match[2] };
}

function parseDecimal(val: number | string): { intPart: string; fracPart: string } | null {
  const str = String(val).trim();
  const match = str.match(/^(\d+)\.(\d+)$/);
  if (!match) return null;
  return { intPart: match[1], fracPart: match[2] };
}

export const MotionNumber = React.memo(function MotionNumber({
  value,
  className = '',
  prefix = '',
  suffix = '',
  mode = 'auto',
  animateIntermediate = true,
  scalePop = true,
  duration,
  ariaLabel,
}: MotionNumberProps) {
  const shouldReduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);

  // Target value tracker
  const [displayValue, setDisplayValue] = useState<number | string>(value);
  const [direction, setDirection] = useState<number>(1);
  const [stepDuration, setStepDuration] = useState<number>(duration || 0.24);

  const prevTargetRef = useRef<number | string>(value);
  const isInitialRenderRef = useRef<boolean>(true);
  const timersRef = useRef<NodeJS.Timeout[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const prev = prevTargetRef.current;
    prevTargetRef.current = value;

    if (value === displayValue) {
      return;
    }

    clearTimers();

    if (isInitialRenderRef.current) {
      isInitialRenderRef.current = false;
      setDisplayValue(value);
      return;
    }

    if (shouldReduceMotion) {
      setDisplayValue(value);
      return;
    }

    // Determine numerical structure and stepping
    const effectiveMode =
      mode !== 'auto'
        ? mode
        : typeof value === 'string' && /^\d+\.[0-5]$/.test(value.trim()) && typeof prev === 'string' && /^\d+\.[0-5]$/.test(prev.trim())
        ? 'cricket-overs'
        : String(value).includes('.')
        ? 'decimal'
        : 'standard';

    // 1. Cricket Overs Mode
    if (effectiveMode === 'cricket-overs') {
      const currOver = parseCricketOvers(displayValue);
      const nextOver = parseCricketOvers(value);

      if (currOver && nextOver) {
        const currBalls = parseInt(currOver.overs, 10) * 6 + parseInt(currOver.balls, 10);
        const targetBalls = parseInt(nextOver.overs, 10) * 6 + parseInt(nextOver.balls, 10);
        const diff = targetBalls - currBalls;

        if (diff === 0) {
          setDisplayValue(value);
          return;
        }

        if (diff > 0) {
          setDirection(1);
          if (diff === 1 || !animateIntermediate) {
            setStepDuration(duration || 0.38);
            setDisplayValue(value);
          } else if (diff <= 6) {
            // Sequence through valid legal balls (e.g. 4.4 -> 4.5 -> 5.0)
            const steps: string[] = [];
            for (let b = currBalls + 1; b <= targetBalls; b++) {
              steps.push(`${Math.floor(b / 6)}.${b % 6}`);
            }
            const totalTime = Math.min(800, Math.max(450, steps.length * 120));
            const interval = Math.round(totalTime / steps.length);

            steps.forEach((s, idx) => {
              const isLast = idx === steps.length - 1;
              const tid = setTimeout(() => {
                setStepDuration(isLast ? (duration || 0.35) : Math.max(0.09, interval / 1000));
                setDisplayValue(s);
              }, idx * interval);
              timersRef.current.push(tid);
            });
          } else {
            setStepDuration(duration || 0.38);
            setDisplayValue(value);
          }
        } else {
          // Reversal / Undo
          setDirection(-1);
          setStepDuration(duration || 0.35);
          setDisplayValue(value);
        }
        return;
      }
    }

    // 2. Standard Integer Mode (Sequential counting for runs, wickets, balls, etc.)
    const isCurrInt =
      (typeof displayValue === 'number' && Number.isInteger(displayValue)) ||
      (typeof displayValue === 'string' && /^\d+$/.test(displayValue.trim()));
    const isTargetInt =
      (typeof value === 'number' && Number.isInteger(value)) ||
      (typeof value === 'string' && /^\d+$/.test(value.trim()));

    if (isCurrInt && isTargetInt && effectiveMode === 'standard') {
      const currNum = typeof displayValue === 'number' ? displayValue : parseInt(displayValue.trim(), 10);
      const targetNum = typeof value === 'number' ? value : parseInt(value.trim(), 10);
      const diff = targetNum - currNum;

      if (diff === 0) return;

      if (diff > 0) {
        setDirection(1);
        if (diff === 1 || !animateIntermediate) {
          setStepDuration(duration || 0.40);
          setDisplayValue(value);
        } else if (diff <= 12) {
          // Multi-run scoring events (e.g. +2, +3, +4, +6)
          const steps: (number | string)[] = [];
          for (let i = currNum + 1; i <= targetNum; i++) {
            steps.push(typeof value === 'number' ? i : String(i));
          }
          const totalTime = Math.min(850, Math.max(450, steps.length * 115));
          const interval = Math.round(totalTime / steps.length);

          steps.forEach((s, idx) => {
            const isLast = idx === steps.length - 1;
            const tid = setTimeout(() => {
              setStepDuration(isLast ? (duration || 0.35) : Math.max(0.09, interval / 1000));
              setDisplayValue(s);
            }, idx * interval);
            timersRef.current.push(tid);
          });
        } else {
          // Larger multi-unit jump: evenly distributed keyframes
          const steps: (number | string)[] = [];
          const numSteps = 7;
          for (let i = 1; i <= numSteps; i++) {
            const v = Math.round(currNum + (diff * i) / numSteps);
            const formatted = typeof value === 'number' ? v : String(v);
            if (!steps.includes(formatted)) steps.push(formatted);
          }
          if (steps[steps.length - 1] !== value) steps.push(value);
          const interval = Math.round(700 / steps.length);

          steps.forEach((s, idx) => {
            const isLast = idx === steps.length - 1;
            const tid = setTimeout(() => {
              setStepDuration(isLast ? (duration || 0.35) : Math.max(0.09, interval / 1000));
              setDisplayValue(s);
            }, idx * interval);
            timersRef.current.push(tid);
          });
        }
      } else {
        // Decrease (Undo / Score correction / Innings reset)
        setDirection(-1);
        setStepDuration(duration || 0.35);
        setDisplayValue(value);
      }
      return;
    }

    // 3. Decimal / Calculated Rates (Strike Rate, Economy, Run Rate)
    const currFloat = parseFloat(String(displayValue));
    const targetFloat = parseFloat(String(value));
    if (!isNaN(currFloat) && !isNaN(targetFloat)) {
      const diff = targetFloat - currFloat;
      if (diff === 0) return;
      setDirection(diff >= 0 ? 1 : -1);
      setStepDuration(duration || 0.38);
      setDisplayValue(value);
      return;
    }

    // Fallback direct set
    setDisplayValue(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, mounted, shouldReduceMotion, animateIntermediate, mode, duration]);

  // SSR & Static rendering safety: render static clean text for SEO, SSR, and static tests
  if (!mounted || shouldReduceMotion) {
    return (
      <span className={`inline-flex items-center justify-center num-font ${className}`}>
        {prefix && <span>{prefix}</span>}
        {value}
        {suffix && <span>{suffix}</span>}
      </span>
    );
  }

  // Client rendering: tokenize and render independent digit tracks
  const valStr = String(displayValue).trim();

  // 1. Check Cricket Overs (e.g. "4.5", "5.0")
  const isCricketOversMode =
    mode === 'cricket-overs' ||
    (mode === 'auto' && /^\d+\.[0-5]$/.test(valStr));

  if (isCricketOversMode) {
    const parts = parseCricketOvers(valStr);
    if (parts) {
      const overChars = parts.overs.split('');
      const overLen = overChars.length;
      return (
        <span
          className={`inline-flex items-baseline justify-center num-font select-none ${className}`}
          aria-label={ariaLabel || String(value)}
        >
          {prefix && <span className="inline-block shrink-0">{prefix}</span>}
          {overChars.map((ch, idx) => {
            const placeFromRight = overLen - 1 - idx;
            return (
              <span key={`ov-p-${placeFromRight}`} className="inline-block">
                <DigitTrack
                  digit={ch}
                  direction={direction}
                  duration={stepDuration}
                  scalePop={scalePop}
                />
              </span>
            );
          })}
          <span key="ov-dot" className="inline-block select-none" style={{ padding: '0 0.04em' }}>
            .
          </span>
          <span key="ov-b-0" className="inline-block">
            <DigitTrack
              digit={parts.balls}
              direction={direction}
              duration={stepDuration}
              scalePop={scalePop}
            />
          </span>
          {suffix && <span className="inline-block shrink-0">{suffix}</span>}
        </span>
      );
    }
  }

  // 2. Check Decimal Rates (e.g. "133.3", "6.75")
  const decParts = parseDecimal(valStr);
  if (decParts && (mode === 'decimal' || mode === 'auto')) {
    const intChars = decParts.intPart.split('');
    const intLen = intChars.length;
    const fracChars = decParts.fracPart.split('');
    return (
      <span
        className={`inline-flex items-baseline justify-center num-font select-none ${className}`}
        aria-label={ariaLabel || String(value)}
      >
        {prefix && <span className="inline-block shrink-0">{prefix}</span>}
        {intChars.map((ch, idx) => {
          const placeFromRight = intLen - 1 - idx;
          return (
            <span key={`dec-p-${placeFromRight}`} className="inline-block">
              <DigitTrack
                digit={ch}
                direction={direction}
                duration={stepDuration}
                scalePop={scalePop}
              />
            </span>
          );
        })}
        <span key="dec-dot" className="inline-block select-none" style={{ padding: '0 0.04em' }}>
          .
        </span>
        {fracChars.map((ch, idx) => (
          <span key={`dec-f-${idx}`} className="inline-block">
            <DigitTrack
              digit={ch}
              direction={direction}
              duration={stepDuration}
              scalePop={scalePop}
            />
          </span>
        ))}
        {suffix && <span className="inline-block shrink-0">{suffix}</span>}
      </span>
    );
  }

  // 3. Pure Integer or Generic
  const tokens = valStr.match(/\d+|[^\d]+/g) || [valStr];
  return (
    <span
      className={`inline-flex items-baseline justify-center num-font select-none ${className}`}
      aria-label={ariaLabel || String(value)}
    >
      {prefix && <span className="inline-block shrink-0">{prefix}</span>}
      {tokens.map((token, tIdx) => {
        if (/^\d+$/.test(token)) {
          const chars = token.split('');
          const len = chars.length;
          return (
            <span key={`tok-${tIdx}`} className="inline-flex items-baseline">
              {chars.map((ch, cIdx) => {
                const placeFromRight = len - 1 - cIdx;
                return (
                  <span key={`tok-${tIdx}-p-${placeFromRight}`} className="inline-block">
                    <DigitTrack
                      digit={ch}
                      direction={direction}
                      duration={stepDuration}
                      scalePop={scalePop}
                    />
                  </span>
                );
              })}
            </span>
          );
        }
        return (
          <span key={`tok-${tIdx}-sep`} className="inline-block select-none" style={{ padding: '0 0.04em' }}>
            {token}
          </span>
        );
      })}
      {suffix && <span className="inline-block shrink-0">{suffix}</span>}
    </span>
  );
});

export const RollingNumber = MotionNumber;
