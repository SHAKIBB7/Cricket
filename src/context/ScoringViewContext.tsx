'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

export type ActiveScorerView = null | 'matches' | 'advancedAnalytics';

interface ScoringViewContextType {
 activeView: ActiveScorerView;
 setActiveView: (view: ActiveScorerView) => void;
 toggleView: (view: 'matches' | 'advancedAnalytics') => void;
 closeView: () => void;
}

const ScoringViewContext = createContext<ScoringViewContextType | undefined>(undefined);

export function ScoringViewProvider({ children }: { children: ReactNode }) {
 const [activeView, setActiveView] = useState<ActiveScorerView>(null);

 const toggleView = (view: 'matches' | 'advancedAnalytics') => {
 setActiveView((current) => (current === view ? null : view));
 };

 const closeView = () => {
 setActiveView(null);
 };

 return (
 <ScoringViewContext.Provider
 value={{
 activeView,
 setActiveView,
 toggleView,
 closeView,
 }}
 >
 {children}
 </ScoringViewContext.Provider>
);
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
