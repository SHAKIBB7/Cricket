import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Ultimate audit F5 guard — native alert is gone for good.
 *
 * Stage A replaced the last 10 alert calls with the shared
 * AppToast surface. This guard fails if a bare alert( ever
 * returns to production code.
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

describe('native alert elimination (F5)', () => {
  it('no bare alert( call exists in production src', () => {
    const offenders = collect(path.resolve(root, 'src')).filter((f) =>
      /(^|[^.\w])alert\s*\(/.test(fs.readFileSync(f, 'utf-8')),
    );
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });

  it('the toast host is mounted once in the root layout', () => {
    expect(read('src/app/layout.tsx')).toContain('<AppToastHost />');
  });

  it('the toast module exposes the imperative API and the host', () => {
    const src = read('src/components/common/AppToast.tsx');
    expect(src).toContain('export function showAppToast');
    expect(src).toContain('export function AppToastHost');
  });
});
