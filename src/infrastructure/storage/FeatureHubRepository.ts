import { db, SavedTeam, UserProfileRecord } from '../database/dexie-db';
import { Tournament } from '@/domain/tournament/types';

export class FeatureHubRepository {
 // Teams
 static async loadTeams(): Promise<SavedTeam[]> {
 return db.teams.orderBy('createdAt').reverse().toArray();
 }

 static async saveTeam(team: SavedTeam): Promise<void> {
 await db.teams.put(team);
 }

 static async saveTeams(teams: SavedTeam[]): Promise<void> {
 await db.teams.bulkPut(teams);
 }

 static async deleteTeam(id: string): Promise<void> {
 await db.teams.delete(id);
 }

 // Tournaments
 static async loadTournaments(): Promise<Tournament[]> {
 return db.tournaments.orderBy('createdAt').reverse().toArray();
 }

 static async getTournament(id: string): Promise<Tournament | undefined> {
 return db.tournaments.get(id);
 }

 static async saveTournament(tournament: Tournament): Promise<void> {
 await db.tournaments.put(tournament);
 }

 static async deleteTournament(id: string): Promise<void> {
 await db.tournaments.delete(id);
 }

 // User Profile
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
