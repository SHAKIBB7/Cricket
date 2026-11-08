// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToHtml } from './helpers/render-dom';
import { DlsModal } from '../components/modals/DlsModal';

/**
 * Ultimate audit F3 — when DLS is already applied, the modal's
 * status banner must show the APPLIED target (the stored value in
 * force), so the fresh recalculation below it can never be mistaken
 * for the number the match is actually being played to.
 */

function renderModal(extra: Record<string, unknown> = {}) {
  return renderToHtml(
    React.createElement(DlsModal, {
      isOpen: true,
      onClose: () => {},
      originalOvers: 20,
      team1Score: 150,
      currentOversBowled: 5,
      currentWicketsLost: 1,
      currentRuns: 35,
      ...extra,
    }),
  );
}

describe('DlsModal applied-target banner (F3)', () => {
  it('shows the applied target and overs in the active banner', () => {
    const html = renderModal({ isDlsApplied: true, appliedTarget: 121, appliedOvers: 15 });
    expect(html).toContain('DLS is currently applied to this match');
    expect(html).toContain('Current target 121 (15 overs)');
  });

  it('shows the banner without a target suffix when no applied value is passed', () => {
    const html = renderModal({ isDlsApplied: true });
    expect(html).toContain('DLS is currently applied to this match');
    expect(html).not.toContain('Current target');
  });

  it('shows no banner when DLS is not applied', () => {
    const html = renderModal({ isDlsApplied: false, appliedTarget: 121, appliedOvers: 15 });
    expect(html).not.toContain('DLS is currently applied to this match');
  });
});
