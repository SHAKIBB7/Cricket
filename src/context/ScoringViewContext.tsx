'use client';

import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';

export type ActiveScorerView = null | 'matches' | 'advancedAnalytics' | 'scoreboard';

interface ScoringViewContextType {
  activeView: ActiveScorerView;
  setActiveView: (view: ActiveScorerView) => void;
  toggleView: (view: 'matches' | 'advancedAnalytics' | 'scoreboard') => void;
  closeView: () => void;
}

const ScoringViewContext = createContext<ScoringViewContextType | undefined>(undefined);

export function ScoringViewProvider({ children }: { children: ReactNode }) {
  const [activeView, setActiveView] = useState<ActiveScorerView>(null);

  const toggleView = useCallback((view: 'matches' | 'advancedAnalytics' | 'scoreboard') => {
    setActiveView((current) => (current === view ? null : view));
  }, []);

  const closeView = useCallback(() => {
    setActiveView(null);
  }, []);

  // Bug 14 (contributing factor): this provider wraps the whole app and used
  // to hand out a brand-new value object on every render, so every consumer
  // (Navigation, the score page) re-rendered even when nothing view-related
  // had changed. The value is now memoized and the callbacks are stable.
  const value = useMemo(
    () => ({
      activeView,
      setActiveView,
      toggleView,
      closeView,
    }),
    [activeView, toggleView, closeView]
  );

  return <ScoringViewContext.Provider value={value}>{children}</ScoringViewContext.Provider>;
}

export function useScoringView() {
  const context = useContext(ScoringViewContext);
  if (!context) {
    return {
      activeView: null as ActiveScorerView,
      setActiveView: () => {},
      toggleView: () => {},
      closeView: () => {},
    };
  }
  return context;
}
