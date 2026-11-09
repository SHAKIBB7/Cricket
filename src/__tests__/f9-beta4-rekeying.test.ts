import { describe, expect, it } from 'vitest';
import { ManOfTheMatchEngine } from '../domain/cricket/analytics/ManOfTheMatchEngine';
import {
  buildPlayerIdentityIndex,
  playerRecordMatchesSelection,
} from '../domain/cricket/analytics/playerIdentityIndex';
import type { InningsData, MatchScorecard, Player } from '../domain/cricket/types';

/**
 * F9-β4: consumers key on the stable playerId first.
 *  - MoM: same-named teammates with different ids stay separate;
 *    a renamed player (same id, two name spellings) is ONE candidate
 *    whose batting and bowling merge; the result reports the id.
 *  - Analytics identity index: rename variants unify in both
 *    directions; distinct ids never unify; id-less records are
 *    name-only, exactly as before.
 */
function batter(partial: Partial<Player>): Player {
  return {
    id: 'p_x',
    name: '',
    battingHand: 'Right-hand Batsman',
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    dotBalls: 0,
    ballLog: [],
    bowlersFaced: {},
    runsVsBowler: {},
    isDismissed: false,
    ...partial,
  } as Player;
}

function innings(partial: Partial<InningsData>): InningsData {
  return {
    inningsNumber: 1,
    team: 'Tigers',
    bowlingTeam: 'Lions',
    totalRuns: 0,
    totalWickets: 0,
    totalBalls: 0,
    oversString: '0.0',
    players: [],
    bowlers: [],
    ...partial,
  } as unknown as InningsData;
}

describe('MoM β4 keying', () => {
  it('two same-named teammates with different playerIds stay separate', () => {
    const inn1 = innings({
      totalRuns: 90,
      totalBalls: 60,
      players: [
        batter({ id: 'p_1_1', playerId: 'pl_rahim_sr', name: 'Rahim', runs: 55, balls: 30, fours: 6, sixes: 2 }),
        batter({ id: 'p_1_2', playerId: 'pl_rahim_jr', name: 'Rahim', runs: 8, balls: 10 }),
      ],
      bowlers: [],
    });
    const inn2 = innings({
      inningsNumber: 2,
      team: 'Lions',
      bowlingTeam: 'Tigers',
      totalRuns: 80,
      totalBalls: 60,
      players: [batter({ id: 'p_2_1', name: 'Lion One', runs: 30, balls: 25 })],
      bowlers: [],
    });

    const result = ManOfTheMatchEngine.calculateForMatch(inn1, inn2, {
      totalOvers: 10,
      winner: 'Tigers',
    });
    const rahims = (result!.allCandidates || []).filter((c) => c.playerName === 'Rahim');
    expect(rahims).toHaveLength(2);
    expect(rahims.map((c) => c.playerId).sort()).toEqual(['pl_rahim_jr', 'pl_rahim_sr']);
    const sr = rahims.find((c) => c.playerId === 'pl_rahim_sr');
    expect(sr?.stats.runs).toBe(55);
  });

  it('a renamed player (same playerId, two spellings) is ONE candidate', () => {
    const inn1 = innings({
      totalRuns: 70,
      totalBalls: 60,
      players: [
        batter({ id: 'p_1_1', playerId: 'pl_rahim', name: 'Rahim', runs: 42, balls: 28, fours: 5, sixes: 1 }),
        batter({ id: 'p_1_2', name: 'Other Bat', runs: 10, balls: 12 }),
      ],
      bowlers: [{ id: 'b_1_1', name: 'Lion Bowl', ballsBowled: 24, maidens: 0, runs: 30, wickets: 1, overHistory: [] }],
    });
    const inn2 = innings({
      inningsNumber: 2,
      team: 'Lions',
      bowlingTeam: 'Tigers',
      totalRuns: 65,
      totalBalls: 60,
      players: [batter({ id: 'p_2_1', name: 'Lion One', runs: 25, balls: 20 })],
      bowlers: [
        { id: 'b_2_1', playerId: 'pl_rahim', name: 'Rahim Uddin', ballsBowled: 24, maidens: 0, runs: 18, wickets: 3, overHistory: [] },
      ],
    });

    const result = ManOfTheMatchEngine.calculateForMatch(inn1, inn2, {
      totalOvers: 10,
      winner: 'Tigers',
    });
    const merged = (result!.allCandidates || []).filter((c) => c.playerId === 'pl_rahim');
    expect(merged).toHaveLength(1);
    expect(merged[0].stats.runs).toBe(42);
    expect(merged[0].stats.wickets).toBe(3);
  });
});

describe('analytics identity index (β4)', () => {
  const card = (players: Array<Partial<Player>>): MatchScorecard =>
    ({
      id: 'm1',
      firstInnings: innings({ players: players.map((p, i) => batter({ id: `p_1_${i + 1}`, ...p })) }),
    }) as unknown as MatchScorecard;

  it('rename variants unify in both directions', () => {
    const idx = buildPlayerIdentityIndex([
      card([{ playerId: 'pl_r', name: 'Rahim', runs: 10 }]),
      card([{ playerId: 'pl_r', name: 'Rahim Uddin', runs: 20 }]),
    ]);
    // Selecting the NEW name matches the OLD-name record…
    expect(
      playerRecordMatchesSelection(idx, { name: 'Rahim', playerId: 'pl_r' }, 'Rahim Uddin')
    ).toBe(true);
    // …and selecting the OLD name matches the NEW-name record.
    expect(
      playerRecordMatchesSelection(idx, { name: 'Rahim Uddin', playerId: 'pl_r' }, 'Rahim')
    ).toBe(true);
  });

  it('variants are tracked per id — ids never cross-match; id-less records stay name-only', () => {
    const idx = buildPlayerIdentityIndex([
      card([
        { playerId: 'pl_a', name: 'Rahim' },
        { playerId: 'pl_a', name: 'Rahim Uddin' }, // pl_a renamed
        { playerId: 'pl_b', name: 'Rahim' }, // a DIFFERENT Rahim
        { playerId: 'pl_b', name: 'Karim' }, // pl_b renamed differently
      ]),
    ]);
    // pl_a's record matches pl_a's other variant…
    expect(playerRecordMatchesSelection(idx, { name: 'Rahim', playerId: 'pl_a' }, 'Rahim Uddin')).toBe(true);
    // …but pl_b's record must NOT match a variant only pl_a ever used.
    expect(playerRecordMatchesSelection(idx, { name: 'Karim', playerId: 'pl_b' }, 'Rahim Uddin')).toBe(false);
    // Id-less records: exact name only, as before β4.
    expect(playerRecordMatchesSelection(idx, { name: 'Rahim' }, 'Rahim')).toBe(true);
    expect(playerRecordMatchesSelection(idx, { name: 'Rahim' }, 'Karim')).toBe(false);
  });
});
