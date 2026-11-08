import { describe, it, expect } from 'vitest';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { getBattedPlayers, getDidNotBatNames, getDidNotBatPlayers } from '../domain/cricket/battingCard';

/**
 * Group A / Bug 4 — Did Not Bat classification (audit/fix-phase2-10).
 * There was previously NO DNB logic in the codebase: four duplicated
 * filters, none of which could see squad members without a player slot.
 */
describe('Group A: Did Not Bat classification', () => {
  function makeEngine() {
    return new EventSourcedMatchEngine({
      teamA: 'Dhaka Gladiators',
      teamB: 'Chittagong Kings',
      tossWinner: 'Dhaka Gladiators',
      tossDecision: 'Batting',
      totalOvers: 20,
      strikerName: 'Tamim Iqbal',
      nonStrikerName: 'Shakib Al Hasan',
      bowlerName: 'Mustafizur Rahman',
    });
  }

  it('openers who have faced ONLY wides have still batted (not DNB)', () => {
    const engine = makeEngine();
    engine.scoreBall({ runsScored: 0, isWide: true });
    engine.scoreBall({ runsScored: 0, isWide: true });
    const inn = engine.currentInnings;
    expect(inn.totalBalls).toBe(0); // wides are not legal deliveries
    const battedNames = getBattedPlayers(inn).map((p) => p.name);
    expect(battedNames).toContain('Tamim Iqbal');
    expect(battedNames).toContain('Shakib Al Hasan');
    expect(getDidNotBatNames(inn)).not.toContain('Tamim Iqbal');
  });

  it('squad members who never got a player slot appear as DNB', () => {
    const engine = makeEngine();
    engine.scoreBall({ runsScored: 4 });
    const inn = engine.currentInnings;
    const squad = [
      'Tamim Iqbal',
      'Shakib Al Hasan',
      'Mushfiqur Rahim',
      'Mahmudullah Riyad',
      'Afif Hossain',
    ];
    const dnb = getDidNotBatNames(inn, squad);
    expect(dnb).toEqual(['Mushfiqur Rahim', 'Mahmudullah Riyad', 'Afif Hossain']);
  });

  it('a dismissed batter is never DNB; the incoming batter at the crease is not DNB', () => {
    const engine = makeEngine();
    engine.scoreBall({
      runsScored: 0,
      isWicket: true,
      dismissalType: 'Bowled',
      newBatsmanName: 'Mushfiqur Rahim',
    } as any);
    const inn = engine.currentInnings;
    const dnb = getDidNotBatPlayers(inn, ['Tamim Iqbal', 'Shakib Al Hasan', 'Mushfiqur Rahim', 'Afif Hossain']);
    const dnbNames = dnb.map((p) => p.name);
    expect(dnbNames).toEqual(['Afif Hossain']);
  });
});
