'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { User } from 'firebase/auth';
import { checkFirebaseConfigured } from '@/infrastructure/auth/firebase';
import { FirebaseAuthService, AuthActionResult } from '@/infrastructure/auth/FirebaseAuthService';
import { UserProfileService, UserProfileData } from '@/infrastructure/auth/UserProfileService';
import { FeatureHubRepository } from '@/infrastructure/storage/FeatureHubRepository';
import { GoogleDriveService } from '@/infrastructure/storage/GoogleDriveService';
import { SyncEngine } from '@/infrastructure/sync/SyncEngine';

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

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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

    // Listen for authentication changes & restore sessions reliably
    const unsubscribe = FirebaseAuthService.onAuthStateChanged(async (firebaseUser) => {
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
            const { db } = await import('@/infrastructure/database/dexie-db');
            const guestMatches = await db.matches.filter((m) => !m.userId).toArray();
            for (const gm of guestMatches) {
              gm.userId = firebaseUser.uid;
              gm.syncStatus = 'PENDING';
              await db.matches.put(gm);
              await SyncEngine.queueMutation('UPSERT_MATCH', gm, gm.id);
            }
          } catch {
            // Non-blocking
          }

          // Trigger immediate cloud synchronization and restore for this user
          SyncEngine.syncNow().catch((err) => {
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
        GoogleDriveService.clearCachedToken();
        await FeatureHubRepository.clearProfile();
      }

      if (mountedRef.current) {
        setIsLoading(false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<AuthActionResult> => {
    setError(null);
    setIsLoading(true);

    try {
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

    const validation = UserProfileService.validateDisplayName(newName);
    if (!validation.isValid) {
      setError(validation.error || 'Invalid display name.');
      throw new Error(validation.error);
    }

    try {
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
    const result = await FirebaseAuthService.sendEmailVerification();
    if (!result.success && result.error) {
      setError(result.error);
    }
    return result;
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
