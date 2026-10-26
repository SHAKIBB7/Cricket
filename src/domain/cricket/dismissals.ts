import { DismissalType } from './types';

export type BatterPosition = 'striker' | 'non_striker';

export interface DismissalRule {
  id: DismissalType;
  label: string;
  eligibleBatters: readonly BatterPosition[];
  bowlerCredited: boolean;
  hasFielder: boolean;
  fielderLabel?: string;
  fielderPlaceholder?: string;
  description: string;
  allowedOnFreeHit: boolean;
  allowedOnNoBall: boolean;
  allowedOnWide: boolean;
}

/**
 * Centralized International Cricket Dismissal Rules (MCC Laws of Cricket)
 * Configures eligible batter positions, bowler credit, fielder requirement,
 * Free Hit eligibility, and No-Ball / Wide delivery restrictions.
 */
export const DISMISSAL_RULES: Record<DismissalType, DismissalRule> = {
  Bowled: {
    id: 'Bowled',
    label: 'Bowled',
    eligibleBatters: ['striker'],
    bowlerCredited: true,
    hasFielder: false,
    description: 'Ball delivered by bowler struck and broke the wickets',
    allowedOnFreeHit: false,
    allowedOnNoBall: false,
    allowedOnWide: false,
  },
  Caught: {
    id: 'Caught',
    label: 'Caught',
    eligibleBatters: ['striker'],
    bowlerCredited: true,
    hasFielder: true,
    fielderLabel: 'Fielder / Keeper',
    fielderPlaceholder: 'e.g. Catcher Name',
    description: 'Fair catch completed by fielder or wicketkeeper before ball grounded',
    allowedOnFreeHit: false,
    allowedOnNoBall: false,
    allowedOnWide: false,
  },
  LBW: {
    id: 'LBW',
    label: 'LBW (Leg Before Wicket)',
    eligibleBatters: ['striker'],
    bowlerCredited: true,
    hasFielder: false,
    description: 'Ball struck the batter\'s pad in line with wickets without touching bat',
    allowedOnFreeHit: false,
    allowedOnNoBall: false,
    allowedOnWide: false,
  },
  Stumped: {
    id: 'Stumped',
    label: 'Stumped',
    eligibleBatters: ['striker'],
    bowlerCredited: true,
    hasFielder: true,
    fielderLabel: 'Wicketkeeper',
    fielderPlaceholder: 'e.g. Wicketkeeper Name',
    description: 'Wicketkeeper put down wicket with batter out of crease and not attempting run',
    allowedOnFreeHit: false,
    allowedOnNoBall: false,
    allowedOnWide: true,
  },
  'Hit Wicket': {
    id: 'Hit Wicket',
    label: 'Hit Wicket',
    eligibleBatters: ['striker'],
    bowlerCredited: true,
    hasFielder: false,
    description: 'Striker broke own wicket with bat, body, or gear while playing/preparing shot',
    allowedOnFreeHit: false,
    allowedOnNoBall: false,
    allowedOnWide: true,
  },
  'Hit the Ball Twice': {
    id: 'Hit the Ball Twice',
    label: 'Hit the Ball Twice',
    eligibleBatters: ['striker'],
    bowlerCredited: false,
    hasFielder: false,
    description: 'Striker willfully struck ball second time other than guarding wicket',
    allowedOnFreeHit: true,
    allowedOnNoBall: true,
    allowedOnWide: false,
  },
  'Run Out': {
    id: 'Run Out',
    label: 'Run Out',
    eligibleBatters: ['striker', 'non_striker'],
    bowlerCredited: false,
    hasFielder: true,
    fielderLabel: 'Fielder (Throw / Assist)',
    fielderPlaceholder: 'e.g. Thrower / Keeper (Optional)',
    description: 'Batter out of ground when wicket broken (includes Non-Striker / Mankad)',
    allowedOnFreeHit: true,
    allowedOnNoBall: true,
    allowedOnWide: true,
  },
  'Obstructing the Field': {
    id: 'Obstructing the Field',
    label: 'Obstructing the Field',
    eligibleBatters: ['striker', 'non_striker'],
    bowlerCredited: false,
    hasFielder: false,
    description: 'Batter willfully obstructed or distracted fielding side by word or action',
    allowedOnFreeHit: true,
    allowedOnNoBall: true,
    allowedOnWide: true,
  },
  'Retired Out': {
    id: 'Retired Out',
    label: 'Retired Out',
    eligibleBatters: ['striker', 'non_striker'],
    bowlerCredited: false,
    hasFielder: false,
    description: 'Batter retired without umpire permission (counts as wicket against batting)',
    allowedOnFreeHit: false,
    allowedOnNoBall: false,
    allowedOnWide: false,
  },
  'Timed Out': {
    id: 'Timed Out',
    label: 'Timed Out',
    eligibleBatters: ['striker', 'non_striker'],
    bowlerCredited: false,
    hasFielder: false,
    description: 'Incoming batter failed to arrive or take guard within the prescribed time',
    allowedOnFreeHit: false,
    allowedOnNoBall: false,
    allowedOnWide: false,
  },
  'Retired Hurt': {
    id: 'Retired Hurt',
    label: 'Retired Hurt (Not Out)',
    eligibleBatters: ['striker', 'non_striker'],
    bowlerCredited: false,
    hasFielder: false,
    description: 'Batter retired due to illness, injury, or unavoidable cause',
    allowedOnFreeHit: false,
    allowedOnNoBall: false,
    allowedOnWide: false,
  },
  'Retire Out': {
    id: 'Retire Out',
    label: 'Retired Out',
    eligibleBatters: ['striker', 'non_striker'],
    bowlerCredited: false,
    hasFielder: false,
    description: 'Batter retired without umpire permission',
    allowedOnFreeHit: false,
    allowedOnNoBall: false,
    allowedOnWide: false,
  },
  'Retire Hurt': {
    id: 'Retire Hurt',
    label: 'Retired Hurt (Not Out)',
    eligibleBatters: ['striker', 'non_striker'],
    bowlerCredited: false,
    hasFielder: false,
    description: 'Batter retired due to illness or injury',
    allowedOnFreeHit: false,
    allowedOnNoBall: false,
    allowedOnWide: false,
  },
};

