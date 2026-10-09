import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { firestore, isFirebaseConfigured } from './firebase';
import { FeatureHubRepository } from '../storage/FeatureHubRepository';
import { db } from '../database/dexie-db';

export interface UserProfileData {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  createdAt: string;
  updatedAt: string;
  lastDriveBackupAt?: string | null;
}

export interface DisplayNameValidationResult {
  isValid: boolean;
  normalized: string;
  error?: string;
}

export class UserProfileService {
  /**
   * Validates and normalizes display name input.
   * Rules:
   * - Must not be empty or whitespace-only
   * - Length must be between 2 and 50 characters
   */
  static validateDisplayName(name: string): DisplayNameValidationResult {
    if (!name || typeof name !== 'string') {
      return {
        isValid: false,
        normalized: '',
        error: 'Display name cannot be empty.',
      };
    }

    const normalized = name.trim().replace(/\s+/g, ' ');

    if (normalized.length < 2) {
      return {
        isValid: false,
        normalized,
        error: 'Display name must be at least 2 characters long.',
      };
    }

    if (normalized.length > 50) {
      return {
        isValid: false,
        normalized,
        error: 'Display name cannot exceed 50 characters.',
      };
    }

    return {
      isValid: true,
      normalized,
    };
  }

  /**
   * Retrieves a user profile document from Firestore by UID.
   */
  static async getUserProfile(uid: string): Promise<UserProfileData | null> {
    if (!uid) throw new Error('User UID is required to fetch profile.');

    // Fallback to local Dexie profile if Firebase is not configured in current environment
    if (!isFirebaseConfigured) {
      const localProfile = await FeatureHubRepository.loadProfile();
      const meta = await db.app_metadata.get(`last_drive_backup_at_${uid}`);
      if (localProfile && localProfile.uid === uid) {
        return {
          uid: localProfile.uid,
          displayName: localProfile.name,
          email: localProfile.email,
          photoURL: localProfile.photoUrl || null,
          createdAt: localProfile.lastSyncedAt || new Date().toISOString(),
          updatedAt: localProfile.lastSyncedAt || new Date().toISOString(),
          lastDriveBackupAt: meta ? meta.value : null,
        };
      }
      return null;
    }

    try {
      const userDocRef = doc(firestore, 'users', uid);
      const userSnap = await getDoc(userDocRef);

      if (!userSnap.exists()) {
        return null;
      }

      const data = userSnap.data();
      const meta = await db.app_metadata.get(`last_drive_backup_at_${uid}`);
      return {
        uid,
        displayName: data.displayName || '',
        email: data.email || '',
        photoURL: data.photoURL || null,
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
        lastDriveBackupAt: data.lastDriveBackupAt || meta?.value || null,
      };
    } catch (err: any) {
      console.error(`[UserProfileService] Error fetching profile for ${uid}:`, err);
      // Attempt local Dexie fallback
      const localProfile = await FeatureHubRepository.loadProfile();
      const meta = await db.app_metadata.get(`last_drive_backup_at_${uid}`);
      if (localProfile && localProfile.uid === uid) {
        return {
          uid: localProfile.uid,
          displayName: localProfile.name,
          email: localProfile.email,
          photoURL: localProfile.photoUrl || null,
          createdAt: localProfile.lastSyncedAt || new Date().toISOString(),
          updatedAt: localProfile.lastSyncedAt || new Date().toISOString(),
          lastDriveBackupAt: meta ? meta.value : null,
        };
      }
      throw new Error(`Failed to load user profile: ${err.message || err}`);
    }
  }

