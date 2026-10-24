/**
 * ==============================================================================
 * Phase 2 Architecture Specification: Google Drive Backup & Restore Foundation
 * ==============================================================================
 * 
 * CRITICAL ARCHITECTURAL CONTEXT & BOUNDARIES:
 * 1. Separation of Concerns:
 *    - Firebase Authentication provides user identity and session persistence (canonical UID).
 *    - Firebase Google Sign-In ID tokens do NOT grant Google Drive API authorization.
 *    - Drive authorization MUST NOT be requested during normal sign-in.
 * 
 * 2. Least-Privilege OAuth Scope:
 *    - The application MUST strictly request `https://www.googleapis.com/auth/drive.file`.
 *    - This scope only allows the app to view and manage files and folders that the app itself created.
 *    - Never request full `https://www.googleapis.com/auth/drive` or read-all scopes.
 * 
 * 3. Token Handling & Storage Security:
 *    - Long-lived OAuth refresh tokens MUST NEVER be stored in client-side storage (localStorage, IndexedDB).
 *    - Drive Access Tokens must remain ephemeral (held in memory only during the active backup/restore operation).
 * 
 * 4. Incremental Consent Mechanism:
 *    - Uses Google Identity Services (GIS) Token Model (`google.accounts.oauth2.initTokenClient`).
 *    - The user is only prompted for Drive permissions when they explicitly click "Backup to Google Drive" or "Restore from Google Drive".
 */

export interface GoogleDriveAuthConfig {
  clientId: string;
  scope: 'https://www.googleapis.com/auth/drive.file';
}

export interface EphemeralDriveSession {
  accessToken: string;
  expiresAt: number;
}

export class GoogleDriveAuthSpec {
  static readonly REQUIRED_SCOPE = 'https://www.googleapis.com/auth/drive.file';

  /**
   * Verifies whether a given token is an ephemeral Drive Access Token
   * and not a Firebase Auth ID Token.
   */
  static isDriveAccessToken(token: string): boolean {
    if (!token || typeof token !== 'string') return false;
    // Firebase ID tokens are standard JWTs (3 segments separated by dots)
    const isJwt = token.split('.').length === 3;
    // GIS OAuth 2.0 access tokens typically start with 'ya29.'
    return !isJwt && token.startsWith('ya29.');
  }

  /**
   * Enforces strict token boundary: verifies that a token is indeed a valid Drive access token
   * and explicitly rejects Firebase ID tokens / JWTs.
   */
  static assertTokenSeparation(token: string): void {
    if (!token || typeof token !== 'string') {
      throw new Error('Access token is required.');
    }
    const isJwt = token.split('.').length === 3;
    if (isJwt) {
      throw new Error('Security Error: A Firebase Auth ID token (JWT) was passed where a Google Drive OAuth access token was expected. These tokens are not interchangeable.');
    }
    if (!this.isDriveAccessToken(token)) {
      throw new Error('Security Error: Invalid Google Drive OAuth access token format.');
    }
  }

  /**
   * Generates token client configuration for Google Identity Services.
   */
  static getGisTokenClientConfig(clientId: string, onTokenReceived: (tokenResponse: any) => void) {
    return {
      client_id: clientId,
      scope: this.REQUIRED_SCOPE,
      callback: onTokenReceived,
      prompt: '', // Incremental authorization prompt
    };
  }
}
