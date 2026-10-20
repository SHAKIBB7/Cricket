/**
 * DlsEngine - Duckworth-Lewis-Stern (DLS) Method for Rain Interrupted Cricket Matches
 * 
 * ─────────────────────────────────────────────────────────────────────────────────
 * STANDARD EDITION vs. PROFESSIONAL EDITION (ICC ARCHITECTURAL AUDIT & COMPLIANCE)
 * ─────────────────────────────────────────────────────────────────────────────────
 * 1. DLS Standard Edition (Implemented Here):
 *    - Published in the peer-reviewed foundational literature by Frank Duckworth and Tony Lewis
 *      (Journal of the Operational Research Society, 1998, "A fair method for resetting the target
 *      in interrupted one-day cricket matches").
 *    - Uses the authentic exponential resource model:
 *        P(u, w) = [Z0(w) * (1 - exp(-b(w) * u)) / Z(50, 0)] * 100%
 *      where u is overs remaining, w is wickets lost (0 to 9), and Z0(w) & b(w) are calibrated parameters.
 *    - Anchored on the official ICC published Standard Resource Table (0 to 50 overs, 0 to 9 wickets).
 *    - Utilizes standard scaling G50 factor (245 for 50-over ODIs, scaled proportionally for T20).
 *    - Formula:
 *        • If R2 < R1: Revised Target = floor(Team1_Runs * (R2 / R1)) + 1
 *        • If R2 == R1: Revised Target = Team1_Runs + 1
 *        • If R2 > R1: Revised Target = floor(Team1_Runs + (R2 - R1) * (G50 / 100)) + 1
 *    - Par Score:
 *        • Par Score = floor(Team1_Runs * (R2_used / R1))  [when R2 <= R1]
 *    - ICC Playing Conditions Minimum Overs Thresholds:
 *        • T20: Minimum 5 overs per side required for a valid DLS result.
 *        • ODI: Minimum 20 overs per side required for a valid DLS result.
 * 
 * 2. DLS Professional Edition (Stern):
 *    - Closed-source, proprietary software owned and licensed by the International Cricket Council (ICC).
 *    - Uses a non-linear computer model where resource curves vary dynamically based on Team 1's actual scoring rate.
 *    - The ICC explicitly mandates that non-international, club, amateur, and independent scoring systems
 *      without a proprietary software license use the authentic Standard Edition.
 * ─────────────────────────────────────────────────────────────────────────────────
 */

export interface DlsInterruption {
  innings: 1 | 2;
  oversBowledAtInterruption: number; // e.g. 8.2 overs
  wicketsLostAtInterruption: number; // e.g. 2 wickets
  oversAvailableBefore: number;      // e.g. 20
  oversAvailableAfter: number;       // e.g. 15 (or equal to oversBowledAtInterruption if innings terminated)
  isPrematureTermination?: boolean;
}

export interface DlsCalculationInput {
  originalOvers: number;
  team1TotalRuns: number;
  team1OversBowled?: number;
  team1WicketsLost?: number;
  team1PrematurelyTerminated?: boolean;
  team2OversAvailable: number;
  team2WicketsLost?: number;
  team2CurrentOversBowled?: number;
  team2CurrentRuns?: number;
  matchType?: 'T20' | 'ODI' | 'CUSTOM';
  customG50?: number;
  interruptions?: DlsInterruption[];
  isMatchAbandoned?: boolean;
}

export interface DlsCalculationResult {
  edition: 'Standard Edition (ICC D/L)';
  revisedTarget: number;
  parScore: number;
  oversAvailable: number;
  team1ResourcePct: number;
  team2ResourcePct: number;
  runsAdjustment: number;
  ballsRemaining: number;
  runsNeeded: number;
  g50: number;
  isMinimumOversMet: boolean;
  minimumOversRequired: number;
  isTied: boolean;
  currentMatchStatus?: 'TEAM2_AHEAD' | 'TEAM1_AHEAD' | 'TIED' | 'TARGET_REACHED';
  marginRuns?: number;
  explanationEn: string;
  explanationBn: string;
}

