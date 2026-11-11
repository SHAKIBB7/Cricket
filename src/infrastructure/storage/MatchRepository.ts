import { db } from '../database/dexie-db';
import { MatchScorecard, DomainEvent, MatchStatus, MatchResultType } from '@/domain/cricket/types';
import { SyncEngine } from '../sync/SyncEngine';
import { StorageManagerService } from './StorageManagerService';

/** Lightweight innings projection used by the archive card. */
export interface MatchSummaryInnings {
  team: string;
  totalRuns: number;
  totalWickets: number;
  totalBalls: number;
  oversString: string;
}

/**
 * Lightweight match projection for list surfaces (F1/F8): only the
 * fields the Match Archive card renders or its helpers
 * (winnerTeamOf / chaseEquationFor) read. Dexie cannot project, so
 * the full records are mapped right after `toArray()` and the heavy
 * innings payloads (players, bowlers, logs) are dropped before the
 * result reaches React state.
 */
export interface MatchSummary {
  id: string;
  status: MatchStatus;
  resultType?: MatchResultType;
  createdAt: string;
  updatedAt: string;
  totalOvers: number;
  venue?: string;
  groundId?: string;
  result?: string;
  teamA: string;
  teamB: string;
  winner?: string;
  targetScore: number;
  firstInnings?: MatchSummaryInnings;
  secondInnings?: MatchSummaryInnings;
}

export class MatchRepository {
  private static firstSavePersistenceHandled = false;

  /**
   * P5 (D5): once the device holds its first locally-saved match,
   * silently ask the browser to protect the database from
   * automatic eviction. Checked at most until the first match
   * exists; never throws into the save path.
   */
  private static async requestPersistenceAfterFirstSave(): Promise<void> {
    if (this.firstSavePersistenceHandled) return;
    try {
      const count = await db.matches.count();
      if (count >= 1) {
        this.firstSavePersistenceHandled = true;
        await StorageManagerService.requestPersistence().catch(() => {});
      }
    } catch {
      // Silent by design — persistence is best-effort protection.
    }
  }

  /**
   * Saves or updates a match scorecard locally inside an atomic IndexedDB transaction,
   * updates the latest active match pointer, and enqueues cloud sync mutation.
   */
  static async saveMatch(scorecard: MatchScorecard): Promise<void> {
    scorecard.updatedAt = new Date().toISOString();
    if (!scorecard.syncStatus || scorecard.syncStatus === 'SYNCED') {
      scorecard.syncStatus = 'PENDING';
    }

    await db.transaction('rw', [db.matches, db.app_metadata], async () => {
      await db.matches.put(scorecard);
      if (scorecard.status === 'ONGOING') {
        await db.app_metadata.put({
          key: 'last_active_match_id',
          value: scorecard.id,
          updatedAt: scorecard.updatedAt,
        });
      }
    });

    // Queue synchronization in the durable outbox. P3-M4: a
    // failed queue write must not be swallowed — the record is
    // already saved as PENDING, and the failure is recorded
    // durably in app_metadata ('sync_queue_error') so it is
    // visible instead of pending forever with no op behind it.
    const queued = await SyncEngine.queueMutation('UPSERT_MATCH', scorecard, scorecard.id);
    if (!queued) {
      await SyncEngine.recordQueueFailure(scorecard.id, 'UPSERT_MATCH');
    }
    await this.requestPersistenceAfterFirstSave();
  }

  static async updateMatch(scorecard: MatchScorecard): Promise<void> {
    return this.saveMatch(scorecard);
  }

  /**
   * Atomic batch persistence for scorecard and ball-by-ball delta events in one transaction.
   */
  static async saveMatchWithEvents(
    scorecard: MatchScorecard,
    events: DomainEvent[],
    fromIndex: number
  ): Promise<void> {
    scorecard.updatedAt = new Date().toISOString();
    if (!scorecard.syncStatus || scorecard.syncStatus === 'SYNCED') {
      scorecard.syncStatus = 'PENDING';
    }

    await db.transaction('rw', [db.matches, db.match_events, db.app_metadata], async () => {
      await db.matches.put(scorecard);
      if (fromIndex === 0 || events.length < fromIndex) {
        await db.match_events.where('matchId').equals(scorecard.id).delete();
        if (events.length > 0) {
          await db.match_events.bulkPut(events);
        }
      } else {
        const deltaEvents = events.slice(fromIndex);
        if (deltaEvents.length > 0) {
          await db.match_events.bulkPut(deltaEvents);
        }
      }
      if (scorecard.status === 'ONGOING') {
        await db.app_metadata.put({
          key: 'last_active_match_id',
          value: scorecard.id,
          updatedAt: scorecard.updatedAt,
        });
      }
    });

    // P3-M4: surface a failed queue write (see saveMatch).
    const queued = await SyncEngine.queueMutation('UPSERT_MATCH', scorecard, scorecard.id);
    if (!queued) {
      await SyncEngine.recordQueueFailure(scorecard.id, 'UPSERT_MATCH');
    }
    await this.requestPersistenceAfterFirstSave();
  }

