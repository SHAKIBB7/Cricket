import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

import { TargetChessModeButton } from '../components/common/TargetChessModeButton';

describe('Target Chess Mode UI Redesign — Verification', () => {
  describe('1. TargetChessModeButton Component', () => {
    it('renders inactive state with subtle liquid flow animation and clean label', () => {
      const html = renderToStaticMarkup(
        React.createElement(TargetChessModeButton, {
          isActive: false,
          onToggle: () => {},
        })
      );

      expect(html).toContain('Target Chess Mode');
      expect(html).toContain('✦');
      expect(html).toContain('animate-liquid-flow');
      expect(html).toContain('animate-liquid-glow');
      expect(html).toContain('aria-pressed="false"');
      // Should not show Active badge when inactive
      expect(html).not.toContain('>Active<');
    });

    it('renders active state with enhanced liquid flow animation and active badge', () => {
      const html = renderToStaticMarkup(
        React.createElement(TargetChessModeButton, {
          isActive: true,
          onToggle: () => {},
        })
      );

      expect(html).toContain('Target Chess Mode');
      expect(html).toContain('✦');
      expect(html).toContain('animate-liquid-flow');
      expect(html).toContain('animate-liquid-glow-active');
      expect(html).toContain('aria-pressed="true"');
      expect(html).toContain('Active');
    });
  });

  describe('2. New Match Screen Source Inspection', () => {
    const pagePath = path.resolve(process.cwd(), 'src/app/matches/new/page.tsx');
    const content = fs.readFileSync(pagePath, 'utf8');

    it('completely removed the obsolete New Match Setup large heading and Step 1/2 indicators', () => {
      expect(content).not.toContain('New Match Setup</h1>');
      expect(content).not.toContain('Step 1 of 2');
      expect(content).not.toContain('Step 1:');
      expect(content).not.toContain('Step 2:');
    });

    it('completely removed Clock and time-style icons from the header and sections', () => {
      expect(content).not.toContain('<Clock');
      expect(content).not.toMatch(/import\s*{[^}]*Clock[^}]*}\s*from\s*['"]lucide-react['"]/);
    });

    it('places TargetChessModeButton at the top of setup column directly above Participating Teams', () => {
      expect(content).toContain('<TargetChessModeButton');
      const buttonIdx = content.indexOf('<TargetChessModeButton');
      const teamsIdx = content.indexOf('Participating Teams');
      expect(buttonIdx).toBeGreaterThan(0);
      expect(teamsIdx).toBeGreaterThan(buttonIdx);
    });

    it('preserves required test tokens and contracts for Toss and Team badges', () => {
      expect(content).toContain('HOME TEAM');
      expect(content).toContain('AWAY TEAM');
      expect(content).not.toContain('>Winner<');
      expect(content).not.toContain('>HOST</span>');
      expect(content).not.toContain('>VISITOR</span>');
    });

    it('preserves match setup engine functionality and session storage persistence', () => {
      expect(content).toContain("sessionStorage.setItem('pending_match_setup'");
      expect(content).toContain("router.push('/matches/opening-players')");
      expect(content).toContain('isChaseMode');
      expect(content).toContain('targetRuns');
    });
  });
});
