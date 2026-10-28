import { db } from '../database/dexie-db';
import { GoogleDriveAuthSpec } from '../auth/google-drive-auth-spec';

export interface DriveBackupFile {
  id: string;
  name: string;
  createdTime: string;
  modifiedTime?: string;
  size?: string;
}

export interface DriveRestoreSummary {
  matchesCount: number;
  teamsCount: number;
  tournamentsCount: number;
  matchEventsCount: number;
  groundsCount?: number;
}

export interface BackupPayload {
  app: string;
  version: string;
  schemaVersion: number;
  exportedAt: string;
  userUid: string | null;
  stats: {
    matchesCount: number;
    teamsCount: number;
    tournamentsCount: number;
    matchEventsCount: number;
    groundsCount?: number;
  };
  matches: any[];
  matchEvents: any[];
  teams: any[];
  tournaments: any[];
  grounds?: any[];
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: any) => void;
            error_callback?: (error: any) => void;
            prompt?: string;
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}

export class GoogleDriveService {
  /**
   * Least-privilege scope: only access files created or opened by this app.
   */
  static readonly DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

  /**
   * Maximum ephemeral in-memory retention window (5 minutes).
   * Prevents long-lived token retention in client memory.
   */
  static readonly MAX_EPHEMERAL_TTL_MS = 5 * 60 * 1000;

  // In-memory token cache (strictly never persisted to localStorage or IndexedDB)
  private static cachedAccessToken: string | null = null;
  private static tokenExpiresAt: number = 0;

  /**
   * Clears the in-memory access token cache immediately.
   */
  static clearCachedToken(): void {
    this.cachedAccessToken = null;
    this.tokenExpiresAt = 0;
  }

  /**
   * Retrieves the currently active cached ephemeral access token if valid and unexpired.
   */
  static getCachedAccessToken(): string | null {
    if (this.cachedAccessToken && Date.now() < this.tokenExpiresAt - 15000) {
      return this.cachedAccessToken;
    }
    return null;
  }

  /**
   * Test/internal helper to inject an ephemeral token with TTL capping.
   */
  static setCachedTokenForTesting(token: string | null, expiresInSec = 3600): void {
    if (!token) {
      this.clearCachedToken();
      return;
    }
    const effectiveTtlMs = Math.min(expiresInSec * 1000, this.MAX_EPHEMERAL_TTL_MS);
    this.cachedAccessToken = token;
    this.tokenExpiresAt = Date.now() + effectiveTtlMs;
  }

