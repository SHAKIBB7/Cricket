import { cleanPlayerName } from '../formatters';
import type { FallOfWicket } from '../types';

/**
 * The wickets a bowler actually took, from a fall-of-wickets list.
 *
 * One matcher for every surface (bowler profile section, profile
 * share card) — audit 2026-11-10 found the modal and the card
 * filtering differently, and the modal's dismissal-substring rule
 * crediting fielders and run-outs. Channels, in order:
 *
 * 1. Stable identity: `bowlerId === bowler.id` (F9-stamped data).
 * 2. The engine-stamped `bowler` name on the FoW entry.
 * 3. Legacy dismissal-text-only records: the bowled-by slot of the
 *    dismissal string ("... b Naeem", "c & b Naeem", a bare
 *    "b Naeem"). A name appearing anywhere else in the text — a
 *    catcher ("c Naeem b Rakibul") or a run-out actor
 *    ("run out (Naeem)") — does NOT credit the bowler.
 */
export function wicketsTakenByBowler(
  fallOfWickets: FallOfWicket[] | undefined,
  bowler: { id?: string; name: string }
): FallOfWicket[] {
  const name = cleanPlayerName(bowler.name || '');
  if (!name) return [];
  const lower = name.toLowerCase();
  return (fallOfWickets || []).filter((w) => {
    if (!w) return false;
    if (w.bowlerId && bowler.id && w.bowlerId === bowler.id) return true;
    if (w.bowler && cleanPlayerName(w.bowler) === name) return true;
    if (w.dismissal) {
      const d = w.dismissal.toLowerCase();
      if (d.includes(` b ${lower}`) || d.startsWith(`b ${lower}`)) return true;
    }
    return false;
  });
}

/**
 * Penalty entries (`+5P` / `-5P`) live in over logs but are team
 * penalties, not deliveries — surfaces that draw ball circles or
 * total an over must exclude them (the engine's maiden accounting
 * skips them for the same reason).
 */
export function isPenaltyToken(token: string): boolean {
  return /^[+-]\d+P$/.test(token.trim());
}
