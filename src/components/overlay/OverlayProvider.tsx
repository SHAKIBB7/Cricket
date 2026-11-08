'use client';

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

/**
 * Overlay coordination (master prompt Phase 2). Guarantees the
 * primary-layer invariant: only ONE primary sheet/modal is active at a
 * time. When a new primary overlay claims the slot, the previous owner
 * is superseded and closes itself (its primitive watches isSuperseded
 * and calls its own onClose, so exit animations and state cleanup stay
 * with the owner). Confirmation tiers do not claim the primary slot —
 * they are allowed to sit temporarily above the active primary.
 */
interface OverlayContextValue {
  activePrimaryId: string | null;
  claimPrimary: (id: string) => void;
  releasePrimary: (id: string) => void;
}

const OverlayContext = createContext<OverlayContextValue | null>(null);

export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const [activePrimaryId, setActivePrimaryId] = useState<string | null>(null);
  const activeRef = useRef<string | null>(null);

  const claimPrimary = useCallback((id: string) => {
    activeRef.current = id;
    setActivePrimaryId(id);
  }, []);

  const releasePrimary = useCallback((id: string) => {
    if (activeRef.current === id) {
      activeRef.current = null;
      setActivePrimaryId(null);
    }
  }, []);

  const value = useMemo(
    () => ({ activePrimaryId, claimPrimary, releasePrimary }),
    [activePrimaryId, claimPrimary, releasePrimary],
  );

  return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>;
}

/**
 * Register a primary overlay with the provider (no-op outside one).
 * Returns true when this overlay has been superseded by a newer
 * primary — the caller should close itself.
 */
export function useOverlaySlot(overlayId: string | undefined, open: boolean): { isSuperseded: boolean } {
  const ctx = useContext(OverlayContext);

  React.useEffect(() => {
    if (!ctx || !overlayId || !open) return;
    ctx.claimPrimary(overlayId);
    return () => ctx.releasePrimary(overlayId);
  }, [ctx, overlayId, open]);

  return {
    isSuperseded: Boolean(ctx && overlayId && open && ctx.activePrimaryId !== null && ctx.activePrimaryId !== overlayId),
  };
}
