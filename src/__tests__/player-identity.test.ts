import { describe, expect, it } from 'vitest';
import {
  newPlayerId,
  normalizeTeamPlayers,
  teamPlayerNames,
  type TeamPlayer,
} from '../domain/teams/playerIdentity';

/**
 * F9-β1: the player-identity compatibility boundary. Pins the
 * normaliser semantics that β2 (migration + object writers) will
 * rely on: both historical forms accepted, ids preserved by name
 * match, duplicates deterministic, garbage dropped.
 */
describe('normalizeTeamPlayers', () => {
  it('converts a legacy string list to objects with fresh pl_ ids', () => {
    const out = normalizeTeamPlayers(['Rahim', 'Karim']);
    expect(out.map((p) => p.name)).toEqual(['Rahim', 'Karim']);
    expect(out.every((p) => p.id.startsWith('pl_'))).toBe(true);
    expect(new Set(out.map((p) => p.id)).size).toBe(2);
  });

  it('passes object form through, keeping ids', () => {
    const input = [
      { id: 'pl_abc', name: 'Rahim' },
      { id: 'pl_def', name: 'Karim' },
    ];
    expect(normalizeTeamPlayers(input)).toEqual(input);
  });

  it('generates an id for objects that lack one', () => {
    const out = normalizeTeamPlayers([{ name: 'Rahim' }]);
    expect(out[0].name).toBe('Rahim');
    expect(out[0].id.startsWith('pl_')).toBe(true);
  });

  it('preserves existing ids by name match (case-insensitive)', () => {
    const existing: TeamPlayer[] = [
      { id: 'pl_rahim', name: 'Rahim' },
      { id: 'pl_karim', name: 'Karim' },
    ];
    const out = normalizeTeamPlayers(['rahim', 'KARIM', 'New Guy'], existing);
    expect(out.map((p) => p.id)).toEqual([
      'pl_rahim',
      'pl_karim',
      expect.stringMatching(/^pl_/),
    ]);
    expect(out[2].id).not.toBe('pl_rahim');
  });

  it('duplicate names consume existing ids one-to-one, in order', () => {
    const existing: TeamPlayer[] = [
      { id: 'pl_rahim_1', name: 'Rahim' },
      { id: 'pl_rahim_2', name: 'Rahim' },
    ];
    const out = normalizeTeamPlayers(['Rahim', 'Rahim', 'Rahim'], existing);
    expect(out[0].id).toBe('pl_rahim_1');
    expect(out[1].id).toBe('pl_rahim_2');
    expect(out[2].id).not.toBe('pl_rahim_1');
    expect(out[2].id).not.toBe('pl_rahim_2');
  });

  it('drops blanks and garbage; non-arrays become empty', () => {
    expect(normalizeTeamPlayers(['', '  ', null, 42, {}, { name: '' }, 'Sakib'])).toEqual([
      expect.objectContaining({ name: 'Sakib' }),
    ]);
    expect(normalizeTeamPlayers(undefined)).toEqual([]);
    expect(normalizeTeamPlayers('Rahim')).toEqual([]);
    expect(normalizeTeamPlayers(null)).toEqual([]);
  });

  it('an explicit id on the entry wins over a name-matched existing id', () => {
    const existing: TeamPlayer[] = [{ id: 'pl_old', name: 'Rahim' }];
    const out = normalizeTeamPlayers([{ id: 'pl_new', name: 'Rahim' }], existing);
    expect(out[0].id).toBe('pl_new');
  });
});

describe('teamPlayerNames', () => {
  it('projects both forms to names (the string-era boundary guard)', () => {
    expect(teamPlayerNames(['Rahim', { id: 'pl_x', name: 'Karim' }, { name: 'Sakib' }])).toEqual([
      'Rahim',
      'Karim',
      'Sakib',
    ]);
    expect(teamPlayerNames([null, {}, ''])).toEqual([]);
    expect(teamPlayerNames(undefined)).toEqual([]);
  });
});

describe('newPlayerId', () => {
  it('is prefixed and unique across many calls', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newPlayerId()));
    expect(ids.size).toBe(500);
    expect([...ids].every((i) => i.startsWith('pl_'))).toBe(true);
  });
});
