import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Phase 2C migration guards — the live score page's four hand-rolled
 * inline overlays (Match Information, Retire Batter, Award Penalty
 * Runs, Innings Transition) now render on the UnifiedModal primitive.
 *
 * What this pins:
 * - Each state renders through UnifiedModal with its exact close funnel
 *   (the same setShow* setters as before — scoring state orchestration
 *   is unchanged; the OverlayProvider supersede layer is deliberately
 *   NOT wired on this page yet, because forced flows like the innings
 *   transition must never be auto-closed by another overlay opening).
 * - The innings transition keeps its forced-flow semantics: no
 *   backdrop dismissal (it never had a backdrop click handler).
 * - No hand-rolled fixed inset-0 overlay shells remain for these four.
 * - Scoring content and actions survive verbatim inside the new shells.
 */

const page = fs.readFileSync(
  path.resolve(process.cwd(), 'src/app/matches/score/[matchId]/client.tsx'),
  'utf-8',
);

describe('score page inline overlays on UnifiedModal', () => {
  it.each([
    ['showMatchInfoModal', 'setShowMatchInfoModal(false)', 'Match Information'],
    ['showRetireModal', 'setShowRetireModal(false)', 'Retire Batter'],
    ['showPenaltyModal', 'setShowPenaltyModal(false)', 'Award Penalty Runs'],
    ['showInningsTransitionModal', 'setShowInningsTransitionModal(false)', 'First innings completed'],
  ])('%s renders through UnifiedModal with its original close setter', (state, setter, label) => {
    expect(page).toContain(`open={${state}}`);
    expect(page).toContain(`onClose={() => ${setter}}`);
    expect(page).toContain(`ariaLabel="${label}"`);
  });

  it('innings transition forbids backdrop dismissal (forced flow, as before)', () => {
    const idx = page.indexOf('showInningsTransitionModal}');
    expect(page.slice(idx, idx + 220)).toContain('dismissOnBackdrop={false}');
  });

  it('no hand-rolled overlay shells remain for the four states', () => {
    expect(page).not.toContain('bg-black/60 backdrop-blur-xs z-50');
    expect(page).not.toContain('bg-black/70 backdrop-blur-xs z-50');
  });

  it('scoring actions inside the migrated shells are untouched', () => {
    expect(page).toContain('Start 2nd Innings Chase');
    expect(page).toContain('Confirm Penalty');
    expect(page).toContain('Match Information');
  });
});
