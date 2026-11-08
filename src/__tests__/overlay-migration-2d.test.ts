import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Phase 2D migration guards — the overlay migration is complete.
 *
 * - Every modal component now renders on a unified primitive
 *   (UnifiedModal / UnifiedSheet); the two bespoke dark profile shells
 *   are the single documented exception — they keep their identity
 *   styling and gained the shared useFocusTrap instead.
 * - The eight suites that render these components behaviorally run on
 *   the jsdom DOM harness (portal content is invisible to SSR markup);
 *   the docblock marker pins that so nobody "simplifies" them back.
 */

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.resolve(root, rel), 'utf-8');

describe('all modals on unified primitives', () => {
  it.each([
    ['src/components/modals/DlsModal.tsx', 'UnifiedModal'],
    ['src/components/modals/OutModal.tsx', 'UnifiedModal'],
    ['src/components/modals/GroundSelectorModal.tsx', 'UnifiedModal'],
    ['src/components/profile/EditProfileModal.tsx', 'UnifiedModal'],
    ['src/components/modals/HistoricalBallEditModal.tsx', 'UnifiedModal'],
    ['src/components/modals/PlayerSelectionModal.tsx', 'UnifiedSheet'],
  ])('%s renders on %s', (rel, primitive) => {
    const src = read(rel);
    expect(src).toContain(`<${primitive}`);
    expect(src).not.toContain('AnimatePresence');
  });

  it('profile modals keep bespoke shells but share the focus trap', () => {
    for (const rel of ['src/components/modals/BatsmanProfileModal.tsx', 'src/components/modals/BowlerProfileModal.tsx']) {
      const src = read(rel);
      expect(src).toContain('useFocusTrap');
      expect(src).toContain('createPortal');
    }
  });
});

describe('DOM harness suites', () => {
  it.each([
    'src/__tests__/conditional-dls-visibility.test.tsx',
    'src/__tests__/dls-activation-and-scoreboard-navigation-bugfix.test.tsx',
    'src/__tests__/dls-button-removal-and-match-info-integration.test.tsx',
    'src/__tests__/squad-player-selection-workflow.test.ts',
    'src/__tests__/out-modal-ui.test.ts',
    'src/__tests__/record-wicket-modal-scrolling-fix.test.tsx',
    'src/__tests__/wicket-scrolling-and-profile-swipe-fix.test.tsx',
    'src/__tests__/enterprise-account-profile-integration.test.ts',
  ])('%s runs under jsdom via the render-dom helper', (rel) => {
    const src = read(rel);
    expect(src.startsWith('// @vitest-environment jsdom')).toBe(true);
    expect(src).toContain("from './helpers/render-dom'");
    expect(src).not.toContain('renderToStaticMarkup');
  });
});
