import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('UI Bug Fix: Duplicate Team & Tournament Creation Actions Audit', () => {
  describe('1. Team Squad Management (src/app/teams/page.tsx)', () => {
    const teamsPath = path.resolve(__dirname, '../app/teams/page.tsx');
    const teamsContent = fs.readFileSync(teamsPath, 'utf-8');

    it('removes duplicate top "New Team Profile" button from page header', () => {
      // Must not have the top button with "New Team Profile" text
      expect(teamsContent).not.toContain('<span>New Team Profile</span>');
      expect(teamsContent).not.toContain('flex items-center justify-end pt-3 sm:pt-4');
    });

    it('strictly preserves the main page title "Team Squad Management"', () => {
      expect(teamsContent).toContain('<span>Team Squad Management</span>');
      expect(teamsContent).toContain('Create club squads with captains, managers, and 15 structured squad positions');
    });

    it('preserves "Create Team" button with existing functionality and styling', () => {
      // Empty state contains Create Team
      expect(teamsContent).toContain('Create Team');
      expect(teamsContent).toContain('onClick={() => handleOpenEditor()}');
      expect(teamsContent).toContain('className="bg-emerald-600 font-bold rounded-xl text-caption min-h-[38px] px-4 py-2"');
    });

    it('provides accessible "Create Team" action when teams list is populated', () => {
      // When teams exist, Create Team is accessible at the bottom
      expect(teamsContent).toContain('<span>Create Team</span>');
    });

    it('ensures correct top padding and clean spacing on Header', () => {
      expect(teamsContent).toContain('<div className="pt-3 sm:pt-4">');
    });
  });

  describe('2. Tournament & League Management (src/app/tournaments/page.tsx)', () => {
    const tourneyPath = path.resolve(__dirname, '../app/tournaments/page.tsx');
    const tourneyContent = fs.readFileSync(tourneyPath, 'utf-8');

    it('removes duplicate top "New Tournament" button from page header', () => {
      // Must not have the top button with "New Tournament"
      expect(tourneyContent).not.toContain('<span>New Tournament</span>');
    });

    it('strictly preserves the main page title "Tournaments & Leagues"', () => {
      expect(tourneyContent).toContain('<span>Tournaments & Leagues</span>');
      expect(tourneyContent).toContain('Manage Knockout brackets, Round-Robin leagues, IPL playoffs & standings');
    });

    it('preserves "Create Tournament" button with existing functionality and styling', () => {
      // Empty state contains Create Tournament
      expect(tourneyContent).toContain('Create Tournament');
      expect(tourneyContent).toContain('onClick={() => setShowCreateModal(true)}');
      expect(tourneyContent).toContain('className="bg-emerald-600 font-bold rounded-xl text-caption min-h-[38px] px-4 py-2"');
    });

    it('provides accessible "Create Tournament" action when tournaments list is populated', () => {
      // When tournaments exist, Create Tournament is accessible at the bottom
      expect(tourneyContent).toContain('<span>Create Tournament</span>');
    });

    it('ensures correct top padding and clean layout on Header without redundant wrapper', () => {
      expect(tourneyContent).toContain('<div className="pt-3 sm:pt-4">');
    });
  });
});
