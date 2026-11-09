import Dexie, { Table } from 'dexie';
import { MatchScorecard, DomainEvent, CricketGround } from '@/domain/cricket/types';
import { Tournament } from '@/domain/tournament/types';
import { normalizeTeamPlayers, type TeamPlayer } from '@/domain/teams/playerIdentity';

export interface SavedTeam {
  id: string;
  userId?: string;
  name: string;
  captain: string;
  manager: string;
  /** F9-β2: stable player identities (was string[] before schema v4). */
  players: TeamPlayer[];
  createdAt: string;
  updatedAt?: string;
  syncStatus?: 'SYNCED' | 'PENDING' | 'LOCAL_ONLY';
}

export interface UserProfileRecord {
  id: string; // 'current' or user id
  uid?: string;
  name: string;
  email: string;
  photoUrl?: string;
  isLoggedIn: boolean;
  lastSyncedAt?: string;
  createdAt?: string;
  syncStatus?: 'SYNCED' | 'LOCAL_ONLY' | 'PENDING';
}

export interface SyncQueueRecord {
  clientOpId: string;
  operationType:
    | 'UPSERT_MATCH'
    | 'DELETE_MATCH'
    | 'UPSERT_TEAM'
    | 'DELETE_TEAM'
    | 'UPSERT_TOURNAMENT'
    | 'DELETE_TOURNAMENT'
    | 'UPSERT_GROUND'
    | 'DELETE_GROUND';
  entityId?: string;
  payload: any;
  status: 'PENDING' | 'SYNCED' | 'FAILED';
  retryCount: number;
  errorMessage?: string;
  createdAt: string;
  lastAttemptAt?: string;
}

export interface AppMetadataRecord {
  key: string;
  value: any;
  updatedAt: string;
}

export class CricScorerProDatabase extends Dexie {
  matches!: Table<MatchScorecard, string>;
  match_events!: Table<DomainEvent, string>;
  teams!: Table<SavedTeam, string>;
  tournaments!: Table<Tournament, string>;
  user_profile!: Table<UserProfileRecord, string>;
  sync_queue!: Table<SyncQueueRecord, string>;
  app_metadata!: Table<AppMetadataRecord, string>;
  grounds!: Table<CricketGround, string>;

  constructor() {
    super('CricScorerPro_v2');

    // Schema Version 1 (Baseline)
    this.version(1).stores({
      matches: 'id, status, currentInnings, updatedAt, createdAt',
      match_events: 'eventId, matchId, version, timestamp, type',
      teams: 'id, name, createdAt',
      tournaments: 'id, name, format, createdAt',
      user_profile: 'id, email',
      sync_queue: 'clientOpId, operationType, status, createdAt',
    });

    // Schema Version 2 (Enterprise Offline-First & Conflict Versioning)
    this.version(2)
      .stores({
        matches: 'id, status, currentInnings, syncStatus, updatedAt, createdAt',
        match_events: 'eventId, matchId, version, timestamp, type, [matchId+version]',
        teams: 'id, name, syncStatus, createdAt',
        tournaments: 'id, name, format, syncStatus, createdAt',
        user_profile: 'id, email',
        sync_queue: 'clientOpId, operationType, status, createdAt, entityId, [status+createdAt]',
        app_metadata: 'key, updatedAt',
      })
      .upgrade((tx) => {
        return tx
          .table('matches')
          .toCollection()
          .modify((match: MatchScorecard) => {
            if (!match.syncStatus) {
              match.syncStatus = 'SYNCED';
            }
          });
      });

    // Schema Version 3 (Cricket Grounds Map & Geo Venue Indexing)
    this.version(3).stores({
      matches: 'id, status, currentInnings, syncStatus, groundId, updatedAt, createdAt',
      match_events: 'eventId, matchId, version, timestamp, type, [matchId+version]',
      teams: 'id, name, syncStatus, createdAt',
      tournaments: 'id, name, format, syncStatus, createdAt',
      user_profile: 'id, email',
      sync_queue: 'clientOpId, operationType, status, createdAt, entityId, [status+createdAt]',
      app_metadata: 'key, updatedAt',
      grounds: 'id, name, googlePlaceId, createdAt, updatedAt',
    });

    // Schema Version 4 (F9-β2: stable player identities)
    // `players` is not an indexed field, so the stores map is unchanged;
    // the upgrade assigns every saved team's players durable ids once.
    // Idempotent: object-form players keep their ids (normalize passes
    // them through), so a re-run can never re-key a team.
    this.version(4)
      .stores({
        matches: 'id, status, currentInnings, syncStatus, groundId, updatedAt, createdAt',
        match_events: 'eventId, matchId, version, timestamp, type, [matchId+version]',
        teams: 'id, name, syncStatus, createdAt',
        tournaments: 'id, name, format, syncStatus, createdAt',
        user_profile: 'id, email',
        sync_queue: 'clientOpId, operationType, status, createdAt, entityId, [status+createdAt]',
        app_metadata: 'key, updatedAt',
        grounds: 'id, name, googlePlaceId, createdAt, updatedAt',
      })
      .upgrade((tx) => {
        return tx
          .table('teams')
          .toCollection()
          .modify((team: SavedTeam) => {
            team.players = normalizeTeamPlayers(team.players);
          });
      });
  }
}

export const db = new CricScorerProDatabase();
