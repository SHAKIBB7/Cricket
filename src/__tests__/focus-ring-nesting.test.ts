/**
 * Regression pin — nested focus-box bug (owner report 2026-11-25).
 *
 * Tapping the Home/Away team field on the New Match screen drew a
 * SECOND, smaller emerald box inside the field: the inner <input>
 * carried its own `focus-visible:ring-2` while the outer container
 * already showed focus. The same tap-visible box appeared on buttons
 * app-wide via plain `focus:ring-*` utilities (fires on ANY focus,
 * including touch) and the ungated global `:focus-visible` outline.
 *
 * Rules pinned here:
 *  1. CompactDropdown draws focus ONCE, on its outer container
 *     (focus-within), never on the inner input / trigger / search.
 *  2. The global :focus-visible outline is gated to fine-pointer,
 *     hover-capable devices (keyboard navigation), never touch.
 *  3. No plain `focus:ring-*` remains in app UI code — button focus
 *     styles use `focus-visible:` so taps don't draw boxes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('Nested focus box — CompactDropdown', () => {
  const src = read('src/components/common/CompactDropdown.tsx');

  it('inner input, trigger and search carry no ring of their own', () => {
    expect(src).not.toContain('focus-visible:ring');
    expect(src).not.toMatch(/(?<!-visible:)focus:ring/);
  });

  it('the outer container shows focus once via focus-within', () => {
    expect(src).toContain('focus-within:border-emerald-500');
    expect(src).toContain('focus-within:ring-2');
    expect(src).toContain('focus-within:ring-emerald-500/20');
  });
});

describe('Nested focus box — global outline gate', () => {
  const css = read('src/app/globals.css');

  it(':focus-visible outline only applies to fine-pointer hover devices', () => {
    const gate = css.indexOf('@media (hover: hover) and (pointer: fine)');
    expect(gate).toBeGreaterThan(-1);
    const outline = css.indexOf(':focus-visible', gate);
    expect(outline).toBeGreaterThan(gate);
    expect(css.slice(gate, outline + 200)).toContain('outline: 2px solid var(--primary)');
  });
});

describe('Nested focus box — no tap-fired rings on buttons', () => {
  const files = [
    'src/components/layout/Navigation.tsx',
    'src/components/navigation/CricketBottomNavigation.tsx',
    'src/components/navigation/BackButton.tsx',
    'src/components/navigation/ToolsAndAccountsPanel.tsx',
    'src/components/scoring/MatchesPanel.tsx',
    'src/app/matches/score/[matchId]/client.tsx',
    'src/app/matches/new/page.tsx',
  ];
  for (const f of files) {
    it(`${f} uses focus-visible: for rings, never plain focus:`, () => {
      const src = read(f);
      expect(src).not.toMatch(/(?<!-visible:)focus:ring/);
    });
  }
});
