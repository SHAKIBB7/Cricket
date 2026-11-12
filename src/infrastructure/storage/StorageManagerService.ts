/**
 * StorageManagerService
 * 
 * Manages persistent storage requests, quota monitoring, quota exhaustion mitigation,
 * and app metadata storage for resilient offline-first operation.
 */

import { db } from '../database/dexie-db';
import { normalizeTeamPlayers } from '@/domain/teams/playerIdentity';
import { downloadBlob } from '@/lib/download';

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
  private static deviceIdCache: string | null = null;

  /**
   * PWA programme P7: this device's stable identity for sync
   * provenance. Generated once, persisted in app_metadata, and
   * stable for the life of the browser profile's data. It names
   * the DEVICE, never the user, and is shown in diagnostics.
   */
  static async getOrCreateDeviceId(): Promise<string> {
    if (this.deviceIdCache) return this.deviceIdCache;
    const existing = await this.getMetadata<string>('device_id');
    if (existing) {
      this.deviceIdCache = existing;
      return existing;
    }
    const id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;
    await this.setMetadata('device_id', id);
    this.deviceIdCache = id;
    return id;
  }

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
      version: this.BACKUP_FORMAT_VERSION,
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

  /** The format version exportDatabase stamps on new backups. */
  private static readonly BACKUP_FORMAT_VERSION = '2.5.0';

  /**
   * Backup file versions this build can restore (P6). D-9:
   * accepting a SET, not one exact string — when the export
   * stamp is ever bumped, add the new version here (one line)
   * and KEEP every older one users may still hold files for,
   * so a format bump never orphans existing backups. The
   * current stamp (BACKUP_FORMAT_VERSION) must always be a
   * member; a test pins that.
   */
  private static readonly SUPPORTED_BACKUP_VERSIONS: readonly string[] = ['2.5.0'];
  private static readonly BACKUP_APP_NAME = 'Cric Scorer Pro';

  /**
   * Parses and validates a backup envelope (P6 hardening). Shared
   * by the import itself and the UI's pre-import peek, so what the
   * user is shown is exactly what will be enforced. Throws with a
   * user-readable message on any problem.
   */
  /** D-11: every restorable record needs a non-empty string id
   * (the same filter the Drive restore applies). */
  private static hasUsableId(record: any): boolean {
    return (
      !!record &&
      typeof record === 'object' &&
      typeof record.id === 'string' &&
      record.id.trim() !== ''
    );
  }

  private static isStringField(record: any, field: string): boolean {
    return typeof record?.[field] === 'string';
  }

  private static parseBackup(jsonString: string): {
    matches: any[]; matchEvents: any[]; teams: any[]; tournaments: any[]; grounds: any[];
    version: string; exportedAt?: string; droppedRecords: number;
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

    // D-11: validate the RECORDS, not just the envelope. A
    // malformed or hand-edited file (the format is plain JSON
    // and users share/edit them) could otherwise insert
    // semantically broken records — a match with no teams, a
    // tournament with no teams list — that Dexie stores happily
    // and that surface later as broken rows, parked sync ops or
    // crashes far from the import. Records failing the minimal
    // per-type sanity checks are dropped and counted; the
    // restore dialog's counts (peek shares this parser) then
    // reflect what will actually be restored.
    let droppedRecords = 0;
    const keepValid = (records: any[], isValid: (r: any) => boolean): any[] => {
      const kept = records.filter(isValid);
      droppedRecords += records.length - kept.length;
      return kept;
    };

    return {
      matches: keepValid(Array.isArray(data.matches) ? data.matches : [], (r) =>
        this.hasUsableId(r) && this.isStringField(r, 'teamA') && this.isStringField(r, 'teamB')),
      matchEvents: Array.isArray(data.matchEvents) ? data.matchEvents : [],
      teams: keepValid(Array.isArray(data.teams) ? data.teams : [], (r) =>
        this.hasUsableId(r) && this.isStringField(r, 'name')),
      tournaments: keepValid(Array.isArray(data.tournaments) ? data.tournaments : [], (r) =>
        this.hasUsableId(r) && this.isStringField(r, 'name') && Array.isArray(r.teams)),
      grounds: keepValid(Array.isArray(data.grounds) ? data.grounds : [], (r) =>
        this.hasUsableId(r) && this.isStringField(r, 'name')),
      version: data.version,
      exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : undefined,
      droppedRecords,
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
   *
   * D-3: records the restore writes are stored as PENDING and
   * queued for sync afterwards — a restore onto a fresh device
   * must upload from that device, not silently stay local.
   * D-11: parseBackup drops (and counts) records that fail
   * minimal per-type validation before any of this runs.
   */
  static async importDatabase(
    jsonString: string,
    mode: 'merge' | 'replace' = 'merge',
  ): Promise<{
    success: boolean;
    restored: { matches: number; teams: number; tournaments: number; grounds: number };
    detail: { added: number; updated: number; skipped: number };
    /** D-11: records dropped by parse-time record validation. */
    dropped: number;
    error?: string;
  }> {
    const zero = { matches: 0, teams: 0, tournaments: 0, grounds: 0 };
    try {
      const data = this.parseBackup(jsonString);

      // D-3: a record this restore writes is PENDING until THIS
      // device has pushed it — whatever syncStatus the file
      // carries describes the exporting device, and pulls never
      // push local-only records, so a restore that left the
      // file's 'SYNCED' in place would strand the data on this
      // device forever while claiming it was safe. Written
      // records are queued for sync after the transaction
      // (enqueueRestoredForSync).
      const pendingMatches = data.matches.map((m: any) => ({ ...m, syncStatus: 'PENDING' }));
      const pendingTeams = data.teams.map((t: any) => ({ ...t, syncStatus: 'PENDING' }));
      const pendingTournaments = data.tournaments.map((t: any) => ({ ...t, syncStatus: 'PENDING' }));
      const pendingGrounds = data.grounds.map((g: any) => ({ ...g, syncStatus: 'PENDING' }));
      const written: { matches: any[]; teams: any[]; tournaments: any[]; grounds: any[] } = {
        matches: [],
        teams: [],
        tournaments: [],
        grounds: [],
      };

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
          const teams = pendingTeams.map((t) => ({ ...t, players: normalizeTeamPlayers(t.players) }));
          if (pendingMatches.length > 0) await db.matches.bulkPut(pendingMatches);
          if (data.matchEvents.length > 0) await db.match_events.bulkPut(data.matchEvents);
          if (teams.length > 0) await db.teams.bulkPut(teams);
          if (pendingTournaments.length > 0) await db.tournaments.bulkPut(pendingTournaments);
          if (pendingGrounds.length > 0) await db.grounds.bulkPut(pendingGrounds);
          written.matches = pendingMatches;
          written.teams = teams;
          written.tournaments = pendingTournaments;
          written.grounds = pendingGrounds;
          restoredMatches = pendingMatches.length;
          restoredTeams = teams.length;
          restoredTournaments = pendingTournaments.length;
          restoredGrounds = pendingGrounds.length;
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

        const matchResult = await mergeInto(db.matches, pendingMatches);
        written.matches = matchResult.written;
        restoredMatches = matchResult.written.length;
        const writtenMatchIds = new Set(matchResult.written.map((m: any) => m.id));
        const eventsToWrite = data.matchEvents.filter((e: any) => writtenMatchIds.has(e.matchId));
        if (eventsToWrite.length > 0) await db.match_events.bulkPut(eventsToWrite);

        // Correctness audit finding 6 (2026-11-11): converge
        // deletions, mirroring SyncEngine.applyRemoteMatchEvents
        // (P3-H2). Merge-writing a match's events used to be
        // additive only, so local events absent from the backup
        // (balls scored after the backup's list diverged, then
        // removed by an edit whose scorecard the backup carries)
        // survived the restore and were replayed on the next
        // event-based rebuild, resurrecting deleted balls. Same
        // guard as the sync path: only for a written match whose
        // incoming event list is non-empty — an empty list means
        // the backup simply carries no log for it, never a
        // licence to wipe the local one.
        const incomingEventIdsByMatch = new Map<string, Set<string>>();
        for (const e of eventsToWrite) {
          const ids = incomingEventIdsByMatch.get(e.matchId) ?? new Set<string>();
          ids.add(e.eventId);
          incomingEventIdsByMatch.set(e.matchId, ids);
        }
        for (const [matchId, incomingIds] of incomingEventIdsByMatch) {
          const localEvents = await db.match_events.where('matchId').equals(matchId).toArray();
          const staleIds = localEvents
            .filter((e) => !incomingIds.has(e.eventId))
            .map((e) => e.eventId);
          if (staleIds.length > 0) {
            await db.match_events.bulkDelete(staleIds);
          }
        }

        const teamResult = await mergeInto(db.teams, pendingTeams, (record: any, local: any) => ({
          ...record,
          players: normalizeTeamPlayers(record.players, local?.players),
        }));
        written.teams = teamResult.written;
        restoredTeams = teamResult.written.length;

        const tournamentResult = await mergeInto(db.tournaments, pendingTournaments);
        written.tournaments = tournamentResult.written;
        restoredTournaments = tournamentResult.written.length;

        const groundResult = await mergeInto(db.grounds, pendingGrounds);
        written.grounds = groundResult.written;
        restoredGrounds = groundResult.written.length;
      });

      // D-3: queue an UPSERT for every record the restore wrote,
      // so restored data actually reaches the cloud from this
      // device. Runs after (never inside) the Dexie transaction.
      await this.enqueueRestoredForSync(written);

      return {
        success: true,
        restored: {
          matches: restoredMatches,
          teams: restoredTeams,
          tournaments: restoredTournaments,
          grounds: restoredGrounds,
        },
        detail: { added, updated, skipped },
        dropped: data.droppedRecords,
      };
    } catch (err: any) {
      return {
        success: false,
        restored: { ...zero },
        detail: { added: 0, updated: 0, skipped: 0 },
        dropped: 0,
        error: err?.message || 'Failed to parse or restore database.',
      };
    }
  }

  /**
   * D-3: queue sync UPSERTs for the records a restore wrote.
   * Works signed-out too — queueMutation needs no session (ops
   * carry guest provenance and drain when a session exists);
   * the records themselves are already stored as PENDING, which
   * is the honest state if queueing itself fails. Lazy dynamic
   * import on purpose: SyncEngine imports THIS service
   * statically (device-id provenance), so a static import here
   * would close a module cycle. Best-effort by design — a queue
   * failure must never fail a completed restore.
   */
  private static async enqueueRestoredForSync(written: {
    matches: any[];
    teams: any[];
    tournaments: any[];
    grounds: any[];
  }): Promise<void> {
    const total =
      written.matches.length +
      written.teams.length +
      written.tournaments.length +
      written.grounds.length;
    if (total === 0) return;
    try {
      const { SyncEngine } = await import('../sync/SyncEngine');
      for (const m of written.matches) {
        await SyncEngine.queueMutation('UPSERT_MATCH', m, m.id);
      }
      for (const t of written.teams) {
        await SyncEngine.queueMutation('UPSERT_TEAM', t, t.id);
      }
      for (const t of written.tournaments) {
        await SyncEngine.queueMutation('UPSERT_TOURNAMENT', t, t.id);
      }
      for (const g of written.grounds) {
        await SyncEngine.queueMutation('UPSERT_GROUND', g, g.id);
      }
    } catch (err) {
      console.warn('StorageManagerService: Failed to queue restored records for sync', err);
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
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      // Bug hunt P-2: deliver via the shared helper so an Android
      // WebView wrapper gets the share-sheet fallback instead of a
      // dead blob: download.
      await downloadBlob(blob, `${prefix}-${stamp}.json`);
      return { ok: true, stats };
    } catch {
      return { ok: false };
    }
  }
}
