import { db } from '../database/dexie-db';
import { MatchScorecard, DomainEvent } from '@/domain/cricket/types';

export class MatchRepository {
 static async saveMatch(scorecard: MatchScorecard): Promise<void> {
 scorecard.updatedAt = new Date().toISOString();
 await db.matches.put(scorecard);
 }

 static async getMatch(id: string): Promise<MatchScorecard | undefined> {
 return db.matches.get(id);
 }

 static async getAllMatches(): Promise<MatchScorecard[]> {
 return db.matches.orderBy('updatedAt').reverse().toArray();
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

 static async deleteMatch(id: string): Promise<void> {
 await db.transaction('rw', db.matches, db.match_events, async () => {
 await db.matches.delete(id);
 await db.match_events.where('matchId').equals(id).delete();
 });
 }

 static async deleteMatches(ids: string[]): Promise<void> {
 await db.transaction('rw', db.matches, db.match_events, async () => {
 await db.matches.bulkDelete(ids);
 for (const id of ids) {
 await db.match_events.where('matchId').equals(id).delete();
 }
 });
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