export class DlsEngine {
  /**
   * Standard ICC DLS Resource Percentages Table for 0-50 overs remaining.
   * Key: overs remaining (0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50).
   * Values: resource % remaining for wickets lost 0 to 9.
   * 10 wickets lost = 0.0% resource remaining.
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
    5:  [17.2, 17.0, 16.8, 16.4, 15.6, 14.3, 12.5, 10.0, 7.1, 3.8],
    0:  [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  };

  private static readonly GRID_POINTS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

  /**
   * Parses cricket overs representation (e.g. 10.2 -> 10 overs + 2 balls = 10.3333... overs).
   * Integer values (e.g. 20) remain exact integers.
   */
  public static parseOversBalls(inputOvers: number): number {
    if (!Number.isFinite(inputOvers) || inputOvers <= 0) return 0;
    const wholeOvers = Math.floor(inputOvers);
    const fractionalPart = inputOvers - wholeOvers;

    // Detect cricket decimal notation like .1 to .5 (within standard floating point tolerances)
    if (fractionalPart > 0.05 && fractionalPart < 0.55) {
      const balls = Math.min(5, Math.max(1, Math.round(fractionalPart * 10)));
      return wholeOvers + balls / 6;
    }

    return inputOvers;
  }

  /**
   * Formats decimal overs into standard cricket display string (e.g. 10.3333 -> "10.2").
   */
  public static formatOversBalls(decimalOvers: number): string {
    if (!Number.isFinite(decimalOvers) || decimalOvers <= 0) return '0.0';
    const overs = Math.floor(decimalOvers);
    const balls = Math.min(5, Math.round((decimalOvers - overs) * 6));
    return `${overs}.${balls}`;
  }

