import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

// Import Navigation Components
import { BackButton, BackNavigationBar } from '../components/navigation';
import { LanguageProvider } from '../context/LanguageContext';

describe('Premium Apple iOS-Inspired Back Navigation System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. BackButton Component UI & Apple HIG Compliance', () => {
    it('renders with Apple SF-Symbols style ChevronLeft and 44pt minimum touch target', () => {
      const html = renderToStaticMarkup(
        <LanguageProvider>
          <BackButton fallbackUrl="/" label="Back" />
        </LanguageProvider>
      );

      // Verify chevron icon exists with stroke width 2.5 (iOS weight)
      expect(html).toContain('lucide-chevron-left');
      expect(html).toContain('stroke-width="2.5"');

      // Verify minimum 44px touch target (Apple HIG standard)
      expect(html).toContain('min-h-[44px]');
      expect(html).toContain('min-w-[44px]');

      // Verify iOS micro-interaction classes (opacity reduction on active tap)
      expect(html).toContain('active:opacity-50');
      expect(html).toContain('active:scale-[0.98]');

      // Verify accessible label
      expect(html).toContain('aria-label="Back"');
      expect(html).toContain('Back');
    });

    it('renders tinted iOS emerald variant matching cricket brand identity', () => {
      const html = renderToStaticMarkup(
        <LanguageProvider>
          <BackButton variant="tinted" label="Matches" />
        </LanguageProvider>
      );

      expect(html).toContain('text-emerald-600');
      expect(html).toContain('dark:text-emerald-400');
      expect(html).toContain('Matches');
    });

    it('supports pill variant for floating overlay headers', () => {
      const html = renderToStaticMarkup(
        <LanguageProvider>
          <BackButton variant="pill" label="Back to Live Scoring" />
        </LanguageProvider>
      );

      expect(html).toContain('bg-[var(--card)]/90');
      expect(html).toContain('rounded-xl');
      expect(html).toContain('Back to Live Scoring');
    });

    it('supports neutral and subtle variants with visible keyboard focus indicators', () => {
      const neutralHtml = renderToStaticMarkup(
        <LanguageProvider>
          <BackButton variant="neutral" label="Home" />
        </LanguageProvider>
      );
      expect(neutralHtml).toContain('text-[var(--foreground)]');
      expect(neutralHtml).toContain('focus-visible:ring-2');

      const subtleHtml = renderToStaticMarkup(
        <LanguageProvider>
          <BackButton variant="subtle" label="Cancel" />
        </LanguageProvider>
      );
      expect(subtleHtml).toContain('text-[var(--muted-foreground)]');
    });
  });

  describe('2. BackNavigationBar Global Component', () => {
    it('renders centered iOS navigation bar with title and balanced left/right columns', () => {
      const html = renderToStaticMarkup(
        <LanguageProvider>
          <BackNavigationBar
            title="Full Scoreboard"
            subtitle="Match 1 • Dhaka vs Chittagong"
            backButtonProps={{ fallbackUrl: '/matches/history', label: 'Matches' }}
            rightAction={<button type="button">Share</button>}
          />
        </LanguageProvider>
      );

      // Verify iOS glassmorphism backdrop & safe area
      expect(html).toContain('backdrop-blur-md');
      expect(html).toContain('pt-[max(0.5rem,env(safe-area-inset-top,0px))]');

      // Verify title & subtitle
      expect(html).toContain('Full Scoreboard');
      expect(html).toContain('Dhaka vs Chittagong');

      // Verify Back button and right action
      expect(html).toContain('Matches');
      expect(html).toContain('Share');
    });
  });

  describe('3. Codebase Coverage & Screen Integration Audit', () => {
    const checkFileContains = (filePath: string, expectedStrings: string[]) => {
      const fullPath = path.resolve(process.cwd(), filePath);
      expect(fs.existsSync(fullPath)).toBe(true);
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const s of expectedStrings) {
        expect(content).toContain(s);
      }
    };

    const checkFileNotContains = (filePath: string, forbiddenStrings: string[]) => {
      const fullPath = path.resolve(process.cwd(), filePath);
      expect(fs.existsSync(fullPath)).toBe(true);
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const s of forbiddenStrings) {
        expect(content).not.toContain(s);
      }
    };

    it('verifies Full Scoreboard / Match Center imports and uses compact inline BackButton with Match Details title', () => {
      checkFileContains('src/app/matches/center/[matchId]/page.tsx', [
        "import { BackButton } from '@/components/navigation';",
        '<BackButton',
        'fallbackUrl="/matches/history"',
        'showLabel={false}',
        'Match Details',
      ]);
    });

    it('verifies Match Summary page includes compact inline iOS back navigation', () => {
      checkFileContains('src/app/matches/summary/[matchId]/page.tsx', [
        "import { BackButton } from '@/components/navigation';",
        '<BackButton',
        'fallbackUrl="/matches/history"',
        'showLabel={false}',
        'Match Summary',
      ]);
    });

    it('verifies IntegratedScoreboard uses iOS BackButton returning to live cockpit', () => {
      checkFileContains('src/components/scoring/IntegratedScoreboard.tsx', [
        "import { BackButton } from '@/components/navigation';",
        'onClick={onClose}',
        'label="Back to Live Scoring"',
      ]);
    });

    it('verifies MatchesPanel uses compact inline iOS BackButton returning to live cockpit', () => {
      checkFileContains('src/components/scoring/MatchesPanel.tsx', [
        "import { BackButton } from '@/components/navigation';",
        'onClick={onClose}',
        'Matches &amp; Archive',
      ]);
    });

    it('verifies AdvancedAnalyticsPanel uses compact inline iOS BackButton returning to live cockpit', () => {
      checkFileContains('src/components/scoring/AdvancedAnalyticsPanel.tsx', [
        "import { BackButton } from '@/components/navigation';",
        'onClick={onClose}',
        'Advanced Analytics',
      ]);
    });

    it('verifies Opening Players page uses compact inline BackButton with safe fallback to new match setup', () => {
      checkFileContains('src/app/matches/opening-players/page.tsx', [
        "import { BackButton } from '@/components/navigation';",
        '<BackButton',
        'fallbackUrl="/matches/new"',
        'showLabel={false}',
        'Opening Players',
      ]);
    });

    it('verifies New Match page uses compact inline BackButton with unsaved changes confirmation prompt', () => {
      checkFileContains('src/app/matches/new/page.tsx', [
        "import { BackButton } from '@/components/navigation';",
        '<BackButton',
        'fallbackUrl="/"',
        'showLabel={false}',
        'confirmMessage=',
        'New Match',
      ]);
    });

    it('verifies Tournament Detail page uses compact inline BackButton returning to tournaments hub', () => {
      checkFileContains('src/app/tournaments/[id]/page.tsx', [
        "import { BackButton } from '@/components/navigation';",
        '<BackButton',
        'fallbackUrl="/tournaments"',
        'showLabel={false}',
        'Tournament Details',
      ]);
    });

    it('verifies Batsman Profile Modal has compact inline iOS Back/Done navigation with title', () => {
      checkFileContains('src/components/modals/BatsmanProfileModal.tsx', [
        "import { BackButton } from '@/components/navigation';",
        'Player Profile',
        'Done',
      ]);
    });

    it('verifies Bowler Profile Modal has compact inline iOS Back/Done navigation with title', () => {
      checkFileContains('src/components/modals/BowlerProfileModal.tsx', [
        "import { BackButton } from '@/components/navigation';",
        'Bowler Profile',
        'Done',
      ]);
    });

    it('verifies DLS Calculator Modal has iOS Done navigation', () => {
      checkFileContains('src/components/modals/DlsModal.tsx', [
        "import { BackButton } from '@/components/navigation';",
        'label="Done"',
      ]);
    });

    it('verifies Offline page includes BackButton returning to home', () => {
      checkFileContains('src/app/offline/page.tsx', [
        "import { BackButton } from '@/components/navigation';",
        '<BackButton fallbackUrl="/" label="Back"',
      ]);
    });

    describe('Top-Level Navigation Tabs Audit (No Redundant Back Buttons)', () => {
      it('verifies Match History page does NOT show redundant BackButton (accessible via Bottom Nav)', () => {
        checkFileNotContains('src/app/matches/history/page.tsx', [
          '<BackButton',
          "import { BackButton } from '@/components/navigation';",
        ]);
      });

      it('verifies Tournaments hub page does NOT show redundant BackButton (accessible via Bottom Nav)', () => {
        checkFileNotContains('src/app/tournaments/page.tsx', [
          '<BackButton',
          "import { BackButton } from '@/components/navigation';",
        ]);
      });

      it('verifies Teams squad management page does NOT show redundant BackButton (accessible via Bottom Nav)', () => {
        checkFileNotContains('src/app/teams/page.tsx', [
          '<BackButton',
          "import { BackButton } from '@/components/navigation';",
        ]);
      });

      it('verifies Analytics hub page does NOT show redundant BackButton (accessible via Bottom Nav / Sidebar)', () => {
        checkFileNotContains('src/app/analytics/page.tsx', [
          '<BackButton',
          "import { BackButton } from '@/components/navigation';",
        ]);
      });

      it('verifies Profile hub page does NOT show redundant BackButton (accessible via Top/Bottom Nav)', () => {
        checkFileNotContains('src/app/profile/page.tsx', [
          '<BackButton',
          "import { BackButton } from '@/components/navigation';",
        ]);
      });

      it('verifies Cricket Grounds Map page does NOT show redundant BackButton', () => {
        checkFileNotContains('src/app/grounds/page.tsx', [
          '<BackButton',
          "import { BackButton } from '@/components/navigation';",
        ]);
      });
    });
  });
});
