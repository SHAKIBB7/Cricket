export type BattingHand = 'Right-hand Batsman' | 'Left-hand Batsman';

export type DismissalType =
  | 'Bowled'
  | 'Caught'
  | 'LBW'
  | 'Run Out'
  | 'Stumped'
  | 'Hit Wicket'
  | 'Retired Out'
  | 'Retired Hurt'
  | 'Retire Out'
  | 'Retire Hurt'
  | 'Obstructing the Field'
  | 'Timed Out';

export type ExtraType = 'wide' | 'no_ball' | 'bye' | 'leg_bye' | 'penalty';

export type BallEventType =
  | 'run'
  | 'boundary'
  | 'six'
  | 'wide'
  | 'no_ball'
  | 'bye'
  | 'leg_bye'
  | 'wicket'
  | 'penalty';

export type MatchStatus = 'PENDING' | 'ONGOING' | 'COMPLETED' | 'ABANDONED';

export type TossDecision = 'Batting' | 'Bowling';

export interface Player {
  id: string;
  name: string;
  battingHand: BattingHand;
  battingPosition: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  dotBalls: number;
  ballLog: string[];
  bowlersFaced: Record<string, number>;
  runsVsBowler: Record<string, number>;
  isDismissed: boolean;
  dismissalText?: string;
  dismissalType?: DismissalType;
  fielderName?: string;
}

export interface OverHistoryRecord {
  overNumber: number;
  log: string[];
  isOngoing?: boolean;
}

export interface Bowler {
  id: string;
  name: string;
  ballsBowled: number;
  maidens: number;
  runs: number;
  wickets: number;
  overHistory: OverHistoryRecord[];
}

export interface FallOfWicket {
  score: number;
  wicket: number;
  over: string; // e.g. "3.4"
  player: string;
  dismissalType?: DismissalType;
  dismissal?: string;
  fielder?: string;
}

export interface Partnership {
  batter1: string;
  batter2: string;
  runs: number;
  balls: number;
}

export interface AdvancedSettings {
  players: number;
  noBall: boolean;
  noBallReball: boolean;
  noBallRun: number;
  wideBall: boolean;
  wideReball: boolean;
  wideRun: number;
  isManualLimitEnabled: boolean;
  manualOverLimit: number;
  tournamentId?: string;
  venue?: string;
  matchType?: string;
}

export interface BallPayload {
  overNumber: number;
  ballNumber: number;
  strikerId: string;
  strikerName: string;
  nonStrikerId: string;
  nonStrikerName: string;
  bowlerId: string;
  bowlerName: string;
  runsScored: number;
  isWide: boolean;
  isNoBall: boolean;
  isByes: boolean;
  isLegByes: boolean;
  isWicket: boolean;
  dismissalType?: DismissalType;
  isStrikerOut?: boolean;
  fielderName?: string;
  newBatsmanName?: string;
  isLegalDelivery: boolean;
  totalRunsGained: number;
  penaltyAdded: number;
  isFreeHit: boolean;
}

export type DomainEventType =
  | 'MATCH_CREATED'
  | 'INNINGS_STARTED'
  | 'BALL_SCORED'
  | 'BOWLER_CHANGED'
  | 'STRIKE_SWAPPED'
  | 'BATTER_RETIRED'
  | 'PENALTY_AWARDED'
  | 'BALL_EDITED'
  | 'UNDO_LAST_ACTION'
  | 'INNINGS_COMPLETED'
  | 'MATCH_COMPLETED';

export interface DomainEvent {
  eventId: string;
  matchId: string;
  version: number;
  timestamp: number;
  type: DomainEventType;
  actorId?: string;
  payload: any;
}

export interface InningsData {
  inningsNumber: number;
  team: string;
  bowlingTeam: string;
  totalRuns: number;
  totalWickets: number;
  totalBalls: number;
  oversString: string;
  wideRuns: number;
  nbRuns: number;
  byeRuns: number;
  lbRuns: number;
  penaltyRuns: number;
  penaltyRunsAgainst: number;
  players: Player[];
  bowlers: Bowler[];
  fallOfWickets: FallOfWicket[];
  pastPartnerships: Partnership[];
  currentPartnership: Partnership;
  thisOverLog: string[];
  strikerIdx: number;
  nonStrikerIdx: number;
  currentBowlerIdx: number;
  nextPlayerIdx: number;
  lastCompletedOverBowlerIdx: number;
  isOverComplete: boolean;
  isFreeHit: boolean;
}

export interface MatchScorecard {
  id: string;
  teamA: string;
  teamB: string;
  tossWinner: string;
  tossDecision: TossDecision;
  totalOvers: number;
  status: MatchStatus;
  currentInnings: number;
  targetScore: number;
  advancedSettings: AdvancedSettings;
  firstInnings?: InningsData;
  secondInnings?: InningsData;
  winner?: string;
  result?: string;
  mom?: string;
  momStats?: {
    name: string;
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
    wickets: number;
    bowlingRuns: number;
    ballsBowled: number;
    points: number;
  };
  venue: string;
  createdAt: string;
  updatedAt: string;
}
