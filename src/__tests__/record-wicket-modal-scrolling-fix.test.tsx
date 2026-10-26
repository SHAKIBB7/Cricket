import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { OutModal } from '../components/modals/OutModal';
import { CompactDropdown } from '../components/common/CompactDropdown';
import { PRIMARY_DISMISSAL_TYPES, getDismissalRule } from '../domain/cricket/dismissals';
import fs from 'fs';
import path from 'path';

describe('Record Wicket Modal Scrolling & Dismissal Type UI Enterprise Fix', () => {
  describe('1. Static Code Analysis & Single Primary Scroll Container Verification', () => {
    const outModalPath = path.resolve(__dirname, '../components/modals/OutModal.tsx');
    const outModalContent = fs.readFileSync(outModalPath, 'utf-8');

    it('verifies OutModal has only one primary vertical scroll container inside the modal card', () => {
      // The modal card body is the single scroll container
      expect(outModalContent).toContain(
        'className="overflow-y-auto overscroll-contain flex-1 min-h-0 px-4 sm:px-5 py-3.5 space-y-3.5 touch-pan-y"'
      );

      // Verify that squad members chips container does NOT have max-h-24 overflow-y-auto
      expect(outModalContent).not.toContain('max-h-24 overflow-y-auto');
      expect(outModalContent).toContain('flex flex-wrap gap-1.5 p-1.5 bg-[var(--muted)]/40 rounded-xl');
    });

    it('verifies Dismissal Type CompactDropdown configures inFlow and disableInternalScroll', () => {
      // OutModal must pass inFlow={true} and disableInternalScroll={true} to dismissal-type-dropdown
      expect(outModalContent).toContain('testId="dismissal-type-dropdown"');
      expect(outModalContent).toContain('inFlow={true}');
      expect(outModalContent).toContain('disableInternalScroll={true}');
    });

    it('verifies Incoming Batter CompactDropdown also configures inFlow and disableInternalScroll', () => {
      expect(outModalContent).toContain('testId="incoming-batter-dropdown"');
      const startIdx = outModalContent.indexOf('testId="incoming-batter-dropdown"');
      const incomingBatterSection = outModalContent.slice(startIdx - 600, startIdx + 100);
      expect(incomingBatterSection).toContain('inFlow={true}');
      expect(incomingBatterSection).toContain('disableInternalScroll={true}');
    });

    it('verifies body scroll locking effect exists to prevent background page scroll', () => {
      expect(outModalContent).toContain("document.body.style.overflow = 'hidden'");
      expect(outModalContent).toContain("document.body.style.overscrollBehavior = 'contain'");
    });

    it('verifies viewport-aware dynamic bounds and mobile safe area insets', () => {
      expect(outModalContent).toContain('max-h-[calc(100dvh-1.5rem)] sm:max-h-[90vh]');
      expect(outModalContent).toContain('pb-safe');
      expect(outModalContent).toContain('Confirm Wicket');
    });
  });

  describe('2. CompactDropdown inFlow & disableInternalScroll Architecture', () => {
    const dropdownPath = path.resolve(__dirname, '../components/common/CompactDropdown.tsx');
    const dropdownContent = fs.readFileSync(dropdownPath, 'utf-8');

    it('verifies CompactDropdown implementation supports inFlow positioning (relative instead of absolute)', () => {
      expect(dropdownContent).toContain('inFlow?: boolean');
      expect(dropdownContent).toContain("relative z-20 w-full mt-1.5");
    });

    it('verifies CompactDropdown implementation supports disableInternalScroll (overflow-visible without max-height or scroll event trapping)', () => {
      expect(dropdownContent).toContain('disableInternalScroll?: boolean');
      expect(dropdownContent).toContain("overflow-visible py-1 divide-y divide-[var(--border)]/20 text-body-small");
      expect(dropdownContent).toContain("!disableInternalScroll && isScrollingListRef.current");
    });

    it('renders CompactDropdown trigger and displays selected dismissal type correctly', () => {
      const dismissalOptions = PRIMARY_DISMISSAL_TYPES.map((type) => ({
        value: type,
        label: getDismissalRule(type).label || type,
        badge: getDismissalRule(type).bowlerCredited ? 'Bowler Wicket' : 'Field Dismissal',
      }));

      const html = renderToStaticMarkup(
        <CompactDropdown
          value="Bowled"
          options={dismissalOptions}
          onChange={() => {}}
          inFlow={true}
          disableInternalScroll={true}
          testId="dismissal-type-dropdown"
        />
      );

      expect(html).toContain('Bowled');
      expect(html).toContain('Bowler Wicket');
      expect(html).toContain('data-testid="dismissal-type-dropdown"');
      expect(html).toContain('role="combobox"');
    });
  });

  describe('3. OutModal Rendering Across All Dismissal Configurations', () => {
    it('renders Bowled correctly with single auto-selected striker and bowler credit', () => {
      const html = renderToStaticMarkup(
        <OutModal
          isOpen={true}
          onClose={() => {}}
          onConfirm={() => {}}
          strikerName="Tamim Iqbal"
          nonStrikerName="Litton Das"
          bowlerName="Jasprit Bumrah"
          initialDismissalType="Bowled"
        />
      );

      expect(html).toContain('Record Wicket');
      expect(html).toContain('Credited to bowler: Jasprit Bumrah');
      expect(html).toContain('Bowled');
      expect(html).toContain('Bowler Wicket');
      expect(html).toContain('Tamim Iqbal (Auto-selected)');
      expect(html).toContain('Confirm Wicket (Bowled)');
      expect(html).not.toContain('Who is Out?');
      expect(html).not.toContain('Fielder Name');
    });

    it('renders Caught correctly with fielder input requirement and striker auto-selected', () => {
      const html = renderToStaticMarkup(
        <OutModal
          isOpen={true}
          onClose={() => {}}
          onConfirm={() => {}}
          strikerName="Tamim Iqbal"
          nonStrikerName="Litton Das"
          bowlerName="Jasprit Bumrah"
          initialDismissalType="Caught"
        />
      );

      expect(html).toContain('Caught');
      expect(html).toContain('Bowler Wicket');
      expect(html).toContain('Tamim Iqbal (Auto-selected)');
      expect(html).toContain('Fielder / Keeper');
      expect(html).toContain('placeholder="e.g. Catcher Name"');
      expect(html).toContain('Confirm Wicket (Caught)');
    });

    it('renders Run Out correctly with both striker and non-striker choice, runs scored, and fielder input', () => {
      const html = renderToStaticMarkup(
        <OutModal
          isOpen={true}
          onClose={() => {}}
          onConfirm={() => {}}
          strikerName="Tamim Iqbal"
          nonStrikerName="Litton Das"
          bowlerName="Jasprit Bumrah"
          initialDismissalType="Run Out"
        />
      );

      expect(html).toContain('Run Out');
      expect(html).toContain('Field Dismissal');
      expect(html).toContain('Who is Out?');
      expect(html).toContain('Striker');
      expect(html).toContain('Non-Striker');
      expect(html).toContain('Fielder (Throw / Assist)');
      expect(html).toContain('Runs Completed on this Ball');
      expect(html).toContain('Confirm Wicket (Run Out)');
    });

    it('renders Stumped correctly with wicketkeeper input', () => {
      const html = renderToStaticMarkup(
        <OutModal
          isOpen={true}
          onClose={() => {}}
          onConfirm={() => {}}
          strikerName="Tamim Iqbal"
          nonStrikerName="Litton Das"
          bowlerName="Jasprit Bumrah"
          initialDismissalType="Stumped"
        />
      );

      expect(html).toContain('Stumped');
      expect(html).toContain('Bowler Wicket');
      expect(html).toContain('Wicketkeeper');
      expect(html).toContain('Tamim Iqbal (Auto-selected)');
      expect(html).toContain('Confirm Wicket (Stumped)');
    });

    it('renders squad member selection chips naturally in document flow without nested overflow-y-auto', () => {
      const squad = ['Shakib Al Hasan', 'Mushfiqur Rahim', 'Mahmudullah', 'Mustafizur Rahman', 'Taskin Ahmed'];
      const html = renderToStaticMarkup(
        <OutModal
          isOpen={true}
          onClose={() => {}}
          onConfirm={() => {}}
          strikerName="Tamim Iqbal"
          nonStrikerName="Litton Das"
          bowlerName="Jasprit Bumrah"
          initialDismissalType="Bowled"
          availableSquadMembers={squad}
        />
      );

      for (const player of squad) {
        expect(html).toContain(player);
      }
      expect(html).not.toContain('max-h-24 overflow-y-auto');
    });

    it('renders all 11 primary dismissal types in PRIMARY_DISMISSAL_TYPES', () => {
      const expected = [
        'Bowled',
        'Caught',
        'LBW',
        'Run Out',
        'Stumped',
        'Hit Wicket',
        'Retired Hurt',
        'Hit the Ball Twice',
        'Obstructing the Field',
        'Retired Out',
        'Timed Out',
      ];

      for (const d of expected) {
        expect(PRIMARY_DISMISSAL_TYPES).toContain(d);
        const rule = getDismissalRule(d as any);
        expect(rule).toBeDefined();
        expect(rule.id).toBe(d);
      }
    });
  });
});
