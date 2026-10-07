import Dexie, { Table } from 'dexie';
import { MatchScorecard, DomainEvent } from '@/domain/cricket/types';
import { Tournament } from '@/domain/tournament/types';

export interface SavedTeam {
 id: string;
 name: string;
 captain: string;
 manager: string;
 players: string[];
 createdAt: string;
}

export interface UserProfileRecord {
 id: string; // 'current' or user id
 uid?: string;
 name: string;
 email: string;
 photoUrl?: string;
 isLoggedIn: boolean;
 lastSyncedAt?: string;
}

export interface SyncQueueRecord {
 clientOpId: string;
 operationType: 'UPSERT_MATCH' | 'DELETE_MATCH' | 'UPSERT_TEAM' | 'UPSERT_TOURNAMENT';
 payload: any;
 status: 'PENDING' | 'SYNCED' | 'FAILED';
 retryCount: number;
 errorMessage?: string;
 createdAt: string;
 lastAttemptAt?: string;
}

export class CricScorerProDatabase extends Dexie {
 matches!: Table<MatchScorecard, string>;
 match_events!: Table<DomainEvent, string>;
 teams!: Table<SavedTeam, string>;
 tournaments!: Table<Tournament, string>;
 user_profile!: Table<UserProfileRecord, string>;
 sync_queue!: Table<SyncQueueRecord, string>;

 constructor() {
 super('CricScorerPro_v2');

 this.version(1).stores({
 matches: 'id, status, currentInnings, updatedAt, createdAt',
 match_events: 'eventId, matchId, version, timestamp, type',
 teams: 'id, name, createdAt',
 tournaments: 'id, name, format, createdAt',
 user_profile: 'id, email',
 sync_queue: 'clientOpId, operationType, status, createdAt',
 });
 }
}

export const db = new CricScorerProDatabase();
