import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Phase 18 Batch 1 guards — semantic alpha utilities.
 *
 * The pre-fix form bg-[var(--muted)]/50 emitted NO CSS in this
 * Tailwind setup (no color-mix), so 169 intended tints were silently
 * transparent. The fix: RGB channel tokens per theme + semantic
 * colors in tailwind.config with <alpha-value>, classes rewritten to
 * bg-muted/50 form. These tests pin all three layers so the tints
 * can never silently vanish again.
 */

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.resolve(root, rel), 'utf-8');

function collect(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      collect(full, out);
    } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

const TOKENS = [
  'background', 'foreground', 'card', 'card-foreground', 'primary',
  'primary-foreground', 'muted', 'muted-foreground', 'border', 'accent',
  'danger', 'warning', 'success', 'info',
];

describe('no broken var-alpha classes remain', () => {
  it('src contains zero [var(--x)]/NN utilities', () => {
    const offenders = collect(path.resolve(root, 'src')).filter((f) =>
      /\[var\(--[a-z-]+\)\]\/\d+/.test(fs.readFileSync(f, 'utf-8')),
    );
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });
});

describe('channel tokens stay in sync with hex tokens', () => {
  const css = read('src/app/globals.css');
  const blocks = [...css.matchAll(/(:root|\.dark|\.sunlight)\s*\{([^}]*)\}/g)];

  it('all three theme blocks are present', () => {
    expect(blocks.map((b) => b[1])).toEqual([':root', '.dark', '.sunlight']);
  });

  it.each([0, 1, 2])('theme block %i defines -rgb channels equal to its hex tokens', (i) => {
    const body = blocks[i][2];
    for (const token of TOKENS) {
      const hex = body.match(new RegExp(`--${token}:\\s*(#[0-9a-fA-F]{6});`));
      const rgb = body.match(new RegExp(`--${token}-rgb:\\s*(\\d+) (\\d+) (\\d+);`));
      expect(hex, `${token} hex`).toBeTruthy();
      expect(rgb, `${token}-rgb`).toBeTruthy();
      const [r, g, b] = [1, 3, 5].map((j) => parseInt(hex![1].slice(j, j + 2), 16));
      expect([Number(rgb![1]), Number(rgb![2]), Number(rgb![3])]).toEqual([r, g, b]);
    }
  });
});

describe('tailwind config exposes alpha-capable semantic colors', () => {
  const config = read('tailwind.config.js');
  it.each(['background', 'foreground', 'card', 'muted', 'border', 'primary'])(
    '%s is mapped through its -rgb channel with <alpha-value>',
    (name) => {
      expect(config).toContain(`rgb(var(--${name}-rgb) / <alpha-value>)`);
    },
  );
});
