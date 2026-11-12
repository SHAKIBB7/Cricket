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
 type BowlingLimitMode,
 MatchResultType,
 MatchResultDetails,
 MatchLocationMetadata,
 BallInput,
 BattingHand,
} from '../types';

export type { BallInput } from '../types';
import { BowlingLimiter } from '../bowling-limiter/BowlingLimiter';
import {
  isBowlerCredited,
  isAllowedOnFreeHit,
  isAllowedOnNoBall,
  isAllowedOnWide,
  isRetiredHurtFallOfWicket,
} from '../dismissals';
import {
 oversString,
 getBattingPosition,
 cleanPlayerName,
} from '../formatters';
import { ManOfTheMatchEngine } from '../analytics/ManOfTheMatchEngine';
import { bowlerMatchupKey } from '../analytics/bowlerMatchup';
import { isRetiredHurt } from '../battingCard';
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
import { DlsEngine, DlsCalculationResult } from '../dls/DlsEngine';
import { normalizeSquadPlayers } from '../../teams/playerIdentity';

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
 /** F4-A: spectator visibility. Default true (Public Match Center). */
 public isPublic: boolean;
 public groundId?: string;
 public location?: MatchLocationMetadata;
 public createdAt: string;
 public updatedAt: string;

 public firstInnings: InningsData;
 public secondInnings?: InningsData;

 public events: DomainEvent[] = [];
 public snapshots: string[] = []; // JSON snapshots for instant undo
 public maxSnapshots = 60;
 // Correctness audit finding 5 (2026-11-11): monotonic event
 // version source. Never derived from events.length (which
 // shrinks on undo) and never decremented.
 private eventVersionCounter = 0;

  get maxOversPerBowler(): number {
    // Audit fix L8: delegate to the same BowlingLimiter-based
    // computation enforcement uses. The old formula ignored the
    // limiter modes entirely (e.g. a 6-over match reported 2 while
    // enforcement allowed 4 under the under-10 default rule).
    return this.getMaxBowlerLimit();
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
 strikerHand?: BattingHand;
 nonStrikerHand?: BattingHand;
 venue?: string;
 isPublic?: boolean;
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
 // Bug hunt C-9: teamA/teamB are trimmed above but tossWinner was
 // stored raw, so a legacy/imported record whose toss winner
 // differs only in case or padding failed the strict-equality
 // batting-first decision below and silently batted the wrong
 // side first. Normalise: trim, then snap to the canonical
 // (trimmed) team name on a case-insensitive match.
 const rawTossWinner = (config.tossWinner || '').trim();
 this.tossWinner =
  this.teamA && rawTossWinner.toLowerCase() === this.teamA.toLowerCase()
   ? this.teamA
   : this.teamB && rawTossWinner.toLowerCase() === this.teamB.toLowerCase()
    ? this.teamB
    : rawTossWinner;
 this.tossDecision = (config.tossDecision as TossDecision) || 'Batting';
 this.totalOvers = config.advancedSettings?.isSuperOver ? 1 : Math.max(1, config.totalOvers || 6);
 this.venue = config.venue || '';
 this.isPublic = config.isPublic ?? true;
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
  originalTotalOvers: config.advancedSettings?.originalTotalOvers || this.totalOvers,
  ...config.advancedSettings,
  bowlingLimitMode: effectiveBowlingMode,
  maxOversPerBowler: effectiveMaxOvers,
 };

 // F9-β3: squads may arrive as legacy name strings (stored scorecards,
 // old setup payloads) — normalise to TeamPlayer[] once, here, so every
 // engine path (constructor, chase, fromScorecard) sees objects.
 if (this.advancedSettings.teamASquad) {
  this.advancedSettings.teamASquad = normalizeSquadPlayers(this.advancedSettings.teamASquad);
 }
 if (this.advancedSettings.teamBSquad) {
  this.advancedSettings.teamBSquad = normalizeSquadPlayers(this.advancedSettings.teamBSquad);
 }

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
      config.bowlerName,
      config.strikerHand,
      config.nonStrikerHand
    );
  }

  if (config.secondInnings) {
    this.secondInnings = JSON.parse(JSON.stringify(config.secondInnings));
  }

  if (Array.isArray(config.events) && config.events.length > 0) {
    this.events = [...config.events];
    // Seed the monotonic counter past every restored version
    // so new events can never reuse one (finding 5).
    this.eventVersionCounter = this.events.reduce(
      (max, e) => Math.max(max, e.version || 0),
      0
    );
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
      strikerHand: config.strikerHand,
      nonStrikerHand: config.nonStrikerHand,
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
 strikerHand?: BattingHand;
 nonStrikerHand?: BattingHand;
 venue?: string;
 isPublic?: boolean;
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
 isPublic: config.isPublic,
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
 config.bowlerName,
 config.strikerHand,
 config.nonStrikerHand
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
  strikerHand: config.strikerHand,
  nonStrikerHand: config.nonStrikerHand,
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
   groundId: parent.advancedSettings?.groundId || (parent as unknown as { groundId?: string }).groundId,
   advancedSettings: {
    ...parent.advancedSettings,
    // A Super Over is a brand-new match: it must not inherit the parent
    // match's DLS state, or DLS TARGET/PAR appears without any application.
    dlsApplied: false,
    dlsRevisedTarget: undefined,
    dlsRevisedOvers: undefined,
    dlsParScore: undefined,
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

 /**
  * F9-β3: resolve a person's stable saved-team id from this match's
  * squad for `team`. Returns undefined for guests, free-typed names
  * and legacy squads (empty ids) — playerId is simply not stamped.
  */
 public squadPlayerId(team: string, personName: string): string | undefined {
  const squad =
   team === this.teamA
    ? this.advancedSettings?.teamASquad
    : team === this.teamB
      ? this.advancedSettings?.teamBSquad
      : undefined;
  if (!squad || !personName?.trim()) return undefined;
  const key = cleanPlayerName(personName).toLowerCase();
  const hit = squad.find((p) => p && cleanPlayerName(p.name).toLowerCase() === key);
  return hit?.id ? hit.id : undefined;
 }

 public createEmptyInnings(
 inningsNumber: number,
 battingTeam: string,
 bowlingTeam: string,
 strikerName?: string,
 nonStrikerName?: string,
 bowlerName?: string,
 strikerHand?: BattingHand,
 nonStrikerHand?: BattingHand
): InningsData {
 const totalPlayers = this.maxPlayers;
 const players: Player[] = [];

 for (let i = 0; i < totalPlayers; i++) {
 const openerName =
  i === 0 ? strikerName?.trim() || 'Batter 1' : i === 1 ? nonStrikerName?.trim() || 'Batter 2' : '';
 players.push({
 id: `p_${inningsNumber}_${i + 1}`,
 playerId: i < 2 ? this.squadPlayerId(battingTeam, openerName) : undefined,
 name: openerName,
 battingHand:
  i === 0 ? strikerHand || 'Right-hand Batsman' : i === 1 ? nonStrikerHand || 'Right-hand Batsman' : 'Right-hand Batsman',
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
 playerId: this.squadPlayerId(bowlingTeam, bowlerName?.trim() || 'Bowler 1'),
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
 // totalOvers + advancedSettings carry DLS state (dlsApplied, revised
 // target/overs). Omitting them made undo restore a hybrid state:
 // pre-DLS targetScore with reduced overs and dlsApplied still true.
 totalOvers: this.totalOvers,
 advancedSettings: this.advancedSettings,
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
   // Older snapshots (pre-fix) may not carry these fields; only restore
   // them when present so legacy snapshot strings keep working.
   if (data.totalOvers !== undefined) this.totalOvers = data.totalOvers;
   if (data.advancedSettings !== undefined) this.advancedSettings = data.advancedSettings;
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
  const replayed = EventSourcedMatchEngine.fromEvents(
   EventSourcedMatchEngine.withBackfilledOpenerHands(eventsToReplay, this)
  );
  this.firstInnings = replayed.firstInnings;
  this.secondInnings = replayed.secondInnings;
  this.currentInningsNumber = replayed.currentInningsNumber;
  this.targetScore = replayed.targetScore;
  this.status = replayed.status;
  this.totalOvers = replayed.totalOvers;
  this.advancedSettings = replayed.advancedSettings;
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
   t === 'BATTER_RESUMED' ||
   t === 'PENALTY_AWARDED' ||
   // Audit fix L1: these actions now take snapshots (applyDlsTarget,
   // resetDls, renamePlayer), so undo must prune THEIR events too —
   // otherwise the snapshot restore and the log diverge.
   t === 'DLS_TARGET_APPLIED' ||
   t === 'DLS_RESET' ||
   t === 'PLAYER_RENAMED'
  ) {
   return i;
  }
 }
 return -1;
 }

 private emitEvent(type: DomainEvent['type'], payload: any): DomainEvent {
 // Correctness audit finding 5 (2026-11-11): version and id
 // used to derive from the MUTABLE events.length. undo()
 // splices the last actionable event out, so the next emitted
 // event reused the removed event's version — ambiguous for
 // the version-sorted store reads — and, when the undo and
 // the next ball landed in the same millisecond, its exact
 // eventId: match_events' primary key is eventId, so the
 // bulkPut silently overwrote a stored event. The version now
 // comes from a monotonic counter undo never decrements, and
 // the id gains a random suffix (the sync op id pattern).
 const version = ++this.eventVersionCounter;
 const event: DomainEvent = {
 eventId: `ev_${Date.now()}_${version}_${Math.random().toString(36).substring(2, 8)}`,
 matchId: this.id,
 version,
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
   // F9-β3: backfill identity for records created before threading.
   if (!inn.bowlers[existingIdx].playerId) {
    inn.bowlers[existingIdx].playerId = this.squadPlayerId(inn.bowlingTeam, formatted);
   }
  } else {
   inn.bowlers.push({
    id: `b_${inn.inningsNumber}_${inn.bowlers.length + 1}`,
    playerId: this.squadPlayerId(inn.bowlingTeam, formatted),
    name: formatted,
    ballsBowled: 0,
    maidens: 0,
    runs: 0,
    wickets: 0,
    overHistory: [],
   });
   inn.currentBowlerIdx = inn.bowlers.length - 1;
  }

  // Only reset the over log at an over boundary. Clearing it mid-over
  // (e.g. an injury change) corrupted three things at once: the recent-balls
  // display, the maiden calculation (which reads the completed log), and
  // the historical-ball edit index mapping.
  if (inn.isOverComplete || inn.totalBalls % 6 === 0) {
   inn.thisOverLog = [];
  }
  inn.isOverComplete = false;
  this.updatedAt = new Date().toISOString();

  this.emitEvent('BOWLER_CHANGED', { bowlerName: formatted });
  return { success: true };
 }

 /**
  * Renames a batsman or bowler by ID or current name while preserving all statistics,
  * ID, ball records, and match state.
  */
 public renamePlayer(
  playerIdOrName: string,
  newName: string
 ): { success: boolean; error?: string; oldName?: string; newName?: string } {
  const trimmed = cleanPlayerName(newName).trim().replace(/\s+/g, ' ');
  if (!trimmed) {
   return { success: false, error: 'Player name cannot be empty.' };
  }
  if (trimmed.length > 50) {
   return { success: false, error: 'Player name cannot exceed 50 characters.' };
  }
  if (!/[a-zA-Z0-9\u0980-\u09FF]/.test(trimmed)) {
   return { success: false, error: 'Player name must contain valid letters or numbers.' };
  }

  const searchKey = playerIdOrName.trim();
  let found = false;
  let oldName = '';

  const inningsList = [this.firstInnings, this.secondInnings].filter(Boolean) as InningsData[];

  // Audit fix L1: snapshot before mutating so undo() restores the
  // pre-rename state and prunes PLAYER_RENAMED (see applyDlsTarget).
  // Existence is pre-scanned with the same match predicates the
  // mutation loop below uses, so a failed rename takes no snapshot.
  const exists = inningsList.some(
   (inn) =>
    inn.players.some(
     (p) =>
      p.id === searchKey ||
      cleanPlayerName(p.name).toLowerCase() === cleanPlayerName(searchKey).toLowerCase()
    ) ||
    inn.bowlers.some(
     (b) =>
      b.id === searchKey ||
      cleanPlayerName(b.name).toLowerCase() === cleanPlayerName(searchKey).toLowerCase()
    )
  );
  if (!exists) {
   return { success: false, error: `Player with identifier "${playerIdOrName}" was not found.` };
  }
  this.saveSnapshot();

  for (const inn of inningsList) {
   // 1. Check players (batters)
   const batter = inn.players.find(
    (p) =>
     p.id === searchKey ||
     cleanPlayerName(p.name).toLowerCase() === cleanPlayerName(searchKey).toLowerCase()
   );

   if (batter) {
    found = true;
    oldName = cleanPlayerName(batter.name);
    batter.name = batter.isDismissed && batter.dismissalText
     ? `${trimmed} (${batter.dismissalText})`
     : trimmed;

    // Update current partnership
    if (cleanPlayerName(inn.currentPartnership.batter1).toLowerCase() === cleanPlayerName(oldName).toLowerCase()) {
     inn.currentPartnership.batter1 = trimmed;
    }
    if (cleanPlayerName(inn.currentPartnership.batter2).toLowerCase() === cleanPlayerName(oldName).toLowerCase()) {
     inn.currentPartnership.batter2 = trimmed;
    }

    // Update past partnerships
    for (const p of inn.pastPartnerships) {
     if (cleanPlayerName(p.batter1).toLowerCase() === cleanPlayerName(oldName).toLowerCase()) {
      p.batter1 = trimmed;
     }
     if (cleanPlayerName(p.batter2).toLowerCase() === cleanPlayerName(oldName).toLowerCase()) {
      p.batter2 = trimmed;
     }
    }

    // Update fall of wickets
    for (const f of inn.fallOfWickets) {
     if (cleanPlayerName(f.player).toLowerCase() === cleanPlayerName(oldName).toLowerCase()) {
      f.player = trimmed;
     }
    }
   }

   // 2. Check bowlers
   const bowler = inn.bowlers.find(
    (b) =>
     b.id === searchKey ||
     cleanPlayerName(b.name).toLowerCase() === cleanPlayerName(searchKey).toLowerCase()
   );

   if (bowler) {
    found = true;
    oldName = cleanPlayerName(bowler.name);
    bowler.name = trimmed;

    // Update fall of wickets where this bowler took the wicket
    for (const f of inn.fallOfWickets) {
     if (f.bowler && cleanPlayerName(f.bowler).toLowerCase() === cleanPlayerName(oldName).toLowerCase()) {
      f.bowler = trimmed;
     }
     if (f.dismissal && f.dismissal.includes(oldName)) {
      f.dismissal = f.dismissal.replaceAll(oldName, trimmed);
     }
    }

    // Update batter head-to-head records. Only NAME-keyed entries move:
    // L3 id-keyed entries (pl_…) follow the person across this rename
    // by design and must not be re-keyed.
    for (const p of inn.players) {
     if (p.bowler && cleanPlayerName(p.bowler).toLowerCase() === cleanPlayerName(oldName).toLowerCase()) {
      p.bowler = trimmed;
     }
     if (p.bowlersFaced && p.bowlersFaced[oldName] !== undefined) {
      p.bowlersFaced[trimmed] = (p.bowlersFaced[trimmed] || 0) + p.bowlersFaced[oldName];
      delete p.bowlersFaced[oldName];
     }
     if (p.runsVsBowler && p.runsVsBowler[oldName] !== undefined) {
      p.runsVsBowler[trimmed] = (p.runsVsBowler[trimmed] || 0) + p.runsVsBowler[oldName];
      delete p.runsVsBowler[oldName];
     }
    }
   }
  }

  if (!found) {
   return { success: false, error: `Player with identifier "${playerIdOrName}" was not found.` };
  }

  // Update historic events payloads to maintain consistency
  for (const ev of this.events) {
   if (ev.payload?.bowler && cleanPlayerName(ev.payload.bowler).toLowerCase() === cleanPlayerName(oldName).toLowerCase()) {
    ev.payload.bowler = trimmed;
   }
   if (ev.payload?.batsman && cleanPlayerName(ev.payload.batsman).toLowerCase() === cleanPlayerName(oldName).toLowerCase()) {
    ev.payload.batsman = trimmed;
   }
   if (ev.payload?.striker && cleanPlayerName(ev.payload.striker).toLowerCase() === cleanPlayerName(oldName).toLowerCase()) {
    ev.payload.striker = trimmed;
   }
   if (ev.payload?.nonStriker && cleanPlayerName(ev.payload.nonStriker).toLowerCase() === cleanPlayerName(oldName).toLowerCase()) {
    ev.payload.nonStriker = trimmed;
   }
   if (ev.payload?.strikerName && cleanPlayerName(ev.payload.strikerName).toLowerCase() === cleanPlayerName(oldName).toLowerCase()) {
    ev.payload.strikerName = trimmed;
   }
   if (ev.payload?.nonStrikerName && cleanPlayerName(ev.payload.nonStrikerName).toLowerCase() === cleanPlayerName(oldName).toLowerCase()) {
    ev.payload.nonStrikerName = trimmed;
   }
   if (ev.payload?.bowlerName && cleanPlayerName(ev.payload.bowlerName).toLowerCase() === cleanPlayerName(oldName).toLowerCase()) {
    ev.payload.bowlerName = trimmed;
   }
   if (ev.payload?.ballInput) {
    if (ev.payload.ballInput.fielderName && cleanPlayerName(ev.payload.ballInput.fielderName).toLowerCase() === cleanPlayerName(oldName).toLowerCase()) {
     ev.payload.ballInput.fielderName = trimmed;
    }
    if (ev.payload.ballInput.newBatsmanName && cleanPlayerName(ev.payload.ballInput.newBatsmanName).toLowerCase() === cleanPlayerName(oldName).toLowerCase()) {
     ev.payload.ballInput.newBatsmanName = trimmed;
    }
   }
  }

  this.updatedAt = new Date().toISOString();
  this.emitEvent('PLAYER_RENAMED', {
   playerId: searchKey,
   oldName,
   newName: trimmed,
  });

  return { success: true, oldName, newName: trimmed };
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
 playerId: retiredPlayer.id,
 dismissalType: type,
 dismissal: `${retiredPlayer.name} (${type})`,
 });

 inn.pastPartnerships.push({
 batter1: inn.players[inn.strikerIdx].name,
 batter2: inn.players[inn.nonStrikerIdx].name,
 runs: inn.currentPartnership.runs,
 balls: inn.currentPartnership.balls,
 });

 // Retired Hurt is NOT a dismissal under the Laws (the batter may
 // resume later); only Retired Out counts as out. Recording hurt as
 // dismissed corrupted batting averages, did-not-bat lists and the
 // player's status on every card (Ultimate audit F1).
 retiredPlayer.isDismissed = isRetireOut;
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
 this.emitEvent('BATTER_RETIRED', { player: retiredPlayer.name, type, isStriker });
 return true;
 }

 /**
  * L4: finds a retired-hurt batter in this innings by positional id
  * or cleaned name (the stored name carries the "(Retire Hurt)"
  * suffix). Players at the crease are never candidates.
  */
 private findRetiredHurtIndex(inn: InningsData, nameOrId: string): number {
 const clean = cleanPlayerName(nameOrId).toLowerCase();
 return inn.players.findIndex(
  (p, i) =>
  i !== inn.strikerIdx &&
  i !== inn.nonStrikerIdx &&
  isRetiredHurt(p) &&
  (p.id === nameOrId || cleanPlayerName(p.name).toLowerCase() === clean)
 );
 }

 /** Restores a retired-hurt record to an in-progress batter. */
 private applyResumption(inn: InningsData, idx: number): void {
 const p = inn.players[idx];
 p.name = cleanPlayerName(p.name);
 p.dismissalType = undefined;
 p.dismissalText = undefined;
 }

 /**
  * L4: can a retired-hurt batter resume at this crease end right
  * now? Only when the slot's occupant is the fresh placeholder the
  * engine placed for the wicket (or retirement) that has just
  * fallen — the post-wicket batter-selector situation.
  */
 public canResumeRetiredBatter(isStriker: boolean): boolean {
 const inn = this.currentInnings;
 const creaseIdx = isStriker ? inn.strikerIdx : inn.nonStrikerIdx;
 const occupant = inn.players[creaseIdx];
 return (
  creaseIdx === inn.nextPlayerIdx - 1 &&
  !!occupant &&
  !occupant.isDismissed &&
  !occupant.dismissalType &&
  (occupant.balls ?? 0) === 0 &&
  (occupant.runs ?? 0) === 0
 );
 }

 /**
  * L4: resumes a retired-hurt batter at a crease slot (the selector
  * flow: the wicket ball was already scored with a placeholder).
  * The resumed record keeps its original slot, runs and balls; the
  * placeholder slot becomes the next unused slot again, so no record
  * is created, moved or renamed. Refuses when the slot's occupant
  * has already batted.
  */
 public resumeRetiredBatter(
 nameOrId: string,
 isStriker: boolean
 ): { success: boolean; error?: string } {
 const inn = this.currentInnings;
 const resumeIdx = this.findRetiredHurtIndex(inn, nameOrId);
 if (resumeIdx < 0) {
  return { success: false, error: 'No retired-hurt batter found by that name.' };
 }
 if (!this.canResumeRetiredBatter(isStriker)) {
  return {
   success: false,
   error: 'A retired-hurt batter can resume only when a wicket has just fallen.',
  };
 }

 this.saveSnapshot();
 const creaseIdx = isStriker ? inn.strikerIdx : inn.nonStrikerIdx;
 inn.nextPlayerIdx = creaseIdx;
 this.applyResumption(inn, resumeIdx);
 if (isStriker) {
  inn.strikerIdx = resumeIdx;
 } else {
  inn.nonStrikerIdx = resumeIdx;
 }
 inn.currentPartnership.batter1 = inn.players[inn.strikerIdx].name;
 inn.currentPartnership.batter2 = inn.players[inn.nonStrikerIdx].name;
 this.updatedAt = new Date().toISOString();
 this.emitEvent('BATTER_RESUMED', {
  player: inn.players[resumeIdx].name,
  playerId: inn.players[resumeIdx].id,
  isStriker,
 });
 return { success: true };
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
 // Bug hunt C-2: penalty runs awarded AGAINST the batting side
 // are runs for the OTHER team (they are credited to the
 // opposing side's total). penaltyRunsAgainst stays as the
 // audit record on this innings; the credit itself must land
 // in a total — previously it reached nothing at all.
 inn.penaltyRunsAgainst += runs;
 if (this.currentInningsNumber === 2) {
  // The opposing side's innings already exists (it batted
  // first): credit it retroactively, as real scorecards record
  // it, and lift the target by the same amount — targetScore
  // was fixed at the innings break and calculateResult prefers
  // it over firstInnings.totalRuns + 1.
  this.firstInnings.totalRuns += runs;
  this.firstInnings.penaltyRuns += runs;
  if (this.targetScore > 0) {
   this.targetScore += runs;
  }
 }
 // In innings 1 the opposing innings does not exist yet:
 // startSecondInnings credits the new innings from
 // firstInnings.penaltyRunsAgainst when it is created. That
 // field is scorecard-persisted and snapshot-restored, so the
 // deferred credit survives save/resume and event replay
 // (PENALTY_AWARDED precedes INNINGS_STARTED in the log).
 }

 inn.thisOverLog.push(entry);
 this.updatedAt = new Date().toISOString();
 this.emitEvent('PENALTY_AWARDED', { runs, awardedToBattingTeam, reason });
 }

 /**
 * Main Scoring Function — Executes ball delivery rules with total fidelity
 */
 public scoreBall(input: BallInput): 'bowler-limit' | undefined {
  if (this.isInningsOver || this.currentInnings.isOverComplete) return undefined;

  const currentInn = this.currentInnings;
  if (currentInn.currentBowlerIdx >= 0 && currentInn.currentBowlerIdx < currentInn.bowlers.length) {
   const currentBowler = currentInn.bowlers[currentInn.currentBowlerIdx];
   if (Math.floor(currentBowler.ballsBowled / 6) >= this.getMaxBowlerLimit()) {
    // Bug hunt C-5: this used to be a silent return. After a
    // mid-innings DLS overs reduction the per-bowler limit can
    // drop onto the bowler mid-spell, and every keypad tap then
    // did nothing with no explanation — the scorer sees a frozen
    // app. Signal the caller so the UI can say why and ask for
    // a bowler change. (Callers that ignore the result behave
    // exactly as before.)
    return 'bowler-limit';
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
 // Audit fix L3: a wide NEVER consumes the free hit under ICC playing
 // conditions — even when the non-standard wideReball:false setting
 // makes the wide count as a bowled ball for over purposes, the free
 // hit carries to the next delivery.
 if (isNoBall && this.advancedSettings.noBall) {
 inn.isFreeHit = true;
 } else if (isLegalBall && !isWide && !isNoBall && inn.isFreeHit) {
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

 // L3: matchup maps are keyed by the bowler's stable playerId when
 // the bowler carries one, falling back to the name (guests, legacy).
 // Readers (bowlerMatchup.ts) understand both key shapes.
 const matchupKey = bowlerMatchupKey(inn.bowlers[inn.currentBowlerIdx]);
 inn.players[inn.strikerIdx].bowlersFaced[matchupKey] =
 (inn.players[inn.strikerIdx].bowlersFaced[matchupKey] || 0) + 1;

 if (!isByes && !isLegByes) {
 inn.players[inn.strikerIdx].runsVsBowler[matchupKey] =
 (inn.players[inn.strikerIdx].runsVsBowler[matchupKey] || 0) + runsScored;
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

  const isCreditToBowler = !dismissalType || isBowlerCredited(dismissalType);
 inn.fallOfWickets.push({
 score: inn.totalRuns,
 wicket: inn.totalWickets + 1,
 over: oversString(inn.totalBalls),
 player: dismissedPlayer.name,
 playerId: dismissedPlayer.id,
 dismissalType,
 dismissal: dismissalText,
 fielder: fielder || undefined,
 bowler: isCreditToBowler ? inn.bowlers[inn.currentBowlerIdx]?.name : undefined,
 bowlerId: isCreditToBowler ? inn.bowlers[inn.currentBowlerIdx]?.id : undefined,
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
   // Encode completed runs (e.g. a run out after 2 runs) so the maiden
   // check can see them; a bare 'W' made those runs vanish from the log.
   inn.thisOverLog.push(runsScored > 0 ? `${runsScored}+W` : 'W');
  }

 // Bowler credit: Bowled, Caught, LBW, Stumped, Hit Wicket
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
 if (inn.totalWickets < this.maxWickets) {
  // L4: if the named incoming batter is a retired-hurt player from
  // this innings, resume THAT record (runs and balls intact) instead
  // of consuming a fresh slot, which would split his innings across
  // two records. Deterministic from state + name, so event replay
  // reproduces it exactly.
  const resumeIdx = newBatsmanName ? this.findRetiredHurtIndex(inn, newBatsmanName) : -1;
  if (resumeIdx >= 0) {
   this.applyResumption(inn, resumeIdx);
   if (isStrikerOut) {
   inn.strikerIdx = resumeIdx;
   } else {
   inn.nonStrikerIdx = resumeIdx;
   }
  } else if (inn.nextPlayerIdx < inn.players.length) {
  const defaultIncomingName = inn.players[inn.nextPlayerIdx]?.name?.trim() || `Batter ${inn.nextPlayerIdx + 1}`;
  const incomingName = newBatsmanName?.trim() || defaultIncomingName;
  inn.players[inn.nextPlayerIdx] = {
   ...inn.players[inn.nextPlayerIdx],
   name: incomingName,
   // F9-β3: stamp the stable identity when the incoming batter is a
   // squad member; free-typed names keep no playerId.
   playerId: this.squadPlayerId(inn.team, incomingName),
  };

 if (isStrikerOut) {
 inn.strikerIdx = inn.nextPlayerIdx;
 } else {
 inn.nonStrikerIdx = inn.nextPlayerIdx;
 }
 inn.nextPlayerIdx++;
  }
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

 /**
  * Total RUNS SCORED in an over, parsed from its log — used only for the
  * maiden check (a maiden is a scoreless over). This is deliberately NOT
  * "runs charged to the bowler": byes and leg-byes are not charged to the
  * bowler's figures, but they ARE runs, so they break a maiden. Completed
  * runs on a run out (encoded as `${runs}+W`) count for the same reason.
  * Penalty entries (`+5P`/`-5P`) are team penalties, not runs scored off
  * the over, so they do not affect the maiden.
  */
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
 } else if (ball.startsWith('LB') || ball.startsWith('B')) {
 // Byes / leg-byes: 'B2', 'LB1', 'B+2+W', 'LB+W' — extract the run count.
 const m = ball.match(/^[A-Z]+[+]?(\d+)?/);
 total += m && m[1] ? parseInt(m[1], 10) : 0;
 } else {
 // Plain runs ('0'..'6') and run-out-with-runs entries ('2+W'):
 // parseInt reads the leading number in both cases.
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

 // Invariant 3: Wickets count consistency. Retired-hurt departures
 // also leave a fall-of-wicket entry but are NOT dismissals (F1), so
 // only genuine dismissal entries may be compared against
 // totalWickets — counting all entries false-positives on exactly
 // the innings F1/L4 made legal (audit fix L5).
 const dismissalFowCount = inn.fallOfWickets.filter(
  (f) => !isRetiredHurtFallOfWicket(f)
 ).length;
 if (dismissalFowCount > inn.totalWickets) {
  errors.push(
   `Wickets invariant violated: dismissal fallOfWickets (${dismissalFowCount}) > totalWickets (${inn.totalWickets})`
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
 bowlerName?: string,
 strikerHand?: BattingHand,
 nonStrikerHand?: BattingHand
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
 bowlerName,
 strikerHand,
 nonStrikerHand
 );

 // Bug hunt C-2: penalty runs awarded against the first-innings
 // batting side belong to THIS innings' team — credit them now
 // that the innings exists (see awardPenaltyRuns).
 const deferredPenalty = this.firstInnings.penaltyRunsAgainst || 0;
 if (deferredPenalty > 0) {
  this.secondInnings.penaltyRuns += deferredPenalty;
  this.secondInnings.totalRuns += deferredPenalty;
 }

 this.emitEvent('INNINGS_STARTED', {
 inningsNumber: 2,
 battingTeam: this.secondInnings.team,
 targetScore: this.targetScore,
 strikerName,
 nonStrikerName,
 bowlerName,
 strikerHand,
 nonStrikerHand,
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

 // Audit fix M5: a match CONCLUDED on DLS par score (rain abandonment
 // via concludeMatchWithDls) records its outcome in
 // advancedSettings.dlsParScore. Honour that record here so the
 // result is reproducible from state alone — critically after an
 // event replay, where the chase is still mid-innings and the
 // generic branches below would report IN_PROGRESS or measure
 // against the unrevised target. dlsParScore is set ONLY by
 // concludeMatchWithDls (applyDlsTarget never sets it, resetDls
 // clears it), so naturally completed DLS-target matches are
 // unaffected and keep flowing through the branches below.
 if (
  this.status === 'COMPLETED' &&
  isDls &&
  typeof this.advancedSettings?.dlsParScore === 'number'
 ) {
  const dlsPar = this.advancedSettings.dlsParScore;
  if (inn2Runs > dlsPar) {
   const margin = inn2Runs - dlsPar;
   return {
    isCompleted: true,
    resultType: 'WIN',
    winner: team2,
    loser: team1,
    marginType: 'RUNS',
    margin,
    resultText: `${team2} won by ${margin} run${margin === 1 ? '' : 's'} (DLS Method)`,
   };
  }
  if (inn2Runs < dlsPar) {
   const margin = dlsPar - inn2Runs;
   return {
    isCompleted: true,
    resultType: 'WIN',
    winner: team1,
    loser: team2,
    marginType: 'RUNS',
    margin,
    resultText: `${team1} won by ${margin} run${margin === 1 ? '' : 's'} (DLS Method)`,
   };
  }
  return {
   isCompleted: true,
   resultType: 'TIE',
   winner: undefined,
   loser: undefined,
   marginType: 'NONE',
   margin: 0,
   resultText: 'Match Tied (DLS Method)',
  };
 }

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
  * Automatically calculates DLS revised target or par score based on current match state.
  */
 public autoCalculateDlsTarget(revisedTotalOvers?: number): DlsCalculationResult {
  const originalOvers = this.advancedSettings?.originalTotalOvers || this.totalOvers;
  const matchType = (originalOvers <= 20 ? 'T20' : 'ODI') as 'T20' | 'ODI';
  const inn1Runs = this.firstInnings?.totalRuns ?? 0;
  const team2Overs = revisedTotalOvers ?? this.totalOvers;
  // Audit fix M1: convert balls to cricket overs NOTATION (63 balls
  // -> 10.3). Passing totalBalls / 6 (decimal overs) made the DLS
  // parser read a .5 fraction as 5 balls whenever balls % 6 === 3,
  // overstating overs bowled by 2 balls.
  const inn2Bowled = this.secondInnings
   ? DlsEngine.ballsToOversNotation(this.secondInnings.totalBalls)
   : 0;
  const inn2Wkts = this.secondInnings ? this.secondInnings.totalWickets : 0;
  const inn2Runs = this.secondInnings ? this.secondInnings.totalRuns : 0;

  return DlsEngine.calculate({
   originalOvers,
   team1TotalRuns: inn1Runs,
   team2OversAvailable: team2Overs,
   team2WicketsLost: inn2Wkts,
   team2CurrentOversBowled: inn2Bowled,
   team2CurrentRuns: inn2Runs,
   matchType,
  });
 }

 /**
  * Applies revised DLS target to the match and updates engine state.
  */
 public applyDlsTarget(revisedTarget: number, revisedTotalOvers: number): void {
  // Audit fix L1: snapshot before mutating so undo() restores the
  // pre-DLS state AND prunes this event — without it, undo popped an
  // earlier ball's snapshot while DLS_TARGET_APPLIED stayed in the
  // log, silently diverging state from the event stream.
  this.saveSnapshot();
  const originalOvers = this.advancedSettings?.originalTotalOvers || this.totalOvers;
  this.targetScore = revisedTarget;
  this.totalOvers = revisedTotalOvers;
  this.advancedSettings = {
   ...this.advancedSettings,
   originalTotalOvers: originalOvers,
   dlsApplied: true,
   dlsRevisedTarget: revisedTarget,
   dlsRevisedOvers: revisedTotalOvers,
  };
  this.updatedAt = new Date().toISOString();

  this.emitEvent('DLS_TARGET_APPLIED', {
   originalOvers,
   revisedTotalOvers,
   revisedTarget,
  });
 }

 /**
  * Resets or disables DLS settings on the match, restoring original overs and base target.
  */
 public resetDls(): void {
  // Audit fix L1: snapshot before mutating (see applyDlsTarget).
  this.saveSnapshot();
  const originalOvers = this.advancedSettings?.originalTotalOvers || this.totalOvers;
  this.totalOvers = originalOvers;

  // In cricket, base target after 1st innings is 1st innings total runs + 1
  if (this.firstInnings && this.firstInnings.totalRuns > 0) {
   this.targetScore = this.firstInnings.totalRuns + 1;
  } else {
   this.targetScore = 0;
  }

  const effectiveBowlingMode = BowlingLimiter.resolveMode(
   this.totalOvers,
   this.advancedSettings?.bowlingLimitMode,
   this.advancedSettings?.isManualLimitEnabled
  );
  const effectiveMaxOvers = BowlingLimiter.calculateMaxOvers(this.totalOvers, {
   mode: effectiveBowlingMode,
   customMaxOvers: this.advancedSettings?.manualOverLimit,
   isManualLimitEnabled: effectiveBowlingMode === 'custom' || this.advancedSettings?.isManualLimitEnabled,
  });

  this.advancedSettings = {
   ...this.advancedSettings,
   dlsApplied: false,
   dlsRevisedTarget: undefined,
   dlsRevisedOvers: undefined,
   dlsParScore: undefined,
   dlsAbandonReason: undefined,
   maxOversPerBowler: effectiveMaxOvers,
  };
  this.updatedAt = new Date().toISOString();

  this.emitEvent('DLS_RESET', {
   originalOvers,
   restoredTarget: this.targetScore,
  });
 }

 /**
  * Concludes the match based on DLS Par Score when play is abandoned due to weather.
  */
 public concludeMatchWithDls(): MatchResultDetails {
  if (this.currentInningsNumber !== 2 || !this.secondInnings) {
   throw new Error('DLS match conclusion is only applicable during the second innings.');
  }

  // Bug hunt C-6: conclusion is terminal and idempotent. If the
  // log already holds a MATCH_COMPLETED, re-deriving the outcome
  // must not emit a second terminal event (the score page's
  // completion check re-enters completion right after a DLS
  // conclusion). calculateResult honours the recorded DLS par
  // score, so the outcome is unchanged.
  if (this.events.some((e) => e.type === 'MATCH_COMPLETED')) {
   return this.calculateResult();
  }

  const originalOvers = this.advancedSettings?.originalTotalOvers || this.totalOvers;
  const matchType = (originalOvers <= 20 ? 'T20' : 'ODI') as 'T20' | 'ODI';
  const inn1Runs = this.firstInnings.totalRuns;
  const inn2Runs = this.secondInnings.totalRuns;
  const inn2Wickets = this.secondInnings.totalWickets;
  const inn2Bowled = DlsEngine.ballsToOversNotation(this.secondInnings.totalBalls);

  const dls = DlsEngine.calculate({
   originalOvers,
   team1TotalRuns: inn1Runs,
   team2OversAvailable: this.totalOvers,
   team2WicketsLost: inn2Wickets,
   team2CurrentOversBowled: inn2Bowled,
   team2CurrentRuns: inn2Runs,
   matchType,
  });

  if (!dls.isMinimumOversMet) {
   // Minimum overs threshold not reached (e.g. < 5 in T20, < 20 in ODI)
   // Correctness audit finding 4 (2026-11-11): this path used
   // to mutate with NO event and NO snapshot, so the persisted
   // scorecard said ABANDONED while the event log contained
   // nothing that reproduces it — any replay-from-events
   // (undo fallback, ball edit, cross-device rebuild)
   // resurrected the match as IN_PROGRESS. Snapshot first (as
   // applyDlsTarget/resetDls do), then mutate, then emit the
   // terminal event, mirroring the success path below;
   // fromEvents maps the NO_RESULT payload back to ABANDONED.
   this.saveSnapshot();
   const abandonReason = `Match abandoned due to rain before minimum ${dls.minimumOversRequired} overs were completed.`;
   this.status = 'ABANDONED';
   this.advancedSettings = {
    ...this.advancedSettings,
    dlsApplied: true,
    dlsAbandonReason: abandonReason,
   };
   this.updatedAt = new Date().toISOString();
   this.emitEvent('MATCH_COMPLETED', {
    winner: undefined,
    loser: undefined,
    resultType: 'NO_RESULT',
    result: 'Match Abandoned',
    dlsApplied: true,
    parScore: dls.parScore,
    dlsAbandonReason: abandonReason,
   });
   return this.calculateResult();
  }

  // Minimum overs satisfied! Determine legal DLS winner
  const team1 = this.firstInnings.team;
  const team2 = this.secondInnings.team;
  const parScore = dls.parScore;

  // Bug hunt C-6: snapshot before mutating, like the abandon path
  // above — this path previously mutated with no snapshot, so
  // state and log could diverge on the completion path.
  this.saveSnapshot();
  this.status = 'COMPLETED';
  this.advancedSettings = {
   ...this.advancedSettings,
   dlsApplied: true,
   dlsRevisedTarget: dls.revisedTarget,
   dlsParScore: parScore,
   dlsRevisedOvers: this.totalOvers,
  };
  this.updatedAt = new Date().toISOString();

  let outcome: MatchResultDetails;

  if (inn2Runs > parScore) {
   const margin = inn2Runs - parScore;
   outcome = {
    isCompleted: true,
    resultType: 'WIN',
    winner: team2,
    loser: team1,
    marginType: 'RUNS',
    margin,
    resultText: `${team2} won by ${margin} run${margin === 1 ? '' : 's'} (DLS Method)`,
   };
  } else if (inn2Runs < parScore) {
   const margin = parScore - inn2Runs;
   outcome = {
    isCompleted: true,
    resultType: 'WIN',
    winner: team1,
    loser: team2,
    marginType: 'RUNS',
    margin,
    resultText: `${team1} won by ${margin} run${margin === 1 ? '' : 's'} (DLS Method)`,
   };
  } else {
   outcome = {
    isCompleted: true,
    resultType: 'TIE',
    marginType: 'NONE',
    margin: 0,
    resultText: 'Match Tied (DLS Method)',
   };
  }

  this.emitEvent('MATCH_COMPLETED', {
   winner: outcome.winner,
   loser: outcome.loser,
   resultType: outcome.resultType,
   result: outcome.resultText,
   marginType: outcome.marginType,
   margin: outcome.margin,
   dlsApplied: true,
   parScore,
  });

  return outcome;
 }

 /**
 * Concludes the match and calculates winner, margin, and Man of the Match
 */
 public completeMatch(): MatchScorecard {
 this.status = 'COMPLETED';
 this.updatedAt = new Date().toISOString();

 const outcome = this.calculateResult();

 // Bug hunt C-6: MATCH_COMPLETED must be unique in the log. The
 // DLS conclude flow already emitted it (and set status), after
 // which the score page's completion check calls completeMatch()
 // again — that second call still re-derives the outcome for the
 // returned scorecard, but it must not emit a duplicate terminal
 // event. (Replay is unaffected: fromEvents reaches this method
 // while the terminal event is still being rebuilt, so the emit
 // below is what re-creates it in the replayed log.)
 if (!this.events.some((e) => e.type === 'MATCH_COMPLETED')) {
  this.emitEvent('MATCH_COMPLETED', {
  winner: outcome.winner,
  loser: outcome.loser,
  resultType: outcome.resultType,
  result: outcome.resultText,
  marginType: outcome.marginType,
  margin: outcome.margin,
  });
 }

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
 teamASquad: this.advancedSettings.teamASquad,
 teamBSquad: this.advancedSettings.teamBSquad,
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
 isPublic: this.isPublic,
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
  * Creates a cloned copy of the engine and innings state for
  * React state updates: the innings containers, arrays and the
  * live records are fresh references so child components detect
  * changes, while records the last ball did not touch keep
  * their identity (structural sharing — scoring audit H1).
  */
 public clone(): EventSourcedMatchEngine {
  const cloned = Object.create(Object.getPrototypeOf(this)) as EventSourcedMatchEngine;
  Object.assign(cloned, this);
  cloned.advancedSettings = this.advancedSettings ? { ...this.advancedSettings } : ({} as unknown as AdvancedSettings);

  // Structural sharing, per the verified mutation discipline
  // of the scoring path: scoreBall is copy-on-write for every
  // record it touches — it re-creates the striker before
  // mutating him, replaces the dismissed and incoming batters
  // before mutating them, and re-creates the current bowler
  // before mutating him — and it never mutates a non-active
  // player/bowler record. Deep-copying every record on every
  // ball therefore bought nothing but defeated the child
  // React.memo's (new identities for striker/non-striker/
  // bowler after every ball, full table re-renders).
  //
  // clone() now deep-copies only the LIVE records — striker
  // and non-striker (the crease pair is also what retirePlayer
  // and resumeRetiredBatter mutate in place) and the current
  // bowler — and shares every other player/bowler record by
  // reference. The arrays themselves are always new, so array
  // pushes/replacements on the clone never leak into the
  // source engine.
  const copyPlayer = (p: Player): Player => ({
   ...p,
   ballLog: p.ballLog ? [...p.ballLog] : [],
   bowlersFaced: p.bowlersFaced ? { ...p.bowlersFaced } : {},
   runsVsBowler: p.runsVsBowler ? { ...p.runsVsBowler } : {},
  });
  const copyBowler = (b: Bowler): Bowler => ({
   ...b,
   overHistory: b.overHistory ? b.overHistory.map((oh) => ({ ...oh, log: [...oh.log] })) : [],
  });

  const cloneInnings = (inn: InningsData): InningsData => ({
   ...inn,
   players: inn.players.map((p, idx) =>
    idx === inn.strikerIdx || idx === inn.nonStrikerIdx ? copyPlayer(p) : p
   ),
   bowlers: inn.bowlers.map((b, idx) => (idx === inn.currentBowlerIdx ? copyBowler(b) : b)),
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
  * Reconstructs an engine instance from an existing MatchScorecard.
  */
 public static fromScorecard(scorecard: MatchScorecard, events?: DomainEvent[]): EventSourcedMatchEngine {
  const eng = new EventSourcedMatchEngine({
   id: scorecard.id,
   teamA: scorecard.teamA,
   teamB: scorecard.teamB,
   tossWinner: scorecard.tossWinner,
   tossDecision: scorecard.tossDecision,
   totalOvers: scorecard.totalOvers,
   advancedSettings: scorecard.advancedSettings,
   venue: scorecard.venue,
   isPublic: scorecard.isPublic,
   groundId: scorecard.groundId,
   location: scorecard.location,
   events,
  });

  // Audit fix L4: deep-copy the innings, exactly as the constructor
  // path does. Assigning by reference aliased the caller's scorecard
  // object, so subsequent engine mutations wrote into an object other
  // surfaces may be rendering or about to persist.
  if (scorecard.firstInnings) eng.firstInnings = JSON.parse(JSON.stringify(scorecard.firstInnings));
  if (scorecard.secondInnings) eng.secondInnings = JSON.parse(JSON.stringify(scorecard.secondInnings));
  eng.currentInningsNumber = scorecard.currentInnings;
  eng.targetScore = scorecard.targetScore;
  eng.status = scorecard.status;
  eng.updatedAt = scorecard.updatedAt;

  return eng;
 }

 /**
  * Deterministically reconstructs an authoritative EventSourcedMatchEngine from an event sequence.
  */
 /**
  * Audit 2026-11-10 (day review): legacy hand backfill.
  *
  * Matches created before the hand fix carry MATCH_CREATED /
  * INNINGS_STARTED payloads WITHOUT strikerHand/nonStrikerHand —
  * their stored scorecards hold the correct hands (the old page
  * mutation was saved into the snapshot), but a pure replay rebuilds
  * the openers as Right-hand and the caller then PERSISTS that,
  * destroying the correct values. When a replay is seeded from a
  * live engine (ball edits, the undo fallback), inject the current
  * innings' openers' hands into COPIES of those payloads whenever
  * the fields are absent. Post-fix logs already carry the fields
  * and pass through untouched; the stored log is never mutated.
  */
 private static withBackfilledOpenerHands(
  events: DomainEvent[],
  source: EventSourcedMatchEngine
 ): DomainEvent[] {
  const openerHands = (inn: InningsData | null | undefined) => {
   if (!inn) return null;
   const striker = inn.players[inn.strikerIdx];
   const nonStriker = inn.players[inn.nonStrikerIdx];
   if (!striker || !nonStriker) return null;
   return {
    strikerHand: striker.battingHand,
    nonStrikerHand: nonStriker.battingHand,
   };
  };
  const first = openerHands(source.firstInnings);
  const second = openerHands(source.secondInnings);
  if (!first && !second) return events;
  return events.map((e) => {
   if (e.type === 'MATCH_CREATED' && first) {
    const p = e.payload as Record<string, unknown>;
    if (p && p.strikerHand === undefined && p.nonStrikerHand === undefined) {
     return { ...e, payload: { ...p, ...first } };
    }
   }
   if (e.type === 'INNINGS_STARTED' && second) {
    const p = e.payload as Record<string, unknown>;
    if (p && p.strikerHand === undefined && p.nonStrikerHand === undefined) {
     return { ...e, payload: { ...p, ...second } };
    }
   }
   return e;
  });
 }

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
   strikerHand: chaseEvent.payload.strikerHand || p.strikerHand,
   nonStrikerHand: chaseEvent.payload.nonStrikerHand || p.nonStrikerHand,
   venue: p.venue,
   groundId: chaseEvent.payload.groundId || p.groundId,
   location: chaseEvent.payload.location || p.location,
   advancedSettings: p.advancedSettings,
  });
  engine.events = [];
  engine.snapshots = [];
  // Finding 5: the replay rebuilds the log from the source
  // events; restart the monotonic counter and re-sync it at
  // every direct push below.
  engine.eventVersionCounter = 0;
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
   strikerHand: p.strikerHand,
   nonStrikerHand: p.nonStrikerHand,
   venue: p.venue,
   groundId: p.groundId,
   location: p.location,
  });
  engine.events = [];
  engine.snapshots = [];
  engine.eventVersionCounter = 0;
 }

 for (const ev of events) {
  if (ev.type === 'MATCH_CREATED') {
   engine.events.push(ev);
   engine.eventVersionCounter = Math.max(engine.eventVersionCounter, ev.version || 0);
   continue;
  }

  if (ev.type === 'INNINGS_STARTED') {
   if (!chaseEvent && ev.payload.inningsNumber === 2 && engine.currentInningsNumber === 1) {
    engine.startSecondInnings(
     ev.payload.strikerName,
     ev.payload.nonStrikerName,
     ev.payload.bowlerName,
     ev.payload.strikerHand,
     ev.payload.nonStrikerHand
    );
   }
   engine.events.push(ev);
   engine.eventVersionCounter = Math.max(engine.eventVersionCounter, ev.version || 0);
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

  if (ev.type === 'BATTER_RESUMED') {
   engine.resumeRetiredBatter(ev.payload.playerId || ev.payload.player, ev.payload.isStriker ?? true);
   continue;
  }

  if (ev.type === 'PENALTY_AWARDED') {
   engine.awardPenaltyRuns(ev.payload.runs, ev.payload.awardedToBattingTeam, ev.payload.reason);
   continue;
  }

  if (ev.type === 'MATCH_COMPLETED') {
   if (ev.payload?.dlsApplied && ev.payload?.resultType === 'NO_RESULT') {
    // Finding 4: the live conclusion was a DLS abandonment
    // below the minimum overs. Re-running the deterministic
    // conclusion at the identical replayed state lands on the
    // same path and restores ABANDONED; if it ever does not
    // (state drift), the log is authoritative for the terminal
    // state — force it rather than resurrecting the match.
    let concluded = false;
    try {
     engine.concludeMatchWithDls();
     concluded = engine.status === 'ABANDONED';
    } catch {
     concluded = false;
    }
    if (!concluded) {
     engine.status = 'ABANDONED';
     engine.advancedSettings = {
      ...engine.advancedSettings,
      dlsApplied: true,
      dlsAbandonReason:
       ev.payload.dlsAbandonReason ?? engine.advancedSettings.dlsAbandonReason,
     };
    }
   } else if (ev.payload?.dlsApplied) {
    // Audit fix M5: the live conclusion was a DLS par-score
    // decision, not a natural completion — completeMatch() would
    // re-derive it via calculateResult() against the unrevised
    // target and lose it. Re-run the deterministic DLS conclusion
    // at the identical replayed state instead; it restores status,
    // dlsParScore and emits its own MATCH_COMPLETED. (Legacy logs
    // whose MATCH_COMPLETED carries no dlsApplied flag replay
    // exactly as before.)
    let concluded = false;
    try {
     engine.concludeMatchWithDls();
     concluded = engine.status === 'COMPLETED' || engine.status === 'ABANDONED';
    } catch {
     concluded = false;
    }
    if (!concluded) {
     engine.completeMatch();
    }
   } else {
    engine.completeMatch();
   }
   continue;
  }

  if (ev.type === 'DLS_TARGET_APPLIED') {
   engine.applyDlsTarget(ev.payload.revisedTarget, ev.payload.revisedTotalOvers);
   continue;
  }

  if (ev.type === 'DLS_RESET') {
   engine.resetDls();
   if (ev.payload?.restoredTarget !== undefined) {
    engine.targetScore = ev.payload.restoredTarget;
   }
   continue;
  }

  if (ev.type === 'PLAYER_RENAMED') {
   engine.renamePlayer(ev.payload.playerId || ev.payload.oldName, ev.payload.newName);
   continue;
  }

  engine.events.push(ev);
  engine.eventVersionCounter = Math.max(engine.eventVersionCounter, ev.version || 0);
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
  // Audit fix L6: capture the original payload and the pre-edit event
  // census so a replay that silently drops deliveries (scoreBall's
  // guards return without a signal; changeBowler rejections are
  // ignored by fromEvents) can be detected and the edit refused,
  // instead of adopting a state that no longer matches the log.
  const originalPayload = JSON.parse(JSON.stringify(targetEvent.payload));
  const countEventsByType = (list: DomainEvent[]): Map<string, number> => {
   const counts = new Map<string, number>();
   for (const e of list) counts.set(e.type, (counts.get(e.type) || 0) + 1);
   return counts;
  };
  const expectedCounts = countEventsByType(this.events);
  // INNINGS_STARTED is excluded: fromEvents re-emits it via
  // startSecondInnings AND pushes the source event, so its replayed
  // count legitimately differs by design of the replay path.
  expectedCounts.delete('INNINGS_STARTED');

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
  let replayed: EventSourcedMatchEngine;
  try {
   replayed = EventSourcedMatchEngine.fromEvents(
    EventSourcedMatchEngine.withBackfilledOpenerHands(this.events, this)
   );
  } catch {
   targetEvent.payload = originalPayload;
   this.snapshots.pop();
   return false;
  }

  // Audit fix L6 (cont.): verify replay integrity — every scored
  // ball and actionable event in the edited log must survive the
  // replay. A shortfall means the edit made a later delivery invalid
  // (e.g. an earlier wicket changed who may bat/bowl) and replay
  // dropped it silently; refuse the edit and restore the log.
  const replayedCounts = countEventsByType(replayed.events);
  replayedCounts.delete('INNINGS_STARTED');
  let replayDiverged = replayedCounts.size !== expectedCounts.size;
  if (!replayDiverged) {
   for (const [type, count] of expectedCounts) {
    if (replayedCounts.get(type) !== count) {
     replayDiverged = true;
     break;
    }
   }
  }
  if (replayDiverged) {
   targetEvent.payload = originalPayload;
   this.snapshots.pop();
   return false;
  }

  this.firstInnings = replayed.firstInnings;
  this.secondInnings = replayed.secondInnings;
  this.currentInningsNumber = replayed.currentInningsNumber;
  this.targetScore = replayed.targetScore;
  this.status = replayed.status;
  this.totalOvers = replayed.totalOvers;
  this.advancedSettings = replayed.advancedSettings;
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

