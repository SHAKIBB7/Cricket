/**
 * Feature run — Bengali i18n completion for PAGES.
 *
 * Guards:
 *  1. The en/bn dictionaries in LanguageContext stay in exact key parity.
 *  2. The new page-surface keys added by this run exist in BOTH languages
 *     with real (non-empty) Bengali translations.
 *  3. Representative pages render Bengali strings when language = 'bn'
 *     (and English when language = 'en'), using the same mock pattern as
 *     account-profile-redesign.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TRANSLATIONS } from '../i18n';
import * as LanguageContextModule from '../context/LanguageContext';
import * as AuthContextModule from '../context/AuthContext';
import TeamsPage from '../app/teams/page';
import TournamentsPage from '../app/tournaments/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const NEW_PAGE_KEY_PREFIXES = [
  'home_', 'analytics_', 'history_', 'teams_', 'tournaments_', 'grounds_',
  'newm_', 'opening_', 'center_', 'summary_', 'score_', 'profile_',
];

function mockLanguage(language: 'en' | 'bn') {
  vi.spyOn(LanguageContextModule, 'useLanguage').mockReturnValue({
    language,
    setLanguage: vi.fn(),
    toggleLanguage: vi.fn(),
    t: (key: string, fallback?: string) =>
      TRANSLATIONS[language][key] || fallback || key,
  } as any);
}

describe('Feature i18n — dictionary parity', () => {
  it('en and bn dictionaries have exactly the same key set', () => {
    const enKeys = Object.keys(TRANSLATIONS.en).sort();
    const bnKeys = Object.keys(TRANSLATIONS.bn).sort();
    expect(bnKeys).toEqual(enKeys);
    expect(enKeys.length).toBeGreaterThan(700);
  });

  it('every new page key exists in bn with a non-empty translation', () => {
    const missing: string[] = [];
    for (const key of Object.keys(TRANSLATIONS.en)) {
      if (!NEW_PAGE_KEY_PREFIXES.some((p) => key.startsWith(p))) continue;
      if (!TRANSLATIONS.bn[key] || TRANSLATIONS.bn[key].trim() === '') {
        missing.push(key);
      }
    }
    expect(missing).toEqual([]);
  });

  it('spot-checks representative page keys in both languages', () => {
    expect(TRANSLATIONS.en.teams_title).toBe('Team Squad Management');
    expect(TRANSLATIONS.bn.teams_title).toBe('দলীয় স্কোয়াড ব্যবস্থাপনা');
    expect(TRANSLATIONS.en.history_title).toBe('Match Archive');
    expect(TRANSLATIONS.bn.history_title).toBe('ম্যাচ আর্কাইভ');
    expect(TRANSLATIONS.en.tournaments_id_points_table).toBe('Points Table');
    expect(TRANSLATIONS.bn.tournaments_id_points_table).toBe('পয়েন্ট টেবিল');
    expect(TRANSLATIONS.en.home_start_match).toBe('Start Match');
    expect(TRANSLATIONS.bn.home_start_match).toBe('ম্যাচ শুরু করুন');
    expect(TRANSLATIONS.en.teams_slot_wicketkeeper).toBe('Wicketkeeper');
    expect(TRANSLATIONS.bn.teams_slot_wicketkeeper).toBe('উইকেটকিপার');
  });
});

describe('Feature i18n — pages render Bengali when language=bn', () => {
  beforeEach(() => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      profile: null,
      isLoading: false,
      isConfigured: true,
      error: null,
      signInWithGoogle: vi.fn(),
      signInWithEmail: vi.fn(),
      signUpWithEmail: vi.fn(),
      sendPasswordReset: vi.fn(),
      signOut: vi.fn(),
      updateDisplayName: vi.fn(),
      refreshProfile: vi.fn(),
      clearError: vi.fn(),
    } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('Teams page renders Bengali headings in bn mode', () => {
    mockLanguage('bn');
    const html = renderToStaticMarkup(React.createElement(TeamsPage));
    expect(html).toContain('দলীয় স্কোয়াড ব্যবস্থাপনা');
    expect(html).toContain('অধিনায়ক, ম্যানেজার ও ১৫টি কাঠামোবদ্ধ স্কোয়াড পজিশনসহ ক্লাব স্কোয়াড তৈরি করুন');
  });

  it('Teams page renders English headings in en mode', () => {
    mockLanguage('en');
    const html = renderToStaticMarkup(React.createElement(TeamsPage));
    expect(html).toContain('Team Squad Management');
    expect(html).toContain('Create club squads with captains, managers');
  });

  it('Tournaments page renders Bengali headings in bn mode', () => {
    mockLanguage('bn');
    const html = renderToStaticMarkup(React.createElement(TournamentsPage));
    expect(html).toContain('টুর্নামেন্ট ও লিগ');
    expect(html).toContain('নকআউট ব্র্যাকেট, রাউন্ড-রবিন লিগ, IPL প্লে-অফ ও স্ট্যান্ডিং পরিচালনা করুন');
  });
});
