/**
 * DlsEngine - Standard Duckworth-Lewis-Stern (DLS) Method for Rain Interrupted Matches
 * 
 * Implements the standard ICC DLS resource percentage calculation:
 * Revised Target = floor(Team1_Runs * (Resource2 / Resource1)) + 1  (when Resource2 < Resource1)
 * Or when Resource2 >= Resource1:
 * Revised Target = floor(Team1_Runs + (Resource2 - Resource1) * (AverageTotal / 100)) + 1
 */

export interface DlsCalculationInput {
  originalOvers: number;
  team1TotalRuns: number;
  team1OversBowled?: number;
  team2OversAvailable: number;
  team2WicketsLost?: number;
  team2CurrentOversBowled?: number;
  team2CurrentRuns?: number;
  matchType?: 'T20' | 'ODI' | 'CUSTOM';
}

export interface DlsCalculationResult {
  revisedTarget: number;
  parScore: number;
  oversAvailable: number;
  team1ResourcePct: number;
  team2ResourcePct: number;
  runsAdjustment: number;
  ballsRemaining: number;
  runsNeeded: number;
  explanationEn: string;
  explanationBn: string;
}

export class DlsEngine {
  /**
   * Standard ICC DLS Resource Percentages Table for 0-50 overs remaining
   * Key: overs remaining (0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50)
   * Values: resource % remaining for wickets lost 0 to 9
   */
  private static readonly RESOURCE_TABLE: Record<number, number[]> = {
    50: [100.0, 93.4, 85.1, 74.9, 62.7, 49.0, 34.9, 22.0, 11.9, 4.7],
    45: [95.0, 89.2, 81.6, 72.2, 60.8, 47.9, 34.3, 21.8, 11.9, 4.7],
    40: [89.3, 84.2, 77.6, 69.1, 58.6, 46.5, 33.7, 21.6, 11.8, 4.7],
    35: [82.7, 78.5, 72.8, 65.3, 55.9, 44.8, 32.8, 21.3, 11.8, 4.7],
    30: [75.1, 71.8, 67.3, 60.7, 52.4, 42.6, 31.6, 20.8, 11.6, 4.7],
    25: [66.5, 63.9, 60.5, 55.2, 48.3, 39.8, 30.0, 20.1, 11.4, 4.7],
    20: [56.6, 54.8, 52.4, 48.4, 43.1, 36.1, 27.8, 19.1, 11.1, 4.6],
    15: [45.2, 44.1, 42.6, 40.0, 36.3, 31.1, 24.6, 17.5, 10.5, 4.5],
    10: [32.1, 31.6, 30.8, 29.4, 27.2, 24.0, 19.8, 14.7, 9.4, 4.4],
    5: [17.2, 17.0, 16.8, 16.4, 15.6, 14.3, 12.5, 10.0, 7.1, 3.8],
    0: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  };

  /**
   * Interpolates resource percentage for any exact overs and wickets lost (0-9)
   */
  public static getResourcePercentage(oversRemaining: number, wicketsLost: number): number {
    if (wicketsLost >= 10 || oversRemaining <= 0) return 0;
    const clampedOvers = Math.max(0, Math.min(50, oversRemaining));
    const clampedWickets = Math.max(0, Math.min(9, wicketsLost));

    // Exact grid points in RESOURCE_TABLE
    const points = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

    // Find bounding intervals for interpolation
    let lower = 0;
    let upper = 50;

    for (let i = 0; i < points.length - 1; i++) {
      if (clampedOvers >= points[i] && clampedOvers <= points[i + 1]) {
        lower = points[i];
        upper = points[i + 1];
        break;
      }
    }

    if (lower === upper) {
      return this.RESOURCE_TABLE[lower][clampedWickets];
    }

    const lowerVal = this.RESOURCE_TABLE[lower][clampedWickets];
    const upperVal = this.RESOURCE_TABLE[upper][clampedWickets];
    const fraction = (clampedOvers - lower) / (upper - lower);

    return Number((lowerVal + fraction * (upperVal - lowerVal)).toFixed(2));
  }

