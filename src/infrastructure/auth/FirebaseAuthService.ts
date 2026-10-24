import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendEmailVerification,
  User,
  NextOrObserver,
} from 'firebase/auth';
import {
  auth,
  googleAuthProvider,
  checkFirebaseConfigured,
  getFirebaseConfigDiagnostics,
} from './firebase';
import { UserProfileService, UserProfileData } from './UserProfileService';
import { FeatureHubRepository } from '../storage/FeatureHubRepository';
import { GoogleDriveService } from '../storage/GoogleDriveService';

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
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
      case 'auth/invalid-login-credentials':
        return {
          message: 'Invalid email or password. Please verify your credentials and try again.',
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
      case 'auth/requires-recent-login':
        return {
          message: 'This sensitive action requires recent authentication. Please sign in again.',
          cancelled: false,
        };
      case 'auth/user-token-expired':
        return {
          message: 'Your login session has expired. Please sign in again.',
          cancelled: false,
        };
      case 'auth/account-exists-with-different-credential':
        return {
          message: 'An account already exists with the same email address but different sign-in credentials.',
          cancelled: false,
        };
      case 'auth/credential-already-in-use':
        return {
          message: 'This credential is already associated with a different user account.',
          cancelled: false,
        };
      case 'auth/invalid-verification-code':
        return {
          message: 'The verification code entered is invalid or has expired.',
          cancelled: false,
        };
      case 'auth/invalid-verification-id':
        return {
          message: 'The verification ID is invalid.',
          cancelled: false,
        };
      case 'auth/quota-exceeded':
        return {
          message: 'Authentication service quota exceeded. Please try again later.',
          cancelled: false,
        };
      case 'auth/unauthorized-domain':
        return {
          message: 'This domain is not authorized for OAuth in Firebase Console. Add your production domain in Firebase Console > Authentication > Settings > Authorized domains.',
          cancelled: false,
        };
      case 'auth/operation-not-allowed':
        return {
          message: 'This authentication provider is not enabled in Firebase Console. Please enable it under Authentication > Sign-in method.',
          cancelled: false,
        };
      default:
        // Raw SDK errors or internal URLs/tokens are strictly sanitized
        return {
          message: 'An unexpected authentication error occurred. Please try again later.',
          cancelled: false,
        };
    }
  }

  /**
   * Initiates Google Sign-In via popup with session persistence.
   */
  static async signInWithGoogle(): Promise<AuthActionResult> {
    if (!checkFirebaseConfigured()) {
      return {
        success: false,
        error: getFirebaseConfigDiagnostics().diagnosticMessage,
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
    const emailValidation = UserProfileService.validateEmail(email);
    if (!emailValidation.isValid) {
      return { success: false, error: emailValidation.error };
    }
    if (!password) {
      return { success: false, error: 'Password is required.' };
    }

    if (!checkFirebaseConfigured()) {
      return {
        success: false,
        error: getFirebaseConfigDiagnostics().diagnosticMessage,
      };
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, emailValidation.normalized, password);
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
    const emailValidation = UserProfileService.validateEmail(email);
    if (!emailValidation.isValid) {
      return { success: false, error: emailValidation.error };
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

    if (!checkFirebaseConfigured()) {
      return {
        success: false,
        error: getFirebaseConfigDiagnostics().diagnosticMessage,
      };
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, emailValidation.normalized, password);
      const user = userCredential.user;

      // Update Auth profile if name provided
      if (normalizedName) {
        try {
          await updateProfile(user, { displayName: normalizedName });
        } catch (e: any) {
          console.warn('[FirebaseAuthService] Could not update auth client profile directly:', e?.code || 'auth/update-failed');
        }
      }

      // Sync or create profile document in Firestore and local Dexie
      const profile = await UserProfileService.syncOrCreateUserProfile({
        uid: user.uid,
        displayName: normalizedName || emailValidation.normalized.split('@')[0],
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
    const emailValidation = UserProfileService.validateEmail(email);
    if (!emailValidation.isValid) {
      return { success: false, error: emailValidation.error };
    }

    if (!checkFirebaseConfigured()) {
      return {
        success: false,
        error: getFirebaseConfigDiagnostics().diagnosticMessage,
      };
    }

    try {
      await sendPasswordResetEmail(auth, emailValidation.normalized);
      return { success: true };
    } catch (err: any) {
      const code = err?.code || '';
      // Mitigate email enumeration: do not disclose whether an account exists
      if (
        code === 'auth/user-not-found' ||
        code === 'auth/invalid-credential' ||
        code === 'auth/invalid-login-credentials'
      ) {
        return { success: true };
      }
      const { message } = this.formatAuthError(err);
      return { success: false, error: message };
    }
  }

  /**
   * Signs out the current user, purges in-memory Google Drive tokens, and clears local profile session.
   * Dexie match data, scores, squads, and tournaments are fully preserved.
   */
  static async signOutUser(): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Purge ephemeral in-memory Google Drive access tokens
      GoogleDriveService.clearCachedToken();

      // 2. Sign out of Firebase Auth if configured
      if (checkFirebaseConfigured()) {
        await signOut(auth);
      }

      // 3. Clear active profile session in Dexie
      await FeatureHubRepository.clearProfile();

      return { success: true };
    } catch (err: any) {
      const code = err?.code || 'auth/sign-out-failed';
      console.warn(`[FirebaseAuthService] Sign out failure code: ${code}`);
      return { success: false, error: 'Failed to sign out. Please try again.' };
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
    } catch (e: any) {
      console.warn('[FirebaseAuthService] Could not update auth client profile directly:', e?.code || 'auth/update-failed');
    }

    // 2. Update Firestore and Dexie
    return await UserProfileService.updateDisplayName(currentUser.uid, validation.normalized);
  }

  /**
   * Updates photo URL on both Firebase Auth profile and Cloud Firestore/Dexie.
   */
  static async updatePhotoURL(newPhotoURL: string | null): Promise<UserProfileData> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('No user is currently signed in.');
    }

    try {
      await updateProfile(currentUser, { photoURL: newPhotoURL });
    } catch (e: any) {
      console.warn('[FirebaseAuthService] Could not update auth client photoURL directly:', e?.code || 'auth/update-failed');
    }

    return await UserProfileService.updatePhotoURL(currentUser.uid, newPhotoURL);
  }

  /**
   * Sends an email verification to the currently signed in user.
   */
  static async sendEmailVerification(): Promise<{ success: boolean; error?: string }> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { success: false, error: 'No user is currently signed in.' };
    }

    if (!checkFirebaseConfigured()) {
      return {
        success: false,
        error: getFirebaseConfigDiagnostics().diagnosticMessage,
      };
    }

    try {
      await sendEmailVerification(currentUser);
      return { success: true };
    } catch (err: any) {
      const { message } = this.formatAuthError(err);
      return { success: false, error: message };
    }
  }

  /**
   * Registers a listener for authentication state changes and session restoration.
   * In unconfigured environments, immediately returns a safe no-op subscription without touching network.
   */
  static onAuthStateChanged(observer: NextOrObserver<User>): () => void {
    if (!checkFirebaseConfigured()) {
      if (typeof observer === 'function') {
        observer(null);
      } else if (observer && typeof observer.next === 'function') {
        observer.next(null);
      }
      return () => {};
    }
    return onAuthStateChanged(auth, observer);
  }

  /**
   * Returns current authenticated user or null.
   */
  static getCurrentUser(): User | null {
    if (!checkFirebaseConfigured()) {
      return null;
    }
    return auth.currentUser;
  }
}