  /**
   * Revokes the active Google Drive access token with Google OAuth2 revocation endpoint
   * and immediately purges in-memory token state.
   */
  static async revokeAccessToken(tokenToRevoke?: string): Promise<boolean> {
    const targetToken = tokenToRevoke || this.cachedAccessToken;
    this.clearCachedToken();
    if (!targetToken) return true;

    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(targetToken)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Diagnostic check for whether Google Drive OAuth Client ID is configured.
   */
  static isDriveConfigured(): boolean {
    const rawClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    return Boolean(
      rawClientId &&
      rawClientId.trim() !== '' &&
      !rawClientId.includes('xxxxxxxx') &&
      !rawClientId.startsWith('your-') &&
      rawClientId !== '[SENSITIVE]' &&
      rawClientId.endsWith('.apps.googleusercontent.com')
    );
  }

  /**
   * Dynamically loads Google Identity Services client script if not already on page.
   */
  static async loadGisScript(): Promise<void> {
    if (typeof window === 'undefined') return;
    if (window.google?.accounts?.oauth2) return;

    return new Promise((resolve, reject) => {
      const existingScript = document.getElementById('google-gsi-client');
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve());
        existingScript.addEventListener('error', (e) => reject(new Error('Failed to load Google Identity Services.')));
        return;
      }

      const script = document.createElement('script');
      script.id = 'google-gsi-client';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Google Identity Services SDK.'));
      document.body.appendChild(script);
    });
  }

  /**
   * Retrieves an ephemeral access token for Google Drive API using incremental authorization.
   */
  static async requestAccessToken(customClientId?: string): Promise<string> {
    // Return cached token if valid and within ephemeral retention window
    if (this.cachedAccessToken && Date.now() < this.tokenExpiresAt - 15000) {
      return this.cachedAccessToken;
    }

    // Ephemeral token expired or close to expiry: cleanly purge
    this.clearCachedToken();

    if (typeof window === 'undefined') {
      throw new Error('Google Drive authorization requires a browser environment.');
    }

    await this.loadGisScript();

    const rawClientId = customClientId || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const isUnconfiguredClientId =
      !rawClientId ||
      rawClientId.trim() === '' ||
      rawClientId.includes('xxxxxxxx') ||
      rawClientId.startsWith('your-') ||
      rawClientId === '[SENSITIVE]';

    if (isUnconfiguredClientId) {
      throw new Error(
        'Google OAuth Client ID is not configured. Please set NEXT_PUBLIC_GOOGLE_CLIENT_ID in your environment variables (e.g. Vercel Project Settings or .env.local).'
      );
    }

    const clientId = rawClientId;

    return new Promise((resolve, reject) => {
      try {
        const tokenClient = window.google!.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: this.DRIVE_FILE_SCOPE,
          callback: (response: any) => {
            if (response.error) {
              reject(new Error(`Drive authorization error: ${response.error_description || response.error}`));
              return;
            }
            if (!response.access_token) {
              reject(new Error('No access token received from Google Identity Services.'));
              return;
            }

            const receivedExpiresInSec = Number(response.expires_in) || 3599;
            // Cap in-memory retention strictly to MAX_EPHEMERAL_TTL_MS (5 min)
            const effectiveTtlMs = Math.min(receivedExpiresInSec * 1000, this.MAX_EPHEMERAL_TTL_MS);
            this.cachedAccessToken = response.access_token;
            this.tokenExpiresAt = Date.now() + effectiveTtlMs;
            resolve(response.access_token);
          },
          error_callback: (err: any) => {
            reject(new Error(err?.message || 'Authorization popup closed or request cancelled.'));
          },
        });

        tokenClient.requestAccessToken({ prompt: '' });
      } catch (err: any) {
        reject(new Error(`Failed to initialize Google token client: ${err.message || err}`));
      }
    });
  }

  /**
   * Creates full backup JSON payload from IndexedDB tables without interrupting local operations.
   * If userUid is provided, ensures only data belonging to or created by that user is included.
   */
  static async createBackupPayload(userUid?: string): Promise<BackupPayload> {
    const [matches, matchEvents, teams, tournaments, grounds] = await Promise.all([
      db.matches.toArray(),
      db.match_events.toArray(),
      db.teams.toArray(),
      db.tournaments.toArray(),
      db.grounds.toArray(),
    ]);

    // Apply strict user isolation if userUid is provided:
    const filteredMatches = userUid
      ? matches.filter((m: any) => !m.userId && !m.user_id ? true : (m.userId === userUid || m.user_id === userUid))
      : matches;

    const filteredTeams = userUid
      ? teams.filter((t: any) => !t.userId && !t.user_id ? true : (t.userId === userUid || t.user_id === userUid))
      : teams;

    const filteredTournaments = userUid
      ? tournaments.filter((trn: any) => !trn.userId && !trn.user_id ? true : (trn.userId === userUid || trn.user_id === userUid))
      : tournaments;

    const filteredGrounds = userUid
      ? grounds.filter((g: any) => !g.userId && !g.user_id ? true : (g.userId === userUid || g.user_id === userUid))
      : grounds;

    // Only include match events belonging to the included matches
    const allowedMatchIds = new Set(filteredMatches.map((m: any) => m.id));
    const filteredMatchEvents = matchEvents.filter((e: any) => allowedMatchIds.has(e.matchId));

    return {
      app: 'Cric Scorer Pro',
      version: '2.5.0',
      schemaVersion: 3,
      exportedAt: new Date().toISOString(),
      userUid: userUid || null,
      stats: {
        matchesCount: filteredMatches.length,
        teamsCount: filteredTeams.length,
        tournamentsCount: filteredTournaments.length,
        matchEventsCount: filteredMatchEvents.length,
        groundsCount: filteredGrounds.length,
      },
      matches: filteredMatches,
      matchEvents: filteredMatchEvents,
      teams: filteredTeams,
      tournaments: filteredTournaments,
      grounds: filteredGrounds,
    };
  }

  /**
   * Uploads backup JSON payload to Google Drive using multipart upload.
   */
  static async uploadBackup(
    accessToken: string,
    backupData: BackupPayload
  ): Promise<{ id: string; name: string }> {
    GoogleDriveAuthSpec.assertTokenSeparation(accessToken);
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `cric-scorer-pro-backup-${dateStr}.json`;

    const metadata = {
      name: fileName,
      mimeType: 'application/json',
      description: 'Cric Scorer Pro Cricket Match & Tournament Backup',
      appProperties: {
        app: 'cric-scorer-pro',
        version: backupData.version || '2.5.0',
        exportedAt: backupData.exportedAt,
      },
    };

    const boundary = '-------cric_scorer_pro_multipart_boundary_314159';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(backupData, null, 2) +
      closeDelimiter;

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        this.clearCachedToken();
      }
      const errText = await response.text();
      throw new Error(`Google Drive upload failed (${response.status}): ${errText}`);
    }

    const result = await response.json();
    return {
      id: result.id,
      name: result.name || fileName,
    };
  }

  /**
   * Queries Google Drive for backups previously created by Cric Scorer Pro.
   */
  static async listBackups(accessToken: string): Promise<DriveBackupFile[]> {
    GoogleDriveAuthSpec.assertTokenSeparation(accessToken);
    const query = encodeURIComponent("name contains 'cric-scorer-pro-backup' and trashed = false");
    const fields = encodeURIComponent('files(id, name, createdTime, modifiedTime, size)');
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&orderBy=createdTime%20desc&pageSize=30`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        this.clearCachedToken();
      }
      const errText = await response.text();
      throw new Error(`Failed to list backups from Google Drive (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return data.files || [];
  }

  /**
   * Downloads backup file content from Google Drive by fileId.
   */
  static async downloadBackup(accessToken: string, fileId: string): Promise<BackupPayload> {
    GoogleDriveAuthSpec.assertTokenSeparation(accessToken);
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        this.clearCachedToken();
      }
      const errText = await response.text();
      throw new Error(`Failed to download backup file (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return data;
  }

  /**
   * Permanently deletes a specific backup snapshot file from Google Drive by fileId.
   * Under drive.file scope, this cleanly removes the file without affecting any local
   * match data or any other cloud backups.
   */
  static async deleteBackup(accessToken: string, fileId: string): Promise<void> {
    GoogleDriveAuthSpec.assertTokenSeparation(accessToken);
    if (!fileId) {
      throw new Error('File ID is required to delete a backup.');
    }

    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.status === 401) {
      this.clearCachedToken();
      throw new Error('Google Drive authorization expired (401). Please try again.');
    }

    if (!response.ok && response.status !== 204 && response.status !== 404) {
      const errText = await response.text();
      throw new Error(`Failed to delete backup from Google Drive (${response.status}): ${errText}`);
    }
  }

  /**
   * Restores a backup payload into IndexedDB safely using transactional operations.
   * Supports mode: 'merge' (default, non-destructive upsert) or 'replace' (clears existing tables first).
   * Validates schemaVersion, structural integrity, and user authorization before committing.
   */
  static async restoreToIndexedDb(
    backupData: any,
    options?: { mode?: 'merge' | 'replace'; expectedUserUid?: string }
  ): Promise<DriveRestoreSummary> {
    if (!backupData || typeof backupData !== 'object') {
      throw new Error('Invalid backup file format: Payload is empty or corrupted.');
    }

    if (
      !Array.isArray(backupData.matches) &&
      !Array.isArray(backupData.teams) &&
      !Array.isArray(backupData.tournaments) &&
      !Array.isArray(backupData.grounds)
    ) {
      throw new Error('Invalid Cric Scorer Pro backup structure: No matches, teams, tournaments, or grounds found.');
    }

    if (backupData.app && backupData.app !== 'Cric Scorer Pro' && backupData.app !== 'cric-scorer-pro') {
      throw new Error(`Invalid Cric Scorer Pro backup structure: Unknown application signature (${backupData.app}).`);
    }

    // Schema version check and migration support (support v1, v2, and v3)
    const schemaVersion = backupData.schemaVersion ?? 1;
    if (typeof schemaVersion === 'number' && schemaVersion > 3) {
      throw new Error(`Unsupported backup schema version (${schemaVersion}). Please update Cric Scorer Pro.`);
    }

    // User ownership verification: prevent cross-account data pollution
    if (options?.expectedUserUid) {
      if (backupData.userUid && backupData.userUid !== options.expectedUserUid) {
        throw new Error(
          `Unauthorized backup: This backup belongs to another user (${backupData.userUid}). Cannot restore to account (${options.expectedUserUid}).`
        );
      }
      if (Array.isArray(backupData.matches)) {
        for (const m of backupData.matches) {
          const mUid = m?.userId || m?.user_id;
          if (mUid && mUid !== options.expectedUserUid) {
            throw new Error('Unauthorized backup: Payload contains records belonging to a different user.');
          }
        }
      }
    }

    const rawMatches = Array.isArray(backupData.matches) ? backupData.matches : [];
    const rawTeams = Array.isArray(backupData.teams) ? backupData.teams : [];
    const rawTournaments = Array.isArray(backupData.tournaments) ? backupData.tournaments : [];
    const rawEvents = Array.isArray(backupData.matchEvents) ? backupData.matchEvents : [];
    const rawGrounds = Array.isArray(backupData.grounds) ? backupData.grounds : [];

    // Structural integrity validation & v1 -> v2 -> v3 migration
    const validMatches = rawMatches.filter(
      (m: any) => m && typeof m === 'object' && typeof m.id === 'string' && m.id.trim() !== ''
    );
    for (const m of validMatches) {
      if (!m.syncStatus) {
        m.syncStatus = 'SYNCED';
      }
      if (!m.updatedAt) {
        m.updatedAt = new Date().toISOString();
      }
    }

    const validTeams = rawTeams.filter(
      (t: any) => t && typeof t === 'object' && typeof t.id === 'string' && t.id.trim() !== ''
    );
    for (const t of validTeams) {
      if (!t.syncStatus) {
        t.syncStatus = 'SYNCED';
      }
    }

    const validTournaments = rawTournaments.filter(
      (tr: any) => tr && typeof tr === 'object' && typeof tr.id === 'string' && tr.id.trim() !== ''
    );
    const validMatchEvents = rawEvents.filter(
      (e: any) => e && typeof e === 'object' && typeof e.eventId === 'string' && typeof e.matchId === 'string'
    );
    const validGrounds = rawGrounds.filter(
      (g: any) => g && typeof g === 'object' && typeof g.id === 'string' && g.id.trim() !== ''
    );

    // Atomic transaction: If any error occurs, Dexie automatically rolls back and preserves all local data
    await db.transaction('rw', [db.matches, db.match_events, db.teams, db.tournaments, db.grounds, db.app_metadata], async () => {
      if (options?.mode === 'replace') {
        await db.matches.clear();
        await db.match_events.clear();
        await db.teams.clear();
        await db.tournaments.clear();
        await db.grounds.clear();
      }

      if (validMatches.length > 0) {
        await db.matches.bulkPut(validMatches);
      }
      if (validMatchEvents.length > 0) {
        await db.match_events.bulkPut(validMatchEvents);
      }
      if (validTeams.length > 0) {
        await db.teams.bulkPut(validTeams);
      }
      if (validTournaments.length > 0) {
        await db.tournaments.bulkPut(validTournaments);
      }
      if (validGrounds.length > 0) {
        await db.grounds.bulkPut(validGrounds);
      }

      // If an ongoing match is restored, update active match pointer
      if (validMatches.length > 0) {
        const ongoingMatch = validMatches.find((m: any) => m.status === 'ONGOING');
        if (ongoingMatch) {
          await db.app_metadata.put({
            key: 'last_active_match_id',
            value: ongoingMatch.id,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    });

    return {
      matchesCount: validMatches.length,
      teamsCount: validTeams.length,
      tournamentsCount: validTournaments.length,
      matchEventsCount: validMatchEvents.length,
      groundsCount: validGrounds.length,
    };
  }
}
