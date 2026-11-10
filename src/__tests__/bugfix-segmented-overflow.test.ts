/**
 * Regression: GroundSelectorModal tab strip overflowed the modal on
 * phones (TAIMUR screenshot, 2026-11-10) — the "Custom Ground" label
 * ran past the box edge and the 4th tab sat off-screen.
 *
 * Root cause: .segmented-item carried `whitespace-nowrap` without
 * `min-w-0`, so flex items could not shrink below their labels'
 * min-content width; the modal compensated with a `min-w-[320px]`
 * control inside an overflow-x-auto wrapper, which reads as broken.
 *
 * Fix: items get min-w-0, labels ellipsise inside their tab, narrow
 * screens (<=480px) stack icon over label so all tabs fit, and the
 * modal's forced min-width is gone.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
const modal = readFileSync(
  join(process.cwd(), 'src/components/modals/GroundSelectorModal.tsx'),
  'utf8'
);

describe('segmented control cannot overflow its container', () => {
  it('segmented items can shrink below label width (min-w-0)', () => {
    // Match the @layer components definitions specifically — an earlier
    // transition-property rule also ends a selector list with
    // `.segmented-item-active {` and would shadow a naive first match.
    const itemRule = css.match(/\.segmented-item \{\s*@apply[^}]*\}/)?.[0] ?? '';
    const activeRule = css.match(/\.segmented-item-active \{\s*@apply[^}]*\}/)?.[0] ?? '';
    expect(itemRule).toContain('min-w-0');
    expect(activeRule).toContain('min-w-0');
  });

  it('labels ellipsise inside their tab instead of pushing out', () => {
    expect(css).toContain('.segmented-control > * > span');
    const spanRule =
      css.match(/\.segmented-control > \* > span \{[^}]*\}/)?.[0] ?? '';
    expect(spanRule).toContain('overflow: hidden');
    expect(spanRule).toContain('text-overflow: ellipsis');
  });

  it('narrow screens stack icon over label so all tabs fit', () => {
    const media = css.match(
      /@media \(max-width: 480px\) \{[\s\S]*?segmented-item[\s\S]*?\n  \}/
    )?.[0];
    expect(media).toBeTruthy();
    expect(media).toContain('flex-direction: column');
  });

  it('the ground modal no longer forces a 320px minimum tab strip', () => {
    expect(modal).not.toContain('min-w-[320px]');
    expect(modal).toContain('segmented-control w-full');
  });

  it('all four ground tabs are still rendered', () => {
    for (const key of ['gsm_tab_search', 'gsm_tab_map', 'gsm_tab_custom', 'gsm_tab_saved']) {
      expect(modal).toContain(key);
    }
  });
});
