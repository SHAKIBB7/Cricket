'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User } from 'firebase/auth';
import { isFirebaseConfigured } from '@/infrastructure/auth/firebase';
import { FirebaseAuthService, AuthActionResult } from '@/infrastructure/auth/FirebaseAuthService';
import { UserProfileService, UserProfileData } from '@/infrastructure/auth/UserProfileService';
import { FeatureHubRepository } from '@/infrastructure/storage/FeatureHubRepository';

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
  refreshProfile: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshProfile = useCallback(async () => {
    if (user) {
      try {
        const p = await UserProfileService.getUserProfile(user.uid);
        if (p) setProfile(p);
      } catch (e: any) {
        console.error('[AuthContext] Failed refreshing profile', e);
      }
    } else {
      const local = await FeatureHubRepository.loadProfile();
      if (local && local.uid) {
        setProfile({
          uid: local.uid,
          displayName: local.name,
          email: local.email,
          photoURL: local.photoUrl || null,
          createdAt: local.lastSyncedAt || new Date().toISOString(),
          updatedAt: local.lastSyncedAt || new Date().toISOString(),
        });
      } else {
        setProfile(null);
      }
    }
  }, [user]);

  useEffect(() => {
    // Listen for authentication changes & restore sessions reliably
    const unsubscribe = FirebaseAuthService.onAuthStateChanged(async (firebaseUser) => {
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
          setProfile(userProfile);
        } catch (err: any) {
          console.error('[AuthContext] Error syncing profile upon auth change:', err);
          setError(err.message || 'Error syncing profile.');
        }
      } else {
        setUser(null);
        // Clear or check guest profile
        const local = await FeatureHubRepository.loadProfile();
        if (local && local.isLoggedIn && local.uid) {
          // If locally marked as logged in but Firebase session ended, clear it
          await FeatureHubRepository.clearProfile();
        }
        setProfile(null);
      }

      setIsLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<AuthActionResult> => {
    setError(null);
    setIsLoading(true);

    const result = await FirebaseAuthService.signInWithGoogle();

    if (result.success && result.user) {
      setUser(result.user);
      if (result.profile) {
        setProfile(result.profile);
      }
    } else if (result.error && !result.cancelled) {
      setError(result.error);
    }

    setIsLoading(false);
    return result;
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string): Promise<AuthActionResult> => {
    setError(null);
    setIsLoading(true);

    const result = await FirebaseAuthService.signInWithEmail(email, password);

    if (result.success && result.user) {
      setUser(result.user);
      if (result.profile) {
        setProfile(result.profile);
      }
    } else if (result.error) {
      setError(result.error);
    }

    setIsLoading(false);
    return result;
  }, []);

  const signUpWithEmail = useCallback(
    async (email: string, password: string, displayName?: string): Promise<AuthActionResult> => {
      setError(null);
      setIsLoading(true);

      const result = await FirebaseAuthService.signUpWithEmail(email, password, displayName);

      if (result.success && result.user) {
        setUser(result.user);
        if (result.profile) {
          setProfile(result.profile);
        }
      } else if (result.error) {
        setError(result.error);
      }

      setIsLoading(false);
      return result;
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

    try {
      await FirebaseAuthService.signOutUser();
      setUser(null);
      setProfile(null);
    } catch (err: any) {
      setError(err.message || 'Failed to sign out.');
    } finally {
      setIsLoading(false);
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
      setProfile(updated);
    } catch (err: any) {
      setError(err.message || 'Failed to update display name.');
      throw err;
    }
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
        isConfigured: isFirebaseConfigured,
        error,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        sendPasswordReset,
        signOut,
        updateDisplayName,
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
