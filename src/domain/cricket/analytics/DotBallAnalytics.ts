/**
 * DotBallAnalytics & Style Classifiers
 * Directly ported from Flutter's DotBallAnalytics and REUSABLE_LOGIC_GUIDE_BN.md §3.4 - §4.4
 */

export class DotBallAnalytics {
  /**
   * Batsman dot ball predicate:
   * '0', 'W', 'Out', startsWith 'W-', or startsWith 'Retire'.
   * Byes, leg-byes, wides, and no-balls are NOT batsman dot balls.
   */
  static isBatsmanDotBall(token: string): boolean {
    if (!token) return false;
    const t = token.trim();
    return (
      t === '0' ||
      t === 'W' ||
      t === 'Out' ||
      t.startsWith('W-') ||
      t.startsWith('Retire')
    );
  }

  /**
   * Bowler dot ball predicate:
   * '0', 'W', 'Out', or startsWith 'W-'.
   * (Retire is NOT charged as a bowler dot ball).
   */
  static isBowlerDotBall(token: string): boolean {
    if (!token) return false;
    const t = token.trim();
    return t === '0' || t === 'W' || t === 'Out' || t.startsWith('W-');
  }

  static isBowlerWide(token: string): boolean {
    return !!token && token.trim().startsWith('Wd');
  }

  static isBowlerNoBall(token: string): boolean {
    return !!token && token.trim().startsWith('Nb');
  }

  static countBatsmanDotBalls(trackedDotBalls: number, ballLog: string[] = []): number {
    if (trackedDotBalls > 0) return trackedDotBalls;
    return ballLog.filter((entry) => this.isBatsmanDotBall(entry)).length;
  }

  static countBowlerDotBallsFromOvers(overHistory: { log: string[] }[] = []): number {
    let dots = 0;
    for (const over of overHistory) {
      if (Array.isArray(over?.log)) {
        for (const token of over.log) {
          if (this.isBowlerDotBall(token)) dots++;
        }
      }
    }
    return dots;
  }

  static countBowlerWidesFromOvers(overHistory: { log: string[] }[] = []): number {
    let count = 0;
    for (const over of overHistory) {
      if (Array.isArray(over?.log)) {
        for (const token of over.log) {
          if (this.isBowlerWide(token)) count++;
        }
      }
    }
    return count;
  }

  static countBowlerNoBallsFromOvers(overHistory: { log: string[] }[] = []): number {
    let count = 0;
    for (const over of overHistory) {
      if (Array.isArray(over?.log)) {
        for (const token of over.log) {
          if (this.isBowlerNoBall(token)) count++;
        }
      }
    }
    return count;
  }

  static calculateDotBallPercentage(dotBalls: number, totalBalls: number): number {
    if (totalBalls <= 0) return 0;
    return (dotBalls / totalBalls) * 100;
  }

  static longestDotStreak(ballLog: string[] = []): number {
    let maxStreak = 0;
    let current = 0;
    for (const entry of ballLog) {
      if (this.isBatsmanDotBall(entry)) {
        current++;
        if (current > maxStreak) maxStreak = current;
      } else {
        current = 0;
      }
    }
    return maxStreak;
  }

  /**
   * Batting Intent Classification (from REUSABLE_LOGIC_GUIDE_BN.md §4.4)
   * Formula: score = sr * 0.45 + boundaryRunsPct * 0.35 + shotControl * 0.20
   */
  static classifyBattingIntent(
    boundaryRunsPct: number,
    shotControl: number,
    sr: number,
    balls: number
  ): 'Finisher' | 'Attacking' | 'Anchor' | 'Balanced' | 'Defensive' {
    const score = sr * 0.45 + boundaryRunsPct * 0.35 + shotControl * 0.2;

    if (balls >= 12 && sr >= 150 && boundaryRunsPct >= 55) {
      return 'Finisher';
    }
    if (sr >= 125 || score >= 95) {
      return 'Attacking';
    }
    if (balls >= 10 && sr <= 85 && shotControl >= 55) {
      return 'Anchor';
    }
    if (score >= 60) {
      return 'Balanced';
    }
    return 'Defensive';
  }

  /**
   * Score-based batting style classifier (REUSABLE_LOGIC_GUIDE_BN.md §3.8A)
   */
  static classifyBattingStyle(
    runs: number,
    balls: number,
    fours: number,
    sixes: number,
    dotBalls: number
  ): { style: string; score: number } {
    if (balls < 10) return { style: 'Not enough data', score: 0 };
    if (runs === 0) return { style: 'Defensive', score: 0 };

    const sr = (runs / balls) * 100;
    const boundaryRuns = fours * 4 + sixes * 6;
    const boundaryPct = (boundaryRuns / runs) * 100;
    const dotBallPct = (dotBalls / balls) * 100;

    const score = Math.round(sr * 0.4 + boundaryPct * 0.4 - dotBallPct * 0.2);
    let label = 'Defensive';
    if (score > 70) label = 'Aggressive';
    else if (score >= 40) label = 'Balanced';

    return { style: label, score };
  }

  /**
   * Gate-based international batting style classifier (REUSABLE_LOGIC_GUIDE_BN.md §3.8B)
   */
  static classifyInternationalStyle(
    sr: number,
    boundaryPct: number,
    dotPct: number
  ): string {
    if (sr > 140 || (sr > 120 && boundaryPct > 50)) {
      return dotPct < 30 ? 'Elite Attacker (Aggressive)' : 'High Risk Hitter (Aggressive)';
    }
    if (sr >= 100 && sr <= 120) {
      return dotPct <= 40 ? 'Reliable Accumulator (Balanced)' : 'Slow Starter (Balanced)';
    }
    if (sr < 100) {
      return dotPct > 45 ? 'Under Pressure (Defensive)' : 'Solid Defender (Defensive)';
    }
    return 'Tactical Player';
  }
}
