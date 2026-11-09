import { describe, expect, it } from 'vitest';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';

/**
 * F4-A (Ultimate Stage C): match visibility. Public-by-default is the
 * documented Public Match Center design; F4-A adds the missing privacy
 * half — `isPublic` must survive the full engine lifecycle
 * (create → scorecard → restore → clone) or the score page's persist
 * loop (which saves engine.toScorecard() wholesale) would silently
 * revert a private match to public on the first ball.
 */

function makeEngine(isPublic?: boolean) {
  return new EventSourcedMatchEngine({
    teamA: 'Team A',
    teamB: 'Team B',
    tossWinner: 'Team A',
    tossDecision: 'Batting',
    totalOvers: 5,
    strikerName: 'Pant',
    nonStrikerName: 'Rahul',
    bowlerName: 'Anderson',
    isPublic,
  });
}

describe('match visibility (F4-A)', () => {
  it('defaults to public when unspecified', () => {
    expect(makeEngine().isPublic).toBe(true);
    expect(makeEngine().toScorecard().isPublic).toBe(true);
  });

  it('a private match stays private through scorecard round-trip', () => {
    const engine = makeEngine(false);
    const scorecard = engine.toScorecard();
    expect(scorecard.isPublic).toBe(false);

    const restored = EventSourcedMatchEngine.fromScorecard(scorecard);
    expect(restored.isPublic).toBe(false);
    expect(restored.toScorecard().isPublic).toBe(false);
  });

  it('legacy scorecards without the flag restore as public', () => {
    const scorecard = makeEngine(false).toScorecard();
    delete scorecard.isPublic;
    expect(EventSourcedMatchEngine.fromScorecard(scorecard).isPublic).toBe(true);
  });

  it('clone preserves visibility (score-page toggle path)', () => {
    const engine = makeEngine(true);
    const cloned = engine.clone();
    cloned.isPublic = false;
    expect(cloned.toScorecard().isPublic).toBe(false);
    expect(engine.isPublic).toBe(true);
  });

  it('chase matches honour the flag too', () => {
    const chase = EventSourcedMatchEngine.createChaseMatch({
      chasingTeam: 'Team B',
      defendingTeam: 'Team A',
      targetScore: 120,
      totalOvers: 5,
      isPublic: false,
    });
    expect(chase.isPublic).toBe(false);
    expect(chase.toScorecard().isPublic).toBe(false);
  });
});
