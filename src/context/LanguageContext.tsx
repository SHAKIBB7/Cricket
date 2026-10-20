'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type Language = 'en' | 'bn';

export const TRANSLATIONS: Record<Language, Record<string, string>> = {
  en: {
    // Navigation
    home: 'Home',
    new_match: 'New Match',
    matches: 'Matches',
    tournaments: 'Tournaments',
    teams: 'Teams',
    analytics: 'Analytics',
    profile: 'Sync & Profile',
    scoreboard: 'SCOREBOARD',

    // Scoring Pad
    undo: 'Undo',
    swap_strike: 'Swap Strike',
    retire: 'Retire',
    penalty: 'Penalty',
    wide: 'Wide',
    no_ball: 'No Ball',
    bye: 'Byes',
    leg_bye: 'Leg Byes',
    out: 'OUT',
    change_bowler: 'Change Bowler',
    free_hit: 'FREE HIT',

    // Stats & Headers
    overs: 'Overs',
    target: 'Target',
    need: 'Need',
    runs: 'Runs',
    wickets: 'Wickets',
    balls: 'balls',
    crr: 'CRR',
    rrr: 'RRR',
    striker: 'Striker',
    non_striker: 'Non-Striker',
    bowler: 'Bowler',
    this_over: 'This Over',
    partnership: 'Partnership',
    venue: 'Venue',

    // Modals & Actions
    record_wicket: 'Record Wicket',
    select_bowler: 'Select Bowler',
    incoming_batter: 'Incoming Batter',
    delivery_type: 'Delivery Type',
    download_pdf: 'Download PDF Scorecard',
    full_scoreboard: 'View Full Scoreboard',
    share_match: 'Share Match',
    view_standings: 'View Standings',
    match_completed: 'Match Completed',
    match_tied: 'Match Tied',
    man_of_the_match: 'Player of the Match',

    // Theme & Language
    light_mode: 'Light',
    dark_mode: 'Dark',
    language: 'English',
    switch_lang: 'বাংলা',
  },
  bn: {
    // Navigation
    home: 'হোম',
    new_match: 'নতুন ম্যাচ',
    matches: 'ম্যাচসমূহ',
    tournaments: 'টুর্নামেন্ট',
    teams: 'দলসমূহ',
    analytics: 'পরিসংখ্যান',
    profile: 'প্রোফাইল ও সিঙ্ক',
    scoreboard: 'স্কোরবোর্ড',

    // Scoring Pad
    undo: 'পূর্বাবস্থায় (Undo)',
    swap_strike: 'স্ট্রাইক পরিবর্তন',
    retire: 'রিটায়ার',
    penalty: 'পেনাল্টি',
    wide: 'ওয়াইড',
    no_ball: 'নো বল',
    bye: 'বাই (Bye)',
    leg_bye: 'লেগ বাই (LB)',
    out: 'আউট',
    change_bowler: 'বোলার পরিবর্তন',
    free_hit: 'ফ্রি হিট',

    // Stats & Headers
    overs: 'ওভার',
    target: 'টার্গেট',
    need: 'প্রয়োজন',
    runs: 'রান',
    wickets: 'উইকেট',
    balls: 'বল',
    crr: 'সিআরআর (CRR)',
    rrr: 'আরআরআর (RRR)',
    striker: 'স্ট্রাইকার',
    non_striker: 'নন-স্ট্রাইকার',
    bowler: 'বোলার',
    this_over: 'চলতি ওভার',
    partnership: 'পার্টনারশিপ',
    venue: 'ভেন্যু / মাঠ',

    // Modals & Actions
    record_wicket: 'উইকেট রেকর্ড করুন',
    select_bowler: 'বোলার নির্বাচন করুন',
    incoming_batter: 'পরবর্তী ব্যাটসম্যান',
    delivery_type: 'ডেলিভারির ধরন',
    download_pdf: 'পিডিএফ ডাউনলোড',
    full_scoreboard: 'পূর্ণ স্কোরবোর্ড দেখুন',
    share_match: 'ম্যাচ শেয়ার করুন',
    view_standings: 'পয়েন্ট টেবিল দেখুন',
    match_completed: 'ম্যাচ সমাপ্ত',
    match_tied: 'ম্যাচ টাই',
    man_of_the_match: 'ম্যান অব দ্য ম্যাচ',

    // Theme & Language
    light_mode: 'লাইট',
    dark_mode: 'ডার্ক',
    language: 'বাংলা',
    switch_lang: 'English',
  },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
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
      const text = TRANSLATIONS[language]?.[key];
      if (text !== undefined) return text;
      return fallback !== undefined ? fallback : key;
    },
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
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
