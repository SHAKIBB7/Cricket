// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { act } from 'react';
import { renderToHtml } from './helpers/render-dom';
import { UnifiedSheet } from '../components/overlay/UnifiedSheet';

/**
 * DOM-level checks for UnifiedSheet behaviours that SSR markup cannot
 * exercise: portal rendering, numeric detents, the custom header slot
 * and the backdrop-dismiss policy (added in Phase 2D for
 * PlayerSelectionModal's required-step semantics).
 */

describe('UnifiedSheet (DOM)', () => {
  it('renders children through the portal at the half detent', () => {
    const html = renderToHtml(
      <UnifiedSheet open onClose={() => {}} ariaLabel="Pick a player" detents={[0.5, 0.92]} initialDetent={0}>
        <div>SheetBodyMarker</div>
      </UnifiedSheet>,
    );
    expect(html).toContain('SheetBodyMarker');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Pick a player"');
  });

  it('renders a custom header in place of the default title row', () => {
    const html = renderToHtml(
      <UnifiedSheet
        open
        onClose={() => {}}
        ariaLabel="Pick a player"
        header={<div>CustomHeaderMarker</div>}
      >
        <div>Body</div>
      </UnifiedSheet>,
    );
    expect(html).toContain('CustomHeaderMarker');
  });

  it('backdrop click does not dismiss when dismissOnBackdrop is false', async () => {
    const onClose = vi.fn();
    const { createRoot } = await import('react-dom/client');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <UnifiedSheet open onClose={onClose} ariaLabel="Pick" dismissOnBackdrop={false}>
          <div>Body</div>
        </UnifiedSheet>,
      );
    });
    const backdrop = document.body.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(backdrop).toBeTruthy();
    act(() => {
      backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = '';
  });
});