  /**
   * Updates the ground/venue of an existing match record and persists to IndexedDB and sync outbox.
   */
  static async updateMatchVenue(
    matchId: string,
    venue: string,
    groundId?: string
  ): Promise<MatchScorecard | undefined> {
    const match = await db.matches.get(matchId);
    if (!match) return undefined;

    const trimmedVenue = venue.trim();
    match.venue = trimmedVenue;
    if (groundId !== undefined) {
      match.groundId = groundId;
    }
    if (match.advancedSettings) {
      match.advancedSettings.venue = trimmedVenue;
      if (groundId !== undefined) {
        match.advancedSettings.groundId = groundId;
      }
    }
    match.updatedAt = new Date().toISOString();

    await this.saveMatch(match);
    return match;
  }

  static async getMatch(id: string): Promise<MatchScorecard | undefined> {
    return db.matches.get(id);
  }

  static async getAllMatches(): Promise<MatchScorecard[]> {
    return db.matches.orderBy('updatedAt').reverse().toArray();
  }

  /**
   * Archive projection (F1/F8): every match, reduced to the
   * MatchSummary shape so list pages never hold or render the full
   * scorecard payloads. Same ordering as getAllMatches.
   */
  static async getMatchSummaries(): Promise<MatchSummary[]> {
    const all = await db.matches.orderBy('updatedAt').reverse().toArray();
    const toInnings = (inn: MatchScorecard['firstInnings']): MatchSummaryInnings | undefined =>
      inn
        ? {
            team: inn.team,
            totalRuns: inn.totalRuns,
            totalWickets: inn.totalWickets,
            totalBalls: inn.totalBalls,
            oversString: inn.oversString,
          }
        : undefined;
    return all.map((m) => ({
      id: m.id,
      status: m.status,
      resultType: m.resultType,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      totalOvers: m.totalOvers,
      venue: m.venue,
      groundId: m.groundId,
      result: m.result,
      teamA: m.teamA,
      teamB: m.teamB,
      winner: m.winner,
      targetScore: m.targetScore,
      firstInnings: toInnings(m.firstInnings),
      secondInnings: toInnings(m.secondInnings),
    }));
  }

  static async countMatches(): Promise<number> {
    return db.matches.count();
  }

  static async countOngoingMatches(): Promise<number> {
    return db.matches.where('status').equals('ONGOING').count();
  }

  static async countCompletedMatches(): Promise<number> {
    return db.matches.where('status').equals('COMPLETED').count();
  }

  static async getRecentMatches(limit: number = 5): Promise<MatchScorecard[]> {
    return db.matches.orderBy('updatedAt').reverse().limit(limit).toArray();
  }

  static async getOngoingMatches(): Promise<MatchScorecard[]> {
    return db.matches
      .where('status')
      .equals('ONGOING')
      .reverse()
      .sortBy('updatedAt');
  }

  static async getCompletedMatches(): Promise<MatchScorecard[]> {
    return db.matches
      .where('status')
      .equals('COMPLETED')
      .reverse()
      .sortBy('updatedAt');
  }

  static async getLatestOngoingMatch(): Promise<MatchScorecard | undefined> {
    const list = await this.getOngoingMatches();
    return list.length > 0 ? list[0] : undefined;
  }

  /**
   * Retrieves the most recently active or ongoing match state for instant application restoration.
   */
  static async getLastActiveMatch(): Promise<MatchScorecard | undefined> {
    const lastId = await StorageManagerService.getLastActiveMatchId();
    if (lastId) {
      const match = await this.getMatch(lastId);
      if (match) return match;
    }
    return this.getLatestOngoingMatch();
  }

  static async deleteMatch(id: string): Promise<void> {
    await db.transaction('rw', [db.matches, db.match_events, db.app_metadata], async () => {
      await db.matches.delete(id);
      await db.match_events.where('matchId').equals(id).delete();
      const lastId = await StorageManagerService.getLastActiveMatchId();
      if (lastId === id) {
        await db.app_metadata.delete('last_active_match_id');
      }
    });

    // P3-M4: the record itself is gone, so the app_metadata
    // failure record is the only surface for a failed queue write.
    const queued = await SyncEngine.queueMutation('DELETE_MATCH', { id }, id);
    if (!queued) {
      await SyncEngine.recordQueueFailure(id, 'DELETE_MATCH');
    }
  }

  static async deleteMatches(ids: string[]): Promise<void> {
    await db.transaction('rw', [db.matches, db.match_events, db.app_metadata], async () => {
      await db.matches.bulkDelete(ids);
      for (const id of ids) {
        await db.match_events.where('matchId').equals(id).delete();
      }
      const lastId = await StorageManagerService.getLastActiveMatchId();
      if (lastId && ids.includes(lastId)) {
        await db.app_metadata.delete('last_active_match_id');
      }
    });

    for (const id of ids) {
      // P3-M4: record failed queue writes (see deleteMatch).
      const queued = await SyncEngine.queueMutation('DELETE_MATCH', { id }, id);
      if (!queued) {
        await SyncEngine.recordQueueFailure(id, 'DELETE_MATCH');
      }
    }
  }

  static async saveEvents(events: DomainEvent[]): Promise<void> {
    await db.match_events.bulkPut(events);
  }

  static async saveEventsDelta(events: DomainEvent[], fromIndex: number): Promise<void> {
    const delta = events.slice(fromIndex);
    if (delta.length > 0) {
      await db.match_events.bulkPut(delta);
    }
  }

  static async getEventsForMatch(matchId: string): Promise<DomainEvent[]> {
    return db.match_events
      .where('matchId')
      .equals(matchId)
      .sortBy('version');
  }
}
