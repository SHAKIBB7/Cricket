import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Teams page — Matchday card redesign (TAIMUR pick of mockup 4,
 * 2026-11-10): deep-navy band with a monogram crest, a Captain /
 * Manager / Squad stat strip, a per-slot squad-strength bar, and a
 * numbered roster with position tags. Pins the wiring so a future
 * restyle cannot silently drop the band, the strip, the bar, or the
 * career-profile links in the roster.
 */
const src = fs.readFileSync(path.resolve(__dirname, '../app/teams/page.tsx'), 'utf-8');

describe('Teams Matchday card', () => {
  it('renders the navy band with the monogram crest', () => {
    expect(src).toContain('bg-[#181868]');
    expect(src).toContain('teamInitials(team.name)');
    expect(src).toContain('rounded-full border-2 border-white/40');
  });

  it('derives initials from the first two words (or two letters)', () => {
    expect(src).toContain('const teamInitials = (teamName: string): string =>');
    expect(src).toContain('words[0].charAt(0) + words[1].charAt(0)');
    expect(src).toContain('slice(0, 2)');
  });

  it('keeps edit and delete reachable from the band', () => {
    expect(src).toContain('handleOpenEditor(team)');
    expect(src).toContain('handleDeleteTeam(team.id, e)');
    expect(src).toContain('bg-white hover:bg-slate-100');
    expect(src).toContain('hover:bg-red-100');
  });

  it('shows the Captain / Manager / Squad stat strip with fallbacks', () => {
    expect(src).toContain('grid grid-cols-3 divide-x divide-[var(--border)]');
    expect(src).toContain("t('teams_captain', 'Captain')");
    expect(src).toContain("t('teams_manager', 'Manager')");
    expect(src).toContain("t('teams_squad_label', 'Squad')");
    expect(src).toContain('{team.players.length}/{PLAYER_SLOT_LABELS.length}');
    expect(src).toContain("team.captain || t('teams_not_assigned', 'Not assigned')");
    expect(src).toContain("team.manager || t('teams_not_assigned', 'Not assigned')");
  });

  it('draws one strength segment per slot, amber until the squad is full', () => {
    expect(src).toContain('PLAYER_SLOT_LABELS.map((_, i) =>');
    expect(src).toContain("'bg-emerald-500'");
    expect(src).toContain("'bg-amber-500'");
    expect(src).toContain('i < team.players.length');
  });

  it('roster rows carry number, position tag and the profile link', () => {
    expect(src).toContain('{idx + 1}');
    expect(src).toContain('slotLabelText(idx)');
    expect(src).toContain('playerProfileHref(playerKeyForRecord(team.players[idx]))');
  });
});
