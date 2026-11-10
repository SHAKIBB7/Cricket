import { isPenaltyToken } from './wicketsTaken';

/**
 * Total runs SCORED in an over, parsed from its ball log.
 *
 * Mirrors the engine's maiden accounting
 * (EventSourcedMatchEngine.runsChargedToBowlerForOver): a maiden is
 * a scoreless over, so byes and leg-byes ARE runs here even though
 * they are not charged to the bowler's figures; completed runs on a
 * run out (`2+W`) count; penalty entries (`+5P`/`-5P`) are team
 * penalties, not runs off the over, and are skipped. Wide / no-ball
 * charges honour the match's advancedSettings.
 *
 * Audit 2026-11-10: the bowler profile's local copy excluded
 * byes/leg-byes and had no penalty handling, so an over containing
 * a leg-bye displayed "MAIDEN" against the engine's own maiden
 * count, and a `-5P` entry could render "-2 runs".
 */
export function overRunsScored(
  log: string[],
  settings?: { wideRun?: number; noBallRun?: number }
): number {
  let r = 0;
  for (const b of log) {
    if (
      b === 'W' ||
      b === 'Out' ||
      b.startsWith('W-') ||
      b.startsWith('Retire') ||
      isPenaltyToken(b)
    ) {
      // wicket / penalty — no runs scored off the over
    } else if (b.startsWith('Wd')) {
      const extra = parseInt(b.replace('Wd', ''), 10) || 0;
      r += (settings?.wideRun || 1) + extra;
    } else if (b.startsWith('Nb')) {
      r += settings?.noBallRun || 1;
      if (!b.includes('B') && !b.includes('LB')) {
        r += parseInt(b.replace('Nb', ''), 10) || 0;
      }
    } else if (b.startsWith('LB') || b.startsWith('B')) {
      const m = b.match(/^[A-Z]+[+]?(\d+)?/);
      r += m && m[1] ? parseInt(m[1], 10) : 0;
    } else {
      r += parseInt(b, 10) || 0;
    }
  }
  return r;
}
