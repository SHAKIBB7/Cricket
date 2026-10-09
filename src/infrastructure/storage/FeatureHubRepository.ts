import { db, SavedTeam, UserProfileRecord } from '../database/dexie-db';
import { Tournament } from '@/domain/tournament/types';
import { SyncEngine } from '../sync/SyncEngine';

export class FeatureHubRepository {
  // ── Teams ──
  static async loadTeams(): Promise<SavedTeam[]> {
    return db.teams.orderBy('createdAt').reverse().toArray();
  }

  static async countTeams(): Promise<number> {
    return db.teams.count();
  }

  static async saveTeam(team: SavedTeam): Promise<void> {
    team.syncStatus = 'PENDING';
    team.updatedAt = new Date().toISOString();
    await db.teams.put(team);
    await SyncEngine.queueMutation('UPSERT_TEAM', team, team.id);
  }

  static async saveTeams(teams: SavedTeam[]): Promise<void> {
    const now = new Date().toISOString();
    for (const team of teams) {
      team.syncStatus = 'PENDING';
      team.updatedAt = now;
    }
    await db.teams.bulkPut(teams);
    for (const team of teams) {
      await SyncEngine.queueMutation('UPSERT_TEAM', team, team.id);
    }
  }

  static async deleteTeam(id: string): Promise<void> {
    await db.teams.delete(id);
    await SyncEngine.queueMutation('DELETE_TEAM', { id }, id);
  }

  // ── Tournaments ──
  static async loadTournaments(): Promise<Tournament[]> {
    return db.tournaments.orderBy('createdAt').reverse().toArray();
  }

  static async countTournaments(): Promise<number> {
    return db.tournaments.count();
  }

  static async getTournament(id: string): Promise<Tournament | undefined> {
    return db.tournaments.get(id);
  }

  static async saveTournament(tournament: Tournament): Promise<void> {
    await db.tournaments.put(tournament);
    await SyncEngine.queueMutation('UPSERT_TOURNAMENT', tournament, tournament.id);
  }

  static async deleteTournament(id: string): Promise<void> {
    await db.tournaments.delete(id);
    await SyncEngine.queueMutation('DELETE_TOURNAMENT', { id }, id);
  }

  // ── User Profile ──
  static async loadProfile(): Promise<UserProfileRecord | undefined> {
    return db.user_profile.get('current');
  }

  static async saveProfile(profile: Omit<UserProfileRecord, 'id'>): Promise<void> {
    await db.user_profile.put({ ...profile, id: 'current' });
  }

  static async clearProfile(): Promise<void> {
    await db.user_profile.delete('current');
  }
}
