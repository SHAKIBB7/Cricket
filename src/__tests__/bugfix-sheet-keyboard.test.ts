/**
 * Regression: in the Select Bowler sheet, the "Enter Player Name
 * Manually" field fell behind the iOS keyboard (TAIMUR report,
 * 2026-11-10) — the typed name was invisible.
 *
 * Root cause: UnifiedSheet's layer was `fixed inset-0` (layout
 * viewport). iOS does not move fixed layers when the keyboard opens;
 * the visual viewport pans up instead, leaving the bottom-anchored
 * sheet — and the manual-entry field at its bottom — under the
 * keyboard. Detent heights already shrank with the visual viewport,
 * but the layer itself was never repositioned into it.
 *
 * Fix, three layers:
 * 1. useViewportMetrics also reports visualViewport.offsetTop.
 * 2. UnifiedSheet sizes/positions its layer to the visual viewport
 *    (top = offsetTop, height = vv height).
 * 3. The manual-entry input scrolls itself to the centre of the
 *    sheet's scroll area once the keyboard settles, and the app
 *    viewport opts into interactive-widget=resizes-content for
 *    browsers that honour it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const metrics = read('src/hooks/useViewportMetrics.ts');
const sheet = read('src/components/overlay/UnifiedSheet.tsx');
const modal = read('src/components/modals/PlayerSelectionModal.tsx');
const layout = read('src/app/layout.tsx');

describe('bottom sheets stay above the on-screen keyboard', () => {
  it('viewport metrics expose the visual viewport offset', () => {
    expect(metrics).toContain('offsetTop');
    expect(metrics).toContain('vv?.offsetTop');
  });

  it('the sheet layer is positioned to the visual viewport', () => {
    expect(sheet).toContain('viewportOffsetTop');
    expect(sheet).toContain('top: viewportOffsetTop');
    expect(sheet).toContain('height: viewportHeight');
    expect(sheet).not.toContain('className="fixed inset-0"');
  });

  it('detent heights still derive from the same metrics', () => {
    // Page presentation (bowler grid, 2026-11-10) substitutes a single
    // full-viewport detent, but heights still derive from detentHeights
    // over the same useViewportMetrics height.
    expect(sheet).toContain('detentHeights(isPage ? [1] : detents, viewportHeight)');
  });

  it('the manual-entry input scrolls itself into view on focus', () => {
    expect(modal).toContain("el.scrollIntoView({ block: 'center', behavior: 'smooth' })");
  });

  it('the app viewport opts into keyboard-resizes-content', () => {
    expect(layout).toContain("interactiveWidget: 'resizes-content'");
  });
});
