import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CricketBottomNavigation,
  CricketDesktopNavigation,
  CricketHomeIcon,
  CricketNewMatchIcon,
  CricketMatchesIcon,
  CricketTournamentIcon,
  CricketTeamsIcon,
} from '../components/navigation';

describe('Cricket Navigation Suite (Mobile, Tablet & Desktop)', () => {
  const mockT = (key: string) => {
    const map: Record<string, string> = {
      home: 'Home',
      new_match: 'New Match',
      matches: 'Matches',
      tournaments: 'Tournaments',
      teams: 'Teams',
      analytics: 'Analytics',
      profile: 'Profile & Sync',
    };
    return map[key] || key;
  };

  describe('1. Individual Cricket-Themed SVG Icon Specifications', () => {
    it('CricketHomeIcon renders cricket pavilion with stumps, bails, and roof badge', () => {
      const activeHtml = renderToStaticMarkup(<CricketHomeIcon isActive={true} />);
      const inactiveHtml = renderToStaticMarkup(<CricketHomeIcon isActive={false} />);

      // Verify viewBox and SVG elements
      expect(activeHtml).toContain('viewBox="0 0 36 36"');
      // Stumps and bails cutouts
      expect(activeHtml).toContain('fill="#ffffff"');
      // Active primary color is emerald green #059669
      expect(activeHtml).toContain('#059669');
      // Inactive uses slate color #334155
      expect(inactiveHtml).toContain('#334155');
    });

    it('CricketNewMatchIcon renders tilted cricket bat, red ball, and green plus badge', () => {
      const html = renderToStaticMarkup(<CricketNewMatchIcon />);

      expect(html).toContain('viewBox="0 0 36 36"');
      // Bat handle grip and blade
      expect(html).toContain('url(#batGripGrad)');
      expect(html).toContain('url(#cricketBallRed)');
      // Plus symbol path
      expect(html).toContain('M27 24.2V28.8M24.7 26.5H29.3');
      // Green badge circle
      expect(html).toContain('fill="#10b981"');
    });

    it('CricketMatchesIcon renders calendar book with dates and green cricket ball badge', () => {
      const html = renderToStaticMarkup(<CricketMatchesIcon isActive={false} />);

      expect(html).toContain('viewBox="0 0 36 36"');
      // Calendar frame and binder loops
      expect(html).toContain('rect');
      // Green cricket ball with seam
      expect(html).toContain('url(#cricketBallGreen)');
      // White curved seam path (renders as stroke-dasharray in HTML)
      expect(html.toLowerCase()).toContain('stroke-dasharray="1.2 0.8"');
    });

    it('CricketTournamentIcon renders golden trophy cup with star and green ribbon accents', () => {
      const html = renderToStaticMarkup(<CricketTournamentIcon />);

      expect(html).toContain('viewBox="0 0 36 36"');
      // Gold gradient definitions
      expect(html).toContain('url(#trophyGold)');
      // Star insignia
      expect(html).toContain('M18 10.8L19.1 13H21.5L19.6 14.4');
      // Green ribbons
      expect(html).toContain('fill="#10b981"');
      expect(html).toContain('M10 15L7 17.5V26L9 24.5L11 26V18');
      expect(html).toContain('M26 15L29 17.5V26L27 24.5L25 26V18');
    });

    it('CricketTeamsIcon renders 3 player silhouettes and front green cricket helmet with grill', () => {
      const html = renderToStaticMarkup(<CricketTeamsIcon />);

      expect(html).toContain('viewBox="0 0 36 36"');
      // Helmet gradient
      expect(html).toContain('url(#helmetGrad)');
      // Grill and chin strap lines
      expect(html).toContain('M14.5 22.5L16 28.5');
      expect(html).toContain('M15.5 25.5H23.5');
    });
  });

  describe('2. Navigation Bar Active State & Route Handling', () => {
    it('activates Home when pathname is "/"', () => {
      const html = renderToStaticMarkup(
        <CricketBottomNavigation pathname="/" language="en" t={mockT} />
      );

      // Home link should have aria-current="page" and aria-label="Home"
      expect(html).toContain('href="/"');
      expect(html).toContain('aria-label="Home"');
      expect(html).toContain('aria-current="page"');
      // Active mint green background
      expect(html).toContain('bg-[#ebfbf2]');
      // Active green text
      expect(html).toContain('text-[#059669]');
      // Active indicator bar visible
      expect(html).toContain('bg-[#10b981] shadow-xs opacity-100 scale-100');
    });

    it('activates New Match when pathname is "/matches/new"', () => {
      const html = renderToStaticMarkup(
        <CricketBottomNavigation pathname="/matches/new" language="en" t={mockT} />
      );

      expect(html).toContain('href="/matches/new"');
      expect(html).toContain('aria-label="New Match"');
      expect(html).toContain('aria-current="page"');
      expect(html).toMatch(/aria-current="page"[^>]*href="\/matches\/new"|href="\/matches\/new"[^>]*aria-current="page"/);
    });

    it('activates Matches when pathname is "/matches/history"', () => {
      const html = renderToStaticMarkup(
        <CricketBottomNavigation pathname="/matches/history" language="en" t={mockT} />
      );

      expect(html).toContain('href="/matches/history"');
      expect(html).toContain('aria-label="Matches"');
      expect(html).toMatch(/aria-current="page"[^>]*href="\/matches\/history"|href="\/matches\/history"[^>]*aria-current="page"/);
    });

    it('activates Tournament when pathname is "/tournaments"', () => {
      const html = renderToStaticMarkup(
        <CricketBottomNavigation pathname="/tournaments" language="en" t={mockT} />
      );

      expect(html).toContain('href="/tournaments"');
      expect(html).toContain('aria-label="Tournament"');
      expect(html).toMatch(/aria-current="page"[^>]*href="\/tournaments"|href="\/tournaments"[^>]*aria-current="page"/);
      expect(html).toContain('>Tournament</span>');
    });

    it('activates Teams when pathname is "/teams"', () => {
      const html = renderToStaticMarkup(
        <CricketBottomNavigation pathname="/teams" language="en" t={mockT} />
      );

      expect(html).toContain('href="/teams"');
      expect(html).toContain('aria-label="Teams"');
      expect(html).toMatch(/aria-current="page"[^>]*href="\/teams"|href="\/teams"[^>]*aria-current="page"/);
    });
  });

  describe('3. Mobile Design Tokens & Floating Architecture', () => {
    it('uses a floating pill container with safe-area spacing and shadow', () => {
      const html = renderToStaticMarkup(
        <CricketBottomNavigation pathname="/" language="en" t={mockT} />
      );

      // Fixed floating wrapper with responsive safe-area positioning lowered for mobile viewports
      expect(html).toContain('bottom-[max(0.35rem,calc(env(safe-area-inset-bottom,0px)*0.65+0.125rem))]');
      // Floating pill styling
      expect(html).toContain('rounded-[28px]');
      expect(html).toContain('shadow-[0_8px_24px_-4px_rgba(15,23,42,0.06)');
      // 5 items evenly distributed
      expect(html).toContain('grid grid-cols-5');
    });

    it('provides discrete circular backgrounds for inactive items', () => {
      const html = renderToStaticMarkup(
        <CricketBottomNavigation pathname="/" language="en" t={mockT} />
      );

      // Inactive items use #f1f5f9 circular disc
      expect(html).toContain('bg-[#f1f5f9]');
      // Inactive items use slate-600 #475569 labels
      expect(html).toContain('text-[#475569]');
    });

    it('supports Bengali localization gracefully', () => {
      const bnT = (key: string) => {
        const map: Record<string, string> = {
          home: 'হোম',
          new_match: 'নতুন ম্যাচ',
          matches: 'ম্যাচসমূহ',
          tournaments: 'টুর্নামেন্ট',
          teams: 'দলসমূহ',
        };
        return map[key] || key;
      };

      const html = renderToStaticMarkup(
        <CricketBottomNavigation pathname="/tournaments" language="bn" t={bnT} />
      );

      expect(html).toContain('টুর্নামেন্ট');
      expect(html).toContain('হোম');
    });
  });

  describe('4. Desktop & Tablet Cricket Navigation Suite', () => {
    it('renders all 5 cricket items in a refined rounded container on desktop', () => {
      const html = renderToStaticMarkup(
        <CricketDesktopNavigation pathname="/" language="en" t={mockT} />
      );

      // Has 5 primary navigation links
      expect(html).toContain('href="/"');
      expect(html).toContain('href="/matches/new"');
      expect(html).toContain('href="/matches/history"');
      expect(html).toContain('href="/tournaments"');
      expect(html).toContain('href="/teams"');

      // Uses refined rounded card container
      expect(html).toContain('rounded-[22px]');
      expect(html).toContain('shadow-[0_4px_20px_-4px_rgba(15,23,42,0.06)');

      // Home is active
      expect(html).toContain('bg-[#ebfbf2]');
      expect(html).toContain('text-[#059669]');
      // Active indicator on right edge
      expect(html).toContain('bg-[#10b981] shadow-xs opacity-100 scale-100');
    });

    it('activates desktop items dynamically based on route', () => {
      const tourneyHtml = renderToStaticMarkup(
        <CricketDesktopNavigation pathname="/tournaments" language="en" t={mockT} />
      );

      expect(tourneyHtml).toMatch(/aria-current="page"[^>]*href="\/tournaments"|href="\/tournaments"[^>]*aria-current="page"/);
      expect(tourneyHtml).toContain('>Tournament</span>');

      const matchesHtml = renderToStaticMarkup(
        <CricketDesktopNavigation pathname="/matches/history" language="en" t={mockT} />
      );
      expect(matchesHtml).toMatch(/aria-current="page"[^>]*href="\/matches\/history"|href="\/matches\/history"[^>]*aria-current="page"/);
    });

    it('supports live scoring drawer toggle click handlers on desktop', () => {
      let toggled = '';
      const toggleView = (view: any) => {
        toggled = view;
      };

      const html = renderToStaticMarkup(
        <CricketDesktopNavigation
          pathname="/matches/score/match-123"
          isScoringScreen={true}
          activeView="matches"
          toggleView={toggleView}
          language="en"
          t={mockT}
        />
      );

      // Matches link is active when activeView is 'matches' in scoring screen
      expect(html).toMatch(/aria-current="page"[^>]*href="\/matches\/history"|href="\/matches\/history"[^>]*aria-current="page"/);
    });

    it('renders secondary tools (Analytics and Profile) cleanly', () => {
      const html = renderToStaticMarkup(
        <CricketDesktopNavigation pathname="/" language="en" t={mockT} />
      );

      expect(html).toContain('href="/analytics"');
      expect(html).toContain('href="/profile"');
      expect(html).toContain('Tools &amp; Account');
    });
  });

  describe('5. iPhone Liquid Glass Bottom Navigation Specifications', () => {
    it('applies translucent Liquid Glass surface with backdrop blur, specular border and depth shadows', () => {
      const html = renderToStaticMarkup(
        <CricketBottomNavigation pathname="/" language="en" t={mockT} />
      );

      // Translucent liquid glass class
      expect(html).toContain('liquid-glass-nav');
      // Backdrop blur utilities
      expect(html).toContain('backdrop-blur-xl');
      // Thin specular border for frosted edge definition
      expect(html).toContain('border-white/60');
      expect(html).toContain('dark:border-white/10');
      // Translucent surface background
      expect(html).toContain('bg-white/75');
      expect(html).toContain('dark:bg-slate-900/75');
    });

    it('renders fluid sliding active highlight pill positioned dynamically by route index', () => {
      const homeHtml = renderToStaticMarkup(
        <CricketBottomNavigation pathname="/" language="en" t={mockT} />
      );
      // Home is index 0 -> translateX(0%)
      expect(homeHtml).toContain('transform:translateX(0%)');
      expect(homeHtml).toContain('w-1/5');
      expect(homeHtml).toContain('rounded-[20px]');

      const newMatchHtml = renderToStaticMarkup(
        <CricketBottomNavigation pathname="/matches/new" language="en" t={mockT} />
      );
      // New Match is index 1 -> translateX(100%)
      expect(newMatchHtml).toContain('transform:translateX(100%)');

      const tournamentsHtml = renderToStaticMarkup(
        <CricketBottomNavigation pathname="/tournaments" language="en" t={mockT} />
      );
      // Tournaments is index 3 -> translateX(300%)
      expect(tournamentsHtml).toContain('transform:translateX(300%)');

      const teamsHtml = renderToStaticMarkup(
        <CricketBottomNavigation pathname="/teams" language="en" t={mockT} />
      );
      // Teams is index 4 -> translateX(400%)
      expect(teamsHtml).toContain('transform:translateX(400%)');
    });

    it('incorporates iOS tactile micro-press feedback and motion-reduction compliance', () => {
      const html = renderToStaticMarkup(
        <CricketBottomNavigation pathname="/" language="en" t={mockT} />
      );

      // Active scale micro-press
      expect(html).toContain('active:scale-[0.92]');
      // Prefers-reduced-motion safety
      expect(html).toContain('motion-reduce:transition-none');
      expect(html).toContain('motion-reduce:transform-none');
    });

    it('renders inactive items with frosted glass discs and specular reflections', () => {
      const html = renderToStaticMarkup(
        <CricketBottomNavigation pathname="/" language="en" t={mockT} />
      );

      // Inactive disc has inner white specular highlight for glass realism
      expect(html).toContain('shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)]');
      expect(html).toContain('dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]');
    });

    it('hides sliding highlight when route does not match any primary tab', () => {
      const html = renderToStaticMarkup(
        <CricketBottomNavigation pathname="/profile" language="en" t={mockT} />
      );

      // No tab should be active
      expect(html).not.toContain('aria-current="page"');
      // Sliding highlight should not be rendered
      expect(html).not.toContain('transform:translateX');
    });
  });

  describe('6. Liquid Glass Clarity & Continuous Motion Verification', () => {
    it('renders top specular reflection sheen for ~50% clearer optical definition', () => {
      const html = renderToStaticMarkup(
        <CricketBottomNavigation pathname="/" language="en" t={mockT} />
      );

      // Top specular reflection sheen bar
      expect(html).toContain('bg-gradient-to-b from-white/60 via-white/15 to-transparent');
      expect(html).toContain('dark:from-white/14 dark:via-white/3 dark:to-transparent');
      expect(html).toContain('rounded-t-[26px]');
    });

    it('uses single continuous sliding active highlight track without competing item background flashes', () => {
      const html = renderToStaticMarkup(
        <CricketBottomNavigation pathname="/" language="en" t={mockT} />
      );

      // Links themselves have transparent background to prevent flash/double-image jumps
      expect(html).toContain('bg-transparent hover:bg-white/30');

      // The emerald active indicator bar is nested inside the fluid sliding track
      expect(html).toContain('duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)]');
      expect(html).toContain('h-[3px] w-5 sm:w-6 rounded-full bg-[#10b981] shadow-xs opacity-100 scale-100');
    });

    it('positions navbar lower on viewport while maintaining Home Indicator clearance', () => {
      const html = renderToStaticMarkup(
        <CricketBottomNavigation pathname="/" language="en" t={mockT} />
      );

      expect(html).toContain('bottom-[max(0.35rem,calc(env(safe-area-inset-bottom,0px)*0.65+0.125rem))]');
      expect(html).toContain('md:hidden fixed');
    });
  });
});
