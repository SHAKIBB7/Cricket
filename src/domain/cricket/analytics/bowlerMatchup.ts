import { cleanPlayerName } from '../formatters';
import type { Bowler, InningsData, Player } from '../types';
import type { PlayerIdentityIndex } from './playerIdentityIndex';

/**
 * L3: per-batter "vs bowler" matchup maps (Player.bowlersFaced /
 * Player.runsVsBowler) were historically keyed by the bowler's NAME.
 * A renamed bowler fragmented one person's figures across spellings,
 * and two same-named bowlers merged into one line.
 *
 * New records are keyed by the bowler's stable playerId whenever the
 * bowler carries one (β3 threading); guests and legacy records keep
 * name keys. Every reader in this module understands BOTH key shapes,
 * so stored matches of any era read correctly with no data migration:
 *
 *   write:  bowlerMatchupKey(bowler)
 *   list:   matchupBreakdown(player, namesById)   — display rows
 *   match:  matchupKeyBelongsToBowler(key, name, index) — H2H filters
 */

export function bowlerMatchupKey(bowler: { playerId?: string; name: string }): string {
  return bowler.playerId || bowler.name;
}

export function isStableIdKey(key: string): boolean {
  return typeof key === 'string' && key.startsWith('pl_');
}

/** playerId -> display name for every bowler in the given innings. */
export function bowlerNamesById(
  inningsList: ReadonlyArray<InningsData | undefined | null>
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const inn of inningsList) {
    for (const b of inn?.bowlers || []) {
      if (b.playerId && b.name) map[b.playerId] = b.name;
    }
  }
  return map;
}

export interface MatchupRow {
  /** Display name of the bowler (resolved from the id when keyed by id). */
  label: string;
  balls: number;
  runs: number;
}

/**
 * Display rows for one batter's matchup maps. Id-keyed and name-keyed
 * entries for the same bowler merge into a single row when the id
 * resolves to that name in this match.
 */
export function matchupBreakdown(
  player: Pick<Player, 'bowlersFaced' | 'runsVsBowler'>,
  namesById: Record<string, string>
): MatchupRow[] {
  const faced = player.bowlersFaced || {};
  const runsMap = player.runsVsBowler || {};
  const rows = new Map<string, MatchupRow>();
  const add = (key: string, balls: number, runs: number) => {
    const label = isStableIdKey(key) ? namesById[key] || 'Bowler' : key;
    const row = rows.get(label) || { label, balls: 0, runs: 0 };
    row.balls += balls;
    row.runs += runs;
    rows.set(label, row);
  };
  for (const key of Object.keys(faced)) {
    if (faced[key] > 0 || (runsMap[key] || 0) > 0) add(key, faced[key] || 0, runsMap[key] || 0);
  }
  for (const key of Object.keys(runsMap)) {
    if (!(key in faced) && runsMap[key] > 0) add(key, 0, runsMap[key]);
  }
  return [...rows.values()].sort((a, b) => b.runs - a.runs);
}

/**
 * Does a matchup-map key belong to the bowler selected by NAME?
 * Name keys compare by cleaned name (legacy behaviour). Id keys match
 * when the identity index has seen that id under the selected name
 * (any match, any era), which is what lets head-to-head totals follow
 * a bowler across renames.
 */
export function matchupKeyBelongsToBowler(
  key: string,
  selectedBowlerName: string,
  index: PlayerIdentityIndex
): boolean {
  const selected = cleanPlayerName(selectedBowlerName || '');
  if (!selected) return false;
  if (isStableIdKey(key)) {
    return index.namesByStableId.get(key)?.has(selected) ?? false;
  }
  return cleanPlayerName(key) === selected;
}

/** The current bowler record shape the engine writes against. */
export type MatchupBowler = Pick<Bowler, 'playerId' | 'name'>;
