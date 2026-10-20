/**
 * EventSourcedMatchEngine — Core Cricket State Machine
 *
 * Implements deterministic cricket scoring, event sourcing, undo,
 * ball-editing, strike rotation, free hits, and rules enforcement.
 */

import {
 Player,
 Bowler,
 InningsData,
 AdvancedSettings,
 DismissalType,
 DomainEvent,
 MatchScorecard,
 TossDecision,
 MatchStatus,
 BowlingLimitMode,
 MatchResultType,
 MatchResultDetails,
 MatchLocationMetadata,
} from '../types';
import { BowlingLimiter } from '../bowling-limiter/BowlingLimiter';
import {
  isBowlerCredited,
  isAllowedOnFreeHit,
  isAllowedOnNoBall,
  isAllowedOnWide,
} from '../dismissals';
import {
 oversString,
 getBattingPosition,
 cleanPlayerName,
} from '../formatters';
import { ManOfTheMatchEngine } from '../analytics/ManOfTheMatchEngine';
import {
  MatchEngineMetadata,
  getEngineMetadata,
  getEngineVersion,
  getEngineVersionDisplay,
  getEngineNavigationLabel,
  setEngineMetadata,
  resetEngineMetadata,
  isValidEngineVersion,
} from './engine-metadata';

export interface BallInput {
 runsScored: number;
 isWide?: boolean;
 isNoBall?: boolean;
 isByes?: boolean;
 isLegByes?: boolean;
 isWicket?: boolean;
 dismissalType?: DismissalType;
 fielderName?: string;
 newBatsmanName?: string;
 isStrikerOut?: boolean;
}

export class EventSourcedMatchEngine {
  /**
   * Authoritative engine metadata reflecting the actual engine implementation.
   */
  public static get METADATA(): MatchEngineMetadata {
    return getEngineMetadata();
  }

  public static get version(): string {
    return getEngineVersion();
  }

  public static getEngineVersion(): string {
    return getEngineVersion();
  }

  public static getEngineVersionDisplay(format?: 'full' | 'short', fallback?: string): string {
    return getEngineVersionDisplay({ format, fallback });
  }

 public id: string;
 public teamA: string;
 public teamB: string;
 public tossWinner: string;
 public tossDecision: TossDecision;
 public totalOvers: number;
 public advancedSettings: AdvancedSettings;
 public currentInningsNumber: number;
 public targetScore: number;
 public status: MatchStatus;
 public venue: string;
 public groundId?: string;
 public location?: MatchLocationMetadata;
 public createdAt: string;
 public updatedAt: string;

 public firstInnings: InningsData;
 public secondInnings?: InningsData;

 public events: DomainEvent[] = [];
 public snapshots: string[] = []; // JSON snapshots for instant undo
 public maxSnapshots = 60;

  get maxOversPerBowler(): number {
    return this.advancedSettings?.maxOversPerBowler || Math.ceil(this.totalOvers / 5);
  }

