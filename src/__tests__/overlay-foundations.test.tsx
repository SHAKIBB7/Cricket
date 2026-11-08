import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { UnifiedModal } from '../components/overlay/UnifiedModal';
import { UnifiedSheet } from '../components/overlay/UnifiedSheet';
import { ConfirmationDialog } from '../components/overlay/ConfirmationDialog';

/**
 * Phase 2A foundations — primitive contracts.
 *
 * These primitives are the ONLY sanctioned way to build new overlays.
 * The contracts below pin the properties the master prompt requires, so
 * a future refactor cannot silently drop them: portal rendering, the
 * shared lifecycle hook (refcounted scroll lock + Escape), dialog
 * semantics, focus trapping, tier z-index, and — critically for
 * scoring safety — sheet dragging that can only start from the header
 * (dragListener off; content can never drag the sheet).
 */

const read = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8');
const modalSrc = read('src/components/overlay/UnifiedModal.tsx');
const sheetSrc = read('src/components/overlay/UnifiedSheet.tsx');
const confirmSrc = read('src/components/overlay/ConfirmationDialog.tsx');
const providerSrc = read('src/components/overlay/OverlayProvider.tsx');
const trapSrc = read('src/hooks/useFocusTrap.ts');

describe('shared lifecycle', () => {
  it('both primitives reuse useModalOverlay instead of hand-rolling scroll lock / Escape', () => {
    expect(modalSrc).toContain('useModalOverlay');
    expect(sheetSrc).toContain('useModalOverlay');
    // No new hand-rolled body locking in the primitives.
    expect(modalSrc).not.toContain('document.body.style.overflow');
    expect(sheetSrc).not.toContain('document.body.style.overflow');
  });

  it('both primitives render through a portal', () => {
    expect(modalSrc).toContain('createPortal');
    expect(sheetSrc).toContain('createPortal');
  });

  it('both primitives trap focus while open', () => {
    expect(modalSrc).toContain('useFocusTrap');
    expect(sheetSrc).toContain('useFocusTrap');
    expect(trapSrc).toContain('previouslyFocused');
  });
});

describe('UnifiedModal contract', () => {
  it('exposes dialog semantics and tier z-index', () => {
    expect(modalSrc).toContain('role="dialog"');
    expect(modalSrc).toContain('aria-modal="true"');
    expect(modalSrc).toContain('OVERLAY_Z_INDEX[tier]');
  });

  it('uses the shared animation variants, not ad-hoc transitions', () => {
    expect(modalSrc).toContain('MODAL_VARIANTS');
    expect(modalSrc).toContain('BACKDROP_VARIANTS');
  });
});

describe('UnifiedSheet contract', () => {
  it('can only be dragged from the header via drag controls (scoring safety)', () => {
    expect(sheetSrc).toContain('dragListener={false}');
    expect(sheetSrc).toContain('dragControls');
    expect(sheetSrc).toContain('controls.start');
  });

  it('derives detents from viewport metrics and the shared snap resolver', () => {
    expect(sheetSrc).toContain('useViewportMetrics');
    expect(sheetSrc).toContain('detentHeights');
    expect(sheetSrc).toContain('resolveSnapTarget');
  });

  it('offers a non-drag alternative for detents (keyboard on the handle)', () => {
    expect(sheetSrc).toContain("e.key === 'ArrowUp'");
    expect(sheetSrc).toContain("e.key === 'ArrowDown'");
  });

  it('accounts for the safe area and locks content overscroll', () => {
    expect(sheetSrc).toContain('safe-area-inset-bottom');
    expect(sheetSrc).toContain('overscroll-contain');
  });
});

describe('ConfirmationDialog contract', () => {
  it('routes destructive confirmations to the critical tier', () => {
    expect(confirmSrc).toContain("destructive ? 'critical' : 'confirmation'");
  });

  it('does not allow backdrop dismissal for destructive confirmations', () => {
    expect(confirmSrc).toContain('dismissOnBackdrop={!destructive}');
  });

  it('uses ≥44px touch targets', () => {
    expect(confirmSrc).toContain('min-h-[44px]');
  });
});

describe('OverlayProvider contract', () => {
  it('enforces a single active primary overlay', () => {
    expect(providerSrc).toContain('claimPrimary');
    expect(providerSrc).toContain('isSuperseded');
  });
});

describe('SSR / closed-state smoke', () => {
  it('closed primitives render nothing (no SSR or hydration hazards)', () => {
    expect(renderToString(<UnifiedModal open={false} onClose={() => {}} ariaLabel="x">hi</UnifiedModal>)).toBe('');
    expect(renderToString(<UnifiedSheet open={false} onClose={() => {}} ariaLabel="x">hi</UnifiedSheet>)).toBe('');
    expect(renderToString(<ConfirmationDialog open={false} title="t" onConfirm={() => {}} onCancel={() => {}} />)).toBe('');
  });
});
