import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Phase 2B migration guards.
 *
 * 1. Native window.confirm() is gone from the app: every destructive
 *    action routes through the unified ConfirmationDialog instead.
 * 2. HistoricalBallEditModal renders on the UnifiedModal primitive.
 * 3. DlsModal and PlayerSelectionModal are DELIBERATELY not yet
 *    migrated: both are rendered behaviorally via renderToStaticMarkup
 *    by existing regression suites (conditional-dls-visibility,
 *    dls-activation, squad-player-selection-workflow), and portal-based
 *    primitives render nothing under SSR markup. Their migration is
 *    gated on porting those suites to a DOM harness (Phase 2D). This
 *    test pins that known state so the deferral is explicit, not
 *    accidental.
 */

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.resolve(root, rel), 'utf-8');

function collectTsx(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      collectTsx(full, out);
    } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Lines that are code (naive comment stripping — enough for a call-site scan). */
function codeLines(src: string): string[] {
  return src.split('\n').filter((line) => {
    const t = line.trim();
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  });
}

describe('native confirm() elimination', () => {
  const files = [
    ...collectTsx(path.resolve(root, 'src/app')),
    ...collectTsx(path.resolve(root, 'src/components')),
  ];

  it('no file calls the native confirm() anymore', () => {
    const offenders = files.filter((f) =>
      codeLines(fs.readFileSync(f, 'utf-8')).some((line) => /(^|[^a-zA-Z.])confirm\(/.test(line)),
    );
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });

  it.each([
    'src/app/grounds/page.tsx',
    'src/app/matches/history/page.tsx',
    'src/app/teams/page.tsx',
    'src/app/tournaments/page.tsx',
    'src/components/profile/GoogleDriveBackupSection.tsx',
  ])('%s routes its destructive action through ConfirmationDialog', (rel) => {
    const src = read(rel);
    expect(src).toContain("from '@/components/overlay/ConfirmationDialog'");
    expect(src).toContain('<ConfirmationDialog');
    expect(src).toContain('destructive');
  });
});

describe('HistoricalBallEditModal migration', () => {
  const src = read('src/components/modals/HistoricalBallEditModal.tsx');

  it('renders on UnifiedModal and dropped its hand-rolled shell', () => {
    expect(src).toContain("from '@/components/overlay/UnifiedModal'");
    expect(src).toContain('<UnifiedModal');
    expect(src).not.toContain('AnimatePresence');
    expect(src).not.toContain('fixed inset-0');
    expect(src).not.toContain('useModalOverlay');
  });

  it('keeps its save/replay behaviour wired (business logic untouched)', () => {
    expect(src).toContain('onSave(ballIndex, inningsNumber, updatedInput)');
    expect(src).toContain('Save & Replay');
  });
});

describe('documented deferrals (portal vs SSR render tests)', () => {
  // RESOLVED in Phase 2D: the render suites were ported to a jsdom DOM
  // harness (src/__tests__/helpers/render-dom.tsx), and both modals are
  // now migrated — DlsModal to UnifiedModal, PlayerSelectionModal to
  // UnifiedSheet. The migration state is pinned by
  // overlay-migration-2d.test.ts; this block now only records that the
  // deferral no longer applies.
  it('the 2B deferral is lifted (see overlay-migration-2d.test.ts)', () => {
    expect(read('src/components/modals/DlsModal.tsx')).toContain('UnifiedModal');
    expect(read('src/components/modals/PlayerSelectionModal.tsx')).toContain('UnifiedSheet');
  });
});
