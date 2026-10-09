import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('View Full Score & Match Summary Vertical Alignment Verification', () => {
  const summaryPagePath = path.resolve(__dirname, '../app/matches/summary/[matchId]/page.tsx');
  const centerPagePath = path.resolve(__dirname, '../app/matches/center/[matchId]/page.tsx');
  const integratedScoreboardPath = path.resolve(__dirname, '../components/scoring/IntegratedScoreboard.tsx');

  const summaryContent = fs.readFileSync(summaryPagePath, 'utf8');
  const centerContent = fs.readFileSync(centerPagePath, 'utf8');
  const integratedContent = fs.readFileSync(integratedScoreboardPath, 'utf8');

  describe('1. MatchSummaryPage Vertical Alignment & Mobile Responsiveness', () => {
    it('uses a balanced, centered flex column with consistent line-heights for Winner Title in all outcomes', () => {
      expect(summaryContent).toContain('flex flex-col items-center justify-center gap-1');
      expect(summaryContent).toContain('text-display leading-tight');
      expect(summaryContent).toContain('text-h2 leading-snug');
      expect(summaryContent).toContain('text-body-small leading-normal');
      expect(summaryContent).toContain('text-caption text-[var(--muted-foreground)] leading-normal');
    });

    it('enforces side-by-side grid-cols-2 on mobile & desktop with matching column heights and baseline score alignment', () => {
      // Side-by-side teams on mobile and desktop
      expect(summaryContent).toContain('floating-card grid p-4 sm:p-5 rounded-2xl grid-cols-2 gap-3 sm:gap-6 items-stretch min-w-0');
      // Sub-containers use h-full, min-w-0, and flex-col
      expect(summaryContent).toContain('flex flex-col items-center justify-between gap-1.5 h-full min-w-0 border-r border-[var(--border)] pr-2 sm:pr-4');
      expect(summaryContent).toContain('flex flex-col items-center justify-between gap-1.5 h-full min-w-0 pl-1 sm:pl-2');
      // Team name min-height & truncation
      expect(summaryContent).toContain('min-h-[24px]');
      expect(summaryContent).toContain('truncate leading-none');
      // Non-CHASE spacer maintains exact vertical baseline across innings
      expect(summaryContent).toContain('invisible select-none leading-none');
      // Score numbers and slash follow baseline leading-none
      expect(summaryContent).toContain('num-font inline-flex items-baseline justify-center leading-none');
      expect(summaryContent).toContain('text-2xl xs:text-3xl sm:text-h2 font-black leading-none');
      expect(summaryContent).toContain('text-sm font-light text-[var(--muted-foreground)] px-0.5 leading-none');
      expect(summaryContent).toContain('text-base font-bold text-[var(--muted-foreground)] leading-none');
    });

    it('aligns Key Match Performers with row-by-row baseline pairing and equalized card heights', () => {
      // Performer cards container uses items-stretch
      expect(summaryContent).toContain('grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 text-left items-stretch');
      // Individual cards use h-full and flex-col justify-between
      expect(summaryContent).toContain('flex flex-col justify-between gap-2 h-full');
      // Header rows have aligned captions and icons
      expect(summaryContent).toContain('text-caption leading-none');
      // Line 1: Name and Runs aligned via items-baseline
      expect(summaryContent).toContain('flex items-baseline justify-between gap-2');
      // Line 2: Team and Balls/Overs aligned via items-baseline
      expect(summaryContent).toContain('text-caption leading-tight text-[var(--muted-foreground)]');
    });

    it('aligns Man of the Match card labels and stats symmetrically without mid-air floating', () => {
      expect(summaryContent).toContain('flex items-center relative z-10 min-w-0 gap-3.5 flex-1');
      expect(summaryContent).toContain('relative z-10 shrink-0 text-right flex flex-col justify-center space-y-0.5');
      expect(summaryContent).toContain('text-caption leading-none block');
      expect(summaryContent).toContain('text-card-title leading-snug');
      expect(summaryContent).toContain('text-h2 leading-tight text-amber-500');
    });

    it('aligns action and navigation buttons with inline-flex items-center and leading-none', () => {
      expect(summaryContent).toContain('inline-flex items-center justify-center active:scale-[0.99]');
      expect(summaryContent).toContain('<span className="leading-none">View Full Scoreboard</span>');
      expect(summaryContent).toContain('<span className="leading-none">Download PDF Scorecard</span>');
      expect(summaryContent).toContain('<span className="leading-none">Home</span>');
    });
  });

  describe('2. MatchCenterPage (View Full Scoreboard) Mobile Layout & Alignment Consistency', () => {
    it('enforces side-by-side grid-cols-2 layout for Team A vs Team B on both mobile and desktop', () => {
      expect(centerContent).toContain('grid grid-cols-2 gap-3 sm:gap-6 pt-1 sm:pt-2 items-stretch min-w-0');
      expect(centerContent).toContain('flex flex-col justify-between gap-1.5 h-full min-w-0 border-r border-white/10 pr-2 sm:pr-4');
      expect(centerContent).toContain('min-h-[22px] min-w-0');
      expect(centerContent).toContain('num-font inline-flex items-baseline leading-none');
      expect(centerContent).toContain('text-2xl xs:text-3xl sm:text-display font-black leading-none');
      expect(centerContent).toContain('text-base xs:text-lg sm:text-xl font-light text-white/50 px-0.5 leading-none');
      expect(centerContent).toContain('text-lg xs:text-xl sm:text-2xl font-bold text-white/80 leading-none');
      expect(centerContent).toContain('text-caption font-semibold text-white/70 leading-none block truncate');
    });

    it('enforces align-middle and mobile-responsive padding across Batting Scorecard table', () => {
      expect(centerContent).toContain('table className="text-caption w-full min-w-full sm:min-w-[480px] border-collapse"');
      // Headers
      expect(centerContent).toContain('py-2.5 px-2.5 sm:px-3 text-left align-middle min-w-[100px]');
      expect(centerContent).toContain('py-2.5 px-1.5 sm:px-2 text-right align-middle w-9 sm:w-12');
      expect(centerContent).toContain('py-2.5 px-2 sm:px-3 text-right align-middle w-12 sm:w-16');
      // Body cells
      expect(centerContent).toContain('px-2.5 sm:px-3 py-2.5 text-body-small align-middle text-left');
      expect(centerContent).toContain('font-black px-1.5 sm:px-2 py-2.5 text-body-small align-middle text-right text-[var(--foreground)]');
      expect(centerContent).toContain('px-1.5 sm:px-2 py-2.5 text-caption align-middle text-right text-[var(--muted-foreground)]');
      expect(centerContent).toContain('font-bold px-2 sm:px-3 py-2.5 text-caption align-middle text-right text-[var(--foreground)]');
    });

    it('enforces align-middle, mobile-responsive padding, and column alignments across Bowling Figures table', () => {
      expect(centerContent).toContain('table className="text-caption w-full min-w-full sm:min-w-[440px] border-collapse"');
      // Headers
      expect(centerContent).toContain('py-2.5 px-2.5 sm:px-3 text-left align-middle min-w-[100px]');
      expect(centerContent).toContain('py-2.5 px-1.5 sm:px-2 text-center align-middle w-9 sm:w-12');
      expect(centerContent).toContain('py-2.5 px-2 sm:px-3 text-right align-middle w-12 sm:w-16');
      // Body cells
      expect(centerContent).toContain('px-2.5 sm:px-3 py-2.5 text-body-small align-middle text-left');
      expect(centerContent).toContain('font-bold px-1.5 sm:px-2 py-2.5 text-caption align-middle text-center text-[var(--foreground)]');
      expect(centerContent).toContain('font-black px-1.5 sm:px-2 py-2.5 text-body-small align-middle text-center text-blue-600 dark:text-blue-400');
      expect(centerContent).toContain('font-bold px-2 sm:px-3 py-2.5 text-caption align-middle text-right text-[var(--foreground)]');
    });

    it('vertically centers Fall of Wickets chip buttons and elements with max-w-full truncation', () => {
      expect(centerContent).toContain('inline-flex items-center truncate bg-[var(--muted)]');
      expect(centerContent).toContain('<b className="text-red-500 leading-none shrink-0">');
      expect(centerContent).toContain('<span className="leading-none text-[var(--muted-foreground)] truncate">');
    });

    it('aligns Match Info items from top baseline with items-start and flex-col justify-start', () => {
      expect(centerContent).toContain('grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 items-start min-w-0');
      expect(centerContent).toContain('flex flex-col justify-start min-w-0');
      expect(centerContent).toContain('text-caption text-[var(--muted-foreground)] leading-none truncate');
      expect(centerContent).toContain('mt-1 text-body-small leading-snug break-words');
    });
  });

  describe('3. IntegratedScoreboard Table Alignment Consistency', () => {
    it('applies align-middle across batting and bowling table cells in IntegratedScoreboard', () => {
      expect(integratedContent).toContain('<th className="py-2 px-3 text-left align-middle">Batter</th>');
      expect(integratedContent).toContain('<td className="py-2.5 px-3 text-left align-middle">');
      expect(integratedContent).toContain('<th className="py-2 px-3 text-left align-middle">Bowler</th>');
      expect(integratedContent).toContain('<td className="py-2.5 px-3 text-left align-middle">');
    });
  });
});
