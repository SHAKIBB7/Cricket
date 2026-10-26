import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Enterprise Mobile Scrolling, Viewport Overflow & Action Accessibility Audit', () => {
  describe('1. Regression Boundary & Navigation App Shell Protection', () => {
    it('strictly isolates protected live scoring interface from scrolling alterations in Navigation.tsx', () => {
      const navPath = path.resolve(__dirname, '../components/layout/Navigation.tsx');
      const navContent = fs.readFileSync(navPath, 'utf-8');

      // Check scoring screen detection
      expect(navContent).toContain("const isScoringScreen = pathname.startsWith('/matches/score/');");

      // Verify outer layout uses 100dvh with screen fallback
      expect(navContent).toContain('min-h-screen min-h-[100dvh] md:h-screen md:overflow-hidden');

      // Verify main container isolates scoring screen from non-scoring screens
      expect(navContent).toContain(
        "isScoringScreen ? 'h-full overflow-y-auto overflow-x-hidden pb-0' : 'min-h-0 md:h-full md:overflow-y-auto md:overflow-x-hidden pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-0'"
      );

      // Verify content container has safe area padding for non-scoring screens
      expect(navContent).toContain(
        "isScoringScreen ? 'p-1.5 sm:p-2.5 md:p-3 lg:p-4 xl:p-5' : 'p-2 sm:p-3 md:p-4 lg:p-6 short:py-3 pb-safe'"
      );
    });
  });

  describe('2. Team Create & Edit Modal (Section 6 Priority Fix)', () => {
    it('verifies Team Create modal eliminates nested scroll traps and provides a permanently accessible Save button', () => {
      const teamsPath = path.resolve(__dirname, '../app/teams/page.tsx');
      const teamsContent = fs.readFileSync(teamsPath, 'utf-8');

      // Outer backdrop must allow scrolling and prevent clipping on small viewports
      expect(teamsContent).toContain('role="dialog"');
      expect(teamsContent).toContain('aria-modal="true"');
      expect(teamsContent).toContain('overflow-y-auto overscroll-contain flex justify-center items-start sm:items-center');

      // Modal container must use dynamic viewport units (100dvh) with vertical auto margins
      expect(teamsContent).toContain('max-h-[calc(100dvh-1.5rem)] sm:max-h-[90vh]');
      expect(teamsContent).toContain('my-auto');

      // Inner 15 squad inputs must NOT be constrained by nested overflow-y-auto max-h-80
      expect(teamsContent).not.toContain('max-h-80');
      expect(teamsContent).not.toContain('grid overflow-y-auto gap-2 max-h-80');

      // Form body must be scrollable with overscroll-contain
      expect(teamsContent).toContain('overflow-y-auto overscroll-contain flex-1 min-h-0 p-4 sm:p-6 space-y-4');

      // Save button must reside in a dedicated sticky footer with safe-area padding
      expect(teamsContent).toContain('border-t border-[var(--border)] bg-[var(--card)] px-4 sm:px-6 py-3.5 shrink-0 pb-safe');
      expect(teamsContent).toContain('Save Team Squad');

      // Main container has bottom padding to prevent overlap with bottom navigation
      expect(teamsContent).toContain('max-w-4xl mx-auto space-y-6 pb-safe pb-8');
    });
  });

  describe('3. Tournament Creation & Details Viewport Scrolling', () => {
    it('verifies Create Tournament modal is fully scrollable on mobile with sticky accessible action button', () => {
      const tourneyPath = path.resolve(__dirname, '../app/tournaments/page.tsx');
      const tourneyContent = fs.readFileSync(tourneyPath, 'utf-8');

      // Outer backdrop
      expect(tourneyContent).toContain('overflow-y-auto overscroll-contain flex justify-center items-start sm:items-center');
      // Dynamic viewport sizing
      expect(tourneyContent).toContain('max-h-[calc(100dvh-1.5rem)] sm:max-h-[90vh]');
      // Dedicated sticky footer
      expect(tourneyContent).toContain('border-t border-[var(--border)] bg-[var(--card)] px-4 sm:px-6 py-3.5 shrink-0 pb-safe');
      expect(tourneyContent).toContain('Create Tournament &amp; Fixtures');
      // Main container safe area
      expect(tourneyContent).toContain('pb-safe pb-8');
    });

    it('verifies Tournament Detail page includes bottom safe area spacing', () => {
      const detailPath = path.resolve(__dirname, '../app/tournaments/[id]/page.tsx');
      const detailContent = fs.readFileSync(detailPath, 'utf-8');
      expect(detailContent).toContain('pb-safe pb-8');
    });
  });

  describe('4. Match Setup & Configuration Pages', () => {
    it('verifies New Match page and Saved Team picker modal scroll completely without clipping', () => {
      const newMatchPath = path.resolve(__dirname, '../app/matches/new/page.tsx');
      const newMatchContent = fs.readFileSync(newMatchPath, 'utf-8');

      // Main wrapper bottom safe padding
      expect(newMatchContent).toContain('max-w-6xl 2xl:max-w-7xl mx-auto flex flex-col gap-4 short:gap-3 pb-safe pb-8');

      // Saved team picker modal
      expect(newMatchContent).toContain('role="dialog"');
      expect(newMatchContent).toContain('overflow-y-auto overscroll-contain flex justify-center items-start sm:items-center');
      expect(newMatchContent).toContain('max-h-[calc(100dvh-2rem)] sm:max-h-[85vh]');
      expect(newMatchContent).toContain('overflow-y-auto overscroll-contain flex-1 min-h-0');
    });

    it('verifies Opening Players page includes bottom safe area spacing for Start Scoring button', () => {
      const openPlayersPath = path.resolve(__dirname, '../app/matches/opening-players/page.tsx');
      const openPlayersContent = fs.readFileSync(openPlayersPath, 'utf-8');
      expect(openPlayersContent).toContain('pb-safe pb-8');
    });
  });

  describe('5. Match History, Center & Summary Screens', () => {
    it('verifies Match History includes bottom safe area spacing so all cards and buttons are reachable', () => {
      const historyPath = path.resolve(__dirname, '../app/matches/history/page.tsx');
      const historyContent = fs.readFileSync(historyPath, 'utf-8');
      expect(historyContent).toContain('pb-safe pb-8');
    });

    it('verifies Match Center includes bottom safe area spacing', () => {
      const centerPath = path.resolve(__dirname, '../app/matches/center/[matchId]/page.tsx');
      const centerContent = fs.readFileSync(centerPath, 'utf-8');
      expect(centerContent).toContain('pb-safe pb-8');
    });

    it('verifies Match Summary includes bottom safe area spacing so action buttons are never obscured', () => {
      const summaryPath = path.resolve(__dirname, '../app/matches/summary/[matchId]/page.tsx');
      const summaryContent = fs.readFileSync(summaryPath, 'utf-8');
      expect(summaryContent).toContain('pb-safe pb-8');
    });
  });

  describe('6. Account, Profile & Backups Management', () => {
    it('verifies Profile page and EditProfile modal have proper scroll containers and safe-area padding', () => {
      const profilePath = path.resolve(__dirname, '../app/profile/page.tsx');
      const profileContent = fs.readFileSync(profilePath, 'utf-8');

      // Page container
      expect(profileContent).toContain('pb-10 pb-safe');

      // Edit profile modal has mobile viewport and overscroll containment
      const editModalPath = path.resolve(__dirname, '../components/profile/EditProfileModal.tsx');
      const editModalContent = fs.readFileSync(editModalPath, 'utf-8');
      expect(editModalContent).toContain('overflow-y-auto overscroll-contain flex justify-center items-start sm:items-center');
      expect(editModalContent).toContain('!m-0');
      expect(editModalContent).toContain('max-h-[calc(100dvh-2rem)] sm:max-h-[88vh] flex flex-col');
      expect(editModalContent).toContain('flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-4 pr-1');
    });
  });

  describe('7. Dialogs, Modals & Drawer Components', () => {
    it('verifies GroundSelectorModal supports full mobile viewport scrolling across all tabs', () => {
      const groundModalPath = path.resolve(__dirname, '../components/modals/GroundSelectorModal.tsx');
      const groundModalContent = fs.readFileSync(groundModalPath, 'utf-8');

      expect(groundModalContent).toContain('role="dialog"');
      expect(groundModalContent).toContain('overflow-y-auto overscroll-contain flex justify-center items-start sm:items-center');
      expect(groundModalContent).toContain('max-h-[calc(100dvh-1.5rem)] sm:max-h-[88vh]');
      expect(groundModalContent).toContain('pb-safe');
    });

    it('verifies OutModal provides accessible sticky confirmation footer and dynamic viewport bounds', () => {
      const outModalPath = path.resolve(__dirname, '../components/modals/OutModal.tsx');
      const outModalContent = fs.readFileSync(outModalPath, 'utf-8');

      expect(outModalContent).toContain('overflow-y-auto overscroll-contain flex justify-center items-start sm:items-center');
      expect(outModalContent).toContain('max-h-[calc(100dvh-1.5rem)] sm:max-h-[90vh]');
      expect(outModalContent).toContain('border-t border-[var(--border)] bg-[var(--card)] px-4 sm:px-5 py-3 shrink-0 pb-safe');
      expect(outModalContent).toContain('Confirm Wicket');
    });

    it('verifies Batsman and Bowler profile modals use dynamic viewport units (100dvh)', () => {
      const batPath = path.resolve(__dirname, '../components/modals/BatsmanProfileModal.tsx');
      const batContent = fs.readFileSync(batPath, 'utf-8');
      expect(batContent).toContain('max-h-[calc(100dvh-1rem)] sm:max-h-[85vh]');

      const bowlPath = path.resolve(__dirname, '../components/modals/BowlerProfileModal.tsx');
      const bowlContent = fs.readFileSync(bowlPath, 'utf-8');
      expect(bowlContent).toContain('max-h-[calc(100dvh-1rem)] sm:max-h-[85vh]');
    });

    it('verifies SyncIndicator modal is scrollable and safe on compact viewports', () => {
      const syncPath = path.resolve(__dirname, '../components/common/SyncIndicator.tsx');
      const syncContent = fs.readFileSync(syncPath, 'utf-8');
      expect(syncContent).toContain('overflow-y-auto overscroll-contain flex justify-center items-start sm:items-center');
      expect(syncContent).toContain('max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]');
    });
  });

  describe('8. Protected Live Scoring Screen Integrity', () => {
    it('confirms the live scoring screen markup and cockpit scrolling controls remain completely intact', () => {
      const scorePath = path.resolve(__dirname, '../app/matches/score/[matchId]/page.tsx');
      const scoreContent = fs.readFileSync(scorePath, 'utf-8');

      // Verify cockpit layout is untouched
      expect(scoreContent).toContain(
        'className="md:hidden flex flex-col select-none overflow-y-auto min-h-[calc(100dvh-3.25rem)] gap-card-gap pb-safe pt-4 px-screen-x w-full max-w-full overflow-x-hidden"'
      );

      // Verify scoring event handlers exist
      expect(scoreContent).toContain('handleScoreRun');
      expect(scoreContent).toContain('handleConfirmOut');
      expect(scoreContent).toContain('handleUndo');
      expect(scoreContent).toContain('handleSwapStrike');
    });
  });
});
