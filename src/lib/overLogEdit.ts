/**
 * Over-log → ball-event edit mapping (Ultimate Stage C, F8-A).
 *
 * `innings.thisOverLog` is a display log: one entry per delivery PLUS one
 * entry per penalty award (`+5P` / `-5P`, pushed by
 * `EventSourcedMatchEngine.awardPenaltyRuns`). Ball editing, however,
 * indexes `BALL_SCORED` events only. Mapping a clicked log position to an
 * event index must therefore count BALL entries, not raw log entries —
 * otherwise, after any penalty in the current over, the edit modal opens
 * (and rewrites) the wrong delivery.
 */

/** True for penalty marker entries such as `+5P` or `-12P`. */
export function isPenaltyLogEntry(entry: string): boolean {
  return /^[+-]\d+P$/.test(entry);
}

/** Number of actual deliveries in an over log (penalty entries excluded). */
export function countOverLogBalls(log: readonly string[]): number {
  return log.reduce((n, e) => (isPenaltyLogEntry(e) ? n : n + 1), 0);
}

/**
 * Resolve the BALL_SCORED event index (within the current innings) that a
 * clicked over-log position refers to.
 *
 * @param log             the current over's `thisOverLog`
 * @param logIdx          raw index into `log` (as rendered)
 * @param totalBallEvents total BALL_SCORED events in the current innings
 * @returns the event index to edit, or `null` when the position is a
 *          penalty entry or out of range (not editable)
 */
export function resolveEditTargetIndex(
  log: readonly string[],
  logIdx: number,
  totalBallEvents: number
): number | null {
  if (logIdx < 0 || logIdx >= log.length) return null;
  if (isPenaltyLogEntry(log[logIdx])) return null;

  // Ordinal of the clicked entry among ball entries only.
  let ordinal = 0;
  for (let i = 0; i < logIdx; i++) {
    if (!isPenaltyLogEntry(log[i])) ordinal++;
  }

  const target = totalBallEvents - countOverLogBalls(log) + ordinal;
  return target >= 0 && target < totalBallEvents ? target : null;
}
