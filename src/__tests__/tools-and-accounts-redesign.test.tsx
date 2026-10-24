import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CricketDesktopNavigation, ToolsAndAccountsPanel } from '../components/navigation';
import { CricketBottomNavigation } from '../components/navigation/CricketBottomNavigation';

describe('Enterprise Tools & Accounts Redesign — Desktop & Tablet Verification', () => {
  const mockT = (key: string) => key;

  describe('1. Tools & Accounts Header & Cricket Emblem', () => {
    it('renders the cricket shield emblem with vertical emerald accent bar', () => {
      const html = renderToStaticMarkup(
        <ToolsAndAccountsPanel pathname="/" language="en" t={mockT} />
      );

      // Header title & subtitle
      expect(html).toContain('Tools &amp; Accounts');
      expect(html).toContain('Manage your account settings, preferences and integrations');

      // Vertical emerald accent line
      expect(html).toContain('bg-emerald-500 rounded-full');

      // Cricket shield SVG with stumps and bail
      expect(html).toContain('<svg width="22" height="24" viewBox="0 0 24 26"');
      expect(html).toContain('fill="#059669"');
    });
  });

  describe('2. Four Dedicated Settings Rows', () => {
    it('renders Row 1 (Analytics) with icon, description, Live Data badge, and link', () => {
      const html = renderToStaticMarkup(
        <ToolsAndAccountsPanel pathname="/" language="en" t={mockT} />
      );

      expect(html).toContain('href="/analytics"');
      expect(html).toContain('Analytics');
      expect(html).toContain('View your performance, match statistics and insights');
      expect(html).toContain('Live Data');
    });

    it('renders Row 2 (Sync & Profile) with icon, description, and link', () => {
      const html = renderToStaticMarkup(
        <ToolsAndAccountsPanel pathname="/" language="en" t={mockT} />
      );

      expect(html).toContain('href="/profile"');
      expect(html).toContain('Sync &amp; Profile');
      expect(html).toContain('Manage your account, profile information and security');
    });

    it('renders Row 3 (Cloud Sync) with cloud icon, description, and sync status', () => {
      const html = renderToStaticMarkup(
        <ToolsAndAccountsPanel pathname="/" language="en" t={mockT} />
      );

      expect(html).toContain('href="/profile#sync"');
      expect(html).toContain('Cloud Sync');
      expect(html).toContain('Your data is safely synced across all devices');
      expect(html).toContain('Synced');
    });

    it('renders Row 4 (Appearance) with dual sun/moon icon, description, and theme selector pill', () => {
      const html = renderToStaticMarkup(
        <ToolsAndAccountsPanel
          pathname="/"
          language="en"
          t={mockT}
          currentTheme="dark"
        />
      );

      expect(html).toContain('Appearance');
      expect(html).toContain('Customize theme, display and visual preferences');
      expect(html).toContain('Dark');
    });

    it('renders Appearance pill reflecting Light theme when active', () => {
      const html = renderToStaticMarkup(
        <ToolsAndAccountsPanel
          pathname="/"
          language="en"
          t={mockT}
          currentTheme="light"
        />
      );

      expect(html).toContain('Light');
    });
  });

  describe('3. Integration in CricketDesktopNavigation', () => {
    it('renders both primary 5 items and Tools & Accounts in desktop navigation', () => {
      const html = renderToStaticMarkup(
        <CricketDesktopNavigation pathname="/" language="en" t={mockT} />
      );

      // 5 Primary Cricket Items
      expect(html).toContain('href="/"');
      expect(html).toContain('href="/matches/new"');
      expect(html).toContain('href="/matches/history"');
      expect(html).toContain('href="/tournaments"');
      expect(html).toContain('href="/teams"');

      // Enterprise Tools & Accounts Panel
      expect(html).toContain('Tools &amp; Accounts');
      expect(html).toContain('Analytics');
      expect(html).toContain('Sync &amp; Profile');
      expect(html).toContain('Cloud Sync');
      expect(html).toContain('Appearance');
    });
  });

  describe('4. Strict Mobile Isolation Boundary', () => {
    it('verifies mobile navigation remains strictly isolated and identical', () => {
      const mobileHtml = renderToStaticMarkup(
        <CricketBottomNavigation pathname="/" language="en" t={mockT} />
      );

      // Mobile bottom nav must only have the 5 primary items
      expect(mobileHtml).toContain('href="/"');
      expect(mobileHtml).toContain('href="/matches/new"');
      expect(mobileHtml).toContain('href="/matches/history"');
      expect(mobileHtml).toContain('href="/tournaments"');
      expect(mobileHtml).toContain('href="/teams"');

      // Mobile bottom nav must NOT contain Tools & Accounts panel
      expect(mobileHtml).not.toContain('Tools &amp; Accounts');
      expect(mobileHtml).not.toContain('Cloud Sync');
      expect(mobileHtml).not.toContain('Appearance');
    });
  });
});
