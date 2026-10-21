import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { firestore, isFirebaseConfigured, checkFirebaseConfigured } from './firebase';
import { FeatureHubRepository } from '../storage/FeatureHubRepository';
import { db } from '../database/dexie-db';

export type ProfileSyncStatus = 'SYNCED' | 'LOCAL_ONLY' | 'PENDING';

export interface UserProfileData {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  createdAt: string;
  updatedAt: string;
  lastDriveBackupAt?: string | null;
  syncStatus?: ProfileSyncStatus;
}

export interface DisplayNameValidationResult {
  isValid: boolean;
  normalized: string;
  error?: string;
}

export interface EmailValidationResult {
  isValid: boolean;
  normalized: string;
  error?: string;
}

export class UserProfileService {
  // In-flight synchronization deduplication to prevent concurrent race conditions
  private static inFlightSyncs = new Map<string, Promise<UserProfileData>>();

  /**
   * Validates and normalizes display name input.
   * Rules:
   * - Must not be empty or whitespace-only
   * - Strips invisible Unicode/control characters
   * - Supports legitimate international names (Bengali, Hindi, Arabic, European accents, etc.)
   * - Length must be between 2 and 50 characters
   */
  static validateDisplayName(name: string): DisplayNameValidationResult {
    if (!name || typeof name !== 'string' || name.length === 0) {
      return {
        isValid: false,
        normalized: '',
        error: 'Display name cannot be empty.',
      };
    }

    // Strip invisible zero-width and control characters, normalize internal whitespace
    const sanitized = name
      .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '')
      .trim()
      .replace(/\s+/g, ' ');

    if (sanitized.length < 2) {
      return {
        isValid: false,
        normalized: sanitized,
        error: 'Display name must be at least 2 characters long.',
      };
    }

    if (sanitized.length > 50) {
      return {
        isValid: false,
        normalized: sanitized,
        error: 'Display name cannot exceed 50 characters.',
      };
    }

