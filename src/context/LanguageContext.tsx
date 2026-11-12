'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

export type Language = 'en' | 'bn';

import { enDictionary } from '@/i18n/en';


interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Hydration (enterprise fix, 2026-11-12): the initial state
  // must match the server render ('en') — reading localStorage
  // in the initializer (the old L-1 choice) made the client's
  // first render diverge from the SSR HTML for saved-Bengali
  // users, failing hydration and forcing React to discard the
  // whole root on every cold load. The mount effect below
  // applies the saved language immediately after hydration;
  // note t() served English strings until the BN chunk landed
  // anyway, so first-paint text timing is unchanged — only the
  // hydration failure (and full root re-render) goes away.
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('preferred_language') as Language;
      if (saved === 'en' || saved === 'bn') {
        setLanguageState(saved);
      }
    } catch {
      // Ignore storage read errors
    }
  }, []);

  // WCAG 3.1.1: keep <html lang> truthful — the server renders
  // lang="en"; once the active language resolves (here and on
  // every later switch) the document language follows it.
  useEffect(() => {
    document.documentElement.lang = language === 'bn' ? 'bn' : 'en';
  }, [language]);

  // Performance cleanup (2026-11-11): the Bengali dictionary is
  // ~104 KB of the old monolithic LanguageContext. It now ships
  // as its own chunk (src/i18n/bn.ts) and loads only while
  // Bengali is active; until it lands, t() serves the English
  // string per key (identical to the fallback text), then the
  // provider re-renders in Bengali. English users never download
  // it at all.
  const [bnDictionary, setBnDictionary] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    if (language !== 'bn' || bnDictionary) return;
    let alive = true;
    import('@/i18n/bn')
      .then((m) => {
        if (alive) setBnDictionary(m.bnDictionary);
      })
      .catch(() => {
        // Chunk failed (offline first visit): t() keeps serving
        // English strings; a later language toggle retries.
      });
    return () => {
      alive = false;
    };
  }, [language, bnDictionary]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem('preferred_language', lang);
    } catch {
      // Ignore storage write errors
    }
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguageState((prev) => {
      const next: Language = prev === 'en' ? 'bn' : 'en';
      try {
        localStorage.setItem('preferred_language', next);
      } catch {
        // Ignore storage write errors
      }
      return next;
    });
  }, []);

  const t = useCallback(
    (key: string, fallback?: string): string => {
      const primary = language === 'bn' ? bnDictionary : enDictionary;
      const text = primary?.[key] ?? enDictionary[key];
      if (text !== undefined) return text;
      return fallback !== undefined ? fallback : key;
    },
    [language, bnDictionary]
  );

  // F4-11: memoize the provider value (matching the other providers)
  // so consumers don't re-render on unrelated provider renders.
  const value = useMemo(
    () => ({ language, setLanguage, toggleLanguage, t }),
    [language, setLanguage, toggleLanguage, t]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext);
  if (!context) {
    // Non-throwing fallback for components rendered outside provider
    return {
      language: 'en',
      setLanguage: () => {},
      toggleLanguage: () => {},
      t: (key: string, fallback?: string) => fallback || key,
    };
  }
  return context;
}