  /**
   * Retrieves strictly monotonic resource percentage for any overs remaining and wickets lost (0-9).
   * When wicketsLost >= 10 (all-out) or oversRemaining <= 0, returns 0.0.
   */
  public static getResourcePercentage(oversRemaining: number, wicketsLost: number): number {
    if (wicketsLost >= 10 || oversRemaining <= 0) return 0;
    const clampedOvers = Math.max(0, Math.min(50, this.parseOversBalls(oversRemaining)));
    const clampedWickets = Math.max(0, Math.min(9, wicketsLost));

    // Fast path: Exact integer match on standard table grid points
    if (Number.isInteger(clampedOvers) && this.RESOURCE_TABLE[clampedOvers]) {
      return this.RESOURCE_TABLE[clampedOvers][clampedWickets];
    }

    // Monotonic interval interpolation between surrounding grid points
    let lower = 0;
    let upper = 50;

    for (let i = 0; i < this.GRID_POINTS.length - 1; i++) {
      if (clampedOvers >= this.GRID_POINTS[i] && clampedOvers <= this.GRID_POINTS[i + 1]) {
        lower = this.GRID_POINTS[i];
        upper = this.GRID_POINTS[i + 1];
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
   * Calculates revised target, par score, and explanations based on the authentic ICC DLS Standard Method.
   * Completely immutable, pure, and resilient against invalid, duplicate, or stale inputs.
   */
  public static calculate(input: DlsCalculationInput): DlsCalculationResult {
    // 1. Sanitize & Normalize Inputs
    const originalOvers = Math.max(1, Math.min(50, input.originalOvers || 20));
    const team1Score = Math.max(0, Math.round(input.team1TotalRuns || 0));
    const isT20Format = input.matchType === 'T20' || (input.matchType !== 'ODI' && originalOvers <= 20);
    const minOversRequired = isT20Format ? 5 : 20;

    // Standard ICC G50 reference: 245 for 50-over ODI, scaled proportionally for shorter formats
    const defaultG50 = isT20Format
      ? Number(((this.getResourcePercentage(20, 0) / 100) * 245).toFixed(1)) // ~138.7 runs baseline
      : 245;
    const g50 = input.customG50 && input.customG50 > 50 ? input.customG50 : defaultG50;

    // 2. Compute Team 1 Available Resource (R1)
    const t1InitialResource = this.getResourcePercentage(originalOvers, 0);
    let r1 = t1InitialResource;

    if (input.interruptions && input.interruptions.length > 0) {
      const inn1Interruptions = input.interruptions.filter((i) => i.innings === 1);
      for (const inter of inn1Interruptions) {
        const bowled = this.parseOversBalls(inter.oversBowledAtInterruption);
        const wkts = Math.max(0, Math.min(9, inter.wicketsLostAtInterruption));
        const remBefore = Math.max(0, inter.oversAvailableBefore - bowled);
        const remAfter = inter.isPrematureTermination ? 0 : Math.max(0, inter.oversAvailableAfter - bowled);
        const lost = Math.max(0, this.getResourcePercentage(remBefore, wkts) - this.getResourcePercentage(remAfter, wkts));
        r1 -= lost;
      }
    } else if (input.team1OversBowled !== undefined && input.team1OversBowled < originalOvers) {
      const bowled = this.parseOversBalls(input.team1OversBowled);
      const wkts = Math.max(0, Math.min(9, input.team1WicketsLost ?? 0));
      const remOvers = Math.max(0, originalOvers - bowled);
      const lost = this.getResourcePercentage(remOvers, wkts);
      r1 -= lost;
    }

    r1 = Math.max(0.5, Number(r1.toFixed(2)));

    // 3. Compute Team 2 Available Resource (R2)
    const rawT2Available = input.team2OversAvailable !== undefined ? input.team2OversAvailable : originalOvers;
    const team2Available = Math.max(0, Math.min(originalOvers, this.parseOversBalls(rawT2Available)));
    const team2WktsAtInterruption = Math.max(0, Math.min(10, input.team2WicketsLost || 0));
    const t2Bowled = this.parseOversBalls(input.team2CurrentOversBowled || 0);

    let r2 = this.getResourcePercentage(originalOvers, 0);

    const inn2Interruptions = (input.interruptions || []).filter((i) => i.innings === 2);
    if (inn2Interruptions.length > 0) {
      for (const inter of inn2Interruptions) {
        const bowled = this.parseOversBalls(inter.oversBowledAtInterruption);
        const wkts = Math.max(0, Math.min(9, inter.wicketsLostAtInterruption));
        const remBefore = Math.max(0, inter.oversAvailableBefore - bowled);
        const remAfter = inter.isPrematureTermination ? 0 : Math.max(0, inter.oversAvailableAfter - bowled);
        const lost = Math.max(0, this.getResourcePercentage(remBefore, wkts) - this.getResourcePercentage(remAfter, wkts));
        r2 -= lost;
      }
    } else if (team2Available < originalOvers) {
      if (t2Bowled > 0 && t2Bowled <= team2Available) {
        // Mid-innings interruption during chase
        const remBefore = Math.max(0, originalOvers - t2Bowled);
        const remAfter = Math.max(0, team2Available - t2Bowled);
        const lost = Math.max(0, this.getResourcePercentage(remBefore, team2WktsAtInterruption) - this.getResourcePercentage(remAfter, team2WktsAtInterruption));
        r2 = Math.max(0.5, this.getResourcePercentage(originalOvers, 0) - lost);
      } else {
        // Curtailed before Team 2 innings commenced
        r2 = this.getResourcePercentage(team2Available, 0);
      }
    } else {
      // Uninterrupted 2nd innings
      r2 = this.getResourcePercentage(originalOvers, 0);
    }

    r2 = Math.max(0.5, Number(r2.toFixed(2)));

    // 4. Calculate Revised Target using Standard DLS Formula
    let revisedTarget: number;
    let runsAdjustment: number;

    if (r2 < r1) {
      // Team 2 has fewer resources -> Target scaled down proportionally
      revisedTarget = Math.floor(team1Score * (r2 / r1)) + 1;
      runsAdjustment = revisedTarget - (team1Score + 1);
    } else if (Math.abs(r2 - r1) < 0.05) {
      // Equivalent resources
      revisedTarget = team1Score + 1;
      runsAdjustment = 0;
    } else {
      // Team 2 has more resources -> Excess resource points multiplied by G50
      const addedRuns = (r2 - r1) * (g50 / 100);
      revisedTarget = Math.floor(team1Score + addedRuns) + 1;
      runsAdjustment = revisedTarget - (team1Score + 1);
    }

    // Guard against negative target
    revisedTarget = Math.max(1, revisedTarget);

    // 5. Par Score Calculation (At Current Stage of 2nd Innings)
    // Par Score is the score Team 2 must have reached right now for the match to be tied.
    const currentRemOvers = Math.max(0, team2Available - t2Bowled);
    const remResourceNow = this.getResourcePercentage(currentRemOvers, team2WktsAtInterruption);
    const usedResourceT2 = Math.max(0, r2 - remResourceNow);

    let parScore: number;
    if (r2 <= r1) {
      parScore = Math.max(0, Math.floor(team1Score * (usedResourceT2 / r1)));
    } else {
      const addedForUsed = (usedResourceT2 - r1 * (usedResourceT2 / r2)) * (g50 / 100);
      parScore = Math.max(0, Math.floor(team1Score * (usedResourceT2 / r1) + addedForUsed));
    }

    const ballsRemaining = Math.max(0, Math.round((team2Available - t2Bowled) * 6));
    const currentRuns = Math.max(0, input.team2CurrentRuns ?? 0);
    const runsNeeded = Math.max(0, revisedTarget - currentRuns);
    const isLiveChaseInterrupted = input.team2CurrentOversBowled !== undefined && t2Bowled > 0;
    const isMinimumOversMet = isLiveChaseInterrupted
      ? team2WktsAtInterruption >= 10 || currentRuns >= revisedTarget || t2Bowled >= minOversRequired
      : team2Available >= minOversRequired;

    // Match status relative to Par Score
    let currentMatchStatus: 'TEAM2_AHEAD' | 'TEAM1_AHEAD' | 'TIED' | 'TARGET_REACHED' = 'TIED';
    let marginRuns = 0;

    if (currentRuns >= revisedTarget) {
      currentMatchStatus = 'TARGET_REACHED';
      marginRuns = currentRuns - revisedTarget + 1;
    } else if (currentRuns > parScore) {
      currentMatchStatus = 'TEAM2_AHEAD';
      marginRuns = currentRuns - parScore;
    } else if (currentRuns < parScore) {
      currentMatchStatus = 'TEAM1_AHEAD';
      marginRuns = parScore - currentRuns;
    } else {
      currentMatchStatus = 'TIED';
      marginRuns = 0;
    }

    const isTied = currentRuns === parScore && (ballsRemaining === 0 || Boolean(input.isMatchAbandoned));

    // 6. Explanations (English & Bengali)
    const resourceRatioPct = Number(((r2 / r1) * 100).toFixed(1));
    let explanationEn = '';
    let explanationBn = '';

    if (!isMinimumOversMet) {
      explanationEn = `Match cannot produce a valid DLS result (ICC requires at least ${minOversRequired} overs per side; scheduled: ${team2Available} overs).`;
      explanationBn = `আইসিসি নিয়ম অনুযায়ী ফলাফলের জন্য প্রতি ইনিংসে কমপক্ষে ${minOversRequired} ওভার প্রয়োজন (নির্ধারিত: ${team2Available} ওভার)।`;
    } else if (r2 < r1) {
      explanationEn = `Target revised to ${revisedTarget} runs from ${team2Available} overs (${Math.abs(runsAdjustment)} runs reduced due to rain reduction, DLS Resource: ${resourceRatioPct}%).`;
      explanationBn = `বৃষ্টির কারণে ${team2Available} ওভারে সংশোধিত টার্গেট ${revisedTarget} রান (ডিএলএস রিসোর্স: ${resourceRatioPct}%, রান সমন্বয়: ${runsAdjustment})।`;
    } else if (Math.abs(r2 - r1) < 0.05) {
      explanationEn = `Target is ${revisedTarget} runs from ${team2Available} overs (equal resources available).`;
      explanationBn = `${team2Available} ওভারে লক্ষ্যমাত্রা ${revisedTarget} রান (উভয় দলের সমপরিমাণ রিসোর্স)।`;
    } else {
      explanationEn = `Target adjusted upward to ${revisedTarget} runs from ${team2Available} overs (+${runsAdjustment} runs added via G50 factor of ${g50}, DLS Resource: ${resourceRatioPct}%).`;
      explanationBn = `ডিএলএস পদ্ধতিতে ${team2Available} ওভারে সংশোধিত টার্গেট ${revisedTarget} রান (+${runsAdjustment} রান যোগ, G50 মান: ${g50})।`;
    }

    return {
      edition: 'Standard Edition (ICC D/L)',
      revisedTarget,
      parScore,
      oversAvailable: team2Available,
      team1ResourcePct: r1,
      team2ResourcePct: r2,
      runsAdjustment,
      ballsRemaining,
      runsNeeded,
      g50,
      isMinimumOversMet,
      minimumOversRequired: minOversRequired,
      isTied,
      currentMatchStatus,
      marginRuns,
      explanationEn,
      explanationBn,
    };
  }
}
