import { describe, it, expect } from 'vitest';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { getBattedPlayers, getDidNotBatPlayers, isRetiredHurt, playerHasBatted } from '../domain/cricket/battingCard';
import { cleanPlayerName } from '../domain/cricket/formatters';

/**
 * Ultimate audit F1 — Retired Hurt is not a dismissal.
 *
 * Before the fix the engine set isDismissed = true for BOTH retire
 * types, so a hurt batter counted as OUT in averages, on cards and
 * in did-not-bat classification — while the dismissal registry and
 * the Laws both say retired hurt is not out. These tests pin the
 * corrected semantics on the live path and on event replay.
 */

function makeEngine() {
  return new EventSourcedMatchEngine({
    teamA: 'Team A',
    teamB: 'Team B',
    tossWinner: 'Team A',
    tossDecision: 'Batting',
    totalOvers: 5,
    strikerName: 'Pant',
    nonStrikerName: 'Rahul',
    bowlerName: 'Anderson',
  });
}

describe('Retired Hurt semantics (F1)', () => {
  it('hurt: not a wicket, not dismissed, departure still recorded', () => {
    const engine = makeEngine();
    expect(engine.retirePlayer(true, 'Retire Hurt')).toBe(true);
    const inn = engine.firstInnings;
    const pant = inn.players.find((p) => cleanPlayerName(p.name) === 'Pant')!;
    expect(inn.totalWickets).toBe(0);
    expect(pant.isDismissed).toBe(false);
    expect(pant.dismissalType).toBe('Retire Hurt');
    expect(isRetiredHurt(pant)).toBe(true);
    expect(inn.fallOfWickets[0].dismissalType).toBe('Retire Hurt');
  });

  it('hurt with zero balls faced still counts as having batted (never did-not-bat)', () => {
    const engine = makeEngine();
    engine.retirePlayer(true, 'Retire Hurt'); // striker retires before facing a ball
    const inn = engine.firstInnings;
    const pantIdx = inn.players.findIndex((p) => cleanPlayerName(p.name) === 'Pant');
    const pant = inn.players[pantIdx];
    expect(pant.balls).toBe(0);
    expect(playerHasBatted(pant, pantIdx, inn)).toBe(true);
    expect(getBattedPlayers(inn).map((p) => cleanPlayerName(p.name))).toContain('Pant');
    expect(getDidNotBatPlayers(inn).map((p) => cleanPlayerName(p.name))).not.toContain('Pant');
  });

  it('out: still a wicket and a dismissal', () => {
    const engine = makeEngine();
    expect(engine.retirePlayer(true, 'Retire Out')).toBe(true);
    const inn = engine.firstInnings;
    const pant = inn.players.find((p) => cleanPlayerName(p.name) === 'Pant')!;
    expect(inn.totalWickets).toBe(1);
    expect(pant.isDismissed).toBe(true);
    expect(isRetiredHurt(pant)).toBe(false);
  });

  it('event replay preserves hurt semantics', () => {
    const engine = makeEngine();
    engine.retirePlayer(true, 'Retire Hurt');
    const replayed = EventSourcedMatchEngine.fromEvents(engine.events);
    const inn = replayed.firstInnings;
    const pant = inn.players.find((p) => cleanPlayerName(p.name) === 'Pant')!;
    expect(pant.isDismissed).toBe(false);
    expect(pant.dismissalType).toBe('Retire Hurt');
    expect(inn.totalWickets).toBe(0);
  });
});