    return {
      isValid: true,
      normalized: sanitized,
    };
  }

  /**
   * Normalizes an email address by trimming and converting to lowercase.
   */
  static normalizeEmail(email: string): string {
    return (email || '').trim().toLowerCase();
  }

  /**
   * Validates an email address format and length.
   */
  static validateEmail(email: string): EmailValidationResult {
    const normalized = this.normalizeEmail(email);
    if (!normalized) {
      return { isValid: false, normalized: '', error: 'Email address is required.' };
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalized) || normalized.length > 254) {
      return { isValid: false, normalized, error: 'Please enter a valid email address.' };
    }
    return { isValid: true, normalized };
  }

  /**
   * Retrieves a user profile document from Firestore by UID, with fallback to local Dexie IndexedDB.
   */
  static async getUserProfile(uid: string): Promise<UserProfileData | null> {
    if (!uid) throw new Error('User UID is required to fetch profile.');

    // Fallback to local Dexie profile if Firebase is not configured in current environment
    if (!checkFirebaseConfigured()) {
      const localProfile = await FeatureHubRepository.loadProfileByUid(uid);
      const meta = await db.app_metadata.get(`last_drive_backup_at_${uid}`);
      if (localProfile && (localProfile.uid === uid || !localProfile.uid)) {
        return {
          uid,
          displayName: localProfile.name,
          email: localProfile.email,
          photoURL: localProfile.photoUrl || null,
          createdAt: localProfile.createdAt || localProfile.lastSyncedAt || new Date().toISOString(),
          updatedAt: localProfile.lastSyncedAt || new Date().toISOString(),
          lastDriveBackupAt: meta ? meta.value : null,
          syncStatus: 'LOCAL_ONLY',
        };
      }
      return null;
    }

    try {
      const userDocRef = doc(firestore, 'users', uid);
      const userSnap = await getDoc(userDocRef);

      if (!userSnap.exists()) {
        // Document does not exist in Firestore; check local Dexie before returning null
        const local = await FeatureHubRepository.loadProfileByUid(uid);
        if (local) {
          const meta = await db.app_metadata.get(`last_drive_backup_at_${uid}`);
          return {
            uid,
            displayName: local.name,
            email: local.email,
            photoURL: local.photoUrl || null,
            createdAt: local.createdAt || local.lastSyncedAt || new Date().toISOString(),
            updatedAt: local.lastSyncedAt || new Date().toISOString(),
            lastDriveBackupAt: meta?.value || null,
            syncStatus: local.syncStatus || 'LOCAL_ONLY',
          };
        }
        return null;
      }

      const data = userSnap.data();
      const meta = await db.app_metadata.get(`last_drive_backup_at_${uid}`);
      const profile: UserProfileData = {
        uid,
        displayName: data.displayName || '',
        email: data.email || '',
        photoURL: data.photoURL || null,
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
        lastDriveBackupAt: data.lastDriveBackupAt || meta?.value || null,
        syncStatus: 'SYNCED',
      };

      // Keep Dexie local cache synchronized
      await FeatureHubRepository.saveProfile({
        uid: profile.uid,
        name: profile.displayName,
        email: profile.email,
        photoUrl: profile.photoURL || undefined,
        isLoggedIn: true,
        lastSyncedAt: profile.updatedAt,
        createdAt: profile.createdAt,
        syncStatus: 'SYNCED',
      });

      return profile;
    } catch (err: any) {
      console.warn(`[UserProfileService] Error fetching profile for ${uid}, falling back to local:`, err);
      // Attempt local Dexie fallback
      const localProfile = await FeatureHubRepository.loadProfileByUid(uid);
      const meta = await db.app_metadata.get(`last_drive_backup_at_${uid}`);
      if (localProfile) {
        return {
          uid,
          displayName: localProfile.name,
          email: localProfile.email,
          photoURL: localProfile.photoUrl || null,
          createdAt: localProfile.createdAt || localProfile.lastSyncedAt || new Date().toISOString(),
          updatedAt: localProfile.lastSyncedAt || new Date().toISOString(),
          lastDriveBackupAt: meta ? meta.value : null,
          syncStatus: localProfile.syncStatus || 'LOCAL_ONLY',
        };
      }
      return null;
    }
  }

  /**
   * Synchronizes or creates user profile on authentication:
   * 1. If user document exists: PRESERVES custom displayName, updates photo/email if changed.
   * 2. If user document does not exist: creates new profile using account details or local custom name.
   * 3. Syncs current profile to local Dexie IndexedDB for uninterrupted offline scoring.
   * 4. Deduplicates concurrent requests for the same UID.
   */
  static async syncOrCreateUserProfile(firebaseUser: {
    uid: string;
    displayName?: string | null;
    email?: string | null;
    photoURL?: string | null;
  }): Promise<UserProfileData> {
    const { uid, displayName, email, photoURL } = firebaseUser;
    if (!uid) throw new Error('Valid Firebase User with UID is required.');

    // Deduplicate concurrent calls for the same UID
    if (this.inFlightSyncs.has(uid)) {
      return this.inFlightSyncs.get(uid)!;
    }

    const syncPromise = this.executeSyncOrCreateUserProfile(firebaseUser);
    this.inFlightSyncs.set(uid, syncPromise);

    try {
      return await syncPromise;
    } finally {
      this.inFlightSyncs.delete(uid);
    }
  }

  private static async executeSyncOrCreateUserProfile(firebaseUser: {
    uid: string;
    displayName?: string | null;
    email?: string | null;
    photoURL?: string | null;
  }): Promise<UserProfileData> {
    const { uid, displayName, email, photoURL } = firebaseUser;
    const now = new Date().toISOString();
    const normalizedEmail = email ? this.normalizeEmail(email) : '';

    // Check existing local profile to preserve custom attributes and createdAt
    const localProfile = await FeatureHubRepository.loadProfileByUid(uid);
    const existingLocalName = localProfile?.name;
    const existingLocalCreatedAt = localProfile?.createdAt;

    // In environments without live Firebase configuration, store directly in Dexie
    if (!checkFirebaseConfigured()) {
      const finalName = existingLocalName || displayName || (normalizedEmail ? normalizedEmail.split('@')[0] : 'Cricket Scorer');
      const createdAt = existingLocalCreatedAt || now;

      const profileData: UserProfileData = {
        uid,
        displayName: finalName,
        email: normalizedEmail,
        photoURL: photoURL || null,
        createdAt,
        updatedAt: now,
        syncStatus: 'LOCAL_ONLY',
      };

      await FeatureHubRepository.saveProfile({
        uid: profileData.uid,
        name: profileData.displayName,
        email: profileData.email,
        photoUrl: profileData.photoURL || undefined,
        isLoggedIn: true,
        lastSyncedAt: profileData.updatedAt,
        createdAt: profileData.createdAt,
        syncStatus: 'LOCAL_ONLY',
      });

      return profileData;
    }

    try {
      const userDocRef = doc(firestore, 'users', uid);
      const userSnap = await getDoc(userDocRef);

      let profileData: UserProfileData;

      if (userSnap.exists()) {
        const existingData = userSnap.data();

        // CRITICAL REQUIREMENT: Do NOT overwrite a customized displayName with Google's default name
        // If local profile has a pending offline update, prefer the newer local name
        const hasPendingLocalName = localProfile?.syncStatus === 'PENDING' && localProfile.name;
        const resolvedDisplayName = hasPendingLocalName
          ? localProfile.name
          : (existingData.displayName || existingLocalName || displayName || (normalizedEmail ? normalizedEmail.split('@')[0] : 'Cricket Scorer'));

        profileData = {
          uid,
          displayName: resolvedDisplayName,
          email: existingData.email || normalizedEmail,
          photoURL: existingData.photoURL || photoURL || null,
          createdAt: existingData.createdAt || existingLocalCreatedAt || now,
          updatedAt: now,
          lastDriveBackupAt: existingData.lastDriveBackupAt || null,
          syncStatus: 'SYNCED',
        };

        // Determine if Firestore requires an update (e.g. pending local name, or email/photoURL changed from provider)
        const updatePayload: Record<string, any> = {};
        if (hasPendingLocalName && localProfile.name !== existingData.displayName) {
          updatePayload.displayName = profileData.displayName;
        }
        if (normalizedEmail && normalizedEmail !== existingData.email) {
          updatePayload.email = normalizedEmail;
        }
        if (photoURL && photoURL !== existingData.photoURL) {
          updatePayload.photoURL = photoURL;
        }

        if (Object.keys(updatePayload).length > 0) {
          updatePayload.updatedAt = now;
          await setDoc(userDocRef, updatePayload, { merge: true });
        }
      } else {
        // First-time user sign-in: Initialize document
        const initialName = existingLocalName || ((displayName && displayName.trim())
          ? displayName.trim()
          : (normalizedEmail ? normalizedEmail.split('@')[0] : 'Cricket Scorer'));

        profileData = {
          uid,
          displayName: initialName,
          email: normalizedEmail,
          photoURL: photoURL || null,
          createdAt: existingLocalCreatedAt || now,
          updatedAt: now,
          syncStatus: 'SYNCED',
        };

        await setDoc(userDocRef, {
          displayName: profileData.displayName,
          email: profileData.email,
          photoURL: profileData.photoURL,
          createdAt: profileData.createdAt,
          updatedAt: profileData.updatedAt,
        });
      }

      // Synchronize with Dexie IndexedDB
      await FeatureHubRepository.saveProfile({
        uid: profileData.uid,
        name: profileData.displayName,
        email: profileData.email,
        photoUrl: profileData.photoURL || undefined,
        isLoggedIn: true,
        lastSyncedAt: profileData.updatedAt,
        createdAt: profileData.createdAt,
        syncStatus: 'SYNCED',
      });

      return profileData;
    } catch (err: any) {
      console.warn(`[UserProfileService] Cloud profile sync failed for ${uid}, falling back locally:`, err);

      // CRITICAL REQUIREMENT: On Firestore network failure or error,
      // PRESERVE existing custom displayName and immutable createdAt!
      const fallbackName = existingLocalName || displayName || (normalizedEmail ? normalizedEmail.split('@')[0] : 'Cricket Scorer');
      const fallbackCreatedAt = existingLocalCreatedAt || now;

      const fallbackProfile: UserProfileData = {
        uid,
        displayName: fallbackName,
        email: normalizedEmail,
        photoURL: photoURL || null,
        createdAt: fallbackCreatedAt,
        updatedAt: now,
        syncStatus: 'LOCAL_ONLY',
      };

      await FeatureHubRepository.saveProfile({
        uid: fallbackProfile.uid,
        name: fallbackProfile.displayName,
        email: fallbackProfile.email,
        photoUrl: fallbackProfile.photoURL || undefined,
        isLoggedIn: true,
        lastSyncedAt: fallbackProfile.updatedAt,
        createdAt: fallbackProfile.createdAt,
        syncStatus: 'LOCAL_ONLY',
      });

      return fallbackProfile;
    }
  }

  /**
   * Updates display name in Firestore and local Dexie storage.
   * If network is unavailable or Firestore fails, updates local storage with PENDING status
   * so the offline user experience remains fluid and changes are never lost.
   */
  static async updateDisplayName(uid: string, newDisplayName: string): Promise<UserProfileData> {
    if (!uid) throw new Error('User UID is required to update display name.');

    const validation = this.validateDisplayName(newDisplayName);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    const updatedAt = new Date().toISOString();
    const existingLocal = await FeatureHubRepository.loadProfileByUid(uid);
    const createdAt = existingLocal?.createdAt || existingLocal?.lastSyncedAt || updatedAt;

    // In environments without Firebase configuration
    if (!checkFirebaseConfigured()) {
      const updated: UserProfileData = {
        uid,
        displayName: validation.normalized,
        email: existingLocal?.email || '',
        photoURL: existingLocal?.photoUrl || null,
        createdAt,
        updatedAt,
        syncStatus: 'LOCAL_ONLY',
      };

      await FeatureHubRepository.saveProfile({
        uid,
        name: validation.normalized,
        email: updated.email,
        photoUrl: updated.photoURL || undefined,
        isLoggedIn: true,
        lastSyncedAt: updatedAt,
        createdAt,
        syncStatus: 'LOCAL_ONLY',
      });

      return updated;
    }

    try {
      const userDocRef = doc(firestore, 'users', uid);
      await setDoc(
        userDocRef,
        {
          displayName: validation.normalized,
          updatedAt,
        },
        { merge: true }
      );

      const currentProfile = await this.getUserProfile(uid);
      const updatedProfile: UserProfileData = {
        uid,
        displayName: validation.normalized,
        email: currentProfile?.email || existingLocal?.email || '',
        photoURL: currentProfile?.photoURL || existingLocal?.photoUrl || null,
        createdAt: currentProfile?.createdAt || createdAt,
        updatedAt,
        syncStatus: 'SYNCED',
      };

      // Keep Dexie in sync
      await FeatureHubRepository.saveProfile({
        uid,
        name: validation.normalized,
        email: updatedProfile.email,
        photoUrl: updatedProfile.photoURL || undefined,
        isLoggedIn: true,
        lastSyncedAt: updatedAt,
        createdAt: updatedProfile.createdAt,
        syncStatus: 'SYNCED',
      });

      return updatedProfile;
    } catch (err: any) {
      console.warn(`[UserProfileService] Network or Firestore error updating display name for ${uid}:`, err);

      // Offline-first graceful fallback: save locally as PENDING
      const offlineProfile: UserProfileData = {
        uid,
        displayName: validation.normalized,
        email: existingLocal?.email || '',
        photoURL: existingLocal?.photoUrl || null,
        createdAt,
        updatedAt,
        syncStatus: 'PENDING',
      };

      await FeatureHubRepository.saveProfile({
        uid,
        name: validation.normalized,
        email: offlineProfile.email,
        photoUrl: offlineProfile.photoURL || undefined,
        isLoggedIn: true,
        lastSyncedAt: updatedAt,
        createdAt,
        syncStatus: 'PENDING',
      });

      return offlineProfile;
    }
  }

  /**
   * Updates photoURL in Firestore and local Dexie storage.
   * Gracefully handles Firestore rules constraint (photoURL <= 2048 chars).
   */
  static async updatePhotoURL(uid: string, newPhotoURL: string | null): Promise<UserProfileData> {
    if (!uid) throw new Error('User UID is required to update photo.');

    const updatedAt = new Date().toISOString();
    const existingLocal = await FeatureHubRepository.loadProfileByUid(uid);
    const createdAt = existingLocal?.createdAt || existingLocal?.lastSyncedAt || updatedAt;
    const displayName = existingLocal?.name || 'Cricket Scorer';
    const email = existingLocal?.email || '';

    // In environments without Firebase configuration
    if (!checkFirebaseConfigured()) {
      const updated: UserProfileData = {
        uid,
        displayName,
        email,
        photoURL: newPhotoURL,
        createdAt,
        updatedAt,
        syncStatus: 'LOCAL_ONLY',
      };

      await FeatureHubRepository.saveProfile({
        uid,
        name: displayName,
        email,
        photoUrl: newPhotoURL || undefined,
        isLoggedIn: true,
        lastSyncedAt: updatedAt,
        createdAt,
        syncStatus: 'LOCAL_ONLY',
      });

      return updated;
    }

    try {
      const userDocRef = doc(firestore, 'users', uid);
      // Firestore rule: photoURL must be <= 2048 chars or null
      const firestorePhotoURL =
        newPhotoURL && newPhotoURL.length <= 2048 ? newPhotoURL : null;

      await setDoc(
        userDocRef,
        {
          photoURL: firestorePhotoURL,
          updatedAt,
        },
        { merge: true }
      );

      const currentProfile = await this.getUserProfile(uid);
      const updatedProfile: UserProfileData = {
        uid,
        displayName: currentProfile?.displayName || displayName,
        email: currentProfile?.email || email,
        photoURL: newPhotoURL,
        createdAt: currentProfile?.createdAt || createdAt,
        updatedAt,
        syncStatus: 'SYNCED',
      };

      await FeatureHubRepository.saveProfile({
        uid,
        name: updatedProfile.displayName,
        email: updatedProfile.email,
        photoUrl: newPhotoURL || undefined,
        isLoggedIn: true,
        lastSyncedAt: updatedAt,
        createdAt: updatedProfile.createdAt,
        syncStatus: 'SYNCED',
      });

      return updatedProfile;
    } catch (err: any) {
      console.warn(`[UserProfileService] Error updating photoURL for ${uid}:`, err);

      const offlineProfile: UserProfileData = {
        uid,
        displayName,
        email,
        photoURL: newPhotoURL,
        createdAt,
        updatedAt,
        syncStatus: 'PENDING',
      };

      await FeatureHubRepository.saveProfile({
        uid,
        name: displayName,
        email,
        photoUrl: newPhotoURL || undefined,
        isLoggedIn: true,
        lastSyncedAt: updatedAt,
        createdAt,
        syncStatus: 'PENDING',
      });

      return offlineProfile;
    }
  }

  /**
   * Records the timestamp of a successful Google Drive backup in Firestore and Dexie.
   * Works for both authenticated users and guest users (via 'guest' fallback key).
   */
  static async recordDriveBackup(uid: string, timestamp: string): Promise<void> {
    const targetUid = uid || 'guest';
    try {
      await db.app_metadata.put({
        key: `last_drive_backup_at_${targetUid}`,
        value: timestamp,
        updatedAt: timestamp,
      });
    } catch (e) {
      console.warn('[UserProfileService] Failed to record in Dexie app_metadata:', e);
    }

    if (checkFirebaseConfigured() && targetUid !== 'guest') {
      try {
        const userDocRef = doc(firestore, 'users', targetUid);
        await setDoc(
          userDocRef,
          {
            lastDriveBackupAt: timestamp,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (err) {
        console.warn('[UserProfileService] Failed to record lastDriveBackupAt in Firestore:', err);
      }
    }
  }
}
