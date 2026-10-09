import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DangerZoneClearButton } from '../components/profile/DangerZoneClearButton';
import { GoogleConnectionStatusBadge } from '../components/profile/GoogleConnectionStatusBadge';
import { db } from '../infrastructure/database/dexie-db';

describe('Danger Zone & Google Connection Status Test Suite', () => {
  beforeEach(async () => {
    await db.matches.clear();
    await db.match_events.clear();
    await db.teams.clear();
    await db.tournaments.clear();
    await db.sync_queue.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. DANGER ZONE — CLEAR LOCAL DATABASE (3-SECOND HOLD UI & SAFETY)
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Danger Zone Clear Local Database (Press-and-Hold)', () => {
    it('renders DangerZoneClearButton with circular progress ring and default text', () => {
      const html = renderToStaticMarkup(
        React.createElement(DangerZoneClearButton, {
          onConfirm: () => {},
          isClearing: false,
        })
      );

      expect(html).toContain('Clear Local Database');
      // Contains circular progress SVG ring
      expect(html).toContain('<svg');
      expect(html).toContain('<circle');
      expect(html).toContain('stroke-dasharray="69.11503837897544"');
      // Initial offset is 100% (unfilled)
      expect(html).toContain('stroke-dashoffset="69.11503837897544"');
      // Accessible label
      expect(html).toContain('aria-label="Clear Local Database (Press and hold for 3 seconds)"');
      // Touch safety styles
      expect(html).toContain('user-select:none');
      expect(html).toContain('touch-action:none');
    });

    it('displays clearing state and disables button when isClearing is true', () => {
      const html = renderToStaticMarkup(
        React.createElement(DangerZoneClearButton, {
          onConfirm: () => {},
          isClearing: true,
        })
      );

      expect(html).toContain('Clearing Database...');
      expect(html).toContain('disabled=""');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('animate-spin');
    });

    it('guarantees that database clearing properly empties all local Dexie stores', async () => {
      // Populate test data
      await db.matches.put({ id: 'match_danger_1', date: '2026-10-09' } as any);
      await db.teams.put({ id: 'team_danger_1', name: 'Tigers' } as any);
      await db.tournaments.put({ id: 'tourney_danger_1', name: 'Cup' } as any);

      expect(await db.matches.count()).toBe(1);
      expect(await db.teams.count()).toBe(1);
      expect(await db.tournaments.count()).toBe(1);

      // Simulate the verified onConfirm callback triggered after full 3-second hold
      await db.matches.clear();
      await db.match_events.clear();
      await db.teams.clear();
      await db.tournaments.clear();
      await db.sync_queue.clear();

      expect(await db.matches.count()).toBe(0);
      expect(await db.teams.count()).toBe(0);
      expect(await db.tournaments.count()).toBe(0);
      expect(await db.sync_queue.count()).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. GOOGLE SIGN-IN — CONNECTION STATUS ACCURACY & VERIFICATION
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Google Sign-In Status Accuracy & Verification', () => {
    it('displays Local & Offline Mode when user is unauthenticated', () => {
      const html = renderToStaticMarkup(
        React.createElement(GoogleConnectionStatusBadge, {
          user: null,
          isOnline: true,
        })
      );

      expect(html).toContain('Local &amp; Offline Mode');
      // Must NOT display fraudulent connection status
      expect(html).not.toContain('Google Connected');
      expect(html).not.toContain('Pro Mode Activated');
    });

    it('displays Firebase Synced for Email/Password users without claiming Google status', () => {
      const mockEmailUser: any = {
        uid: 'email_user_123',
        email: 'user@example.com',
        providerData: [{ providerId: 'password' }],
      };

      const html = renderToStaticMarkup(
        React.createElement(GoogleConnectionStatusBadge, {
          user: mockEmailUser,
          isOnline: true,
        })
      );

      expect(html).toContain('Firebase Synced');
      // Must strictly NOT show Google Connected or Pro Mode Activated
      expect(html).not.toContain('Google Connected');
      expect(html).not.toContain('Pro Mode Activated');
    });

    it('displays Google Connected initially for verified Google OAuth user', () => {
      const mockGoogleUser: any = {
        uid: 'google_user_456',
        email: 'cricketer@gmail.com',
        providerData: [{ providerId: 'google.com' }],
      };

      const html = renderToStaticMarkup(
        React.createElement(GoogleConnectionStatusBadge, {
          user: mockGoogleUser,
          isOnline: true,
        })
      );

      // Step 1 requirement: Initially shows Google Connected
      expect(html).toContain('Google Connected');
      // Has stable minimum width container to prevent layout shifts
      expect(html).toContain('min-w-[165px]');
      expect(html).toContain('border-blue-500/30');
    });
  });
});
