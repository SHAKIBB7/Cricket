/**
 * StorageManagerService
 * 
 * Manages persistent storage requests, quota monitoring, quota exhaustion mitigation,
 * and app metadata storage for resilient offline-first operation.
 */

import { db } from '../database/dexie-db';
import { normalizeTeamPlayers } from '@/domain/teams/playerIdentity';

export interface StorageEstimateResult {
  supported: boolean;
  persisted: boolean;
  usageBytes: number;
  quotaBytes: number;
  usagePercent: number;
  usageMB: number;
  quotaMB: number;
  isLowSpace: boolean;
}

export class StorageManagerService {
  private static persistenceRequested = false;

  /**
   * Requests persistent storage from the browser (e.g. Chrome, Firefox, Safari)
   * so cached matches and IndexedDB data are not evicted under storage pressure.
   */
  static async requestPersistence(): Promise<boolean> {
    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.storage?.persist) {
      return false;
    }

    try {
      const isAlreadyPersisted = await navigator.storage.persisted();
      if (isAlreadyPersisted) {
        return true;
      }

      const granted = await navigator.storage.persist();
      this.persistenceRequested = true;
      return granted;
    } catch (err) {
      console.warn('StorageManagerService: Persistence request failed', err);
      return false;
    }
  }

  /**
   * Checks whether the current origin has persistent storage status.
   */
  static async isPersisted(): Promise<boolean> {
    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.storage?.persisted) {
      return false;
    }
    try {
      return await navigator.storage.persisted();
    } catch {
      return false;
    }
  }

  /**
   * Retrieves accurate storage usage and quota estimates from the browser.
   */
  static async getStorageEstimate(): Promise<StorageEstimateResult> {
    const defaultResult: StorageEstimateResult = {
      supported: false,
      persisted: false,
      usageBytes: 0,
      quotaBytes: 0,
      usagePercent: 0,
      usageMB: 0,
      quotaMB: 0,
      isLowSpace: false,
    };

    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.storage?.estimate) {
      return defaultResult;
    }

    try {
      if (!this.persistenceRequested) {
        await this.requestPersistence().catch(() => {});
      }

      const [estimate, persisted] = await Promise.all([
        navigator.storage.estimate(),
        this.isPersisted(),
      ]);

      const usageBytes = estimate.usage || 0;
      const quotaBytes = estimate.quota || 0;
      const usagePercent = quotaBytes > 0 ? (usageBytes / quotaBytes) * 100 : 0;
      const usageMB = Math.round((usageBytes / (1024 * 1024)) * 10) / 10;
      const quotaMB = Math.round((quotaBytes / (1024 * 1024)) * 10) / 10;
      const isLowSpace = quotaBytes > 0 && quotaBytes - usageBytes < 20 * 1024 * 1024; // Less than 20MB remaining

      return {
        supported: true,
        persisted,
        usageBytes,
        quotaBytes,
        usagePercent,
        usageMB,
        quotaMB,
        isLowSpace,
      };
    } catch (err) {
      console.warn('StorageManagerService: Failed to estimate storage', err);
      return defaultResult;
    }
  }

  /**
   * Mitigates quota exhaustion by cleaning up completed sync items
   * and notifying caller if storage is dangerously full.
   */
  static async handleQuotaExhaustion(): Promise<{ cleanedItems: number; isStillFull: boolean }> {
    let cleanedItems = 0;
    try {
      const syncedRecords = await db.sync_queue.where('status').equals('SYNCED').toArray();
      if (syncedRecords.length > 0) {
        cleanedItems = syncedRecords.length;
        await db.sync_queue.where('status').equals('SYNCED').delete();
      }
    } catch (err) {
      console.error('StorageManagerService: Error during quota cleanup', err);
    }

    const estimate = await this.getStorageEstimate();
    return {
      cleanedItems,
      isStillFull: estimate.isLowSpace || estimate.usagePercent > 90,
    };
  }

  /**
   * Diagnostic test to verify IndexedDB is unblocked and functioning properly.
   */
  static async verifyStorageHealth(): Promise<{ healthy: boolean; error?: string }> {
    try {
      const testKey = '__health_check__';
      await db.app_metadata.put({
        key: testKey,
        value: Date.now(),
        updatedAt: new Date().toISOString(),
      });
      await db.app_metadata.delete(testKey);
      return { healthy: true };
    } catch (err: any) {
      return {
        healthy: false,
        error: err?.message || 'IndexedDB storage is inaccessible or blocked.',
      };
    }
  }

  /**
   * Stores persistent application metadata key-value pair in IndexedDB.
   */
  static async setMetadata(key: string, value: any): Promise<void> {
    try {
      await db.app_metadata.put({
        key,
        value,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn(`StorageManagerService: Failed to set metadata for ${key}`, err);
    }
  }

  /**
   * Retrieves persistent application metadata value from IndexedDB.
   */
  static async getMetadata<T = any>(key: string): Promise<T | undefined> {
    try {
      const record = await db.app_metadata.get(key);
      return record ? (record.value as T) : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Tracks the latest active match ID for immediate restoration on application reopen.
   */
  static async setLastActiveMatchId(matchId: string): Promise<void> {
    await this.setMetadata('last_active_match_id', matchId);
  }

  /**
   * Retrieves the latest active match ID.
   */
  static async getLastActiveMatchId(): Promise<string | undefined> {
    return this.getMetadata<string>('last_active_match_id');
  }

  /**
   * Exports full IndexedDB database into a validated portable JSON string.
   */
  static async exportDatabase(): Promise<{
    jsonString: string;
    stats: { matches: number; teams: number; tournaments: number; grounds: number };
  }> {
    const [matches, matchEvents, teams, tournaments, grounds, appMetadata] = await Promise.all([
      db.matches.toArray(),
      db.match_events.toArray(),
      db.teams.toArray(),
      db.tournaments.toArray(),
      db.grounds.toArray(),
      db.app_metadata.toArray(),
    ]);

    const backupData = {
      app: 'Cric Scorer Pro',
      version: '2.5.0',
      exportedAt: new Date().toISOString(),
      matches,
      matchEvents,
      teams,
      tournaments,
      grounds,
      appMetadata,
    };

    return {
      jsonString: JSON.stringify(backupData, null, 2),
      stats: {
        matches: matches.length,
        teams: teams.length,
        tournaments: tournaments.length,
        grounds: grounds.length,
      },
    };
  }

  /** Backup file versions this build can restore (P6). */
  private static readonly SUPPORTED_BACKUP_VERSIONS = ['2.5.0'];
  private static readonly BACKUP_APP_NAME = 'Cric Scorer Pro';

  /**
   * Parses and validates a backup envelope (P6 hardening). Shared
   * by the import itself and the UI's pre-import peek, so what the
   * user is shown is exactly what will be enforced. Throws with a
   * user-readable message on any problem.
   */
  private static parseBackup(jsonString: string): {
    matches: any[]; matchEvents: any[]; teams: any[]; tournaments: any[]; grounds: any[];
    version: string; exportedAt?: string;
  } {
    const data = JSON.parse(jsonString);

    if (!data || typeof data !== 'object') {
      throw new Error('Invalid JSON backup file');
    }

    const hasValidPayload =
      Array.isArray(data.matches) ||
      Array.isArray(data.teams) ||
      Array.isArray(data.tournaments) ||
      Array.isArray(data.grounds);

    if (!hasValidPayload) {
      throw new Error('Backup file does not contain recognized Cric Scorer Pro records.');
    }

    if (data.app !== this.BACKUP_APP_NAME) {
      throw new Error('This file was not exported by Cric Scorer Pro.');
    }
    if (!this.SUPPORTED_BACKUP_VERSIONS.includes(data.version)) {
      throw new Error(
        `Unsupported backup version "${data.version ?? 'unknown'}". This app restores backups from version ${this.SUPPORTED_BACKUP_VERSIONS.join(', ')}.`,
      );
    }

    return {
      matches: Array.isArray(data.matches) ? data.matches : [],
      matchEvents: Array.isArray(data.matchEvents) ? data.matchEvents : [],
      teams: Array.isArray(data.teams) ? data.teams : [],
      tournaments: Array.isArray(data.tournaments) ? data.tournaments : [],
      grounds: Array.isArray(data.grounds) ? data.grounds : [],
      version: data.version,
      exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : undefined,
    };
  }

  /**
   * Validates a backup file and reports its contents WITHOUT
   * importing — the restore dialog shows these counts before the
   * user confirms.
   */
  static peekBackupEnvelope(jsonString: string): {
    ok: boolean;
    error?: string;
    version?: string;
    exportedAt?: string;
    counts?: { matches: number; matchEvents: number; teams: number; tournaments: number; grounds: number };
  } {
    try {
      const data = this.parseBackup(jsonString);
      return {
        ok: true,
        version: data.version,
        exportedAt: data.exportedAt,
        counts: {
          matches: data.matches.length,
          matchEvents: data.matchEvents.length,
          teams: data.teams.length,
          tournaments: data.tournaments.length,
          grounds: data.grounds.length,
        },
      };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Invalid backup file.' };
    }
  }

  private static recordTimestamp(record: { updatedAt?: string; createdAt?: string }): number {
    const t = Date.parse(record?.updatedAt ?? record?.createdAt ?? '');
    return Number.isFinite(t) ? t : 0;
  }

  /**
   * Imports a validated database backup (P6 hardened).
   *
   * Modes:
   * - 'merge' (default): per record, an incoming record is added
   *   when its id is new locally, replaces the local copy only
   *   when it is NEWER (updatedAt, falling back to createdAt),
   *   and is skipped when the local copy is newer — restoring an
   *   old backup can never silently clobber newer local work.
   *   Match events follow the matches actually written.
   * - 'replace': the five data tables are cleared inside the
   *   same transaction and repopulated with the file's records.
   *
   * Team players are normalised through the same player-identity
   * intake as Drive/Sync restores (existing local players are
   * passed as previous so stable ids survive a re-import).
   * appMetadata is deliberately NOT restored: it holds
   * device-local state (last active match, install dismissal).
   */
  static async importDatabase(
    jsonString: string,
    mode: 'merge' | 'replace' = 'merge',
  ): Promise<{
    success: boolean;
    restored: { matches: number; teams: number; tournaments: number; grounds: number };
    detail: { added: number; updated: number; skipped: number };
    error?: string;
  }> {
    const zero = { matches: 0, teams: 0, tournaments: 0, grounds: 0 };
    try {
      const data = this.parseBackup(jsonString);

      let restoredMatches = 0;
      let restoredTeams = 0;
      let restoredTournaments = 0;
      let restoredGrounds = 0;
      let added = 0;
      let updated = 0;
      let skipped = 0;

      await db.transaction('rw', [db.matches, db.match_events, db.teams, db.tournaments, db.grounds], async () => {
        if (mode === 'replace') {
          await Promise.all([
            db.matches.clear(),
            db.match_events.clear(),
            db.teams.clear(),
            db.tournaments.clear(),
            db.grounds.clear(),
          ]);
          const teams = data.teams.map((t) => ({ ...t, players: normalizeTeamPlayers(t.players) }));
          if (data.matches.length > 0) await db.matches.bulkPut(data.matches);
          if (data.matchEvents.length > 0) await db.match_events.bulkPut(data.matchEvents);
          if (teams.length > 0) await db.teams.bulkPut(teams);
          if (data.tournaments.length > 0) await db.tournaments.bulkPut(data.tournaments);
          if (data.grounds.length > 0) await db.grounds.bulkPut(data.grounds);
          restoredMatches = data.matches.length;
          restoredTeams = teams.length;
          restoredTournaments = data.tournaments.length;
          restoredGrounds = data.grounds.length;
          added = restoredMatches + restoredTeams + restoredTournaments + restoredGrounds;
          return;
        }

        // merge: updatedAt-aware upsert per collection
        const mergeInto = async <T extends { id: string; updatedAt?: string; createdAt?: string }>(
          table: { toArray: () => Promise<T[]>; bulkPut: (records: T[]) => Promise<unknown> },
          incoming: T[],
          prepare?: (record: T, local?: T) => T,
        ): Promise<{ written: T[] }> => {
          if (incoming.length === 0) return { written: [] };
          const localById = new Map((await table.toArray()).map((r) => [r.id, r]));
          const toPut: T[] = [];
          for (const record of incoming) {
            const local = localById.get(record.id);
            if (!local) {
              toPut.push(prepare ? prepare(record, undefined) : record);
              added++;
            } else if (this.recordTimestamp(record) > this.recordTimestamp(local)) {
              toPut.push(prepare ? prepare(record, local) : record);
              updated++;
            } else {
              skipped++;
            }
          }
          if (toPut.length > 0) await table.bulkPut(toPut);
          return { written: toPut };
        };

        const matchResult = await mergeInto(db.matches, data.matches);
        restoredMatches = matchResult.written.length;
        const writtenMatchIds = new Set(matchResult.written.map((m: any) => m.id));
        const eventsToWrite = data.matchEvents.filter((e: any) => writtenMatchIds.has(e.matchId));
        if (eventsToWrite.length > 0) await db.match_events.bulkPut(eventsToWrite);

        const teamResult = await mergeInto(db.teams, data.teams, (record: any, local: any) => ({
          ...record,
          players: normalizeTeamPlayers(record.players, local?.players),
        }));
        restoredTeams = teamResult.written.length;

        const tournamentResult = await mergeInto(db.tournaments, data.tournaments);
        restoredTournaments = tournamentResult.written.length;

        const groundResult = await mergeInto(db.grounds, data.grounds);
        restoredGrounds = groundResult.written.length;
      });

      return {
        success: true,
        restored: {
          matches: restoredMatches,
          teams: restoredTeams,
          tournaments: restoredTournaments,
          grounds: restoredGrounds,
        },
        detail: { added, updated, skipped },
      };
    } catch (err: any) {
      return {
        success: false,
        restored: { ...zero },
        detail: { added: 0, updated: 0, skipped: 0 },
        error: err?.message || 'Failed to parse or restore database.',
      };
    }
  }

  /**
   * Downloads the current database as a backup JSON file (P6).
   * Used by the file-backup section's export button and by the
   * pre-restore safety snapshot (D6) before any replace restore.
   */
  static async downloadBackupSnapshot(prefix: string): Promise<{
    ok: boolean;
    stats?: { matches: number; teams: number; tournaments: number; grounds: number };
  }> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return { ok: false };
    }
    try {
      const { jsonString, stats } = await this.exportDatabase();
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${prefix}-${stamp}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      return { ok: true, stats };
    } catch {
      return { ok: false };
    }
  }
}
