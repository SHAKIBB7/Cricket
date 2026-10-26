import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ProfilePage from '../app/profile/page';
import { TRANSLATIONS } from '../context/LanguageContext';
import { db } from '../infrastructure/database/dexie-db';
import * as AuthContextModule from '../context/AuthContext';
import * as LanguageContextModule from '../context/LanguageContext';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
  }),
}));

describe('Account & User Profile Page Redesign — Compact Enterprise UI/UX Suite', () => {
  beforeEach(async () => {
    await db.matches.clear();
    await db.match_events.clear();
    await db.teams.clear();
    await db.tournaments.clear();
    await db.sync_queue.clear();
    await db.app_metadata.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. UI SIMPLIFICATION & DEVELOPER DIAGNOSTICS SEPARATION
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. UI Simplification & Developer Diagnostics Separation', () => {
    it('removes duplicated Pro Mode from H1 header and provides clean page title', () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: {
          uid: 'test_user_google_123',
          displayName: 'Tamim Iqbal',
          email: 'tamim@tigers.bd',
          photoURL: 'https://example.com/tamim.png',
          providerData: [{ providerId: 'google.com' }],
        } as any,
        profile: {
          uid: 'test_user_google_123',
          displayName: 'Tamim Iqbal',
          email: 'tamim@tigers.bd',
          syncStatus: 'SYNCED',
        } as any,
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
      });

      const html = renderToStaticMarkup(React.createElement(ProfilePage));

      // H1 must contain clean title
      expect(html).toContain('Account &amp; Profile');
      // Subtitle is clean and user-facing
      expect(html).toContain('Manage your profile, cloud sync, and data backups');
      // Must NOT contain technical dev jargon right in header
      expect(html).not.toContain('Firebase Auth, Firestore Profile Sync &amp; Personal Google Drive Backups');
    });

    it('houses technical details inside a collapsed System & Developer Diagnostics disclosure', () => {
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
      });

      const html = renderToStaticMarkup(React.createElement(ProfilePage));

      // Collapsible details element for diagnostics
      expect(html).toContain('System &amp; Developer Diagnostics');
      expect(html).toContain('<details');
      // Contains version and engine specs inside diagnostics
      expect(html).toContain('Cric Scorer Pro • Version 2.5.0');
      expect(html).toContain('Official ICC Rules Engine • MCC Law 18.11 • Event-Sourced Architecture');
      expect(html).toContain('Dexie.js IndexedDB (100% Uninterrupted Offline Scoring)');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. PROFILE SECTION (COMPACT CARD, SINGLE PRO INDICATOR, UID COPY)
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Profile Section: Compact Card & Single Pro Indicator', () => {
    it('displays single Pro Account badge for Google OAuth users without repetition', () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: {
          uid: 'google_user_verified_999',
          displayName: 'Mushfiqur Rahim',
          email: 'mushi@tigers.bd',
          photoURL: 'https://example.com/mushi.jpg',
          providerData: [{ providerId: 'google.com' }],
        } as any,
        profile: {
          uid: 'google_user_verified_999',
          displayName: 'Mushfiqur Rahim',
          email: 'mushi@tigers.bd',
          syncStatus: 'SYNCED',
        } as any,
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
      });

      const html = renderToStaticMarkup(React.createElement(ProfilePage));

      // Avatar, Name, Email
      expect(html).toContain('Mushfiqur Rahim');
      expect(html).toContain('mushi@tigers.bd');
      expect(html).toContain('src="https://example.com/mushi.jpg"');

      // Exactly ONE Pro Account badge in the profile section
      expect(html).toContain('Pro Account');

      // UID with Copy UID button
      expect(html).toContain('UID: google_u..._999');
      expect(html).toContain('Copy UID');

      // Sign Out action
      expect(html).toContain('Sign Out');
    });

    it('renders Email Account badge for email/password users', () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: {
          uid: 'email_user_regular_456',
          displayName: 'Mahmudullah Riyad',
          email: 'riyad@cricket.org',
          photoURL: null,
          providerData: [{ providerId: 'password' }],
        } as any,
        profile: {
          uid: 'email_user_regular_456',
          displayName: 'Mahmudullah Riyad',
          email: 'riyad@cricket.org',
          syncStatus: 'SYNCED',
        } as any,
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
      });

      const html = renderToStaticMarkup(React.createElement(ProfilePage));

      expect(html).toContain('Mahmudullah Riyad');
      expect(html).toContain('Email Account');
      expect(html).not.toContain('Pro Account');
    });

    it('renders compact Guest Scorer mode when unauthenticated', () => {
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
      });

      const html = renderToStaticMarkup(React.createElement(ProfilePage));

      expect(html).toContain('Guest Account');
      expect(html).toContain('Offline Active');
      expect(html).toContain('Sign In with Google');
      expect(html).toContain('Create Account');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. ACCOUNT OVERVIEW STATISTICS (GENUINE DATA SOURCE)
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Account Overview Statistics', () => {
    it('renders Local Matches, Saved Squads, Tournaments, and Venues cards', () => {
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
      });

      const html = renderToStaticMarkup(React.createElement(ProfilePage));

      expect(html).toContain('Local Matches');
      expect(html).toContain('Saved Squads');
      expect(html).toContain('Tournaments');
      expect(html).toContain('Venues');
      // Tabular numbers class for stable layout
      expect(html).toContain('num-font');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. BACKUP & SYNCHRONIZATION
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. Backup & Synchronization Enterprise Suite', () => {
    it('renders Automatic Cloud Backup & Sync with active status and zero manual buttons', () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: {
          uid: 'test_user_google_123',
          displayName: 'Tamim Iqbal',
          email: 'tamim@tigers.bd',
        } as any,
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
      });

      const html = renderToStaticMarkup(React.createElement(ProfilePage));

      expect(html).toContain('Automatic Cloud Backup &amp; Sync');
      expect(html).toContain('Cloud Backup Active');
      expect(html).toContain('Zero-Friction Cross-Device Synchronization');

      // Zero manual backup buttons requirement
      expect(html).not.toContain('Backup to Google Drive');
      expect(html).not.toContain('Manage Backups / Restore');
      expect(html).not.toContain('Sync Now');
      expect(html).not.toContain('Export JSON Backup');
      expect(html).not.toContain('Import JSON Backup');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. DANGER ZONE (COLLAPSED ACCORDION & DELETION SCOPE TRANSPARENCY)
  // ───────────────────────────────────────────────────────────────────────────
  describe('5. Danger Zone Collapsed Accordion & Safety', () => {
    it('renders Danger Zone inside a collapsed details disclosure', () => {
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
      });

      const html = renderToStaticMarkup(React.createElement(ProfilePage));

      // Danger Zone heading
      expect(html).toContain('Danger Zone');
      // Must be a disclosure (<details>)
      expect(html).toContain('<details class="group border border-red-500/25');
      // Clearly outlines data scope
      expect(html).toContain('All locally recorded match scorecards &amp; ball-by-ball history');
      expect(html).toContain('Saved teams, squads, and custom player rosters');
      expect(html).toContain('Tournament brackets, standings, and net run rates');
      expect(html).toContain('Pending mutation queue awaiting cloud sync');
      expect(html).toContain('Remote cloud records in Firebase are protected');

      // Contains 3-second hold circular SVG button
      expect(html).toContain('Clear Local Database');
      expect(html).toContain('stroke-dasharray="69.11503837897544"');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. LOCALIZATION & BILINGUAL SUPPORT (BANGLA & ENGLISH)
  // ───────────────────────────────────────────────────────────────────────────
  describe('6. Localization & Bilingual Support', () => {
    it('contains comprehensive translation keys for English and Bengali', () => {
      expect(TRANSLATIONS.en.account_profile).toBe('Account & Profile');
      expect(TRANSLATIONS.bn.account_profile).toBe('অ্যাকাউন্ট ও প্রোফাইল');

      expect(TRANSLATIONS.en.pro_account).toBe('Pro Account');
      expect(TRANSLATIONS.bn.pro_account).toBe('প্রো অ্যাকাউন্ট');

      expect(TRANSLATIONS.en.local_matches).toBe('Local Matches');
      expect(TRANSLATIONS.bn.local_matches).toBe('স্থানীয় ম্যাচ');

      expect(TRANSLATIONS.en.saved_squads).toBe('Saved Squads');
      expect(TRANSLATIONS.bn.saved_squads).toBe('সংরক্ষিত দল');

      expect(TRANSLATIONS.en.auto_cloud_backup).toBe('Automatic Cloud Backup & Sync');
      expect(TRANSLATIONS.bn.auto_cloud_backup).toBe('স্বয়ংক্রিয় ক্লাউড ব্যাকআপ ও সিঙ্ক');

      expect(TRANSLATIONS.en.danger_zone).toBe('Danger Zone');
      expect(TRANSLATIONS.bn.danger_zone).toBe('বিপদজনক অঞ্চল (Danger Zone)');

      expect(TRANSLATIONS.en.dev_diagnostics).toBe('System & Developer Diagnostics');
      expect(TRANSLATIONS.bn.dev_diagnostics).toBe('সিস্টেম ও ডেভেলপার ডায়াগনস্টিকস');
    });

    it('renders with Bengali localization when active language is bn', () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: {
          uid: 'bn_user_001',
          displayName: 'সাকিব আল হাসান',
          email: 'shakib@tigers.bd',
          providerData: [{ providerId: 'google.com' }],
        } as any,
        profile: {
          uid: 'bn_user_001',
          displayName: 'সাকিব আল হাসান',
          email: 'shakib@tigers.bd',
        } as any,
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
      });

      vi.spyOn(LanguageContextModule, 'useLanguage').mockReturnValue({
        language: 'bn',
        setLanguage: vi.fn(),
        toggleLanguage: vi.fn(),
        t: (key: string, fallback?: string) => TRANSLATIONS.bn[key] || fallback || key,
      });

      const html = renderToStaticMarkup(React.createElement(ProfilePage));

      expect(html).toContain('অ্যাকাউন্ট ও প্রোফাইল');
      expect(html).toContain('সাকিব আল হাসান');
      expect(html).toContain('প্রো অ্যাকাউন্ট');
      expect(html).toContain('স্থানীয় ম্যাচ');
      expect(html).toContain('সংরক্ষিত দল');
      expect(html).toContain('স্বয়ংক্রিয় ক্লাউড ব্যাকআপ ও সিঙ্ক');
      expect(html).toContain('বিপদজনক অঞ্চল (Danger Zone)');
    });
  });
});
