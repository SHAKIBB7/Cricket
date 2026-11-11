import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Tournaments page — Matchday Trophy cards (TAIMUR pick of mockup 1,
 * 2026-11-11): the Teams page's navy band with a gold trophy
 * medallion, a Teams / Overs / Meetings-or-Matches stat strip, a
 * per-fixture segmented progress bar, and a gold champion band.
 * Pins the wiring so a future restyle cannot silently drop the
 * band, the strip, the segments, or the champion state.
 */
const src = fs.readFileSync(path.resolve(__dirname, '../app/tournaments/page.tsx'), 'utf-8');

describe('Tournaments Matchday Trophy card', () => {
  it('renders the navy band with the gold trophy medallion', () => {
    expect(src).toContain('bg-[#181868]');
    expect(src).toContain('border-amber-400/70');
    expect(src).toContain('text-amber-400');
  });

  it('shows a localised short format pill on the band', () => {
    expect(src).toContain("tr('tournaments_format_league_short', 'League')");
    expect(src).toContain("tr('tournaments_format_knockout_short', 'Knockout')");
    expect(src).toContain('bg-[#e8b850] text-[#181868]');
  });

  it('keeps delete on the band with its confirm flow handler', () => {
    expect(src).toContain('handleDelete(t.id, e)');
    expect(src).toContain('hover:bg-red-100');
  });

  it('stat strip carries Teams / Overs / Meetings-or-Matches', () => {
    expect(src).toContain('grid grid-cols-3 divide-x divide-[var(--border)]');
    expect(src).toContain("tr('tournaments_teams_suffix', 'Teams')");
    expect(src).toContain("tr('tournaments_overs_label', 'Overs')");
    expect(src).toContain("tr('tournaments_meetings_suffix', 'Meetings')");
    expect(src).toContain("tr('tournaments_matches_label', 'Matches')");
    expect(src).toContain('{t.leagueMeetings}x');
  });

  it('progress is one segment per fixture, emerald when complete', () => {
    expect(src).toContain('t.fixtures.map((f, i) =>');
    expect(src).toContain("f.winner || f.isTie ? 'bg-emerald-500' : 'bg-[var(--muted)]'");
    expect(src).toContain("tr('tournaments_progress', 'Progress')");
  });

  it('a champion replaces progress with the gold band', () => {
    expect(src).toContain('bg-[#e8b850] flex items-center gap-2.5 px-4 py-2.5 mt-auto');
    expect(src).toContain("tr('tournaments_champion', 'Champion')");
    expect(src).toContain('{t.champion}');
  });

  it('the card still navigates to the tournament detail page', () => {
    expect(src).toContain('router.push(`/tournaments/${t.id}`)');
  });
});
