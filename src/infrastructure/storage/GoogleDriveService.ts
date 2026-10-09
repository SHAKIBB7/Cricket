import { db } from '../database/dexie-db';

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
  };
  matches: any[];
  matchEvents: any[];
  teams: any[];
  tournaments: any[];
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

  // In-memory token cache (strictly never persisted to localStorage or IndexedDB)
  private static cachedAccessToken: string | null = null;
  private static tokenExpiresAt: number = 0;

  /**
   * Clears the in-memory access token cache.
   */
  static clearCachedToken(): void {
    this.cachedAccessToken = null;
    this.tokenExpiresAt = 0;
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
    // Return cached token if valid for at least 60 seconds
    if (this.cachedAccessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.cachedAccessToken;
    }

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

            const expiresIn = Number(response.expires_in) || 3599;
            this.cachedAccessToken = response.access_token;
            this.tokenExpiresAt = Date.now() + expiresIn * 1000;
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
   */
  static async createBackupPayload(userUid?: string): Promise<BackupPayload> {
    const [matches, matchEvents, teams, tournaments] = await Promise.all([
      db.matches.toArray(),
      db.match_events.toArray(),
      db.teams.toArray(),
      db.tournaments.toArray(),
    ]);

    return {
      app: 'Cric Scorer Pro',
      version: '2.5.0',
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      userUid: userUid || null,
      stats: {
        matchesCount: matches.length,
        teamsCount: teams.length,
        tournamentsCount: tournaments.length,
        matchEventsCount: matchEvents.length,
      },
      matches,
      matchEvents,
      teams,
      tournaments,
    };
  }

  /**
   * Uploads backup JSON payload to Google Drive using multipart upload.
   */
  static async uploadBackup(
    accessToken: string,
    backupData: BackupPayload
  ): Promise<{ id: string; name: string }> {
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
   * Restores a backup payload into IndexedDB safely using transactional bulkPut.
   */
  static async restoreToIndexedDb(backupData: any): Promise<DriveRestoreSummary> {
    if (!backupData || typeof backupData !== 'object') {
      throw new Error('Invalid backup file format: Payload is empty or corrupted.');
    }

    if (
      !Array.isArray(backupData.matches) &&
      !Array.isArray(backupData.teams) &&
      !Array.isArray(backupData.tournaments)
    ) {
      throw new Error('Invalid Cric Scorer Pro backup structure: No matches, teams, or tournaments found.');
    }

    const matchesCount = Array.isArray(backupData.matches) ? backupData.matches.length : 0;
    const teamsCount = Array.isArray(backupData.teams) ? backupData.teams.length : 0;
    const tournamentsCount = Array.isArray(backupData.tournaments) ? backupData.tournaments.length : 0;
    const matchEventsCount = Array.isArray(backupData.matchEvents) ? backupData.matchEvents.length : 0;

    await db.transaction('rw', [db.matches, db.match_events, db.teams, db.tournaments, db.app_metadata], async () => {
      if (matchesCount > 0) {
        await db.matches.bulkPut(backupData.matches);
      }
      if (matchEventsCount > 0) {
        await db.match_events.bulkPut(backupData.matchEvents);
      }
      if (teamsCount > 0) {
        await db.teams.bulkPut(backupData.teams);
      }
      if (tournamentsCount > 0) {
        await db.tournaments.bulkPut(backupData.tournaments);
      }
      // If there is an ongoing match in the restored data, ensure last_active_match_id is configured
      if (matchesCount > 0) {
        const ongoingMatch = backupData.matches.find((m: any) => m.status === 'ONGOING');
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
      matchesCount,
      teamsCount,
      tournamentsCount,
      matchEventsCount,
    };
  }
}
