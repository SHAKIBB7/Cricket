/**
 * Chase win predictor for Live Spectating — a small deterministic model,
 * not an ML black box:
 *
 * - Par required-run-rate by wickets in hand (T20-style chase table):
 *   the RRR at which the chase is roughly 50/50.
 * - Logistic curve on (par − required rate): needing less than par
 *   favours the batting side, needing more favours the fielding side.
 * - Early in the chase the estimate is blended toward 50%, because a
 *   handful of balls says little; the blend reaches full weight once
 *   half the innings is bowled.
 *
 * Returns the BATTING team's win percentage (2..98), or null when the
 * inputs cannot support a chase estimate (1st innings, no balls left,
 * target already reached is handled as 98+ by the caller contract —
 * here: runsNeeded <= 0 → 98).
 */

const PAR_RRR_BY_WICKETS_LEFT: Record<number, number> = {
  10: 13.0,
  9: 12.5,
  8: 12.0,
  7: 11.4,
  6: 10.8,
  5: 10.2,
  4: 9.6,
  3: 9.0,
  2: 8.4,
  1: 7.8,
  0: 7.0,
};

export interface WinPredictorInput {
  runsNeeded: number;
  ballsLeft: number;
  ballsBowled: number;
  wicketsLeft: number;
}

export function predictChaseWinPct(input: WinPredictorInput): number | null {
  const { runsNeeded, ballsLeft, ballsBowled, wicketsLeft } = input;
  if (ballsLeft <= 0) return null;
  if (runsNeeded <= 0) return 98;
  if (wicketsLeft <= 0) return null;

  const reqRate = (runsNeeded / ballsLeft) * 6;
  const par = PAR_RRR_BY_WICKETS_LEFT[Math.max(0, Math.min(10, wicketsLeft))] ?? 10;
  const logistic = 100 / (1 + Math.exp(-(par - reqRate) * 0.55));

  const totalBalls = ballsLeft + ballsBowled;
  const progress = totalBalls > 0 ? ballsBowled / totalBalls : 0;
  const weight = Math.min(1, progress * 2);
  const blended = 50 + (logistic - 50) * weight;

  return Math.max(2, Math.min(98, Math.round(blended)));
}