/**
 * Primary dismissals in logical display order for scorer selection.
 */
export const PRIMARY_DISMISSAL_TYPES: readonly DismissalType[] = [
  'Bowled',
  'Caught',
  'LBW',
  'Run Out',
  'Stumped',
  'Hit Wicket',
  'Retired Hurt',
  'Hit the Ball Twice',
  'Obstructing the Field',
  'Retired Out',
  'Timed Out',
] as const;

/**
 * Returns the rule configuration for a given dismissal type.
 * Gracefully falls back to Bowled if an unknown key is passed.
 */
export function getDismissalRule(type?: string | DismissalType): DismissalRule {
  if (type && type in DISMISSAL_RULES) {
    return DISMISSAL_RULES[type as DismissalType];
  }
  return DISMISSAL_RULES['Bowled'];
}

/**
 * Returns list of eligible batter roles ('striker', 'non_striker') for a dismissal.
 */
export function getEligibleBatters(type: DismissalType): readonly BatterPosition[] {
  return getDismissalRule(type).eligibleBatters;
}

/**
 * Returns true if exactly one batter role is eligible (i.e. automatic selection, no choice required).
 */
export function isSingleBatterEligible(type: DismissalType): boolean {
  return getEligibleBatters(type).length === 1;
}

/**
 * Returns the default batter position for a dismissal type.
 */
export function getDefaultEligibleBatter(type: DismissalType): BatterPosition {
  const eligible = getEligibleBatters(type);
  return eligible[0] ?? 'striker';
}

/**
 * Returns true if the bowler is credited with the wicket in their bowling figures.
 */
export function isBowlerCredited(type?: DismissalType): boolean {
  if (!type) return true; // Default legacy fallback
  return getDismissalRule(type).bowlerCredited;
}

/**
 * Returns true if this dismissal involves a fielder name input (Caught, Stumped, Run Out).
 */
export function requiresFielder(type: DismissalType): boolean {
  return getDismissalRule(type).hasFielder;
}

/**
 * Returns true if this dismissal is allowed on a Free Hit delivery per ICC/MCC regulations.
 */
export function isAllowedOnFreeHit(type?: DismissalType): boolean {
  if (!type) return false;
  return getDismissalRule(type).allowedOnFreeHit;
}

/**
 * Returns true if this dismissal is permitted on a No-Ball delivery under MCC Law 21.18.
 * On a No-Ball, batters can ONLY be dismissed Run Out, Obstructing the Field, or Hit the Ball Twice.
 */
export function isAllowedOnNoBall(type?: DismissalType): boolean {
  if (!type) return false;
  return getDismissalRule(type).allowedOnNoBall;
}

/**
 * Returns true if this dismissal is permitted on a Wide delivery under MCC Law 22.17.
 * Permitted on Wide: Stumped, Run Out, Hit Wicket, Obstructing the Field.
 * Prohibited on Wide: Bowled, Caught, LBW, Hit the Ball Twice.
 */
export function isAllowedOnWide(type?: DismissalType): boolean {
  if (!type) return false;
  return getDismissalRule(type).allowedOnWide;
}
