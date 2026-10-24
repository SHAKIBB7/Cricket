import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('New Match Screen — GPS & Google Maps Icon Layout Suite', () => {
  const pagePath = path.resolve(process.cwd(), 'src/app/matches/new/page.tsx');
  const content = fs.readFileSync(pagePath, 'utf8');

  describe('1. Root Cause & Parent Container Space Remediation', () => {
    it('does not constrain Match Overs & Venue into an unworkable sm:grid-cols-2 column', () => {
      // Must not use sm:grid-cols-2 for Match Overs & Venue card which crushed Venue width on tablet & desktop
      const oversVenueSection = content.substring(
        content.indexOf('Match Overs & Venue Card'),
        content.indexOf('Toss Results Card')
      );
      expect(oversVenueSection).not.toContain('grid-cols-1 sm:grid-cols-2 gap-4');
      expect(oversVenueSection).toContain('grid grid-cols-1 gap-4');
    });

    it('ensures venue input container has proper fluid Flexbox and min-width rules', () => {
      expect(content).toContain('className="flex gap-2 items-center mt-1 w-full min-w-0"');
    });

    it('ensures CompactDropdown has flex-1 and min-w-0 to prevent layout blowout and allow button breathing room', () => {
      expect(content).toContain('testId="venue-dropdown"');
      expect(content).toContain('className="flex-1 min-w-0"');
    });
  });

  describe('2. GPS & Google Maps Action Buttons Geometry & Alignment', () => {
    it('applies flex-shrink: 0, whitespace-nowrap, and proper touch target to GPS button', () => {
      expect(content).toContain(
        'className="btn-primary py-2.5 px-3.5 shrink-0 text-caption min-h-[42px] flex items-center justify-center gap-1.5 whitespace-nowrap"'
      );
    });

    it('applies flex-shrink: 0, whitespace-nowrap, and proper touch target to Map button', () => {
      expect(content).toContain(
        'className="btn-secondary py-2.5 px-3.5 shrink-0 text-caption min-h-[42px] flex items-center justify-center gap-1.5 whitespace-nowrap"'
      );
    });

    it('maintains proper label header spacing and prevents header text collision', () => {
      expect(content).toContain('className="flex items-center justify-between gap-2"');
      expect(content).toContain('className="font-semibold flex items-center text-caption gap-1 shrink-0"');
      expect(content).toContain('className="flex items-center gap-2 shrink-0"');
    });
  });

  describe('3. Mobile Protection', () => {
    it('preserves mobile-specific hidden sm:inline text hiding for compact mobile viewports', () => {
      expect(content).toContain('<span className="hidden sm:inline">GPS</span>');
      expect(content).toContain('<span className="hidden sm:inline">Map</span>');
    });

    it('preserves mobile touch target sizes of at least 42px', () => {
      expect(content).toContain('min-h-[42px]');
    });
  });

  describe('4. Functional Integrity & Event Handlers', () => {
    it('preserves GPS detection click handler and loading spinner', () => {
      expect(content).toContain('onClick={handleDetectGps}');
      expect(content).toContain('disabled={gpsStatus === \'detecting\'}');
      expect(content).toContain('Crosshair className={`w-4 h-4 ${gpsStatus === \'detecting\' ? \'animate-spin\' : \'\'}`');
    });

    it('preserves GroundSelectorModal trigger click handler', () => {
      expect(content).toContain('onClick={() => setShowGroundModal(true)}');
      expect(content).toContain('<GroundSelectorModal');
    });
  });
});
