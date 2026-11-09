import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Elevation system (3 levels + inset) — proof applied to the New Match
 * screen before any project-wide rollout.
 *
 * Pins the three layers so the depth can never silently vanish:
 *  1. --shadow-elev-1/2/3 + --shadow-inset tokens exist in every theme
 *     block of globals.css (light :root, .dark, .sunlight).
 *  2. tailwind.config.js maps boxShadow elev1/elev2/elev3/inset to those
 *     tokens (classes shadow-elev1, shadow-elev2, shadow-elev3,
 *     shadow-inset).
 *  3. The New Match page actually uses the scale, and the shared
 *     components it relies on expose the opt-in `elevated` prop instead
 *     of changing their defaults for other screens.
 */

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.resolve(root, rel), 'utf-8');

const TOKENS = ['--shadow-elev-1', '--shadow-elev-2', '--shadow-elev-3', '--shadow-inset'];

describe('elevation tokens exist in all three theme blocks', () => {
  const css = read('src/app/globals.css');
  const blocks = [...css.matchAll(/(:root|\.dark|\.sunlight)\s*\{([^}]*)\}/g)];

  it('finds the three theme blocks in order', () => {
    expect(blocks.map((b) => b[1])).toEqual([':root', '.dark', '.sunlight']);
  });

  it.each([0, 1, 2])('theme block %i defines all four elevation tokens', (i) => {
    const body = blocks[i][2];
    for (const token of TOKENS) {
      const match = body.match(new RegExp(`${token}:\\s*([^;]+);`));
      expect(match, `${blocks[i][1]} ${token}`).toBeTruthy();
      expect(match![1]).toContain('rgb(');
    }
  });

  it('level 2 casts a coloured shadow from the primary channels in every theme', () => {
    for (const block of blocks) {
      const elev2 = block[2].match(/--shadow-elev-2:\s*([^;]+);/);
      expect(elev2![1]).toContain('var(--primary-rgb)');
    }
  });

  it('the inset token is a true inset shadow in every theme', () => {
    for (const block of blocks) {
      const inset = block[2].match(/--shadow-inset:\s*([^;]+);/);
      expect(inset![1].trim().startsWith('inset')).toBe(true);
    }
  });

  it('.floating-card bridge rule resolves shadow-elev1 through the token', () => {
    // .floating-card is unlayered CSS and would otherwise override the
    // layered Tailwind utility on opted-in cards.
    expect(css).toContain('.floating-card.shadow-elev1');
    expect(css).toMatch(/\.floating-card\.shadow-elev1\s*\{\s*box-shadow:\s*var\(--shadow-elev-1\);/);
  });
});

describe('tailwind config maps the elevation scale', () => {
  const config = read('tailwind.config.js');

  it.each([
    ['elev1', '--shadow-elev-1'],
    ['elev2', '--shadow-elev-2'],
    ['elev3', '--shadow-elev-3'],
    ['inset', '--shadow-inset'],
  ])("boxShadow %s points at var(%s)", (key, token) => {
    expect(config).toContain(`'${key}': 'var(${token})'`);
  });
});

describe('new match screen applies the elevation scale', () => {
  const page = read('src/app/matches/new/page.tsx');

  it.each(['shadow-elev1', 'shadow-elev2', 'shadow-elev3', 'shadow-inset'])(
    'page uses %s',
    (cls) => {
      expect(page).toContain(cls);
    },
  );

  it('section cards opt into level 1 via the floating-card bridge', () => {
    expect(page).toContain('floating-card shadow-elev1');
  });

  it('primary submit carries the coloured level 2 shadow', () => {
    expect(page).toMatch(/btn-primary[^"]*shadow-elev2/);
  });

  it('selected overs chip carries level 2, unselected chips level 1', () => {
    expect(page).toContain('shadow-elev2 font-black');
    expect(page).toContain('hover:text-[var(--foreground)] shadow-elev1');
  });

  it('the page-owned saved-team modal panel floats at level 3', () => {
    expect(page).toContain('shadow-elev3 max-w-md');
  });
});

describe('shared components expose opt-in elevation (defaults unchanged)', () => {
  it('CompactDropdown declares the elevated prop and swaps trigger/menu shadows', () => {
    const src = read('src/components/common/CompactDropdown.tsx');
    expect(src).toContain('elevated?: boolean');
    expect(src).toContain("elevated ? 'shadow-elev1' : 'shadow-2xs'");
    expect(src).toContain("elevated ? 'shadow-elev3' : 'shadow-xl'");
  });

  it('BowlingLimiterDrawer declares the elevated prop on its card shell', () => {
    const src = read('src/components/common/BowlingLimiterDrawer.tsx');
    expect(src).toContain('elevated?: boolean');
    expect(src).toContain("elevated ? ' shadow-elev1' : ''");
  });

  it('the new match page passes elevated to both shared components', () => {
    const page = read('src/app/matches/new/page.tsx');
    // home/away/venue dropdowns + the bowling limiter drawer
    expect(page.match(/\n\s+elevated\n/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
