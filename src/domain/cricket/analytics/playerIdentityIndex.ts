import { cleanPlayerName } from '../formatters';
import type { MatchScorecard } from '../types';

/**
 * F9-β4: cross-match identity index for name-based analytics.
 *
 * Match records written since β3 carry a stable `playerId` alongside
 * the display name of the day. A player who was renamed (in the teams
 * editor, where renames keep the id) therefore appears under
 * DIFFERENT names in different matches. This index learns, from the
 * records themselves, every name variant a stable id has used —
 * letting a name-keyed surface (the analytics page's pickers) unify
 * a renamed player's history in both directions:
 *
 *   select the NEW name → old-name records with the same id match;
 *   select the OLD name → new-name records with the same id match.
 *
 * Records without a playerId keep matching by exact cleaned name,
 * exactly as before β4. Two distinct people who share a name and
 * carry different ids are NOT unified with each other (their
 * variants stay disjoint).
 */
export interface PlayerIdentityIndex {
  /** stable playerId -> every cleaned display name it has used */
  namesByStableId: Map<string, Set<string>>;
}

export function buildPlayerIdentityIndex(
  scorecards: readonly MatchScorecard[]
): PlayerIdentityIndex {
  const namesByStableId = new Map<string, Set<string>>();
  const visit = (rec: { name?: string; playerId?: string } | undefined) => {
    if (!rec?.playerId) return;
    const cleaned = cleanPlayerName(rec.name || '');
    if (!cleaned) return;
    let set = namesByStableId.get(rec.playerId);
    if (!set) {
      set = new Set<string>();
      namesByStableId.set(rec.playerId, set);
    }
    set.add(cleaned);
  };

  for (const m of scorecards || []) {
    for (const inn of [m.firstInnings, m.secondInnings]) {
      inn?.players?.forEach(visit);
      inn?.bowlers?.forEach(visit);
    }
  }
  return { namesByStableId };
}

/**
 * Does this innings record belong to the person the user selected by
 * name? True on an exact cleaned-name match (legacy behaviour), or
 * when the record's stable id has ALSO been seen under the selected
 * name in some match (a rename variant).
 */
export function playerRecordMatchesSelection(
  index: PlayerIdentityIndex,
  record: { name?: string; playerId?: string },
  selectedName: string
): boolean {
  const selected = cleanPlayerName(selectedName || '');
  if (!selected) return false;
  if (cleanPlayerName(record?.name || '') === selected) return true;
  if (record?.playerId) {
    const variants = index.namesByStableId.get(record.playerId);
    if (variants?.has(selected)) return true;
  }
  return false;
}
