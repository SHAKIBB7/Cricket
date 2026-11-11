'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * useLoadReveal — the gatekeeper of the motion system
 * (TAIMUR, 2026-11-11: Skeleton Loading + Staggered Scale-In).
 *
 * Contract (measured anti-jank rules):
 * - Data arriving within 150ms of mount renders PLAINLY — no
 *   skeleton flash, no stagger; it simply rides the page slide.
 * - Loading that exceeds 150ms shows a skeleton (showSkeleton).
 * - When data then arrives, the content reveal (staggered
 *   scale-in via RevealGroup/RevealItem) is armed — but never
 *   before mount+290ms, so the reveal can never start inside the
 *   page slide (<= 280ms). If data lands at 200ms, the skeleton
 *   stays up and `reveal` flips at 290ms; the skeleton never
 *   hands over to plain content in between.
 * - ONE-SHOT per mount: the first completed load cycle spends the
 *   machine. A fast first cycle spends it with no reveal; a slow
 *   one fires `reveal` exactly once (it then stays latched true so
 *   the mounted RevealGroup is never torn down). Later isLoading
 *   cycles never re-show a skeleton or re-fire a reveal — data
 *   refreshes render plainly.
 */
export interface LoadReveal {
  showSkeleton: boolean;
  reveal: boolean;
}

export const SKELETON_GATE_MS = 150;
export const REVEAL_FLOOR_MS = 290;

export function useLoadReveal(isLoading: boolean): LoadReveal {
  const [gateOpen, setGateOpen] = useState(false);
  const [floorPassed, setFloorPassed] = useState(false);
  const [skeletonShown, setSkeletonShown] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [spent, setSpent] = useState(false);

  // Mount-relative timers: skeleton gate at 150ms, reveal floor at
  // 290ms. Both are one-shot and cleaned up on unmount.
  useEffect(() => {
    const gate = setTimeout(() => setGateOpen(true), SKELETON_GATE_MS);
    const floor = setTimeout(() => setFloorPassed(true), REVEAL_FLOOR_MS);
    return () => {
      clearTimeout(gate);
      clearTimeout(floor);
    };
  }, []);

  // The skeleton is up while loading past the gate, and stays up
  // while a reveal is pending (data arrived before the floor) so
  // the swap is always skeleton -> reveal, never skeleton -> plain
  // -> reveal.
  const showSkeleton =
    !spent && gateOpen && (isLoading || (skeletonShown && !reveal));

  // Latch that the skeleton was actually shown for this mount.
  useEffect(() => {
    if (showSkeleton && !skeletonShown) {
      setSkeletonShown(true);
    }
  }, [showSkeleton, skeletonShown]);

  // Fire the one-shot reveal once data has arrived after a shown
  // skeleton AND the 290ms floor has passed.
  useEffect(() => {
    if (skeletonShown && !isLoading && floorPassed && !reveal) {
      setReveal(true);
      setSpent(true);
    }
  }, [skeletonShown, isLoading, floorPassed, reveal]);

  // Spend the machine on a fast first cycle: loading finished
  // before the skeleton ever showed -> plain forever.
  const skeletonShownRef = useRef(false);
  skeletonShownRef.current = skeletonShown;
  const prevLoadingRef = useRef(isLoading);
  useEffect(() => {
    const wasLoading = prevLoadingRef.current;
    prevLoadingRef.current = isLoading;
    if (wasLoading && !isLoading && !skeletonShownRef.current) {
      setSpent(true);
    }
  }, [isLoading]);

  return { showSkeleton, reveal };
}
