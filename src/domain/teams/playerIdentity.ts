/**
 * Stable player identity (F9-β1 foundation).
 *
 * A saved team's player is becoming an object with an immutable id:
 *
 *     { id: 'pl_…', name: 'Rahim' }
 *
 * Historically players were bare name strings, and string-era data
 * still exists in Dexie, in synced payloads, in Google Drive backups
 * and in payloads written by older builds. This module is the single
 * compatibility boundary for that transition (see
 * Cricket-F9-Beta-Design.md):
 *
 * - `normalizeTeamPlayers` accepts strings, objects, or a mix, and
 *   always returns TeamPlayer[]. When a list of EXISTING players is
 *   supplied, ids are preserved by name match — so a legacy writer
 *   that still sends bare names cannot orphan a team's identities
 *   (name-match preservation, design §8).
 * - `teamPlayerNames` projects any accepted form back to the plain
 *   name list. String-era storage keeps using it until β2 switches
 *   writers to objects; it makes every external parse boundary
 *   (sync intake, backup restore) safe against object-form input.
 *
 * β1 note: nothing persists the generated ids yet — durability lands
 * with the β2 Dexie upgrade + object writers. The semantics are
 * pinned by tests now so β2 is a wiring exercise.
 */

export interface TeamPlayer {
  /** Immutable identity, 'pl_' + random suffix. Never reused. */
  id: string;
  /** Display name. Editable — the id is the identity, not the name. */
  name: string;
}

export function newPlayerId(): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return `pl_${rand}`;
}

function entryName(entry: unknown): string | null {
  if (typeof entry === 'string') {
    const n = entry.trim();
    return n ? n : null;
  }
  if (entry && typeof entry === 'object') {
    const name = (entry as { name?: unknown }).name;
    if (typeof name === 'string') {
      const n = name.trim();
      return n ? n : null;
    }
  }
  return null;
}

function entryId(entry: unknown): string | null {
  if (entry && typeof entry === 'object') {
    const id = (entry as { id?: unknown }).id;
    if (typeof id === 'string' && id.trim()) return id;
  }
  return null;
}

/**
 * Normalise any historical player-list form to TeamPlayer[].
 *
 * @param input    strings, {id?, name} objects, mixed, or garbage
 * @param existing players whose ids should be preserved by name match
 *                 (case-insensitive, consumed one-to-one in order, so
 *                 duplicate names map deterministically)
 */
export function normalizeTeamPlayers(
  input: unknown,
  existing?: readonly TeamPlayer[]
): TeamPlayer[] {
  if (!Array.isArray(input)) return [];

  // Pool of reusable ids keyed by lower-cased cleaned name.
  const reusable = new Map<string, string[]>();
  for (const p of existing || []) {
    if (!p || typeof p.name !== 'string' || typeof p.id !== 'string') continue;
    const key = p.name.trim().toLowerCase();
    if (!key) continue;
    const list = reusable.get(key) || [];
    list.push(p.id);
    reusable.set(key, list);
  }

  const out: TeamPlayer[] = [];
  for (const entry of input) {
    const name = entryName(entry);
    if (!name) continue;

    let id = entryId(entry);
    if (!id) {
      const pool = reusable.get(name.toLowerCase());
      if (pool && pool.length > 0) id = pool.shift()!;
    }
    out.push({ id: id || newPlayerId(), name });
  }
  return out;
}

/**
 * Project any accepted player-list form to plain display names.
 * String-era storage and name-based consumers use this at parse
 * boundaries so object-form input can never leak `[object Object]`
 * into the UI or the database.
 */
export function teamPlayerNames(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const names: string[] = [];
  for (const entry of input) {
    const n = entryName(entry);
    if (n) names.push(n);
  }
  return names;
}

/**
 * Reconcile a slot-based squad edit (the teams page edits 15 name
 * slots) with the team's previous players, preserving identities:
 *
 *  1. A name that still exists keeps its id (moves across slots are
 *     fine — ids follow the NAME, i.e. the person).
 *  2. Same slot, name changed, and the old name appears nowhere in
 *     the new slots → a RENAME: the slot's previous id is kept, so a
 *     rename never orphans a player's history.
 *  3. Anything else is a genuinely new player and gets a fresh id.
 *
 * Returns objects for the non-empty slots, in slot order (the stored
 * form). Squad names are UI-enforced unique per team, which keeps
 * rule 1 unambiguous; sync-imported duplicates resolve first-come.
 */
export function reconcileSlotPlayerIds(
  previous: readonly TeamPlayer[] | undefined,
  newSlots: readonly string[]
): TeamPlayer[] {
  const prev = previous || [];
  const byName = new Map<string, string>();
  for (const p of prev) {
    const key = p.name.trim().toLowerCase();
    if (key && !byName.has(key)) byName.set(key, p.id);
  }
  const newNameKeys = new Set(
    newSlots.map((n) => n.trim().toLowerCase()).filter(Boolean)
  );
  const used = new Set<string>();

  const out: TeamPlayer[] = [];
  newSlots.forEach((raw, slotIdx) => {
    const name = raw.trim();
    if (!name) return;
    const key = name.toLowerCase();

    let id = byName.get(key);
    if (id && used.has(id)) id = undefined;

    if (!id) {
      const slotPrev = prev[slotIdx];
      if (
        slotPrev &&
        !used.has(slotPrev.id) &&
        !newNameKeys.has(slotPrev.name.trim().toLowerCase())
      ) {
        id = slotPrev.id; // rename in place
      }
    }

    if (!id) id = newPlayerId();
    used.add(id);
    out.push({ id, name });
  });
  return out;
}

/**
 * Normalise a MATCH squad (AdvancedSettings / MatchScorecard) to
 * TeamPlayer[]. Unlike saved-team data, a legacy match squad's bare
 * names must NOT mint fresh identities — an id invented here would
 * look real but exist in no team. Unresolvable entries therefore
 * carry an EMPTY id, which every consumer treats as "identity
 * unknown" (playerId is simply not stamped).
 */
export function normalizeSquadPlayers(input: unknown): TeamPlayer[] {
  if (!Array.isArray(input)) return [];
  const out: TeamPlayer[] = [];
  for (const entry of input) {
    const name = entryName(entry);
    if (!name) continue;
    out.push({ id: entryId(entry) || '', name });
  }
  return out;
}
