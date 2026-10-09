import { db } from '../database/dexie-db';
import { MatchScorecard, DomainEvent } from '@/domain/cricket/types';
import { SyncEngine } from '../sync/SyncEngine';
import { StorageManagerService } from './StorageManagerService';

export class MatchRepository {
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

    // Queue synchronization in the durable outbox
    await SyncEngine.queueMutation('UPSERT_MATCH', scorecard, scorecard.id);
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

    const deltaEvents = events.slice(fromIndex);

    await db.transaction('rw', [db.matches, db.match_events, db.app_metadata], async () => {
      await db.matches.put(scorecard);
      if (deltaEvents.length > 0) {
        await db.match_events.bulkPut(deltaEvents);
      }
      if (scorecard.status === 'ONGOING') {
        await db.app_metadata.put({
          key: 'last_active_match_id',
          value: scorecard.id,
          updatedAt: scorecard.updatedAt,
        });
      }
    });

    await SyncEngine.queueMutation('UPSERT_MATCH', scorecard, scorecard.id);
  }

  static async getMatch(id: string): Promise<MatchScorecard | undefined> {
    return db.matches.get(id);
  }

  static async getAllMatches(): Promise<MatchScorecard[]> {
    return db.matches.orderBy('updatedAt').reverse().toArray();
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

    await SyncEngine.queueMutation('DELETE_MATCH', { id }, id);
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
      await SyncEngine.queueMutation('DELETE_MATCH', { id }, id);
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
