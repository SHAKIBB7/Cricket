import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile,
  User,
  NextOrObserver,
} from 'firebase/auth';
import { auth, googleAuthProvider, isFirebaseConfigured } from './firebase';
import { UserProfileService, UserProfileData } from './UserProfileService';
import { FeatureHubRepository } from '../storage/FeatureHubRepository';

export interface AuthActionResult {
  success: boolean;
  user?: User;
  profile?: UserProfileData;
  error?: string;
  cancelled?: boolean;
}

export class FirebaseAuthService {
  /**
   * Translates Firebase Auth error codes into human-friendly messages.
   */
  static formatAuthError(error: any): { message: string; cancelled: boolean } {
    const code = error?.code || '';
    switch (code) {
      case 'auth/popup-closed-by-user':
        return {
          message: 'Sign-in was cancelled before completion.',
          cancelled: true,
        };
      case 'auth/cancelled-popup-request':
        return {
          message: 'Sign-in window was closed by a newer request.',
          cancelled: true,
        };
      case 'auth/popup-blocked':
        return {
          message: 'The sign-in popup was blocked by your browser. Please allow popups for this site.',
          cancelled: false,
        };
      case 'auth/email-already-in-use':
        return {
          message: 'This email is already in use. Please sign in or use a different email.',
          cancelled: false,
        };
      case 'auth/invalid-email':
        return {
          message: 'Please enter a valid email address.',
          cancelled: false,
        };
      case 'auth/weak-password':
        return {
          message: 'Password must be at least 6 characters long.',
          cancelled: false,
        };
      case 'auth/user-not-found':
        return {
          message: 'No account found with this email address.',
          cancelled: false,
        };
      case 'auth/wrong-password':
        return {
          message: 'Incorrect password. Please verify and try again.',
          cancelled: false,
        };
      case 'auth/invalid-credential':
        return {
          message: 'Invalid email or password. Please verify your credentials.',
          cancelled: false,
        };
      case 'auth/too-many-requests':
        return {
          message: 'Too many unsuccessful attempts. Access has been temporarily paused. Try again later or reset password.',
          cancelled: false,
        };
      case 'auth/user-disabled':
        return {
          message: 'This account has been disabled by an administrator.',
          cancelled: false,
        };
      case 'auth/network-request-failed':
        return {
          message: 'Network error. Please check your internet connection.',
          cancelled: false,
        };
      case 'auth/unauthorized-domain':
        return {
          message: 'This domain is not authorized for OAuth in the Firebase Console.',
          cancelled: false,
        };
      case 'auth/operation-not-allowed':
        return {
          message: 'This authentication provider is not enabled in Firebase Console. Please enable it under Authentication > Sign-in method.',
          cancelled: false,
        };
      default:
        return {
          message: error?.message || 'An unexpected authentication error occurred.',
          cancelled: false,
        };
    }
  }

  /**
   * Initiates Google Sign-In via popup with session persistence.
   */
  static async signInWithGoogle(): Promise<AuthActionResult> {
    if (!isFirebaseConfigured) {
      return {
        success: false,
        error: 'Firebase is not configured. Please set NEXT_PUBLIC_FIREBASE_* in your environment.',
      };
    }

    try {
      const userCredential = await signInWithPopup(auth, googleAuthProvider);
      const user = userCredential.user;

      // Sync or create profile document in Firestore and local Dexie
      const profile = await UserProfileService.syncOrCreateUserProfile({
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
      });

      return {
        success: true,
        user,
        profile,
      };
    } catch (err: any) {
      const { message, cancelled } = this.formatAuthError(err);
      return {
        success: false,
        error: message,
        cancelled,
      };
    }
  }

