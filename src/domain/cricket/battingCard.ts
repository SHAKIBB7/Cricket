import { InningsData, Player } from './types';
import { cleanPlayerName } from './formatters';

/**
 * Batting-card classification — the single source of truth for
 * "who has batted" and "who did not bat".
 *
 * Previously this was re-derived independently (and incorrectly) in at
 * least four places (IntegratedScoreboard, match center, both PDF
 * generators) with a `runs>0 || balls>0 || isDismissed` predicate that:
 *  - classified openers who had faced only wides as "yet to bat"
 *    (wides increment neither their balls nor the legal-ball count),
 *  - could never list real squad members, because innings player slots
 *    for positions 3-11 start with empty names — a player only appears
 *    in `players[]` once they actually come in to bat,
 *  - was suppressed entirely on completed matches in the scoreboard.
 *
 * Rules used here (cricket-correct):
 *  - A player has batted if they are dismissed, OR they are currently at
 *    the crease (striker / non-striker), OR they have a batting record
 *    (runs/balls) — the last clause covers historical/imported data whose
 *    crease indices may be stale.
 *  - Did-not-bat = named squad players who have not batted, taken from
 *    the innings player list PLUS any squad names that never received a
 *    player slot, in squad/batting order.
 */

function isRealName(name: string | null | undefined): boolean {
  if (!name) return false;
  const cleaned = cleanPlayerName(name).trim();
  return cleaned !== '' && cleaned !== 'Select Player';
}

/**
 * A batter who retired hurt: he left the crease but is NOT out
 * (engine records dismissalType without isDismissed). Any other
 * departed batter is a dismissal. Single source for the distinction
 * every card/scoreboard surface needs (Ultimate audit F1).
 */
export function isRetiredHurt(player: Player): boolean {
  return (
    !player.isDismissed &&
    (player.dismissalType === 'Retire Hurt' || player.dismissalType === 'Retired Hurt')
  );
}

export function playerHasBatted(player: Player, index: number, inn: InningsData): boolean {
  if (player.isDismissed) return true;
  // A recorded departure (wicket or retirement) means he was at the
  // crease — covers a 0-ball retired-hurt batter, who has neither
  // runs nor balls but must not be listed as did-not-bat.
  if (player.dismissalType) return true;
  if (index === inn.strikerIdx || index === inn.nonStrikerIdx) {
    // At the crease counts as batting even with 0 runs off 0 legal balls
    // (e.g. an opener who has so far faced only wides).
    return isRealName(player.name);
  }
  return (player.runs ?? 0) > 0 || (player.balls ?? 0) > 0;
}

export function getBattedPlayers(inn: InningsData): Player[] {
  return inn.players.filter((p, i) => playerHasBatted(p, i, inn) && isRealName(p.name));
}

/**
 * Players who have not batted. Returns Player entries (synthesised for
 * squad members who never got an innings slot) so existing scoreboard /
 * PDF rendering code can treat every entry uniformly.
 */
export function getDidNotBatPlayers(inn: InningsData, squadNames?: string[]): Player[] {
  const result: Player[] = [];
  const seen = new Set<string>();

  inn.players.forEach((p, i) => {
    if (!isRealName(p.name)) return;
    if (playerHasBatted(p, i, inn)) return;
    const key = cleanPlayerName(p.name).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(p);
  });

  // Squad members who never received a player slot in this innings.
  const battedKeys = new Set(
    inn.players
      .filter((p, i) => playerHasBatted(p, i, inn))
      .map((p) => cleanPlayerName(p.name).toLowerCase())
  );
  const allPlayerKeys = new Set(
    inn.players.map((p) => cleanPlayerName(p.name).toLowerCase()).filter(Boolean)
  );

  for (const rawName of squadNames ?? []) {
    if (!isRealName(rawName)) continue;
    const key = cleanPlayerName(rawName).toLowerCase();
    if (seen.has(key) || battedKeys.has(key) || allPlayerKeys.has(key)) continue;
    seen.add(key);
    result.push({
      id: `squad-dnb-${key.replace(/[^a-z0-9]/g, '_')}`,
      name: cleanPlayerName(rawName),
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
    } as Player);
  }

  return result;
}

/** Convenience: just the display names, e.g. for PDF scorecards. */
export function getDidNotBatNames(inn: InningsData, squadNames?: string[]): string[] {
  return getDidNotBatPlayers(inn, squadNames).map((p) => cleanPlayerName(p.name));
}
