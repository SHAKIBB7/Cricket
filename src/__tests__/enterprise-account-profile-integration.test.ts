import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ProfilePage from '../app/profile/page';
import { EditProfileModal } from '../components/profile/EditProfileModal';
import { TRANSLATIONS } from '../context/LanguageContext';
import { db } from '../infrastructure/database/dexie-db';
import { UserProfileService } from '../infrastructure/auth/UserProfileService';
import { FeatureHubRepository } from '../infrastructure/storage/FeatureHubRepository';
import * as AuthContextModule from '../context/AuthContext';
import * as LanguageContextModule from '../context/LanguageContext';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
  }),
}));

describe('Enterprise Accounts & Profile Functional Integration Suite', () => {
  beforeEach(async () => {
    await db.user_profile.clear();
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
  // 1. EDIT PROFILE MODAL COMPONENT TESTS
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Edit Profile Modal Component', () => {
    it('renders EditProfileModal with avatar presets, display name input, and actions when open', () => {
      const html = renderToStaticMarkup(
        React.createElement(EditProfileModal, {
          isOpen: true,
          onClose: () => {},
          currentDisplayName: 'Tamim Iqbal',
          currentPhotoURL: 'https://example.com/tamim.png',
          email: 'tamim@tigers.bd',
          onSave: async () => {},
        })
      );

      expect(html).toContain('Edit Profile');
      expect(html).toContain('Tamim Iqbal');
      expect(html).toContain('tamim@tigers.bd');
      expect(html).toContain('Cricket Avatar Presets');
      expect(html).toContain('src="/assets/illustrations/strike_batsman.png"');
      expect(html).toContain('src="/assets/illustrations/opening_bowler.png"');
      expect(html).toContain('Upload Image');
      expect(html).toContain('Save Changes');
      expect(html).toContain('Cancel');
    });

    it('returns null when isOpen is false', () => {
      const html = renderToStaticMarkup(
        React.createElement(EditProfileModal, {
          isOpen: false,
          onClose: () => {},
          currentDisplayName: 'Tamim Iqbal',
          currentPhotoURL: null,
          email: 'tamim@tigers.bd',
          onSave: async () => {},
        })
      );

      expect(html).toBe('');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. USER PROFILE SERVICE — PHOTO URL PERSISTENCE & LOCAL CACHE
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. UserProfileService Photo URL Persistence', () => {
    it('persists photoURL to Dexie local cache and returns updated profile data', async () => {
      const uid = 'user_photo_test_123';
      await UserProfileService.syncOrCreateUserProfile({
        uid,
        displayName: 'Taskin Ahmed',
        email: 'taskin@tigers.bd',
        photoURL: null,
      });

      const updated = await UserProfileService.updatePhotoURL(
        uid,
        '/assets/illustrations/opening_bowler.png'
      );

      expect(updated.photoURL).toBe('/assets/illustrations/opening_bowler.png');

      const local = await FeatureHubRepository.loadProfileByUid(uid);
      expect(local?.photoUrl).toBe('/assets/illustrations/opening_bowler.png');
    });

    it('allows clearing photoURL by passing null', async () => {
      const uid = 'user_clear_photo_456';
      await UserProfileService.syncOrCreateUserProfile({
        uid,
        displayName: 'Litton Das',
        email: 'litton@tigers.bd',
        photoURL: 'https://example.com/litton.jpg',
      });

      const updated = await UserProfileService.updatePhotoURL(uid, null);
      expect(updated.photoURL).toBeNull();

      const local = await FeatureHubRepository.loadProfileByUid(uid);
      expect(local?.photoUrl).toBeUndefined();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. ENTERPRISE PREFERENCES & APPEARANCE (THEME & LANGUAGE)
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Enterprise Preferences & Appearance Controls', () => {
    it('renders Theme Appearance selector with Light, Dark, and Sunlight options', () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: {
          uid: 'user_theme_test',
          displayName: 'Najmul Shanto',
          email: 'shanto@tigers.bd',
          providerData: [{ providerId: 'google.com' }],
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

      expect(html).toContain('Preferences &amp; Display');
      expect(html).toContain('Theme Appearance');
      expect(html).toContain('Light');
      expect(html).toContain('Dark');
      expect(html).toContain('Sunlight');
      expect(html).toContain('English');
      expect(html).toContain('বাংলা');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. INTERACTIVE STAT CARDS & QUICK NAVIGATION
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. Interactive Stat Cards & Quick Navigation', () => {
    it('renders interactive navigation cards for Local Matches, Saved Squads, and Tournaments', () => {
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

      expect(html).toContain('Account Overview &amp; Quick Navigation');
      expect(html).toContain('Local Matches');
      expect(html).toContain('Saved Squads');
      expect(html).toContain('Tournaments');
      expect(html).toContain('Pending Sync');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. SECURITY & EMAIL ACCOUNT ACTIONS
  // ───────────────────────────────────────────────────────────────────────────
  describe('5. Security & Email Account Actions', () => {
    it('renders Reset Password button for non-Google authenticated users', () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: {
          uid: 'user_email_sec_123',
          displayName: 'Towhid Hridoy',
          email: 'towhid@tigers.bd',
          emailVerified: true,
          providerData: [{ providerId: 'password' }],
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

      expect(html).toContain('Towhid Hridoy');
      expect(html).toContain('towhid@tigers.bd');
      expect(html).toContain('Reset Password');
      expect(html).toContain('Verified');
    });

    it('renders Verify Email button when email is unverified', () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: {
          uid: 'user_unverified_123',
          displayName: 'Rishad Hossain',
          email: 'rishad@tigers.bd',
          emailVerified: false,
          providerData: [{ providerId: 'password' }],
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

      expect(html).toContain('Verify Email');
    });
  });
});
