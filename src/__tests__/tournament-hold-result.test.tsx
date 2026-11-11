/**
 * @vitest-environment jsdom
 *
 * TAIMUR (2026-11-11): on Tournament Details a stray tap on a
 * Won/Tie button recorded the result instantly and it could never
 * be undone. Manual results are now hold-to-confirm — 3s to set,
 * 5s on the set option to clear — with a round timer ring.
 * These tests pin the engine's clear path and the button's timing.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TournamentEngine } from '../domain/tournament/TournamentEngine';
import { HoldResultButton } from '../features/tournaments/HoldResultButton';

describe('TournamentEngine.clearResult (hold-to-deselect path)', () => {
  it('clears a recorded winner and retracts the knockout final it created', () => {
    let tournament = TournamentEngine.createTournament({
      name: 'KO',
      format: 'knockout',
      teams: ['Bangladesh', 'India', 'Pakistan'],
    });
    const firstMatch = tournament.fixtures.find((f) => !!f.awayTeam)!;
    tournament = TournamentEngine.recordWinner({
      tournament,
      fixtureId: firstMatch.id,
      winner: 'Bangladesh',
    });
    expect(tournament.fixtures.some((f) => f.round === 2)).toBe(true);

    tournament = TournamentEngine.clearResult({
      tournament,
      fixtureId: firstMatch.id,
    });
    const cleared = tournament.fixtures.find((f) => f.id === firstMatch.id)!;
    expect(cleared.winner).toBeUndefined();
    expect(cleared.loser).toBeUndefined();
    expect(cleared.resultType).toBeUndefined();
    expect(cleared.isTie).toBe(false);
    expect(cleared.resultText).toBeUndefined();
    // The auto-generated final depended on the cleared result.
    expect(tournament.fixtures.some((f) => f.round === 2)).toBe(false);
    expect(tournament.champion).toBeUndefined();
  });

  it('clears a tie in a league and standings drop the shared point', () => {
    let tournament = TournamentEngine.createTournament({
      name: 'League',
      format: 'league',
      teams: ['A', 'B', 'C'],
    });
    const fixture = tournament.fixtures.find(
      (f) => f.homeTeam === 'A' && f.awayTeam === 'B'
    )!;
    tournament = TournamentEngine.recordTie({
      tournament,
      fixtureId: fixture.id,
    });
    let rows = TournamentEngine.standings(tournament);
    expect(rows.find((r) => r.team === 'A')?.points).toBe(1);

    tournament = TournamentEngine.clearResult({
      tournament,
      fixtureId: fixture.id,
    });
    const cleared = tournament.fixtures.find((f) => f.id === fixture.id)!;
    expect(cleared.isTie).toBe(false);
    rows = TournamentEngine.standings(tournament);
    expect(rows.find((r) => r.team === 'A')?.points).toBe(0);
    expect(rows.find((r) => r.team === 'A')?.played).toBe(0);
  });
});

describe('HoldResultButton timing', () => {
  let container: HTMLDivElement | null = null;
  let root: import('react-dom/client').Root | null = null;

  const pointer = (type: string) => {
    const Ctor = (window as any).PointerEvent as typeof PointerEvent | undefined;
    return Ctor
      ? new Ctor(type, { bubbles: true, button: 0, pointerType: 'touch' })
      : new window.MouseEvent(type, { bubbles: true, button: 0 });
  };

  const renderButton = async (duration: number, onComplete: () => void) => {
    const { createRoot } = await import('react-dom/client');
    const { act } = await import('react');
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <HoldResultButton duration={duration} onComplete={onComplete}>
          Label
        </HoldResultButton>
      );
    });
    return container.querySelector('button')!;
  };

  const fire = async (el: Element, type: string) => {
    const { act } = await import('react');
    await act(async () => {
      el.dispatchEvent(pointer(type));
    });
  };

  const advance = async (ms: number) => {
    const { act } = await import('react');
    await act(async () => {
      vi.advanceTimersByTime(ms);
    });
  };

  afterEach(async () => {
    const { act } = await import('react');
    if (root) {
      await act(async () => root!.unmount());
      root = null;
    }
    container?.remove();
    container = null;
    vi.useRealTimers();
  });

  it('a plain tap (press and release) records nothing', async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const button = await renderButton(3000, onComplete);
    await fire(button, 'pointerdown');
    await advance(120);
    await fire(button, 'pointerup');
    await advance(10000);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('holding the full 3s fires exactly once; releasing at 2.9s does not', async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const button = await renderButton(3000, onComplete);
    await fire(button, 'pointerdown');
    await advance(2900);
    expect(onComplete).not.toHaveBeenCalled();
    await fire(button, 'pointerup');

    await fire(button, 'pointerdown');
    await advance(3100);
    expect(onComplete).toHaveBeenCalledTimes(1);
    await advance(5000);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('a 5s deselect hold does not fire at 3s', async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const button = await renderButton(5000, onComplete);
    await fire(button, 'pointerdown');
    await advance(3000);
    expect(onComplete).not.toHaveBeenCalled();
    await advance(2100);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('renders the round timer ring svg', async () => {
    const button = await renderButton(3000, vi.fn());
    const svg = button.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.querySelectorAll('circle')).toHaveLength(2);
  });
});

describe('tournament details page — hold wiring (source pins)', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/app/tournaments/[id]/page.tsx'),
    'utf8'
  );

  it('fixture results use HoldResultButton with 3s set / 5s clear durations', () => {
    expect(src).toContain('HoldResultButton');
    expect(src).toContain('? 5000 : 3000');
    expect(src).toContain('handleClearResult');
    expect(src).toContain('tournaments_id_hold_hint');
  });

  it('the result grid is constrained to the card width (no Tie overflow)', () => {
    expect(src).toContain('grid gap-1.5 grid-cols-[1fr_1fr_64px] w-full');
    // Matchday Navy reskin (TAIMUR picked style (1), 2026-11-11):
    // solid navy hero, gold meta + tab underline, navy card strip.
    expect(src).toContain('bg-[#181868]');
    expect(src).toContain('text-[#e8b850]');
    expect(src).toContain("? 'border-[#e8b850] text-[#181868] dark:text-white'");
    expect(src).not.toContain('from-amber-950');
    // Completed fixtures trade the Score Match CTA for a status.
    expect(src).toContain('tournaments_id_match_completed');
    expect(src).toContain('isComplete ?');
    // Schedule & Bracket joins the same navy/gold family.
    expect(src).toContain('Generate Knockout Bracket (Top 4)');
    expect(src).toContain('Knockout Bracket');
    expect(src).toContain('bg-[#e8b850] px-4 py-1.5 flex items-center gap-1.5');
    // Cap leaderboards: rich cap bands + rank badges (international style).
    expect(src).toContain('from-orange-600 to-amber-500');
    expect(src).toContain('from-purple-700 to-violet-500');
    expect(src).toContain('Crown');
    expect(src).toContain('tournaments_id_col_batsman');
    expect(src).toContain('tournaments_id_col_best');
  });
});
