/**
 * Token-adoption guard (Phase 17 follow-up sweep).
 *
 * Shared components must express semantic surface/text/border/primary
 * roles through the CSS-var design tokens in globals.css — the only way
 * all three themes (light / dark / sunlight) stay correct. The literal
 * Tailwind pairs below were swept out; this test keeps them out.
 *
 * Exemptions (whole-file, deliberate designs — see TOKEN_ADOPTION_REPORT.md):
 * - BatsmanProfileModal / BowlerProfileModal: fixed dark "broadcast"
 *   stat modals, slate-900 based in every theme by design.
 *
 * NOT banned (intentional literal palette, also documented in the report):
 * backdrop scrims (bg-slate-950/70), glass nav (bg-white/75), on-gradient
 * white tints, alpha tints (bg-slate-50/70 — Tailwind cannot alpha a CSS
 * var without color-mix), brand icon chips and status palette colors.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const COMPONENTS_DIR = path.join(process.cwd(), 'src', 'components');

const EXEMPT_FILES = new Set([
  'modals/BatsmanProfileModal.tsx',
  'modals/BowlerProfileModal.tsx',
]);

const BANNED_PATTERNS = [
  'text-slate-900 dark:text-slate-100',
  'text-slate-900 dark:text-white',
  'text-slate-600 dark:text-slate-400',
  'text-slate-500 dark:text-slate-400',
  'text-slate-400 dark:text-slate-500',
  'text-slate-700 dark:text-slate-300',
  'text-slate-700 dark:text-slate-200',
  'border-slate-200 dark:border-slate-800',
  'border-slate-200/80 dark:border-slate-800',
  'border-slate-200/90 dark:border-slate-800',
  'border-slate-100 dark:border-slate-800/60',
  'border-slate-300 dark:border-slate-700',
  'bg-white dark:bg-slate-900',
  'bg-slate-100 dark:bg-slate-800',
  'bg-slate-200 dark:bg-slate-800',
  'bg-emerald-600 text-white',
  'bg-emerald-600 hover:bg-emerald-500',
];

function listTsx(dir: string, base: string): Array<{ rel: string; full: string }> {
  const out: Array<{ rel: string; full: string }> = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.join(base, entry.name);
    if (entry.isDirectory()) out.push(...listTsx(full, rel));
    else if (entry.name.endsWith('.tsx')) out.push({ rel, full });
  }
  return out;
}

describe('token adoption in shared components', () => {
  const files = listTsx(COMPONENTS_DIR, '');

  it('finds the shared component tree', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it('no swept literal color pairs remain outside the exempt files', () => {
    const violations: string[] = [];
    for (const { rel, full } of files) {
      if (EXEMPT_FILES.has(rel)) continue;
      const src = fs.readFileSync(full, 'utf8');
      for (const pattern of BANNED_PATTERNS) {
        if (src.includes(pattern)) violations.push(`${rel}: ${pattern}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('semantic tokens are actually in use across shared components', () => {
    let tokenFiles = 0;
    for (const { full } of files) {
      if (fs.readFileSync(full, 'utf8').includes('var(--')) tokenFiles++;
    }
    expect(tokenFiles).toBeGreaterThanOrEqual(10);
  });
});

describe('token adoption in app pages (Phase 18 Batch 2)', () => {
  const appFiles = listTsx(path.join(process.cwd(), 'src', 'app'), 'app');

  // The exact neutral pairs swept out of the pages. What legitimately
  // remains in src/app is a documented keep-set, none of which uses
  // these pairs: amber accent pairings (text-slate-950 on amber),
  // scrims (bg-slate-950/70), fixed-dark hero wells/dropdowns, the
  // Google brand button (white bg/text kept; its border was swept),
  // and a neutral status dot (bg-slate-400).
  const PAGE_BANNED_PATTERNS = [
    'text-slate-600 dark:text-slate-400',
    'text-slate-700 dark:text-slate-300',
    'text-slate-700 dark:text-slate-200',
    'bg-slate-100 dark:bg-slate-800',
    'border-slate-200 dark:border-slate-700',
    'border-slate-300 dark:border-slate-700',
  ];

  it('no swept literal color pairs remain in app pages', () => {
    const violations: string[] = [];
    for (const { rel, full } of appFiles) {
      const src = fs.readFileSync(full, 'utf8');
      for (const pattern of PAGE_BANNED_PATTERNS) {
        if (src.includes(pattern)) violations.push(`${rel}: ${pattern}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