 constructor(config: {
 id?: string;
 teamA: string;
 teamB: string;
 tossWinner: string;
 tossDecision: TossDecision;
 totalOvers: number;
 advancedSettings?: Partial<AdvancedSettings>;
 strikerName?: string;
 nonStrikerName?: string;
 bowlerName?: string;
 venue?: string;
 groundId?: string;
 location?: MatchLocationMetadata;
 firstInnings?: InningsData;
 secondInnings?: InningsData;
 currentInnings?: number;
 targetScore?: number;
 status?: MatchStatus;
 events?: DomainEvent[];
 }) {
 this.id = config.id || `match_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
 this.teamA = config.teamA.trim() || '';
 this.teamB = config.teamB.trim() || '';
 this.tossWinner = config.tossWinner || '';
 this.tossDecision = (config.tossDecision as TossDecision) || 'Batting';
 this.totalOvers = config.advancedSettings?.isSuperOver ? 1 : Math.max(1, config.totalOvers || 6);
 this.venue = config.venue || '';
 this.groundId = config.groundId || config.advancedSettings?.groundId;
 this.location = config.location || config.advancedSettings?.location;
 this.status = 'ONGOING';
 this.createdAt = new Date().toISOString();
 this.updatedAt = new Date().toISOString();
 this.currentInningsNumber = 1;
 this.targetScore = 0;

 const effectiveBowlingMode = BowlingLimiter.resolveMode(
  this.totalOvers,
  config.advancedSettings?.bowlingLimitMode,
  config.advancedSettings?.isManualLimitEnabled
 );
 const effectiveMaxOvers = BowlingLimiter.calculateMaxOvers(this.totalOvers, {
  mode: effectiveBowlingMode,
  customMaxOvers: config.advancedSettings?.maxOversPerBowler ?? config.advancedSettings?.manualOverLimit,
  isManualLimitEnabled: effectiveBowlingMode === 'custom' || config.advancedSettings?.isManualLimitEnabled,
 });

 this.advancedSettings = {
  players: 11,
  noBall: true,
  noBallReball: true,
  noBallRun: 1,
  wideBall: true,
  wideReball: true,
  wideRun: 1,
  isManualLimitEnabled: effectiveBowlingMode === 'custom',
  manualOverLimit: effectiveMaxOvers,
  ...config.advancedSettings,
  bowlingLimitMode: effectiveBowlingMode,
  maxOversPerBowler: effectiveMaxOvers,
 };

 // Determine initial batting and bowling teams from toss
 let initialBattingTeam = this.teamA;
 let initialBowlingTeam = this.teamB;

 if (this.tossWinner === this.teamA) {
 if (this.tossDecision === 'Bowling') {
 initialBattingTeam = this.teamB;
 initialBowlingTeam = this.teamA;
 }
 } else {
 if (this.tossDecision === 'Batting') {
 initialBattingTeam = this.teamB;
 initialBowlingTeam = this.teamA;
 }
 }

  if (config.targetScore !== undefined) {
    this.targetScore = config.targetScore;
  }
  if (config.status !== undefined) {
    this.status = config.status;
  }
  if (config.currentInnings !== undefined) {
    this.currentInningsNumber = config.currentInnings;
  }

  if (config.firstInnings) {
    this.firstInnings = JSON.parse(JSON.stringify(config.firstInnings));
  } else {
    this.firstInnings = this.createEmptyInnings(
      1,
      initialBattingTeam,
      initialBowlingTeam,
      config.strikerName,
      config.nonStrikerName,
      config.bowlerName
    );
  }

  if (config.secondInnings) {
    this.secondInnings = JSON.parse(JSON.stringify(config.secondInnings));
  }

  if (Array.isArray(config.events) && config.events.length > 0) {
    this.events = [...config.events];
  } else {
    this.emitEvent('MATCH_CREATED', {
      id: this.id,
      teamA: this.teamA,
      teamB: this.teamB,
      tossWinner: this.tossWinner,
      tossDecision: this.tossDecision,
      totalOvers: this.totalOvers,
      advancedSettings: this.advancedSettings,
      strikerName: config.strikerName,
      nonStrikerName: config.nonStrikerName,
      bowlerName: config.bowlerName,
      venue: this.venue,
      groundId: this.groundId,
      location: this.location,
    });
  }
 }

 /**
 * Factory method to create a match in Chase Mode (starts directly in 2nd innings)
 */
 public static createChaseMatch(config: {
 id?: string;
 chasingTeam: string;
 defendingTeam: string;
 targetScore: number;
 totalOvers: number;
 strikerName?: string;
 nonStrikerName?: string;
 bowlerName?: string;
 venue?: string;
 groundId?: string;
 location?: MatchLocationMetadata;
 advancedSettings?: Partial<AdvancedSettings>;
 }): EventSourcedMatchEngine {
 const chasingTeam = config.chasingTeam.trim() || '';
 const defendingTeam = config.defendingTeam.trim() || '';
 const targetScore = Math.max(1, config.targetScore || 100);
 const totalOvers = Math.max(1, config.totalOvers || 6);

 const engine = new EventSourcedMatchEngine({
 id: config.id,
 teamA: chasingTeam,
 teamB: defendingTeam,
 tossWinner: chasingTeam,
 tossDecision: 'Batting',
 totalOvers,
 venue: config.venue,
 groundId: config.groundId,
 location: config.location,
 advancedSettings: {
 ...config.advancedSettings,
 matchType: 'CHASE',
 },
 });

 engine.targetScore = targetScore;
 engine.currentInningsNumber = 2;

 // 1st innings is recorded as defending team score that set the target
 engine.firstInnings = {
 ...engine.createEmptyInnings(1, defendingTeam, chasingTeam),
 totalRuns: targetScore - 1,
 totalWickets: 0,
 totalBalls: totalOvers * 6,
 oversString: `${totalOvers}.0`,
 };

 // 2nd innings is the chasing team actively batting
 engine.secondInnings = engine.createEmptyInnings(
 2,
 chasingTeam,
 defendingTeam,
 config.strikerName,
 config.nonStrikerName,
 config.bowlerName
);

  engine.emitEvent('INNINGS_STARTED', {
  inningsNumber: 2,
  battingTeam: chasingTeam,
  defendingTeam,
  targetScore,
  totalOvers,
  isChaseMode: true,
  strikerName: config.strikerName,
  nonStrikerName: config.nonStrikerName,
  bowlerName: config.bowlerName,
  venue: config.venue,
  groundId: config.groundId,
  location: config.location,
  advancedSettings: config.advancedSettings,
  });

 return engine;
 }

 /**
  * Factory method to create a Super Over tie-breaker match.
  * Standard ICC Rules: 1 over per side, maximum 2 wickets per side.
  * Team batting second in main match typically bats first in Super Over.
  */
 public static createSuperOverMatch(config: {
  parentMatch: MatchScorecard;
  strikerName?: string;
  nonStrikerName?: string;
  bowlerName?: string;
 }): EventSourcedMatchEngine {
  const parent = config.parentMatch;
  const teamBattingFirst = parent.secondInnings?.team || parent.teamB;
  const teamBowlingFirst = parent.firstInnings?.team || parent.teamA;

  const engine = new EventSourcedMatchEngine({
   id: `${parent.id}_super_over`,
   teamA: teamBattingFirst,
   teamB: teamBowlingFirst,
   tossWinner: teamBattingFirst,
   tossDecision: 'Batting',
   totalOvers: 1,
   strikerName: config.strikerName || 'Batter 1',
   nonStrikerName: config.nonStrikerName || 'Batter 2',
   bowlerName: config.bowlerName || 'Bowler 1',
   venue: parent.venue,
   groundId: parent.advancedSettings?.groundId || (parent as any).groundId,
   advancedSettings: {
    ...parent.advancedSettings,
    isSuperOver: true,
    parentMatchId: parent.id,
    players: Math.min(3, parent.advancedSettings?.players || 11),
    maxOversPerBowler: 1,
   },
  });

  return engine;
 }

 public get currentInnings(): InningsData {
 return this.currentInningsNumber === 2 && this.secondInnings
 ? this.secondInnings
 : this.firstInnings;
 }

 public get maxPlayers(): number {
 return Math.max(2, this.advancedSettings.players || 11);
 }

 public get maxWickets(): number {
  if (this.advancedSettings?.isSuperOver) {
   return 2;
  }
  return this.maxPlayers - 1;
 }

 public get isInningsOver(): boolean {
 const inn = this.currentInnings;
 if (inn.totalWickets >= this.maxWickets) return true;
 if (inn.totalBalls >= this.totalOvers * 6) return true;
 if (this.currentInningsNumber === 2 && inn.totalRuns >= this.targetScore && this.targetScore > 0) {
 return true;
 }
 return false;
 }

 public get isMatchCompleted(): boolean {
 return (
 this.status === 'COMPLETED' ||
 (this.currentInningsNumber === 2 && this.isInningsOver)
);
 }

 public createEmptyInnings(
 inningsNumber: number,
 battingTeam: string,
 bowlingTeam: string,
 strikerName?: string,
 nonStrikerName?: string,
 bowlerName?: string
): InningsData {
 const totalPlayers = this.maxPlayers;
 const players: Player[] = [];

 for (let i = 0; i < totalPlayers; i++) {
 players.push({
 id: `p_${inningsNumber}_${i + 1}`,
 name: i === 0 ? strikerName?.trim() || 'Batter 1' : i === 1 ? nonStrikerName?.trim() || 'Batter 2' : '',
 battingHand: 'Right-hand Batsman',
 battingPosition: getBattingPosition(i),
 runs: 0,
 balls: 0,
 fours: 0,
 sixes: 0,
 dotBalls: 0,
 ballLog: [],
 bowlersFaced: {},
 runsVsBowler: {},
 isDismissed: false,
 });
 }

 const bowlers: Bowler[] = [
 {
 id: `b_${inningsNumber}_1`,
 name: bowlerName?.trim() || 'Bowler 1',
 ballsBowled: 0,
 maidens: 0,
 runs: 0,
 wickets: 0,
 overHistory: [],
 },
 ];

 return {
 inningsNumber,
 team: battingTeam,
 bowlingTeam,
 totalRuns: 0,
 totalWickets: 0,
 totalBalls: 0,
 oversString: '0.0',
 wideRuns: 0,
 nbRuns: 0,
 byeRuns: 0,
 lbRuns: 0,
 penaltyRuns: 0,
 penaltyRunsAgainst: 0,
 players,
 bowlers,
 fallOfWickets: [],
 pastPartnerships: [],
 currentPartnership: {
 batter1: players[0].name,
 batter2: players[1].name,
 runs: 0,
 balls: 0,
 },
 thisOverLog: [],
 strikerIdx: 0,
 nonStrikerIdx: 1,
 currentBowlerIdx: 0,
 nextPlayerIdx: 2,
 lastCompletedOverBowlerIdx: -1,
 isOverComplete: false,
 isFreeHit: false,
 };
 }

 public saveSnapshot(): void {
 if (this.snapshots.length >= this.maxSnapshots) {
 this.snapshots.shift();
 }
 const stateString = JSON.stringify({
 currentInningsNumber: this.currentInningsNumber,
 targetScore: this.targetScore,
 status: this.status,
 firstInnings: this.firstInnings,
 secondInnings: this.secondInnings,
 });
 this.snapshots.push(stateString);
 }

 public undo(): boolean {
 if (this.snapshots.length > 0) {
  const previous = this.snapshots.pop();
  if (!previous) return false;

  try {
   const data = JSON.parse(previous);
   this.currentInningsNumber = data.currentInningsNumber;
   this.targetScore = data.targetScore;
   this.status = data.status;
   this.firstInnings = data.firstInnings;
   this.secondInnings = data.secondInnings;
   this.updatedAt = new Date().toISOString();

   // Prune matching action event so event log stays consistent with scorecard
   const actionIdx = this.findLastActionableEventIndex();
   if (actionIdx !== -1) {
    this.events.splice(actionIdx, 1);
   }

   this.emitEvent('UNDO_LAST_ACTION', { timestamp: Date.now() });
   return true;
  } catch {
   return false;
  }
 }

 // Fallback when in-memory snapshots is empty (e.g. after browser refresh or IndexedDB reload)
 const actionIdx = this.findLastActionableEventIndex();
 if (actionIdx === -1) {
  return false;
 }

 const eventsToReplay = this.events.slice(0, actionIdx);
 if (eventsToReplay.length === 0 || !eventsToReplay.some((e) => e.type === 'MATCH_CREATED')) {
  return false;
 }

 try {
  const replayed = EventSourcedMatchEngine.fromEvents(eventsToReplay);
  this.firstInnings = replayed.firstInnings;
  this.secondInnings = replayed.secondInnings;
  this.currentInningsNumber = replayed.currentInningsNumber;
  this.targetScore = replayed.targetScore;
  this.status = replayed.status;
  this.snapshots = replayed.snapshots;
  this.events = eventsToReplay;
  this.updatedAt = new Date().toISOString();

  this.emitEvent('UNDO_LAST_ACTION', { timestamp: Date.now() });
  return true;
 } catch {
  return false;
 }
 }

 public findLastActionableEventIndex(): number {
 for (let i = this.events.length - 1; i >= 0; i--) {
  const t = this.events[i].type;
  if (
   t === 'BALL_SCORED' ||
   t === 'BOWLER_CHANGED' ||
   t === 'STRIKE_SWAPPED' ||
   t === 'BATTER_RETIRED' ||
   t === 'PENALTY_AWARDED'
  ) {
   return i;
  }
 }
 return -1;
 }

 private emitEvent(type: DomainEvent['type'], payload: any): DomainEvent {
 const event: DomainEvent = {
 eventId: `ev_${Date.now()}_${this.events.length + 1}`,
 matchId: this.id,
 version: this.events.length + 1,
 timestamp: Date.now(),
 type,
 payload,
 };
 this.events.push(event);
 return event;
 }

 public getMaxBowlerLimit(): number {
  return BowlingLimiter.calculateMaxOvers(this.totalOvers, {
   mode: this.advancedSettings.bowlingLimitMode,
   customMaxOvers: this.advancedSettings.maxOversPerBowler ?? this.advancedSettings.manualOverLimit,
   isManualLimitEnabled: this.advancedSettings.bowlingLimitMode === 'custom' || this.advancedSettings.isManualLimitEnabled,
  });
 }

 public validateBowlerSelection(bowlerName: string): { allowed: boolean; reason?: string } {
  const formatted = bowlerName.trim();
  if (!formatted) {
   return { allowed: false, reason: 'Bowler name cannot be empty.' };
  }
  const inn = this.currentInnings;
  const isBackToBack = (
   inn.lastCompletedOverBowlerIdx >= 0 &&
   inn.lastCompletedOverBowlerIdx < inn.bowlers.length &&
   inn.bowlers[inn.lastCompletedOverBowlerIdx].name.trim().toLowerCase() === formatted.toLowerCase()
  );
  const existing = inn.bowlers.find((b) => b.name.trim().toLowerCase() === formatted.toLowerCase());
  const ballsBowled = existing ? existing.ballsBowled : 0;

  return BowlingLimiter.validateBowler(
   formatted,
   ballsBowled,
   this.getMaxBowlerLimit(),
   isBackToBack
  );
 }

 public canBowlerBowl(bowlerName: string): boolean {
  return this.validateBowlerSelection(bowlerName).allowed;
 }

 public changeBowler(newBowlerName: string): { success: boolean; reason?: string } {
  const formatted = newBowlerName.trim();
  if (!formatted) return { success: false, reason: 'Bowler name cannot be empty.' };

  const validation = this.validateBowlerSelection(formatted);
  if (!validation.allowed) {
   return { success: false, reason: validation.reason };
  }

  this.saveSnapshot();
  const inn = this.currentInnings;

  const existingIdx = inn.bowlers.findIndex(
   (b) => b.name.toLowerCase() === formatted.toLowerCase()
  );

  if (existingIdx !== -1) {
   inn.currentBowlerIdx = existingIdx;
  } else {
   inn.bowlers.push({
    id: `b_${inn.inningsNumber}_${inn.bowlers.length + 1}`,
    name: formatted,
    ballsBowled: 0,
    maidens: 0,
    runs: 0,
    wickets: 0,
    overHistory: [],
   });
   inn.currentBowlerIdx = inn.bowlers.length - 1;
  }

  inn.thisOverLog = [];
  inn.isOverComplete = false;
  this.updatedAt = new Date().toISOString();

  this.emitEvent('BOWLER_CHANGED', { bowlerName: formatted });
  return { success: true };
 }

 public swapStrike(saveHistory = true): void {
 if (saveHistory) this.saveSnapshot();
 this.swapStrikeInternal();
 this.updatedAt = new Date().toISOString();
 this.emitEvent('STRIKE_SWAPPED', {});
 }

 private swapStrikeInternal(): void {
 const inn = this.currentInnings;
 const temp = inn.strikerIdx;
 inn.strikerIdx = inn.nonStrikerIdx;
 inn.nonStrikerIdx = temp;
 }

 public retirePlayer(isStriker: boolean, type: 'Retire Out' | 'Retire Hurt'): boolean {
 const inn = this.currentInnings;
 const isRetireOut = type === 'Retire Out';
 if (inn.totalWickets >= this.maxWickets) return false;
 if (!isRetireOut && inn.nextPlayerIdx >= inn.players.length) return false;

 this.saveSnapshot();
 const targetIdx = isStriker ? inn.strikerIdx : inn.nonStrikerIdx;
 const retiredPlayer = inn.players[targetIdx];

 inn.fallOfWickets.push({
 score: inn.totalRuns,
 wicket: isRetireOut ? inn.totalWickets + 1 : inn.totalWickets,
 over: oversString(inn.totalBalls),
 player: retiredPlayer.name,
 dismissalType: type,
 dismissal: `${retiredPlayer.name} (${type})`,
 });

 inn.pastPartnerships.push({
 batter1: inn.players[inn.strikerIdx].name,
 batter2: inn.players[inn.nonStrikerIdx].name,
 runs: inn.currentPartnership.runs,
 balls: inn.currentPartnership.balls,
 });

 retiredPlayer.isDismissed = true;
 retiredPlayer.dismissalText = `(${type})`;
 retiredPlayer.dismissalType = type;
 retiredPlayer.name = `${retiredPlayer.name} (${type})`;

 inn.currentPartnership = {
 batter1: '',
 batter2: '',
 runs: 0,
 balls: 0,
 };

 if (isRetireOut) inn.totalWickets++;

 if (inn.nextPlayerIdx < inn.players.length) {
  if (!inn.players[inn.nextPlayerIdx].name || !inn.players[inn.nextPlayerIdx].name.trim()) {
   inn.players[inn.nextPlayerIdx] = {
    ...inn.players[inn.nextPlayerIdx],
    name: `Batter ${inn.nextPlayerIdx + 1}`,
   };
  }
  if (isStriker) {
  inn.strikerIdx = inn.nextPlayerIdx;
  } else {
  inn.nonStrikerIdx = inn.nextPlayerIdx;
  }
  inn.nextPlayerIdx++;
 }

 inn.currentPartnership.batter1 = inn.players[inn.strikerIdx].name;
 inn.currentPartnership.batter2 = inn.players[inn.nonStrikerIdx].name;

 this.updatedAt = new Date().toISOString();
 this.emitEvent('BATTER_RETIRED', { player: retiredPlayer.name, type });
 return true;
 }

 public awardPenaltyRuns(runs: number, awardedToBattingTeam: boolean, reason: string): void {
 if (this.isInningsOver) return;
 this.saveSnapshot();
 const inn = this.currentInnings;

 const entry = awardedToBattingTeam ? `+${runs}P` : `-${runs}P`;
 if (awardedToBattingTeam) {
 inn.totalRuns += runs;
 inn.penaltyRuns += runs;
 inn.currentPartnership.runs += runs;
 } else {
 inn.penaltyRunsAgainst += runs;
 }

 inn.thisOverLog.push(entry);
 this.updatedAt = new Date().toISOString();
 this.emitEvent('PENALTY_AWARDED', { runs, awardedToBattingTeam, reason });
 }

 /**
 * Main Scoring Function — Executes ball delivery rules with total fidelity
 */
 public scoreBall(input: BallInput): void {
  if (this.isInningsOver || this.currentInnings.isOverComplete) return;

  const currentInn = this.currentInnings;
  if (currentInn.currentBowlerIdx >= 0 && currentInn.currentBowlerIdx < currentInn.bowlers.length) {
   const currentBowler = currentInn.bowlers[currentInn.currentBowlerIdx];
   if (Math.floor(currentBowler.ballsBowled / 6) >= this.getMaxBowlerLimit()) {
    return;
   }
  }

  this.saveSnapshot();
  const inn = this.currentInnings;

 let {
 runsScored,
 isWide = false,
 isNoBall = false,
 isByes = false,
 isLegByes = false,
 isWicket = false,
 dismissalType,
 fielderName,
 newBatsmanName,
 isStrikerOut = true,
 } = input;

 // Normalization: Under MCC Laws 21 & 22, No-Ball supersedes Wide.
 // A delivery cannot be both Wide and No-Ball, preventing duplicate penalties.
 if (isNoBall) {
  isWide = false;
 }
 if (isWide) {
  isByes = false;
  isLegByes = false;
 }

 // Free Hit dismissal restriction: On a Free Hit, batters can ONLY be out by Run Out, Obstructing Field, or Hit Ball Twice
 if (inn.isFreeHit && isWicket && !isAllowedOnFreeHit(dismissalType)) {
  isWicket = false;
 }

 // No-Ball dismissal restriction: Under MCC Law 21.18, batters can ONLY be out Run Out, Obstructing Field, or Hit Ball Twice
 if (isNoBall && isWicket && !isAllowedOnNoBall(dismissalType)) {
  isWicket = false;
 }

 // Wide dismissal restriction: Under MCC Law 22.17, batters cannot be out Bowled, Caught, LBW, or Hit Ball Twice
 if (isWide && isWicket && !isAllowedOnWide(dismissalType)) {
  isWicket = false;
 }

 let penalty = 0;
 let needsReball = false;

 if (isWide && this.advancedSettings.wideBall) {
 penalty += this.advancedSettings.wideRun || 1;
 if (this.advancedSettings.wideReball) needsReball = true;
 }

 if (isNoBall && this.advancedSettings.noBall) {
 penalty += this.advancedSettings.noBallRun || 1;
 if (this.advancedSettings.noBallReball) needsReball = true;
 }

 const totalRunsGained = runsScored + penalty;
 inn.totalRuns += totalRunsGained;
 inn.currentPartnership.runs += totalRunsGained;

 if (isWide) inn.wideRuns += totalRunsGained;
 if (isNoBall) inn.nbRuns += penalty;
 if (isByes) inn.byeRuns += runsScored;
 if (isLegByes) inn.lbRuns += runsScored;

 const isLegalBall = !needsReball;

 // Update Free Hit state:
 // No ball triggers Free Hit on next ball. Legal ball consumes it. Wide or subsequent No ball preserves it.
 if (isNoBall && this.advancedSettings.noBall) {
 inn.isFreeHit = true;
 } else if (isLegalBall && inn.isFreeHit) {
 inn.isFreeHit = false;
 }

 // Ensure immutable references for current bowler and striker
 inn.players = inn.players.map((p, idx) =>
  idx === inn.strikerIdx
   ? {
      ...p,
      ballLog: [...(p.ballLog || [])],
      bowlersFaced: { ...(p.bowlersFaced || {}) },
      runsVsBowler: { ...(p.runsVsBowler || {}) },
     }
   : p
 );

 inn.bowlers = inn.bowlers.map((b, idx) =>
  idx === inn.currentBowlerIdx
   ? {
      ...b,
      overHistory: b.overHistory
       ? b.overHistory.map((oh) => ({ ...oh, log: [...oh.log] }))
       : [],
     }
   : b
 );

 inn.thisOverLog = [...inn.thisOverLog];
 inn.currentPartnership = { ...inn.currentPartnership };

 if (isLegalBall) {
 inn.totalBalls++;
 inn.currentPartnership.balls++;
 inn.bowlers[inn.currentBowlerIdx].ballsBowled++;
 }

 // Bowler charged runs: Byes and Leg-Byes are NOT charged to the bowler,
 // but any No-Ball penalty (or Wide penalty) IS charged to the bowler.
 if (isByes || isLegByes) {
  inn.bowlers[inn.currentBowlerIdx].runs += penalty;
 } else {
  inn.bowlers[inn.currentBowlerIdx].runs += totalRunsGained;
 }

 // Striker runs
 if (!isWide && !isByes && !isLegByes) {
 inn.players[inn.strikerIdx].runs += runsScored;
 if (runsScored === 4) inn.players[inn.strikerIdx].fours++;
 if (runsScored === 6) inn.players[inn.strikerIdx].sixes++;
 }

 // Striker balls faced (wide does not count as ball faced)
 if (isLegalBall || isNoBall) {
 if (!isWide) inn.players[inn.strikerIdx].balls++;
 }

 // Striker dot balls
 if (isLegalBall && !isWide && !isByes && !isLegByes && runsScored === 0) {
 inn.players[inn.strikerIdx].dotBalls++;
 }

 // Striker personal ball log
 if (!isWide) {
 let ballEntry: string;
 if (isWicket) {
 ballEntry = 'W';
 } else if (isNoBall) {
 ballEntry = `Nb${runsScored > 0 ? runsScored : ''}`;
 } else if (isByes) {
 ballEntry = `B${runsScored > 0 ? runsScored : ''}`;
 } else if (isLegByes) {
 ballEntry = `LB${runsScored > 0 ? runsScored : ''}`;
 } else {
 ballEntry = runsScored.toString();
 }

 inn.players[inn.strikerIdx].ballLog.push(ballEntry);

 const bowlerName = inn.bowlers[inn.currentBowlerIdx].name;
 inn.players[inn.strikerIdx].bowlersFaced[bowlerName] =
 (inn.players[inn.strikerIdx].bowlersFaced[bowlerName] || 0) + 1;

 if (!isByes && !isLegByes) {
 inn.players[inn.strikerIdx].runsVsBowler[bowlerName] =
 (inn.players[inn.strikerIdx].runsVsBowler[bowlerName] || 0) + runsScored;
 }
 }

 // ── WICKET HANDLING ──
 if (isWicket) {
 const outIdx = isStrikerOut ? inn.strikerIdx : inn.nonStrikerIdx;
 inn.players[outIdx] = { ...inn.players[outIdx] };
 const dismissedPlayer = inn.players[outIdx];
 const fielder = fielderName?.trim();

 let dismissalText = dismissalType || '';
 if (fielder) {
 if (dismissalType === 'Caught') dismissalText = `Caught by ${fielder}`;
 else if (dismissalType === 'Run Out') dismissalText = `Run Out by ${fielder}`;
 else if (dismissalType === 'Stumped') dismissalText = `Stumped by ${fielder}`;
 else dismissalText = `${dismissalType} (${fielder})`;
 }

 inn.fallOfWickets.push({
 score: inn.totalRuns,
 wicket: inn.totalWickets + 1,
 over: oversString(inn.totalBalls),
 player: dismissedPlayer.name,
 dismissalType,
 dismissal: dismissalText,
 fielder: fielder || undefined,
 });

 inn.pastPartnerships.push({
 batter1: inn.players[inn.strikerIdx].name,
 batter2: inn.players[inn.nonStrikerIdx].name,
 runs: inn.currentPartnership.runs,
 balls: inn.currentPartnership.balls,
 });

  inn.totalWickets++;
  if (isWide) {
   inn.thisOverLog.push(runsScored > 0 ? `Wd+${runsScored}+W` : 'Wd+W');
  } else if (isNoBall) {
   inn.thisOverLog.push(runsScored > 0 ? `Nb+${runsScored}+W` : 'Nb+W');
  } else if (isByes) {
   inn.thisOverLog.push(runsScored > 0 ? `B+${runsScored}+W` : 'B+W');
  } else if (isLegByes) {
   inn.thisOverLog.push(runsScored > 0 ? `LB+${runsScored}+W` : 'LB+W');
  } else {
   inn.thisOverLog.push('W');
  }

 // Bowler credit: Bowled, Caught, LBW, Stumped, Hit Wicket
 const bowlerCreditedDismissals: DismissalType[] = [
 'Bowled',
 'Caught',
 'LBW',
 'Stumped',
 'Hit Wicket',
 ];
 if (!dismissalType || isBowlerCredited(dismissalType)) {
 inn.bowlers[inn.currentBowlerIdx].wickets++;
 }

 dismissedPlayer.isDismissed = true;
 dismissedPlayer.dismissalText = dismissalText;
 dismissedPlayer.dismissalType = dismissalType;
 dismissedPlayer.fielderName = fielder;
 dismissedPlayer.name = `${dismissedPlayer.name} (${dismissalText})`;

 inn.currentPartnership = {
 batter1: '',
 batter2: '',
 runs: 0,
 balls: 0,
 };

 // Bring in incoming batter
 if (inn.totalWickets < this.maxWickets && inn.nextPlayerIdx < inn.players.length) {
  const defaultIncomingName = inn.players[inn.nextPlayerIdx]?.name?.trim() || `Batter ${inn.nextPlayerIdx + 1}`;
  inn.players[inn.nextPlayerIdx] = {
   ...inn.players[inn.nextPlayerIdx],
   name: newBatsmanName?.trim() || defaultIncomingName,
  };

 if (isStrikerOut) {
 inn.strikerIdx = inn.nextPlayerIdx;
 } else {
 inn.nonStrikerIdx = inn.nextPlayerIdx;
 }
 inn.nextPlayerIdx++;
 }

 inn.currentPartnership.batter1 = inn.players[inn.strikerIdx].name;
 inn.currentPartnership.batter2 = inn.players[inn.nonStrikerIdx].name;

 // MCC Law 18.11: On Caught, the incoming batter always faces the next delivery
 const isCaught = dismissalType === 'Caught';
 if (!isCaught && runsScored % 2 === 1) {
 this.swapStrikeInternal();
 }
 } else {
 // ── NON-WICKET DELIVERY LOG ──
 if (isWide) {
 inn.thisOverLog.push(`Wd${runsScored > 0 ? runsScored : ''}`);
 } else if (isNoBall) {
 inn.thisOverLog.push(`Nb${runsScored > 0 ? runsScored : ''}`);
 } else if (isByes) {
 inn.thisOverLog.push(`B${runsScored > 0 ? runsScored : ''}`);
 } else if (isLegByes) {
 inn.thisOverLog.push(`LB${runsScored > 0 ? runsScored : ''}`);
 } else {
 inn.thisOverLog.push(runsScored.toString());
 }

 if (runsScored % 2 === 1) {
 this.swapStrikeInternal();
 }
 }

 inn.oversString = oversString(inn.totalBalls);

 // ── OVER COMPLETION LOGIC ──
 const isCompletedOver = isLegalBall && inn.totalBalls > 0 && inn.totalBalls % 6 === 0;
 if (isCompletedOver) {
 inn.lastCompletedOverBowlerIdx = inn.currentBowlerIdx;
 const completedLog = [...inn.thisOverLog];

 // Maiden check: 0 runs charged to bowler in this over
 if (this.runsChargedToBowlerForOver(completedLog) === 0) {
 inn.bowlers[inn.currentBowlerIdx].maidens++;
 }

 inn.bowlers[inn.currentBowlerIdx].overHistory.push({
 overNumber: Math.floor(inn.totalBalls / 6),
 log: completedLog,
 });

 if (!this.isInningsOver) {
 this.swapStrikeInternal();
 inn.isOverComplete = true;
 }
 }

 this.updatedAt = new Date().toISOString();

 this.emitEvent('BALL_SCORED', {
 inningsNumber: inn.inningsNumber,
 overNumber: Math.floor((inn.totalBalls - (isLegalBall ? 1 : 0)) / 6) + 1,
 ballNumber: inn.thisOverLog.length,
 runsScored,
 totalRunsGained,
 isWide,
 isNoBall,
 isByes,
 isLegByes,
 isWicket,
 isLegalBall,
 dismissalType,
 striker: inn.players[inn.strikerIdx].name,
 bowler: inn.bowlers[inn.currentBowlerIdx].name,
 score: inn.totalRuns,
 wickets: inn.totalWickets,
 overs: inn.oversString,
 ballInput: {
  runsScored,
  isWide,
  isNoBall,
  isByes,
  isLegByes,
  isWicket,
  dismissalType,
  fielderName,
  newBatsmanName,
  isStrikerOut,
 },
 });
 }

 private runsChargedToBowlerForOver(log: string[]): number {
 let total = 0;
 for (const ball of log) {
 if (ball === 'W' || ball === 'Out' || ball.startsWith('W-') || ball.startsWith('Retire') || ball.includes('P')) {
 continue;
 }
 if (ball.startsWith('Wd')) {
 const extra = parseInt(ball.replace('Wd', ''), 10) || 0;
 total += (this.advancedSettings.wideRun || 1) + extra;
 } else if (ball.startsWith('Nb')) {
 total += (this.advancedSettings.noBallRun || 1);
 if (!ball.includes('B') && !ball.includes('LB')) {
  const extra = parseInt(ball.replace('Nb', ''), 10) || 0;
  total += extra;
 }
 } else if (ball.startsWith('B') || ball.startsWith('LB')) {
 continue; // Not charged to bowler
 } else {
 total += parseInt(ball, 10) || 0;
 }
 }
 return total;
 }

 /**
  * Validates cricket scoring invariants after deliveries
  */
 public validateScoringInvariants(): { valid: boolean; errors: string[] } {
 const errors: string[] = [];
 const inn = this.currentInnings;

 // Invariant 1: Team total runs == batter runs + extras
 const totalBatterRuns = inn.players.reduce((sum, p) => sum + (p.runs || 0), 0);
 const totalExtras =
  (inn.wideRuns || 0) +
  (inn.nbRuns || 0) +
  (inn.byeRuns || 0) +
  (inn.lbRuns || 0) +
  (inn.penaltyRuns || 0);
 if (inn.totalRuns !== totalBatterRuns + totalExtras) {
  errors.push(
   `Team runs invariant violated: totalRuns (${inn.totalRuns}) !== batterRuns (${totalBatterRuns}) + extras (${totalExtras})`
  );
 }

 // Invariant 2: Legal balls == bowler ballsBowled sum
 const totalBowlerBalls = inn.bowlers.reduce((sum, b) => sum + (b.ballsBowled || 0), 0);
 if (inn.totalBalls !== totalBowlerBalls) {
  errors.push(
   `Balls invariant violated: totalBalls (${inn.totalBalls}) !== bowlerBalls (${totalBowlerBalls})`
  );
 }

 // Invariant 3: Wickets count consistency
 if (inn.fallOfWickets.length > inn.totalWickets) {
  errors.push(
   `Wickets invariant violated: fallOfWickets (${inn.fallOfWickets.length}) > totalWickets (${inn.totalWickets})`
  );
 }

 return { valid: errors.length === 0, errors };
 }

 /**
 * Transitions from 1st Innings to 2nd Innings
 */
 public startSecondInnings(
 strikerName?: string,
 nonStrikerName?: string,
 bowlerName?: string
): void {
 if (this.currentInningsNumber !== 1) return;

 this.targetScore = this.firstInnings.totalRuns + 1;
 this.currentInningsNumber = 2;

 this.secondInnings = this.createEmptyInnings(
 2,
 this.firstInnings.bowlingTeam, // Team swap
 this.firstInnings.team,
 strikerName,
 nonStrikerName,
 bowlerName
 );

 this.emitEvent('INNINGS_STARTED', {
 inningsNumber: 2,
 battingTeam: this.secondInnings.team,
 targetScore: this.targetScore,
 strikerName,
 nonStrikerName,
 bowlerName,
 });
 }

/**
 * Evaluates match outcome according to MCC Law 16 (The Result)
 */
 public calculateResult(): MatchResultDetails {
 if (this.status === 'ABANDONED') {
  return {
   isCompleted: true,
   resultType: 'NO_RESULT',
   marginType: 'NONE',
   margin: 0,
   resultText: 'Match Abandoned (No Result)',
  };
 }

 if (this.currentInningsNumber < 2 || !this.secondInnings) {
 return {
 isCompleted: false,
 resultType: 'IN_PROGRESS',
 marginType: 'NONE',
 margin: 0,
 resultText: 'Match in Progress',
 };
 }

 const inn1Runs = this.firstInnings.totalRuns;
 const inn2Runs = this.secondInnings.totalRuns;
 const inn2Wickets = this.secondInnings.totalWickets;
 const team1 = this.firstInnings.team;
 const team2 = this.secondInnings.team;
 const target = this.targetScore > 0 ? this.targetScore : inn1Runs + 1;
 const parScore = target - 1;
 const isDls = Boolean(this.advancedSettings?.dlsApplied);
 const dlsSuffix = isDls ? ' (DLS Method)' : '';

 // Condition 1: Chasing side has reached or exceeded target (Win by Wickets)
 if (inn2Runs >= target) {
 const wicketsRemaining = Math.max(0, this.maxWickets - inn2Wickets);
 const ballsRemaining = Math.max(0, this.totalOvers * 6 - this.secondInnings.totalBalls);
 const resultText = `${team2} won by ${wicketsRemaining} wicket${wicketsRemaining === 1 ? '' : 's'}${dlsSuffix}`;
 return {
 isCompleted: true,
 resultType: 'WIN',
 winner: team2,
 loser: team1,
 marginType: 'WICKETS',
 margin: wicketsRemaining,
 resultText,
 ballsRemaining,
 };
 }

 // If second innings has not ended yet, the match is still underway
 if (!this.isInningsOver) {
 return {
 isCompleted: false,
 resultType: 'IN_PROGRESS',
 marginType: 'NONE',
 margin: 0,
 resultText: 'Match in Progress',
 };
 }

 // Second innings is completed (all out or scheduled overs exhausted)
 if (inn2Runs === parScore) {
 // MCC Law 16.5.1: Scores equal at end of match -> Match Tied
 return {
 isCompleted: true,
 resultType: 'TIE',
 winner: undefined,
 loser: undefined,
 marginType: 'NONE',
 margin: 0,
 resultText: isDls ? 'Match Tied (DLS Method)' : 'Match Tied',
 };
 } else if (inn2Runs < parScore) {
 // Defending team won by runs
 const runsMargin = parScore - inn2Runs;
 const resultText = `${team1} won by ${runsMargin} run${runsMargin === 1 ? '' : 's'}${dlsSuffix}`;
 return {
 isCompleted: true,
 resultType: 'WIN',
 winner: team1,
 loser: team2,
 marginType: 'RUNS',
 margin: runsMargin,
 resultText,
 };
 } else {
 // Safety fallback: inn2Runs > parScore (which would be inn2Runs >= target)
 const wicketsRemaining = Math.max(0, this.maxWickets - inn2Wickets);
 const ballsRemaining = Math.max(0, this.totalOvers * 6 - this.secondInnings.totalBalls);
 const resultText = `${team2} won by ${wicketsRemaining} wicket${wicketsRemaining === 1 ? '' : 's'}${dlsSuffix}`;
 return {
 isCompleted: true,
 resultType: 'WIN',
 winner: team2,
 loser: team1,
 marginType: 'WICKETS',
 margin: wicketsRemaining,
 resultText,
 ballsRemaining,
 };
 }
 }

 /**
 * Concludes the match and calculates winner, margin, and Man of the Match
 */
 public completeMatch(): MatchScorecard {
 this.status = 'COMPLETED';
 this.updatedAt = new Date().toISOString();

 const outcome = this.calculateResult();

 this.emitEvent('MATCH_COMPLETED', {
 winner: outcome.winner,
 loser: outcome.loser,
 resultType: outcome.resultType,
 result: outcome.resultText,
 marginType: outcome.marginType,
 margin: outcome.margin,
 });

 return this.toScorecard(outcome.winner, outcome.resultText, outcome.loser, outcome.resultType);
 }

 public toScorecard(
 winner?: string,
 result?: string,
 loser?: string,
 resultType?: MatchResultType
 ): MatchScorecard {
 const outcome = this.isMatchCompleted ? this.calculateResult() : null;
 const finalResultType = resultType || outcome?.resultType;
 const finalWinner = winner !== undefined ? winner : outcome?.winner;
 const finalLoser = loser !== undefined ? loser : outcome?.loser;
 const finalResult = result || outcome?.resultText || (this.isMatchCompleted ? 'Match Finished' : undefined);

 const scorecard: MatchScorecard = {
 id: this.id,
 teamA: this.teamA,
 teamB: this.teamB,
 tossWinner: this.tossWinner,
 tossDecision: this.tossDecision,
 totalOvers: this.totalOvers,
 status: this.status,
 currentInnings: this.currentInningsNumber,
 targetScore: this.targetScore,
 advancedSettings: this.advancedSettings,
 firstInnings: JSON.parse(JSON.stringify(this.firstInnings)),
 secondInnings: this.secondInnings ? JSON.parse(JSON.stringify(this.secondInnings)) : undefined,
 winner: finalWinner,
 loser: finalLoser,
 result: finalResult,
 resultType: finalResultType,
 marginType: outcome?.marginType,
 margin: outcome?.margin,
 ballsRemaining: outcome?.ballsRemaining,
 venue: this.venue,
 groundId: this.groundId,
 location: this.location,
 createdAt: this.createdAt,
 updatedAt: this.updatedAt,
 };

 if (
  this.isMatchCompleted &&
  (this.firstInnings || this.secondInnings) &&
  finalResultType !== 'NO_RESULT' &&
  this.status !== 'ABANDONED'
 ) {
  ManOfTheMatchEngine.resolveForMatch(scorecard, { forceRecalculate: true });
 } else {
  scorecard.mom = undefined;
  scorecard.momStats = undefined;
 }

 return scorecard;
 }

 /**
  * Creates a deep-cloned immutable copy of the engine and innings state.
  * Crucial for React state updates to guarantee that child components (batsmen, bowler tables)
  * detect reference differences and re-render in real time without stale state.
  */
 public clone(): EventSourcedMatchEngine {
  const cloned = Object.create(Object.getPrototypeOf(this)) as EventSourcedMatchEngine;
  Object.assign(cloned, this);

  const cloneInnings = (inn: InningsData): InningsData => ({
   ...inn,
   players: inn.players.map((p) => ({
    ...p,
    ballLog: p.ballLog ? [...p.ballLog] : [],
    bowlersFaced: p.bowlersFaced ? { ...p.bowlersFaced } : {},
    runsVsBowler: p.runsVsBowler ? { ...p.runsVsBowler } : {},
   })),
   bowlers: inn.bowlers.map((b) => ({
    ...b,
    overHistory: b.overHistory ? b.overHistory.map((oh) => ({ ...oh, log: [...oh.log] })) : [],
   })),
   fallOfWickets: inn.fallOfWickets ? [...inn.fallOfWickets] : [],
   pastPartnerships: inn.pastPartnerships ? [...inn.pastPartnerships] : [],
   currentPartnership: inn.currentPartnership
    ? { ...inn.currentPartnership }
    : { batter1: '', batter2: '', runs: 0, balls: 0 },
   thisOverLog: inn.thisOverLog ? [...inn.thisOverLog] : [],
  });

  if (this.firstInnings) {
   cloned.firstInnings = cloneInnings(this.firstInnings);
  }
  if (this.secondInnings) {
   cloned.secondInnings = cloneInnings(this.secondInnings);
  }

  cloned.events = [...this.events];
  cloned.snapshots = [...this.snapshots];

  return cloned;
 }

 /**
  * Deterministically reconstructs an authoritative EventSourcedMatchEngine from an event sequence.
  */
 public static fromEvents(events: DomainEvent[]): EventSourcedMatchEngine {
 if (!events || events.length === 0) {
  throw new Error('Cannot reconstruct match: event sequence is empty.');
 }

 const createdEvent = events.find((e) => e.type === 'MATCH_CREATED');
 if (!createdEvent) {
  throw new Error('Cannot reconstruct match: MATCH_CREATED event is missing.');
 }

 const p = createdEvent.payload;
 const chaseEvent = events.find((e) => e.type === 'INNINGS_STARTED' && e.payload?.isChaseMode);

 let engine: EventSourcedMatchEngine;

 if (chaseEvent) {
  engine = EventSourcedMatchEngine.createChaseMatch({
   id: createdEvent.matchId || p.id,
   chasingTeam: chaseEvent.payload.battingTeam || p.teamA,
   defendingTeam: chaseEvent.payload.defendingTeam || p.teamB,
   targetScore: chaseEvent.payload.targetScore || 100,
   totalOvers: chaseEvent.payload.totalOvers || p.totalOvers,
   strikerName: chaseEvent.payload.strikerName || p.strikerName,
   nonStrikerName: chaseEvent.payload.nonStrikerName || p.nonStrikerName,
   bowlerName: chaseEvent.payload.bowlerName || p.bowlerName,
   venue: p.venue,
   groundId: chaseEvent.payload.groundId || p.groundId,
   location: chaseEvent.payload.location || p.location,
   advancedSettings: p.advancedSettings,
  });
  engine.events = [];
  engine.snapshots = [];
 } else {
  engine = new EventSourcedMatchEngine({
   id: createdEvent.matchId || p.id,
   teamA: p.teamA,
   teamB: p.teamB,
   tossWinner: p.tossWinner,
   tossDecision: p.tossDecision,
   totalOvers: p.totalOvers,
   advancedSettings: p.advancedSettings,
   strikerName: p.strikerName,
   nonStrikerName: p.nonStrikerName,
   bowlerName: p.bowlerName,
   venue: p.venue,
   groundId: p.groundId,
   location: p.location,
  });
  engine.events = [];
  engine.snapshots = [];
 }

 for (const ev of events) {
  if (ev.type === 'MATCH_CREATED') {
   engine.events.push(ev);
   continue;
  }

  if (ev.type === 'INNINGS_STARTED') {
   if (!chaseEvent && ev.payload.inningsNumber === 2 && engine.currentInningsNumber === 1) {
    engine.startSecondInnings(
     ev.payload.strikerName,
     ev.payload.nonStrikerName,
     ev.payload.bowlerName
    );
   }
   engine.events.push(ev);
   continue;
  }

  if (ev.type === 'BALL_SCORED') {
   const input: BallInput = ev.payload.ballInput || {
    runsScored: ev.payload.runsScored,
    isWide: ev.payload.isWide,
    isNoBall: ev.payload.isNoBall,
    isByes: ev.payload.isByes,
    isLegByes: ev.payload.isLegByes,
    isWicket: ev.payload.isWicket,
    dismissalType: ev.payload.dismissalType,
    fielderName: ev.payload.fielderName,
    newBatsmanName: ev.payload.newBatsmanName,
    isStrikerOut: ev.payload.isStrikerOut,
   };

   if (ev.payload.inningsNumber && ev.payload.inningsNumber !== engine.currentInningsNumber) {
    if (ev.payload.inningsNumber === 2 && engine.currentInningsNumber === 1) {
     engine.startSecondInnings();
    }
   }

   engine.scoreBall(input);
   continue;
  }

  if (ev.type === 'BOWLER_CHANGED') {
   engine.changeBowler(ev.payload.bowlerName);
   continue;
  }

  if (ev.type === 'STRIKE_SWAPPED') {
   engine.swapStrike(true);
   continue;
  }

  if (ev.type === 'BATTER_RETIRED') {
   engine.retirePlayer(ev.payload.isStriker ?? true, ev.payload.type);
   continue;
  }

  if (ev.type === 'PENALTY_AWARDED') {
   engine.awardPenaltyRuns(ev.payload.runs, ev.payload.awardedToBattingTeam, ev.payload.reason);
   continue;
  }

  if (ev.type === 'MATCH_COMPLETED') {
   engine.completeMatch();
   continue;
  }

  engine.events.push(ev);
 }

 return engine;
 }

 /**
  * Historical Ball Editing Engine:
  * Edits a historic delivery and completely replays the entire match deterministically,
  * recalculating totals, wickets, overs, batter/bowler figures, fall of wickets, and awards.
  */
 public editHistoricalBall(
  ballIndex: number,
  inningsNumber: number,
  updatedInput: BallInput
 ): boolean {
  if (inningsNumber !== 1 && inningsNumber !== 2) return false;

  const ballEvents = this.events.filter(
   (e) => e.type === 'BALL_SCORED' && ((e.payload.inningsNumber ?? 1) === inningsNumber)
  );

  if (ballIndex < 0 || ballIndex >= ballEvents.length) {
   return false;
  }

  this.saveSnapshot();

  const targetEvent = ballEvents[ballIndex];
  const normalizedInput: BallInput = {
   runsScored: updatedInput.runsScored,
   isWide: updatedInput.isWide ?? false,
   isNoBall: updatedInput.isNoBall ?? false,
   isByes: updatedInput.isByes ?? false,
   isLegByes: updatedInput.isLegByes ?? false,
   isWicket: updatedInput.isWicket ?? false,
   dismissalType: updatedInput.dismissalType,
   fielderName: updatedInput.fielderName,
   newBatsmanName: updatedInput.newBatsmanName,
   isStrikerOut: updatedInput.isStrikerOut ?? true,
  };

  targetEvent.payload.ballInput = normalizedInput;
  targetEvent.payload.runsScored = normalizedInput.runsScored;
  targetEvent.payload.isWide = normalizedInput.isWide;
  targetEvent.payload.isNoBall = normalizedInput.isNoBall;
  targetEvent.payload.isByes = normalizedInput.isByes;
  targetEvent.payload.isLegByes = normalizedInput.isLegByes;
  targetEvent.payload.isWicket = normalizedInput.isWicket;
  targetEvent.payload.dismissalType = normalizedInput.dismissalType;
  targetEvent.payload.fielderName = normalizedInput.fielderName;
  targetEvent.payload.newBatsmanName = normalizedInput.newBatsmanName;
  targetEvent.payload.isStrikerOut = normalizedInput.isStrikerOut;

  // Deterministically replay the entire match from the modified event sequence
  const replayed = EventSourcedMatchEngine.fromEvents(this.events);

  this.firstInnings = replayed.firstInnings;
  this.secondInnings = replayed.secondInnings;
  this.currentInningsNumber = replayed.currentInningsNumber;
  this.targetScore = replayed.targetScore;
  this.status = replayed.status;
  this.snapshots = replayed.snapshots;
  this.updatedAt = new Date().toISOString();

  if (this.isMatchCompleted) {
   const outcome = this.calculateResult();
   this.toScorecard(outcome.winner, outcome.resultText, outcome.loser, outcome.resultType);
  }

  this.emitEvent('BALL_EDITED', {
   inningsNumber,
   ballIndex,
   updatedInput: normalizedInput,
  });

  return true;
 }
}

export {
  type MatchEngineMetadata,
  getEngineMetadata,
  getEngineVersion,
  getEngineVersionDisplay,
  getEngineNavigationLabel,
  setEngineMetadata,
  resetEngineMetadata,
  isValidEngineVersion,
};