  /**
   * Signs in an existing user using Email and Password.
   */
  static async signInWithEmail(email: string, password: string): Promise<AuthActionResult> {
    if (!email || !email.trim()) {
      return { success: false, error: 'Email address is required.' };
    }
    if (!password) {
      return { success: false, error: 'Password is required.' };
    }

    if (!isFirebaseConfigured) {
      return {
        success: false,
        error: 'Firebase is not configured. Please set NEXT_PUBLIC_FIREBASE_* in your environment.',
      };
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const user = userCredential.user;

      const profile = await UserProfileService.syncOrCreateUserProfile({
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
      });

      return {
        success: true,
        user,
        profile,
      };
    } catch (err: any) {
      const { message, cancelled } = this.formatAuthError(err);
      return {
        success: false,
        error: message,
        cancelled,
      };
    }
  }

  /**
   * Registers a new user account using Email, Password, and optional Display Name.
   */
  static async signUpWithEmail(
    email: string,
    password: string,
    displayName?: string
  ): Promise<AuthActionResult> {
    if (!email || !email.trim()) {
      return { success: false, error: 'Email address is required.' };
    }
    if (!password || password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters long.' };
    }

    let normalizedName: string | undefined = undefined;
    if (displayName && displayName.trim()) {
      const validation = UserProfileService.validateDisplayName(displayName);
      if (!validation.isValid) {
        return { success: false, error: validation.error };
      }
      normalizedName = validation.normalized;
    }

    if (!isFirebaseConfigured) {
      return {
        success: false,
        error: 'Firebase is not configured. Please set NEXT_PUBLIC_FIREBASE_* in your environment.',
      };
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const user = userCredential.user;

      // Update Auth profile if name provided
      if (normalizedName) {
        try {
          await updateProfile(user, { displayName: normalizedName });
        } catch (e) {
          console.warn('[FirebaseAuthService] Could not update profile displayName:', e);
        }
      }

      // Sync or create profile document in Firestore and local Dexie
      const profile = await UserProfileService.syncOrCreateUserProfile({
        uid: user.uid,
        displayName: normalizedName || email.split('@')[0],
        email: user.email,
        photoURL: null,
      });

      return {
        success: true,
        user,
        profile,
      };
    } catch (err: any) {
      const { message, cancelled } = this.formatAuthError(err);
      return {
        success: false,
        error: message,
        cancelled,
      };
    }
  }

  /**
   * Sends a password reset email to the specified address.
   */
  static async sendPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    if (!email || !email.trim()) {
      return { success: false, error: 'Email address is required.' };
    }

    if (!isFirebaseConfigured) {
      return {
        success: false,
        error: 'Firebase is not configured. Please set NEXT_PUBLIC_FIREBASE_* in your environment.',
      };
    }

    try {
      await sendPasswordResetEmail(auth, email.trim());
      return { success: true };
    } catch (err: any) {
      const { message } = this.formatAuthError(err);
      return { success: false, error: message };
    }
  }

  /**
   * Signs out the current user and clears local profile session.
   * Dexie match data, scores, squads, and tournaments are fully preserved.
   */
  static async signOutUser(): Promise<{ success: boolean; error?: string }> {
    try {
      if (isFirebaseConfigured) {
        await signOut(auth);
      }
      await FeatureHubRepository.clearProfile();
      return { success: true };
    } catch (err: any) {
      console.error('[FirebaseAuthService] Sign out error:', err);
      return { success: false, error: err.message || 'Failed to sign out.' };
    }
  }

  /**
   * Updates display name on both Firebase Auth profile and Cloud Firestore.
   */
  static async updateDisplayName(newDisplayName: string): Promise<UserProfileData> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('No user is currently signed in.');
    }

    const validation = UserProfileService.validateDisplayName(newDisplayName);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    // 1. Update Firebase Auth client profile
    try {
      await updateProfile(currentUser, { displayName: validation.normalized });
    } catch (e) {
      console.warn('[FirebaseAuthService] Could not update auth client profile directly', e);
    }

    // 2. Update Firestore and Dexie
    return await UserProfileService.updateDisplayName(currentUser.uid, validation.normalized);
  }

  /**
   * Registers a listener for authentication state changes and session restoration.
   */
  static onAuthStateChanged(observer: NextOrObserver<User>): () => void {
    return onAuthStateChanged(auth, observer);
  }

  /**
   * Returns current authenticated user or null.
   */
  static getCurrentUser(): User | null {
    return auth.currentUser;
  }
}
