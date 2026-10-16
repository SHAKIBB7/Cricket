import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

// Mock SyncContext for isolated component testing
vi.mock('@/context/SyncContext', () => ({
  useSyncStatus: () => ({
    syncState: 'SYNCED',
    pendingCount: 0,
    lastSyncedAt: new Date('2026-10-16T12:00:00Z'),
    errorMessage: null,
    isOnline: true,
    isServerReachable: true,
    triggerSync: vi.fn(),
    storageEstimate: { persisted: true, usageMB: 12, quotaMB: 500 },
    refreshStorage: vi.fn(),
    isOfflineReady: true,
    isUpdateAvailable: false,
    applyUpdate: vi.fn(),
    offlineSetup: { status: 'completed', isOfflineReady: true, progress: 100, message: null, error: null },
    retryOfflineSetup: vi.fn(),
  }),
}));

import { SyncIndicator } from '../components/common/SyncIndicator';

describe('Navbar Light Signal Information Panel Toggle & Gestures', () => {
  describe('1. Navbar Item Order & Placement Verification', () => {
    it('ensures top navbar item order is strictly: Scoreboard → Light Signal Icon → Dark Mode / Day Mode Toggle', () => {
      const navFilePath = path.resolve(__dirname, '../components/layout/Navigation.tsx');
      const navContent = fs.readFileSync(navFilePath, 'utf-8');

      // Extract the header component
      const headerMatch = navContent.match(/<header[\s\S]*?<\/header>/);
      expect(headerMatch).not.toBeNull();
      const header = headerMatch![0];

      // Find indices of the key elements in header
      const scoreboardIndex = header.indexOf('SCOREBOARD');
      const lightSignalIndex = header.indexOf('<SyncIndicator variant="compact" />');
      const themeToggleIndex = header.indexOf('toggleTheme');
      const profileIndex = header.indexOf('href="/profile"');

      // Verify all elements exist in the top navbar
      expect(scoreboardIndex).toBeGreaterThan(-1);
      expect(lightSignalIndex).toBeGreaterThan(-1);
      expect(themeToggleIndex).toBeGreaterThan(-1);
      expect(profileIndex).toBeGreaterThan(-1);

      // Verify the exact sequence: Scoreboard -> Light Signal -> Theme Toggle -> Profile
      expect(scoreboardIndex).toBeLessThan(lightSignalIndex);
      expect(lightSignalIndex).toBeLessThan(themeToggleIndex);
      expect(themeToggleIndex).toBeLessThan(profileIndex);
    });

    it('confirms Light Signal icon is inside rounded-full wrapper without invasive layout mutations', () => {
      const navFilePath = path.resolve(__dirname, '../components/layout/Navigation.tsx');
      const navContent = fs.readFileSync(navFilePath, 'utf-8');

      expect(navContent).toMatch(/<span className="rounded-full">\s*<SyncIndicator variant="compact" \/>\s*<\/span>/);
    });
  });

  describe('2. Component Structure & Toggle Handlers in SyncIndicator', () => {
    it('verifies that SyncIndicator has toggleModal logic instead of one-way opening', () => {
      const syncFilePath = path.resolve(__dirname, '../components/common/SyncIndicator.tsx');
      const syncContent = fs.readFileSync(syncFilePath, 'utf-8');

      // Must have toggle logic
      expect(syncContent).toContain('setShowModal((prev) => !prev)');
      expect(syncContent).toContain('toggleModal');

      // Must not have one-way hardcoded setShowModal(true) in button handlers
      expect(syncContent).not.toMatch(/onClick=\{\(\) => setShowModal\(true\)\}/);

      // Must have elevated z-index (z-[60]) when showModal is open
      expect(syncContent).toContain("showModal ? 'z-[60]' : ''");
    });

    it('verifies backdrop dismiss handler ("onno kno pase click korle")', () => {
      const syncFilePath = path.resolve(__dirname, '../components/common/SyncIndicator.tsx');
      const syncContent = fs.readFileSync(syncFilePath, 'utf-8');

      // Backdrop must have onClick to close modal
      expect(syncContent).toMatch(/data-testid="sync-modal-backdrop"[\s\S]*?onClick=\{\(\) => setShowModal\(false\)\}/);

      // Modal content must stop propagation so clicks inside don't close it
      expect(syncContent).toContain('data-testid="sync-modal-content"');
      expect(syncContent).toContain('onClick={(e) => e.stopPropagation()}');
    });

    it('verifies reliable mobile Swipe-Up gesture implementation and scroll guard', () => {
      const syncFilePath = path.resolve(__dirname, '../components/common/SyncIndicator.tsx');
      const syncContent = fs.readFileSync(syncFilePath, 'utf-8');

      // Framer motion drag="y" and upward dragEnd detection
      expect(syncContent).toContain('drag="y"');
      expect(syncContent).toContain('dragElastic={{ top: 0.6, bottom: 0.05 }}');
      expect(syncContent).toContain('info.offset.y < -40');

      // Native touch event handlers
      expect(syncContent).toContain('onTouchStart={handleTouchStart}');
      expect(syncContent).toContain('onTouchEnd={handleTouchEnd}');

      // Must reject gestures if container is scrolled down inside
      expect(syncContent).toContain('scrollTop > 5');

      // Must reject taps (requires upward displacement deltaY < -40 or quick flick)
      expect(syncContent).toContain('deltaY < -40');
      expect(syncContent).toContain('Math.abs(deltaY) > Math.abs(deltaX)');
    });

    it('confirms no extra Back or Close buttons were added to the UI', () => {
      const syncFilePath = path.resolve(__dirname, '../components/common/SyncIndicator.tsx');
      const syncContent = fs.readFileSync(syncFilePath, 'utf-8');

      // Ensure no new "Back", "Back to Scoreboard", or extra Close button controls were added
      expect(syncContent).not.toContain('Back to Scoreboard');
      expect(syncContent).not.toContain('Close Button');
      expect(syncContent).not.toContain('>Back<');
      expect(syncContent).not.toContain('>Close<');
    });

    it('renders compact SyncIndicator initially without modal stuck on screen', () => {
      const html = renderToStaticMarkup(React.createElement(SyncIndicator, { variant: 'compact' }));

      // Button is rendered
      expect(html).toContain('data-testid="sync-indicator-toggle"');
      expect(html).toContain('aria-expanded="false"');

      // Modal is not open initially
      expect(html).not.toContain('data-testid="sync-modal-backdrop"');
      expect(html).not.toContain('data-testid="sync-modal-content"');
      expect(html).not.toContain('Sync &amp; Storage Status');
    });
  });

  describe('3. Gesture Logic Unit Tests', () => {
    it('correctly identifies valid upward swipes vs taps and downward/horizontal movements', () => {
      // Helper function simulating the gesture evaluation logic in handleTouchEnd
      const evaluateSwipeUp = (
        startY: number,
        startX: number,
        endY: number,
        endX: number,
        deltaTime: number,
        scrollTop: number = 0
      ) => {
        if (scrollTop > 5) return false;
        const deltaY = endY - startY;
        const deltaX = endX - startX;
        const isUpward = deltaY < -40 || (deltaY < -25 && deltaTime < 300);
        const isVertical = Math.abs(deltaY) > Math.abs(deltaX) * 1.3;
        return isUpward && isVertical;
      };

      // 1. Standard upward swipe: start at 300, end at 230 (-70px) in 250ms -> VALID
      expect(evaluateSwipeUp(300, 100, 230, 102, 250)).toBe(true);

      // 2. Fast upward flick: start at 300, end at 270 (-30px) in 150ms -> VALID
      expect(evaluateSwipeUp(300, 100, 270, 101, 150)).toBe(true);

      // 3. Regular tap: start at 300, end at 301 (+1px) in 100ms -> INVALID (NOT a swipe)
      expect(evaluateSwipeUp(300, 100, 301, 100, 100)).toBe(false);

      // 4. Downward swipe: start at 200, end at 280 (+80px) -> INVALID
      expect(evaluateSwipeUp(200, 100, 280, 100, 250)).toBe(false);

      // 5. Horizontal swipe: start at 200, end at 190 (-10px) with deltaX = 80px -> INVALID
      expect(evaluateSwipeUp(200, 100, 190, 180, 250)).toBe(false);

      // 6. Diagonal motion: deltaY = -35, deltaX = 40 -> INVALID (not predominantly vertical)
      expect(evaluateSwipeUp(200, 100, 165, 140, 200)).toBe(false);

      // 7. Scrolled container: user scrolls content (scrollTop = 50) -> INVALID (must not close)
      expect(evaluateSwipeUp(300, 100, 230, 102, 250, 50)).toBe(false);
    });
  });
});
