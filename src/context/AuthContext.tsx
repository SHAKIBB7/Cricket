'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type { User } from 'firebase/auth';
import { checkFirebaseConfigured } from '@/infrastructure/auth/firebase-config';
import type { AuthActionResult } from '@/infrastructure/auth/FirebaseAuthService';
import type { UserProfileData } from '@/infrastructure/auth/UserProfileService';

/**
 * Performance fix programme 2026-11-15 (Fix 1): FirebaseAuthService,
 * UserProfileService, FeatureHubRepository, GoogleDriveService,
 * StorageManagerService and SyncEngine are NO LONGER statically
 * imported here. The static chain pulled the Firebase SDK
 * (app+auth+firestore), Firestore profile code and the whole
 * sync engine into the shared layout bundle, where it parsed and
 * ran on every cold page load. They are now loaded with dynamic
 * import() only when Firebase is configured and an auth event or
 * an explicit sign-in action actually needs them. The context
 * interface and behaviour are unchanged: unconfigured installs
 * resolve isLoading=false in guest/offline mode without ever
 * loading the SDK, and first render reads only process.env via
 * the SDK-free firebase-config module (hydration-safe).
 */
async function loadAuthService() {
  return (await import('@/infrastructure/auth/FirebaseAuthService')).FirebaseAuthService;
}

