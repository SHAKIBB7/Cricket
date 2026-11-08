import { describe, it, expect, beforeEach } from 'vitest';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';

/**
 * Group B regression tests — audit/fix-phase2-10
 *
 * Bug 6: DLS state leaking into places the user never applied it.
 * Bug 7: undo / replay paths restoring only 5 of the engine's state fields,
 *        producing hybrid DLS state (old target + reduced overs + dlsApplied).
 */
describe('Group B: DLS state integrity', () => {
  let engine: EventSourcedMatchEngine;

  beforeEach(() => {
    engine = new EventSourcedMatchEngine({
      teamA: 'Dhaka Gladiators',
      teamB: 'Chittagong Kings',
      tossWinner: 'Dhaka Gladiators',
      tossDecision: 'Batting',
      totalOvers: 20,
      strikerName: 'Tamim Iqbal',
      nonStrikerName: 'Shakib Al Hasan',
      bowlerName: 'Mustafizur Rahman',
    });
  });

  it('Bug 6: a Super Over created from a DLS match must NOT inherit DLS state', () => {
    engine.applyDlsTarget(120, 15);
    expect(engine.advancedSettings?.dlsApplied).toBe(true);

    const parentScorecard = engine.toScorecard();
    const superEngine = EventSourcedMatchEngine.createSuperOverMatch({
      parentMatch: parentScorecard,
      strikerName: 'Tamim Iqbal',
      nonStrikerName: 'Shakib Al Hasan',
      bowlerName: 'Mustafizur Rahman',
    });

    expect(superEngine.advancedSettings?.dlsApplied).toBeFalsy();
    expect(superEngine.advancedSettings?.dlsRevisedTarget).toBeUndefined();
    expect(superEngine.advancedSettings?.dlsRevisedOvers).toBeUndefined();
    expect(superEngine.advancedSettings?.isSuperOver).toBe(true);
    expect(superEngine.totalOvers).toBe(1);
  });

  it('Bug 7: undo after DLS application must not leave a hybrid state', () => {
    // Score one ball in innings 1 (this pushes a snapshot of the pre-DLS state)
    engine.scoreBall({ runsScored: 4 });
    const targetBeforeDls = engine.targetScore;
    const oversBeforeDls = engine.totalOvers;

    // Apply DLS (no snapshot is pushed by applyDlsTarget)
    engine.applyDlsTarget(120, 15);
    expect(engine.totalOvers).toBe(15);
    expect(engine.targetScore).toBe(120);
    expect(engine.advancedSettings?.dlsApplied).toBe(true);

    // Undo the last ball. The restored snapshot is the PRE-DLS state, so the
    // engine must return to it completely — not keep reduced overs / dlsApplied
    // alongside the pre-DLS target.
    const undone = engine.undo();
    expect(undone).toBe(true);
    expect(engine.targetScore).toBe(targetBeforeDls);
    expect(engine.totalOvers).toBe(oversBeforeDls);
    expect(engine.advancedSettings?.dlsApplied).toBeFalsy();
  });
});
