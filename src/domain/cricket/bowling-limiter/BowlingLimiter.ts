export type BowlingLimitMode = 'international' | 'default' | 'custom';

export interface BowlingLimitConfig {
  mode?: BowlingLimitMode;
  customMaxOvers?: number;
  maxOversPerBowler?: number;
  // Legacy backward-compatibility flags
  isManualLimitEnabled?: boolean;
  manualOverLimit?: number;
}

export class BowlingLimiter {
  /**
   * Default bowling limit applied to all matches under 10 overs.
   */
  public static readonly UNDER_10_DEFAULT_MAX_OVERS = 4;

  /**
   * Application standard default restriction for matches choosing Default Rule.
   */
  public static readonly DEFAULT_RULE_MAX_OVERS = 4;

  /**
   * Resolves the effective bowling limit mode based on total match overs and configuration.
   *
   * Rule:
   * - If totalOvers < 10: Mode is ALWAYS 'default' (locked automatically).
   * - If totalOvers >= 10: User-selected mode, falling back to 'custom' (if legacy manual flag is on)
   *   or recommended 'international'.
   */
  public static resolveMode(
    totalOvers: number,
    selectedMode?: BowlingLimitMode,
    legacyIsManual?: boolean
  ): BowlingLimitMode {
    const overs = Math.max(1, Number(totalOvers) || 6);
    if (overs < 10) {
      return 'default';
    }

    if (selectedMode === 'international' || selectedMode === 'default' || selectedMode === 'custom') {
      return selectedMode;
    }

    if (legacyIsManual) {
      return 'custom';
    }

    // Default recommended option for matches of 10+ overs
    return 'international';
  }

  /**
   * Calculates the maximum overs allowed per bowler.
   *
   * 1. If totalOvers < 10:
   *    Strictly 4 overs maximum per bowler.
   *    Examples: 5 ov -> 4, 6 ov -> 4, 8 ov -> 4, 9 ov -> 4.
   *
   * 2. If totalOvers >= 10:
   *    - International Rule: Math.ceil(totalOvers / 5)
   *      Examples: 10 ov -> 2, 11 ov -> 3, 20 ov -> 4, 50 ov -> 10.
   *    - Default Rule: 4 overs.
   *    - Custom / Manual Rule: user specified value (clamped between 1 and totalOvers).
   */
  public static calculateMaxOvers(
    totalOvers: number,
    config?: BowlingLimitConfig
  ): number {
    const overs = Math.max(1, Number(totalOvers) || 6);

    // Rule 1: Matches under 10 overs strictly use the default 4-over rule
    if (overs < 10) {
      return this.UNDER_10_DEFAULT_MAX_OVERS;
    }

    const mode = this.resolveMode(
      overs,
      config?.mode,
      config?.isManualLimitEnabled
    );

    switch (mode) {
      case 'international':
        // International cricket rule: one-fifth of innings overs (rounded up for balance)
        return Math.max(1, Math.min(overs, Math.ceil(overs / 5)));

      case 'default':
        // Application standard configured default: 4 overs
        return Math.max(1, Math.min(overs, this.DEFAULT_RULE_MAX_OVERS));

      case 'custom': {
        const customValue = Number(
          config?.customMaxOvers ??
          config?.manualOverLimit ??
          config?.maxOversPerBowler ??
          4
        );
        const resolved = isNaN(customValue) || customValue < 1 ? 4 : customValue;
        return Math.max(1, Math.min(overs, resolved));
      }

      default:
        return Math.max(1, Math.min(overs, Math.ceil(overs / 5)));
    }
  }

  /**
   * Formats a descriptive label for the bowling limit mode.
   */
  public static getModeLabel(mode: BowlingLimitMode): string {
    switch (mode) {
      case 'international':
        return 'International Rule';
      case 'default':
        return 'Default Rule';
      case 'custom':
        return 'Custom Rule';
      default:
        return 'Default Rule';
    }
  }

  /**
   * Validates whether a bowler is permitted to bowl another over.
   */
  public static validateBowler(
    bowlerName: string,
    ballsBowled: number,
    maxOversAllowed: number,
    isPreviousOverBowler: boolean
  ): { allowed: boolean; reason?: string } {
    const name = bowlerName.trim();
    if (!name) {
      return { allowed: false, reason: 'Bowler name cannot be empty.' };
    }

    const completedOvers = Math.floor(ballsBowled / 6);
    if (completedOvers >= maxOversAllowed) {
      return {
        allowed: false,
        reason: `${name} has reached the maximum allowed limit (${completedOvers}/${maxOversAllowed} overs).`,
      };
    }

    if (isPreviousOverBowler) {
      return {
        allowed: false,
        reason: `${name} cannot bowl consecutive overs.`,
      };
    }

    return { allowed: true };
  }
}