  /**
   * Synchronizes or creates user profile on authentication:
   * 1. If user document exists: PRESERVES custom displayName, updates photo/email if changed.
   * 2. If user document does not exist: creates new profile using Google account details.
   * 3. Syncs current profile to local Dexie IndexedDB for unhindered offline operations.
   */
  static async syncOrCreateUserProfile(firebaseUser: {
    uid: string;
    displayName?: string | null;
    email?: string | null;
    photoURL?: string | null;
  }): Promise<UserProfileData> {
    const { uid, displayName, email, photoURL } = firebaseUser;
    if (!uid) throw new Error('Valid Firebase User with UID is required.');

    const now = new Date().toISOString();

    // In environments without live Firebase configuration, store directly in Dexie
    if (!isFirebaseConfigured) {
      const localProfile = await FeatureHubRepository.loadProfile();
      const existingName = localProfile?.uid === uid ? localProfile.name : null;
      const finalName = existingName || displayName || (email ? email.split('@')[0] : 'Cricket Scorer');

      const profileData: UserProfileData = {
        uid,
        displayName: finalName,
        email: email || '',
        photoURL: photoURL || null,
        createdAt: localProfile?.lastSyncedAt || now,
        updatedAt: now,
      };

      await FeatureHubRepository.saveProfile({
        uid: profileData.uid,
        name: profileData.displayName,
        email: profileData.email,
        photoUrl: profileData.photoURL || undefined,
        isLoggedIn: true,
        lastSyncedAt: profileData.updatedAt,
      });

      return profileData;
    }

    try {
      const userDocRef = doc(firestore, 'users', uid);
      const userSnap = await getDoc(userDocRef);

      let profileData: UserProfileData;

      if (userSnap.exists()) {
        const existingData = userSnap.data();
        // CRITICAL REQUIREMENT: Do NOT overwrite a customized displayName with Google's default
        profileData = {
          uid,
          displayName: existingData.displayName || displayName || (email ? email.split('@')[0] : 'Cricket Scorer'),
          email: existingData.email || email || '',
          photoURL: existingData.photoURL || photoURL || null,
          createdAt: existingData.createdAt || now,
          updatedAt: now,
          lastDriveBackupAt: existingData.lastDriveBackupAt || null,
        };

        // If email or photo has updated from Google provider, persist safely without touching displayName
        if (
          (email && email !== existingData.email) ||
          (photoURL && photoURL !== existingData.photoURL)
        ) {
          await updateDoc(userDocRef, {
            email: profileData.email,
            photoURL: profileData.photoURL,
            updatedAt: profileData.updatedAt,
          });
        }
      } else {
        // First-time user sign-in: Initialize document
        const initialName = (displayName && displayName.trim())
          ? displayName.trim()
          : (email ? email.split('@')[0] : 'Cricket Scorer');

        profileData = {
          uid,
          displayName: initialName,
          email: email || '',
          photoURL: photoURL || null,
          createdAt: now,
          updatedAt: now,
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
      });

      return profileData;
    } catch (err: any) {
      console.error(`[UserProfileService] Error during profile sync for ${uid}:`, err);
      // Fallback local update so offline scoring remains unblocked
      const fallbackProfile: UserProfileData = {
        uid,
        displayName: displayName || (email ? email.split('@')[0] : 'Cricket Scorer'),
        email: email || '',
        photoURL: photoURL || null,
        createdAt: now,
        updatedAt: now,
      };

      await FeatureHubRepository.saveProfile({
        uid: fallbackProfile.uid,
        name: fallbackProfile.displayName,
        email: fallbackProfile.email,
        photoUrl: fallbackProfile.photoURL || undefined,
        isLoggedIn: true,
        lastSyncedAt: fallbackProfile.updatedAt,
      });

      return fallbackProfile;
    }
  }

  /**
   * Updates display name in Firestore and local Dexie storage.
   */
  static async updateDisplayName(uid: string, newDisplayName: string): Promise<UserProfileData> {
    const validation = this.validateDisplayName(newDisplayName);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    const updatedAt = new Date().toISOString();

    if (!isFirebaseConfigured) {
      const local = await FeatureHubRepository.loadProfile();
      const updated: UserProfileData = {
        uid,
        displayName: validation.normalized,
        email: local?.email || '',
        photoURL: local?.photoUrl || null,
        createdAt: local?.lastSyncedAt || updatedAt,
        updatedAt,
      };

      await FeatureHubRepository.saveProfile({
        uid,
        name: validation.normalized,
        email: updated.email,
        photoUrl: updated.photoURL || undefined,
        isLoggedIn: true,
        lastSyncedAt: updatedAt,
      });

      return updated;
    }

    try {
      const userDocRef = doc(firestore, 'users', uid);
      await updateDoc(userDocRef, {
        displayName: validation.normalized,
        updatedAt,
      });

      const currentProfile = await this.getUserProfile(uid);
      const updatedProfile: UserProfileData = {
        uid,
        displayName: validation.normalized,
        email: currentProfile?.email || '',
        photoURL: currentProfile?.photoURL || null,
        createdAt: currentProfile?.createdAt || updatedAt,
        updatedAt,
      };

      // Keep Dexie in sync
      await FeatureHubRepository.saveProfile({
        uid,
        name: validation.normalized,
        email: updatedProfile.email,
        photoUrl: updatedProfile.photoURL || undefined,
        isLoggedIn: true,
        lastSyncedAt: updatedAt,
      });

      return updatedProfile;
    } catch (err: any) {
      console.error(`[UserProfileService] Error updating display name for ${uid}:`, err);
      throw new Error(`Failed to update display name: ${err.message || err}`);
    }
  }

  /**
   * Records the timestamp of a successful Google Drive backup in Firestore and Dexie.
   */
  static async recordDriveBackup(uid: string, timestamp: string): Promise<void> {
    if (!uid) return;
    try {
      await db.app_metadata.put({
        key: `last_drive_backup_at_${uid}`,
        value: timestamp,
        updatedAt: timestamp,
      });
    } catch (e) {
      console.warn('[UserProfileService] Failed to record in Dexie app_metadata:', e);
    }

    if (isFirebaseConfigured) {
      try {
        const userDocRef = doc(firestore, 'users', uid);
        await updateDoc(userDocRef, {
          lastDriveBackupAt: timestamp,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.warn('[UserProfileService] Failed to record lastDriveBackupAt in Firestore:', err);
      }
    }
  }
}