async function loadProfileService() {
  return (await import('@/infrastructure/auth/UserProfileService')).UserProfileService;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfileData | null;
  isLoading: boolean;
  isConfigured: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<AuthActionResult>;
  signInWithEmail: (email: string, password: string) => Promise<AuthActionResult>;
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<AuthActionResult>;
  sendPasswordReset: (email: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  updateDisplayName: (newName: string) => Promise<void>;
  updatePhotoURL?: (newPhotoURL: string | null) => Promise<void>;
  sendEmailVerification?: () => Promise<{ success: boolean; error?: string }>;
  refreshProfile: () => Promise<void>;
  clearError: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isConfigured, setIsConfigured] = useState<boolean>(() => checkFirebaseConfigured());
  const [error, setError] = useState<string | null>(null);

  // Tracks active authenticated user UID to prevent stale async callbacks from overwriting state
  const activeUidRef = useRef<string | null>(null);
  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) {
      // Guest mode: unauthenticated state must not hold a user profile
      setProfile(null);
      return;
    }

    const currentUid = user.uid;
    try {
      const UserProfileService = await loadProfileService();
      const p = await UserProfileService.getUserProfile(currentUid);
      if (mountedRef.current && activeUidRef.current === currentUid && p) {
        setProfile(p);
      }
    } catch (e: any) {
      console.warn('[AuthContext] Failed refreshing profile:', e);
    }
  }, [user]);

  useEffect(() => {
    const configured = checkFirebaseConfigured();
    setIsConfigured(configured);

    if (!configured) {
      // In unconfigured environments: local offline mode is active without Firebase
      activeUidRef.current = null;
      setUser(null);
      setProfile(null);
      setIsLoading(false);
      return;
    }

    // Configured: load the Firebase-backed services on demand.
    // isLoading stays true (its initial value) until the auth
    // listener fires, exactly as before.
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    (async () => {
      const [FirebaseAuthService, UserProfileService] = await Promise.all([
        loadAuthService(),
        loadProfileService(),
      ]);
      if (cancelled || !mountedRef.current) return;

      // Bug hunt P-1: collect the result of a redirect-based
      // Google sign-in (the embedded-WebView / popup-blocked
      // fallback) now that the app has reloaded back from the
      // provider. The auth listener below restores the session
      // and profile itself; this call only surfaces a failure.
      FirebaseAuthService.completeRedirectSignIn()
        .then((result) => {
          if (mountedRef.current && result && !result.success && result.error && !result.cancelled) {
            setError(result.error);
          }
        })
        .catch(() => {});

      // Listen for authentication changes & restore sessions reliably
      unsubscribe = FirebaseAuthService.onAuthStateChanged(async (firebaseUser) => {
        if (!mountedRef.current) return;

        const newUid = firebaseUser?.uid || null;
        activeUidRef.current = newUid;
        setIsLoading(true);
        setError(null);

        if (firebaseUser) {
          setUser(firebaseUser);
          try {
            const userProfile = await UserProfileService.syncOrCreateUserProfile({
              uid: firebaseUser.uid,
              displayName: firebaseUser.displayName,
              email: firebaseUser.email,
              photoURL: firebaseUser.photoURL,
            });

            // Verify that active user hasn't changed while sync was resolving
            if (mountedRef.current && activeUidRef.current === firebaseUser.uid) {
              setProfile(userProfile);
            }

            // Claim any unowned guest records in local Dexie so they are backed up
            try {
              await FirebaseAuthService.claimGuestRecords(firebaseUser.uid);
            } catch (claimErr) {
              console.warn('[AuthContext] Failed to claim unowned guest records:', claimErr);
            }

            // P5 (D5): silently ask the browser to protect this
            // device's local data from automatic eviction now that
            // the user is signed in. Fire-and-forget by design.
            import('@/infrastructure/storage/StorageManagerService')
              .then(({ StorageManagerService }) => StorageManagerService.requestPersistence())
              .catch(() => {});

            // Trigger immediate cloud synchronization and restore for this user
            import('@/infrastructure/sync/SyncEngine')
              .then(({ SyncEngine }) => SyncEngine.syncNow())
              .catch((err) => {
                console.warn('[AuthContext] Initial cloud sync on login notice:', err);
              });
          } catch (err: any) {
            console.error('[AuthContext] Error syncing profile upon auth change:', err);
            if (mountedRef.current && activeUidRef.current === firebaseUser.uid) {
              setError(err.message || 'Error syncing profile.');
            }
          }
        } else {
          // User is signed out or session ended: cleanly reset state
          setUser(null);
          setProfile(null);
          const [{ GoogleDriveService }, { FeatureHubRepository }] = await Promise.all([
            import('@/infrastructure/storage/GoogleDriveService'),
            import('@/infrastructure/storage/FeatureHubRepository'),
          ]);
          GoogleDriveService.clearCachedToken();
          await FeatureHubRepository.clearProfile();
        }

        if (mountedRef.current) {
          setIsLoading(false);
        }
      });
    })().catch(() => {
      // SDK chunk failed to load (offline first visit): fall back
      // to guest mode rather than spinning forever.
      if (!cancelled && mountedRef.current) {
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<AuthActionResult> => {
    setError(null);
    setIsLoading(true);

    try {
      const FirebaseAuthService = await loadAuthService();
      const result = await FirebaseAuthService.signInWithGoogle();

      if (result.success && result.user) {
        activeUidRef.current = result.user.uid;
        setUser(result.user);
        if (result.profile) {
          setProfile(result.profile);
        }
      } else if (result.error && !result.cancelled) {
        setError(result.error);
      }

      return result;
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string): Promise<AuthActionResult> => {
    setError(null);
    setIsLoading(true);

    try {
      const FirebaseAuthService = await loadAuthService();
      const result = await FirebaseAuthService.signInWithEmail(email, password);

      if (result.success && result.user) {
        activeUidRef.current = result.user.uid;
        setUser(result.user);
        if (result.profile) {
          setProfile(result.profile);
        }
      } else if (result.error) {
        setError(result.error);
      }

      return result;
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const signUpWithEmail = useCallback(
    async (email: string, password: string, displayName?: string): Promise<AuthActionResult> => {
      setError(null);
      setIsLoading(true);

      try {
        const FirebaseAuthService = await loadAuthService();
        const result = await FirebaseAuthService.signUpWithEmail(email, password, displayName);

        if (result.success && result.user) {
          activeUidRef.current = result.user.uid;
          setUser(result.user);
          if (result.profile) {
            setProfile(result.profile);
          }
        } else if (result.error) {
          setError(result.error);
        }

        return result;
      } finally {
        if (mountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    []
  );

  const sendPasswordReset = useCallback(async (email: string) => {
    setError(null);
    const FirebaseAuthService = await loadAuthService();
    const result = await FirebaseAuthService.sendPasswordReset(email);
    if (!result.success && result.error) {
      setError(result.error);
    }
    return result;
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    activeUidRef.current = null;

    try {
      // Bug hunt 2026-11-26 D-M3: drop queued live-publish snapshots
      // so they cannot keep retrying under the dead session (and can
      // never be attributed to the next user of this device).
      try {
        const live = await import('@/infrastructure/live/LivePublishService');
        live.clearLivePublishState();
      } catch {
        // Live module unavailable: nothing queued to clear.
      }
      const FirebaseAuthService = await loadAuthService();
      await FirebaseAuthService.signOutUser();
      if (mountedRef.current) {
        setUser(null);
        setProfile(null);
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setError(err.message || 'Failed to sign out.');
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const updateDisplayName = useCallback(async (newName: string) => {
    setError(null);

    const UserProfileService = await loadProfileService();
    const validation = UserProfileService.validateDisplayName(newName);
    if (!validation.isValid) {
      setError(validation.error || 'Invalid display name.');
      throw new Error(validation.error);
    }

    try {
      const FirebaseAuthService = await loadAuthService();
      const updated = await FirebaseAuthService.updateDisplayName(validation.normalized);
      if (mountedRef.current && user && activeUidRef.current === user.uid) {
        setProfile(updated);
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setError(err.message || 'Failed to update display name.');
      }
      throw err;
    }
  }, [user]);

  const updatePhotoURL = useCallback(async (newPhotoURL: string | null) => {
    setError(null);
    try {
      const FirebaseAuthService = await loadAuthService();
      const updated = await FirebaseAuthService.updatePhotoURL(newPhotoURL);
      if (mountedRef.current && user && activeUidRef.current === user.uid) {
        setProfile(updated);
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setError(err.message || 'Failed to update profile photo.');
      }
      throw err;
    }
  }, [user]);

  const sendEmailVerification = useCallback(async () => {
    setError(null);
    const FirebaseAuthService = await loadAuthService();
    const result = await FirebaseAuthService.sendEmailVerification();
    if (!result.success && result.error) {
      setError(result.error);
    }
    return result;
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // F4-11: memoize the provider value (matching the other providers)
  // so consumers don't re-render on unrelated provider renders. All
  // action fields are useCallback-stable, so the value only changes
  // when the auth snapshot itself changes.
  const value = useMemo(
    () => ({
      user,
      profile,
      isLoading,
      isConfigured,
      error,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      sendPasswordReset,
      signOut,
      updateDisplayName,
      updatePhotoURL,
      sendEmailVerification,
      refreshProfile,
      clearError,
    }),
    [
      user,
      profile,
      isLoading,
      isConfigured,
      error,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      sendPasswordReset,
      signOut,
      updateDisplayName,
      updatePhotoURL,
      sendEmailVerification,
      refreshProfile,
      clearError,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
