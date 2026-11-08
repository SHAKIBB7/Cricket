import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Phase 17 — Strict color accuracy & contrast (automated validation).
 *
 * Parses the semantic tokens in src/app/globals.css for all three themes
 * (:root light, .dark, .sunlight) and asserts WCAG 2.2 AA contrast:
 *  - every text-bearing token >= 4.5:1 on background / card / muted
 *  - primary button label >= 4.5:1
 *  - borders >= 1.8:1 surface separation (decorative dividers sit below
 *    the 3:1 component threshold by design; shadows + fills also carry
 *    surface separation — this floor guards against invisible borders
 *    like the old light #e2e8f0 at 1.18:1)
 */

const css = fs.readFileSync(path.resolve(process.cwd(), 'src/app/globals.css'), 'utf-8');

function themeTokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start, `theme block ${selector} exists`).toBeGreaterThanOrEqual(0);
  const block = css.slice(start, css.indexOf('}', start));
  const tokens: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[m[1]] = m[2];
  }
  return tokens;
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

const THEMES: Record<string, string> = {
  light: ':root',
  dark: '.dark',
  sunlight: '.sunlight',
};

const TEXT_TOKENS = ['foreground', 'card-foreground', 'muted-foreground', 'accent', 'danger', 'warning', 'success', 'info'];
const SURFACES = ['background', 'card', 'muted'];

describe('Phase 17: semantic token contrast (WCAG 2.2 AA)', () => {
  for (const [themeName, selector] of Object.entries(THEMES)) {
    describe(themeName, () => {
      const t = themeTokens(selector);

      it('defines the full semantic token set', () => {
        for (const name of [...TEXT_TOKENS, ...SURFACES, 'primary', 'primary-foreground', 'border']) {
          expect(t[name], `--${name} defined in ${themeName}`).toBeTruthy();
        }
      });

      for (const token of TEXT_TOKENS) {
        for (const surface of SURFACES) {
          it(`--${token} on --${surface} >= 4.5:1`, () => {
            // muted-foreground is not rendered on the muted surface for body
            // text in every component, but secondary labels do sit on muted
            // chips — hold it to the same standard on bg/card, and 4.5 on
            // muted as well since tokens must be safe by construction.
            expect(contrast(t[token], t[surface])).toBeGreaterThanOrEqual(4.5);
          });
        }
      }

      it('primary button label >= 4.5:1', () => {
        expect(contrast(t['primary-foreground'], t['primary'])).toBeGreaterThanOrEqual(4.5);
      });

      it('border surface separation >= 1.8:1 (no invisible borders)', () => {
        expect(contrast(t['border'], t['background'])).toBeGreaterThanOrEqual(1.8);
        expect(contrast(t['border'], t['card'])).toBeGreaterThanOrEqual(1.8);
      });
    });
  }
});

/**
 * The critical-CSS block inlined in src/app/layout.tsx redefines a subset
 * of tokens for first paint — and WINS the cascade over globals.css.
 * Phase 17's border fixes (#e2e8f0 -> #a8bccd, #1f293d -> #3d4f6a) silently
 * never reached the app because this duplicate kept the old values; it was
 * caught by computed-style probing during the token-adoption sweep. Every
 * token the inline block defines must match globals.css exactly.
 */
describe('Phase 17: layout.tsx critical-CSS tokens match globals.css', () => {
  const layout = fs.readFileSync(path.resolve(process.cwd(), 'src/app/layout.tsx'), 'utf-8');
  const criticalStart = layout.indexOf('critical-lcp-css');
  expect(criticalStart).toBeGreaterThanOrEqual(0);
  const critical = layout.slice(criticalStart, layout.indexOf('</style>', criticalStart));

  function inlineTokens(selector: string): Record<string, string> {
    const start = critical.indexOf(`${selector} {`);
    expect(start, `inline theme block ${selector} exists`).toBeGreaterThanOrEqual(0);
    const block = critical.slice(start, critical.indexOf('}', start));
    const tokens: Record<string, string> = {};
    for (const m of block.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
      tokens[m[1]] = m[2];
    }
    return tokens;
  }

  for (const [themeName, selector] of Object.entries(THEMES)) {
    it(`${themeName}: every inline token equals the globals.css token`, () => {
      const expected = themeTokens(selector);
      const inline = inlineTokens(selector);
      expect(Object.keys(inline).length).toBeGreaterThanOrEqual(5);
      for (const [name, value] of Object.entries(inline)) {
        expect(value, `--${name} (${themeName}) in layout.tsx critical CSS`).toBe(expected[name]);
      }
    });
  }
});