  /**
   * Calculates revised target, par score, and explanations based on ICC DLS standard method.
   */
  public static calculate(input: DlsCalculationInput): DlsCalculationResult {
    const originalOvers = Math.max(1, input.originalOvers || 20);
    const team1Score = Math.max(0, input.team1TotalRuns || 0);
    const team1Overs = input.team1OversBowled !== undefined ? input.team1OversBowled : originalOvers;
    const team2Available = Math.max(1, Math.min(originalOvers, input.team2OversAvailable));
    const team2Wkts = Math.max(0, Math.min(9, input.team2WicketsLost || 0));

    // Resource calculations
    // Team 1 Resource: Total resources available at start minus resources remaining if interrupted
    const t1InitialResource = this.getResourcePercentage(originalOvers, 0);
    const t1LostResource = originalOvers > team1Overs
      ? this.getResourcePercentage(originalOvers - team1Overs, 0)
      : 0;
    const r1 = Math.max(1, t1InitialResource - t1LostResource);

    // Team 2 Resource: Available overs with wickets lost
    const r2 = this.getResourcePercentage(team2Available, team2Wkts);

    // Scaling average score (G50: 245 for 50-over ODI, scaled proportionally for T20)
    const gAverage = originalOvers <= 20 ? 150 : 245;

    let revisedTarget: number;
    let runsAdjustment: number;

    if (r2 < r1) {
      // Team 2 has less resources -> Target reduced proportionally
      revisedTarget = Math.floor(team1Score * (r2 / r1)) + 1;
      runsAdjustment = revisedTarget - (team1Score + 1);
    } else if (r2 === r1) {
      revisedTarget = team1Score + 1;
      runsAdjustment = 0;
    } else {
      // Team 2 has more resources -> Target increased
      const addedRuns = (r2 - r1) * (gAverage / 100);
      revisedTarget = Math.floor(team1Score + addedRuns) + 1;
      runsAdjustment = revisedTarget - (team1Score + 1);
    }

    // Par score calculation: Score required to be tied right at this moment
    const currentT2Bowled = input.team2CurrentOversBowled || 0;
    const currentOversRemaining = Math.max(0, team2Available - currentT2Bowled);
    const currentT2Resource = this.getResourcePercentage(currentOversRemaining, team2Wkts);
    const usedResource = Math.max(0, r2 - currentT2Resource);
    const parScore = Math.max(0, Math.floor(team1Score * (usedResource / r1)));

    const ballsRemaining = Math.max(0, Math.round((team2Available - currentT2Bowled) * 6));
    const currentRuns = input.team2CurrentRuns ?? 0;
    const runsNeeded = Math.max(0, revisedTarget - currentRuns);

    const explanationEn =
      r2 < r1
        ? `Target revised to ${revisedTarget} runs from ${team2Available} overs (${Math.abs(runsAdjustment)} runs reduced due to rain reduction, DLS Resource: ${(r2 / r1 * 100).toFixed(1)}%).`
        : `Target adjusted to ${revisedTarget} runs from ${team2Available} overs (DLS Resource ratio: ${(r2 / r1 * 100).toFixed(1)}%).`;

    const explanationBn =
      r2 < r1
        ? `বৃষ্টির কারণে ${team2Available} ওভারে সংশোধিত টার্গেট ${revisedTarget} রান (ডিএলএস রিসোর্স রেশিও: ${(r2 / r1 * 100).toFixed(1)}%)।`
        : `ডিএলএস পদ্ধতিতে ${team2Available} ওভারে সংশোধিত টার্গেট ${revisedTarget} রান।`;

    return {
      revisedTarget,
      parScore,
      oversAvailable: team2Available,
      team1ResourcePct: r1,
      team2ResourcePct: r2,
      runsAdjustment,
      ballsRemaining,
      runsNeeded,
      explanationEn,
      explanationBn,
    };
  }
}
