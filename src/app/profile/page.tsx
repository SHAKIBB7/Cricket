'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useSyncStatusOptional } from '@/context/SyncContext';
import { SyncEngine, SyncStatusSnapshot } from '@/infrastructure/sync/SyncEngine';
import { db } from '@/infrastructure/database/dexie-db';
import { UserProfileService } from '@/infrastructure/auth/UserProfileService';
import { getFirebaseConfigDiagnostics } from '@/infrastructure/auth/firebase';
import { useRouter } from 'next/navigation';
import { GoogleConnectionStatusBadge } from '@/components/profile/GoogleConnectionStatusBadge';
import { GoogleDriveBackupSection } from '@/components/profile/GoogleDriveBackupSection';
import { LocalFileBackupSection } from '@/components/profile/LocalFileBackupSection';
import { InstallAppCard } from '@/components/profile/InstallAppCard';
import { SyncConflictsSection } from '@/components/profile/SyncConflictsSection';
import { StorageDiagnosticsSection } from '@/components/profile/StorageDiagnosticsSection';
import { ErrorLogSection } from '@/components/profile/ErrorLogSection';
import { showAppToast } from '@/components/common/AppToast';
import { DangerZoneClearButton } from '@/components/profile/DangerZoneClearButton';
import { EditProfileModal } from '@/components/profile/EditProfileModal';
import { BackButton } from '@/components/navigation';
import {
  Check,
  Edit2,
  Copy,
  LogOut,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  User as UserIcon,
  Mail,
  Cloud,
  X,
  ChevronRight,
  ChevronDown,
  Terminal,
  Activity,
  Users,
  Trophy,
  MapPin,
  Sun,
  Moon,
  Camera,
  KeyRound,
  CheckCircle2,
} from 'lucide-react';

export default function ProfilePage() {
  const router = useRouter();
  const { language, setLanguage, t } = useLanguage();
  const {
    user,
    profile,
    isLoading: isAuthLoading,
    isConfigured,
    error: authError,
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
  } = useAuth();

  const configDiagnostics = getFirebaseConfigDiagnostics();

  const [stats, setStats] = useState({
    matchesCount: 0,
    teamsCount: 0,
    tournamentsCount: 0,
    groundsCount: 0,
    pendingSyncCount: 0,
  });

  const [isOnline, setIsOnline] = useState(true);
  const [syncSnapshot, setSyncSnapshot] = useState<SyncStatusSnapshot | null>(null);
  // BV-4: the status pill derives from the SAME shared sync
  // snapshot the sidebar's SyncIndicator uses, so the two
  // surfaces can never contradict each other. The local
  // SyncEngine subscription above is kept only for the F12-1
  // failedCount/failedError fields SyncContext does not expose.
  const sharedSync = useSyncStatusOptional();
  // P3-M4 follow-up: durable record of the most recent failed
  // outbox write (SyncEngine.recordQueueFailure), if any.
  const [queueFailure, setQueueFailure] = useState<{
    operationType: string;
    error: string;
    at: string;
  } | null>(null);
  // F4-16: profile feedback routes through the shared AppToast system
  // (was a page-local persisted banner). 'info' maps to the default variant.
  const handleNotify = (message: { type: 'success' | 'error' | 'info'; text: string }) => {
    showAppToast(message.text, { variant: message.type === 'info' ? 'default' : message.type });
  };

  // Email / Password Form state
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [signupNameInput, setSignupNameInput] = useState('');
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isSendingVerification, setIsSendingVerification] = useState(false);

  // Display name editing state (inline & modal)
  const [isEditingName, setIsEditingName] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [copiedUid, setCopiedUid] = useState(false);
  const [copiedDiagnostics, setCopiedDiagnostics] = useState(false);

  // Appearance & Theme State
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark' | 'sunlight'>('light');

  const [mounted, setMounted] = useState(false);
  const [isClearingDatabase, setIsClearingDatabase] = useState(false);
  const [ongoingMatchId, setOngoingMatchId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    loadLocalStats();

    // Check for ongoing match to enable smart fallback to live scoreboard
    db.matches
      .where('status')
      .equals('ONGOING')
      .first()
      .then((m) => {
        if (m?.id) setOngoingMatchId(m.id);
      })
      .catch(() => {});

    // P3-M4 follow-up: surface the durable queue-failure record
    // written by SyncEngine.recordQueueFailure, if one exists.
    db.app_metadata
      .get('sync_queue_error')
      .then((record) => {
        const value = record?.value as
          | { operationType?: string; error?: string; at?: string }
          | undefined;
        if (value?.error) {
          setQueueFailure({
            operationType: value.operationType ?? 'SYNC',
            error: value.error,
            at: value.at ?? record?.updatedAt ?? '',
          });
        }
      })
      .catch(() => {});

    // Check saved theme
    try {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme === 'sunlight') {
        setCurrentTheme('sunlight');
      } else if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        setCurrentTheme('dark');
      } else {
        setCurrentTheme('light');
      }
    } catch {
      // Fallback
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOnline(navigator.onLine);

    // Listen for SyncEngine background queue and status changes.
    // F6: snapshots fire on every sync state change while the
    // outbox drains; refreshing local stats (queue prune + five
    // Dexie counts + a full-page re-render) on every one caused
    // visible flicker. Only refresh when the counts the stats
    // depend on actually changed.
    let lastPendingCount = -1;
    let lastFailedCount = -1;
    const unsubSync = SyncEngine.subscribe((snapshot) => {
      setSyncSnapshot(snapshot);
      if (
        snapshot.pendingCount !== lastPendingCount ||
        snapshot.failedCount !== lastFailedCount
      ) {
        lastPendingCount = snapshot.pendingCount;
        lastFailedCount = snapshot.failedCount;
        loadLocalStats();
      }
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubSync();
    };
  }, []);

  // Sync editing input with active profile name
  useEffect(() => {
    if (profile?.displayName) {
      setNameInput(profile.displayName);
    } else if (user?.displayName) {
      setNameInput(user.displayName);
    }
  }, [profile, user]);

  // Sync auth errors to feedback message
  useEffect(() => {
    if (authError) {
      handleNotify({ type: 'error', text: authError });
    }
  }, [authError]);

  async function loadLocalStats() {
    try {
      await SyncEngine.pruneCompletedQueue();
      const [matchesCount, teamsCount, tournamentsCount, groundsCount, pendingSyncCount] = await Promise.all([
        db.matches.count(),
        db.teams.count(),
        db.tournaments.count(),
        db.grounds.count(),
        db.sync_queue.where('status').equals('PENDING').count(),
      ]);

      setStats({
        matchesCount,
        teamsCount,
        tournamentsCount,
        groundsCount,
        pendingSyncCount,
      });
    } catch (e) {
      console.error('Failed to load local statistics', e);
    }
  }

  function handleThemeChange(newTheme: 'light' | 'dark' | 'sunlight') {
    document.documentElement.classList.remove('dark', 'sunlight');
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (newTheme === 'sunlight') {
      document.documentElement.classList.add('sunlight');
    }
    try {
      localStorage.setItem('theme', newTheme);
    } catch {}
    setCurrentTheme(newTheme);
    window.dispatchEvent(new Event('theme-change'));
  }

  async function handleGoogleSignIn() {
    clearError();

    if (!isConfigured) {
      handleNotify({
        type: 'info',
        text: 'Cloud authentication is not configured in this deployment. Set NEXT_PUBLIC_FIREBASE_* variables in your environment to enable cloud sign-in. Local scoring and Google Drive backup remain 100% operational.',
      });
      return;
    }

    const result = await signInWithGoogle();
    if (result.success) {
      handleNotify({
        type: 'success',
        text: 'Successfully signed in with Google.',
      });
      loadLocalStats();
    } else if (result.error && !result.cancelled) {
      handleNotify({
        type: 'error',
        text: result.error,
      });
    }
  }

  async function handleEmailAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmittingAuth) return;
    clearError();

    if (!isConfigured) {
      handleNotify({
        type: 'info',
        text: 'Cloud authentication is not configured in this deployment. Set NEXT_PUBLIC_FIREBASE_* variables in your environment to enable cloud sign-in. Local scoring and Google Drive backup remain 100% operational.',
      });
      return;
    }

    const emailValidation = UserProfileService.validateEmail(emailInput);
    if (!emailValidation.isValid) {
      handleNotify({ type: 'error', text: emailValidation.error || 'Please enter a valid email address.' });
      return;
    }
    if (!passwordInput || passwordInput.length < 6) {
      handleNotify({ type: 'error', text: 'Password must be at least 6 characters long.' });
      return;
    }

    setIsSubmittingAuth(true);
    try {
      if (authMode === 'signin') {
        const result = await signInWithEmail(emailValidation.normalized, passwordInput);
        if (result.success) {
          handleNotify({ type: 'success', text: 'Successfully signed in!' });
          setEmailInput('');
          setPasswordInput('');
          loadLocalStats();
        } else if (result.error) {
          handleNotify({ type: 'error', text: result.error });
        }
      } else {
        const result = await signUpWithEmail(emailValidation.normalized, passwordInput, signupNameInput);
        if (result.success) {
          handleNotify({ type: 'success', text: 'Account created successfully!' });
          setEmailInput('');
          setPasswordInput('');
          setSignupNameInput('');
          loadLocalStats();
        } else if (result.error) {
          handleNotify({ type: 'error', text: result.error });
        }
      }
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  async function handleForgotPassword() {
    if (isResettingPassword) return;
    const emailToUse = user?.email || emailInput;
    const emailValidation = UserProfileService.validateEmail(emailToUse);
    if (!emailValidation.isValid) {
      handleNotify({
        type: 'error',
        text: 'Enter a valid email address to receive a password reset link.',
      });
      return;
    }

    setIsResettingPassword(true);
    try {
      const res = await sendPasswordReset(emailValidation.normalized);
      if (res.success) {
        handleNotify({
          type: 'success',
          text: `If an account exists for ${emailValidation.normalized}, a password reset link has been sent. Please check your inbox.`,
        });
      }
    } finally {
      setIsResettingPassword(false);
    }
  }

  async function handleSendEmailVerification() {
    if (!user || isSendingVerification) return;
    setIsSendingVerification(true);
    try {
      if (sendEmailVerification) {
        const res = await sendEmailVerification();
        if (res.success) {
          handleNotify({
            type: 'success',
            text: t('verification_sent', 'Verification email sent. Please check your inbox.'),
          });
        } else {
          handleNotify({
            type: 'error',
            text: res.error || 'Failed to send verification email.',
          });
        }
      }
    } catch (err: any) {
      handleNotify({
        type: 'error',
        text: err.message || 'Failed to send verification email.',
      });
    } finally {
      setIsSendingVerification(false);
    }
  }

  async function handleSignOut() {
    try {
      await signOut();
      setIsEditingName(false);
      setNameError(null);
      handleNotify({
        type: 'info',
        text: 'Signed out successfully. Switched to offline guest mode.',
      });
      loadLocalStats();
    } catch (err: any) {
      handleNotify({
        type: 'error',
        text: `Sign out failed: ${err.message}`,
      });
    }
  }

  async function handleSaveDisplayName(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (isSavingName) return;
    setNameError(null);

    const validation = UserProfileService.validateDisplayName(nameInput);
    if (!validation.isValid) {
      setNameError(validation.error || 'Invalid display name.');
      return;
    }

    setIsSavingName(true);
    try {
      await updateDisplayName(validation.normalized);
      setIsEditingName(false);
      handleNotify({
        type: 'success',
        text: 'Display name updated successfully.',
      });
    } catch (err: any) {
      setNameError(err.message || 'Failed to update display name.');
    } finally {
      setIsSavingName(false);
    }
  }

  function handleCancelEditName() {
    setIsEditingName(false);
    setNameError(null);
    setNameInput(profile?.displayName || user?.displayName || '');
  }

  async function handleSaveModalProfile(newName: string, newPhotoURL: string | null) {
    if (newName !== activeDisplayName) {
      await updateDisplayName(newName);
    }
    if (newPhotoURL !== activePhoto && updatePhotoURL) {
      await updatePhotoURL(newPhotoURL);
    }
    await refreshProfile();
    handleNotify({
      type: 'success',
      text: 'Profile updated successfully.',
    });
  }

  function handleCopyUid() {
    if (!user?.uid) return;
    navigator.clipboard.writeText(user.uid);
    setCopiedUid(true);
    setTimeout(() => setCopiedUid(false), 2000);
  }

  function handleCopyDiagnostics() {
    const diag = [
      '=== Cric Scorer Pro Diagnostics ===',
      'App Version: 2.5.0',
      `Language: ${language}`,
      `Theme: ${currentTheme}`,
      `Network: ${isOnline ? 'Online' : 'Offline'}`,
      `User Mode: ${isGoogleUser ? 'Google Pro User' : user ? 'Email Authenticated' : 'Guest Scorer'}`,
      `UID: ${user?.uid || 'guest'}`,
      `Local Matches: ${stats.matchesCount}`,
      `Saved Squads: ${stats.teamsCount}`,
      `Tournaments: ${stats.tournamentsCount}`,
      `Pending Sync: ${stats.pendingSyncCount}`,
      `Firebase Configured: ${isConfigured ? 'Yes' : 'No'}`,
      `Rules Engine: Official ICC Rules Engine • MCC Law 18.11`,
      `Storage: Dexie IndexedDB (CricScorerPro_v2)`,
      `Timestamp: ${new Date().toISOString()}`,
    ].join('\n');

    navigator.clipboard.writeText(diag);
    setCopiedDiagnostics(true);
    setTimeout(() => setCopiedDiagnostics(false), 2500);
  }

  async function handleClearDatabase() {
    setIsClearingDatabase(true);
    try {
      await db.matches.clear();
      await db.match_events.clear();
      await db.teams.clear();
      await db.tournaments.clear();
      await db.sync_queue.clear();
      await loadLocalStats();
      handleNotify({
        type: 'success',
        text: 'Local database cleared successfully.',
      });
    } catch (err: any) {
      handleNotify({
        type: 'error',
        text: `Clear error: ${err.message}`,
      });
    } finally {
      setIsClearingDatabase(false);
    }
  }

  const activeDisplayName = profile?.displayName || user?.displayName || 'Guest Scorer';
  const activeEmail = profile?.email || user?.email || 'offline@cricscorerpro.local';
  const activePhoto = profile?.photoURL || user?.photoURL;
  const isGoogleUser = user?.providerData?.some((p) => p.providerId === 'google.com');

  return (
    <div className="max-w-4xl xl:max-w-5xl mx-auto w-full space-y-4 sm:space-y-5 pb-10 pb-safe">
      {/* ── Page Header (Enterprise Clean) ── */}
      <div className="flex items-center justify-between py-1 border-b border-[var(--border)] pb-3 flex-wrap gap-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <BackButton
            fallbackUrl={ongoingMatchId ? `/matches/score/${ongoingMatchId}` : '/'}
            showLabel={false}
            title={t('back', 'Back')}
            size="sm"
          />
          <div className="min-w-0">
            <h1 className="font-extrabold tracking-tight text-h2 sm:text-h1 text-[var(--foreground)] leading-tight truncate">
              {t('account_profile', 'Account & Profile')}
            </h1>
            <p className="text-caption text-[var(--muted-foreground)] mt-0.5">
              {t('account_subtitle', 'Manage your profile, cloud sync, and data backups')}
            </p>
          </div>
        </div>

        <span
          suppressHydrationWarning
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption font-semibold self-start sm:self-center shadow-xs transition-colors ${
            isOnline
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
              : 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
            }`}
          />
          <span suppressHydrationWarning>
            {isOnline ? t('network_online', 'Online') : t('network_offline', 'Offline')}
          </span>
        </span>
      </div>

      

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* ── ENTERPRISE RESPONSIVE DASHBOARD LAYOUT ─────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
        {/* ── LEFT COLUMN: Profile Hero, Identity, Preferences (cols 12 -> 5) ── */}
        <div className="lg:col-span-5 space-y-4 sm:space-y-5">
          {/* 1. Main Profile Card */}
          <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-4 sm:p-5 shadow-elev1 space-y-4">
            {isAuthLoading ? (
              /* BV-3: while auth is still resolving, show a neutral
                 skeleton — never the guest card with a disabled
                 sign-in button (the pre-auth flash). */
              <div className="space-y-4" aria-busy="true" aria-label={t('profile_loading_account', 'Loading account')}>
                <div className="flex items-center gap-3.5">
                  <div className="w-16 h-16 rounded-full bg-[var(--muted)] animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2 min-w-0">
                    <div className="h-5 w-2/3 rounded bg-[var(--muted)] animate-pulse" />
                    <div className="h-3.5 w-1/2 rounded bg-[var(--muted)] animate-pulse" />
                  </div>
                </div>
                <div className="h-10 rounded-xl bg-[var(--muted)] animate-pulse" />
              </div>
            ) : user ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {/* Circular Avatar with Camera Action */}
                    <div className="relative group shrink-0">
                      <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-[var(--muted)] flex items-center justify-center overflow-hidden border-2 border-emerald-500/40 shadow-xs">
                        {activePhoto ? (
                          <img
                            src={activePhoto}
                            alt={activeDisplayName}
                            className="object-cover w-full h-full"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <UserIcon className="w-8 h-8 text-[var(--foreground)] stroke-[1.75]" />
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowEditModal(true)}
                        className="absolute bottom-0 right-0 bg-emerald-600 hover:bg-emerald-500 text-white p-1.5 rounded-full shadow-md active:scale-90 transition-transform"
                        title={t('change_photo', 'Change Photo')}
                        aria-label={t('profile_change_photo', 'Change photo')}
                      >
                        <Camera className="w-3 h-3" />
                      </button>
                    </div>

                    {/* User Identity Details */}
                    <div className="min-w-0 flex-1">
                      {isEditingName ? (
                        <form onSubmit={handleSaveDisplayName} className="space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={nameInput}
                              onChange={(e) => {
                                setNameInput(e.target.value);
                                if (nameError) setNameError(null);
                              }}
                              maxLength={50}
                              disabled={isSavingName}
                              placeholder={t('edit_name', 'Enter display name')}
                              className="bg-[var(--card)] border border-[var(--border)] focus:border-emerald-500 px-2.5 py-1 rounded-lg text-body-small outline-none w-full text-[var(--foreground)] shadow-inset focus:shadow-elev1"
                              autoFocus
                            />
                            <button
                              type="submit"
                              disabled={isSavingName}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold p-1.5 rounded-lg flex items-center justify-center text-caption disabled:opacity-50"
                              title={t('save', 'Save')}
                            >
                              {isSavingName ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelEditName}
                              disabled={isSavingName}
                              className="bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--foreground)] p-1.5 rounded-lg flex items-center justify-center text-caption"
                              title={t('cancel', 'Cancel')}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {nameError && (
                            <p className="text-[11px] text-red-500 font-medium">{nameError}</p>
                          )}
                        </form>
                      ) : (
                        <div>
                          <h2 className="font-extrabold text-lg sm:text-xl text-[var(--foreground)] truncate leading-tight">
                            {activeDisplayName}
                          </h2>
                          <p className="text-caption text-[var(--muted-foreground)] truncate mt-0.5">
                            {activeEmail}
                          </p>

                          {/* Pro Status Indicator & UID Copy */}
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {isGoogleUser ? (
                              <span
                                className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400"
                                title={t('pro_account', 'Pro Account')}
                              >
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                <span>{t('pro_active', 'Pro Active')}</span>
                                <span className="sr-only">{t('pro_account', 'Pro Account')}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-600 dark:text-blue-400">
                                <Mail className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                <span>{t('email_account', 'Email Account')}</span>
                              </span>
                            )}

                            <span className="text-[11px] font-mono text-[var(--muted-foreground)] opacity-70">
                              • UID: {user.uid.slice(0, 8)}...{user.uid.slice(-4)}
                            </span>

                            <button
                              type="button"
                              onClick={handleCopyUid}
                              className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-0.5 font-medium cursor-pointer"
                            >
                              {copiedUid ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                              <span>{copiedUid ? t('copied', 'Copied!') : t('copy_uid', 'Copy UID')}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Inline Edit Icon */}
                  {!isEditingName && (
                    <button
                      type="button"
                      onClick={() => {
                        setNameInput(activeDisplayName);
                        setIsEditingName(true);
                      }}
                      className="p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] dark:hover:text-[var(--foreground)] transition-colors rounded-lg active:scale-95 shrink-0 self-start mt-0.5"
                      title={t('edit_name', 'Edit display name')}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Profile Action Buttons */}
                <div className="flex items-center gap-2 pt-1 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(true)}
                    className="flex-1 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-700 dark:text-emerald-400 hover:text-white border border-emerald-500/25 py-2 px-3 rounded-xl font-semibold text-caption flex items-center justify-center gap-1.5 transition-all active:scale-98"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>{t('edit_profile', 'Edit Profile & Avatar')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={isAuthLoading}
                    className="bg-[var(--muted)] hover:bg-red-500/15 hover:text-red-500 text-[var(--muted-foreground)] border border-[var(--border)] py-2 px-3.5 rounded-xl font-semibold text-caption flex items-center justify-center gap-1.5 transition-all active:scale-98"
                    title={t('sign_out', 'Sign Out')}
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{t('sign_out', 'Sign Out')}</span>
                  </button>
                </div>

                {/* Email Verification / Password Reset Info for Non-Google Users */}
                {!isGoogleUser && (
                  <div className="bg-muted/40 border border-[var(--border)] rounded-xl p-3 space-y-2 text-caption">
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--muted-foreground)]">Email Verification:</span>
                      {user.emailVerified ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{t('email_verified', 'Verified')}</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={handleSendEmailVerification}
                          disabled={isSendingVerification || !isOnline}
                          className="text-amber-600 dark:text-amber-400 font-bold hover:underline flex items-center gap-1"
                        >
                          {isSendingVerification ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <KeyRound className="w-3 h-3" />
                          )}
                          <span>{t('send_verification', 'Verify Email')}</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-[var(--border)]">
                      <span className="text-[var(--muted-foreground)]">Password Security:</span>
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        disabled={isResettingPassword || !isOnline}
                        className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline flex items-center gap-1"
                      >
                        {isResettingPassword ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <KeyRound className="w-3 h-3" />
                        )}
                        <span>{t('reset_password', 'Reset Password')}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Guest Account Card */
              <div className="space-y-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-14 h-14 rounded-full bg-[var(--muted)] flex items-center justify-center shrink-0 border border-[var(--border)]">
                      <UserIcon className="w-6 h-6 text-[var(--muted-foreground)] stroke-[1.75]" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-bold text-base text-[var(--foreground)] truncate">
                        {t('guest_account', 'Guest Account')}
                      </h2>
                      <p className="text-caption text-[var(--muted-foreground)] truncate mt-0.5">
                        {t('guest_desc', 'Operating in local offline storage on this device')}
                      </p>
                    </div>
                  </div>

                  <span className="text-[11px] font-semibold text-[var(--muted-foreground)] bg-[var(--muted)] px-2 py-0.5 rounded-full border border-[var(--border)] shrink-0">
                    Offline Active
                  </span>
                </div>

                <div className="pt-1">
                  <button
                    onClick={handleGoogleSignIn}
                    disabled={isAuthLoading || !isOnline}
                    className="w-full font-semibold bg-white hover:bg-slate-50 text-slate-900 border border-[var(--border)] py-2.5 px-3 rounded-xl text-body-small flex items-center justify-center gap-2 shadow-elev2 transition-transform active:scale-98"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    <span>{t('profile_sign_in_google', 'Sign In with Google')}</span>
                  </button>
                </div>

                {/* Email/Password Toggle */}
                <details className="group pt-1">
                  <summary className="text-[12px] text-emerald-700 dark:text-emerald-400 cursor-pointer select-none font-medium hover:underline">
                    {t('profile_or_email', 'Or sign in with email & password')} →
                  </summary>
                  <div className="pt-2 space-y-2.5">
                    <div className="flex bg-[var(--muted)] p-0.5 rounded-lg border border-[var(--border)]">
                      <button
                        type="button"
                        onClick={() => { setAuthMode('signin'); clearError(); }}
                        className={`flex-1 py-1 text-caption font-semibold rounded-md ${
                          authMode === 'signin' ? 'bg-emerald-600 text-white shadow-elev2' : 'text-[var(--muted-foreground)]'
                        }`}
                      >
                        {t('sign_in', 'Sign In')}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAuthMode('signup'); clearError(); }}
                        className={`flex-1 py-1 text-caption font-semibold rounded-md ${
                          authMode === 'signup' ? 'bg-emerald-600 text-white shadow-elev2' : 'text-[var(--muted-foreground)]'
                        }`}
                      >
                        {t('create_account', 'Create Account')}
                      </button>
                    </div>

                    <form onSubmit={handleEmailAuthSubmit} className="space-y-2">
                      {authMode === 'signup' && (
                        <input
                          type="text"
                          value={signupNameInput}
                          onChange={(e) => setSignupNameInput(e.target.value)}
                          placeholder={t('profile_display_name', 'Display Name')}
                          className="bg-[var(--card)] border border-[var(--border)] px-3 py-1.5 rounded-lg text-body-small w-full shadow-inset"
                        />
                      )}
                      <input
                        type="email"
                        required
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder={t('profile_email', 'Email address')}
                        className="bg-[var(--card)] border border-[var(--border)] px-3 py-1.5 rounded-lg text-body-small w-full shadow-inset"
                      />
                      <input
                        type="password"
                        required
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        placeholder={t('profile_password', 'Password')}
                        minLength={6}
                        className="bg-[var(--card)] border border-[var(--border)] px-3 py-1.5 rounded-lg text-body-small w-full shadow-inset"
                      />
                      <button
                        type="submit"
                        disabled={isSubmittingAuth || !isOnline}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-lg text-caption shadow-elev2"
                      >
                        {isSubmittingAuth ? t('profile_processing', 'Processing...') : authMode === 'signin' ? t('sign_in', 'Sign In') : t('create_account', 'Create Account')}
                      </button>
                    </form>
                  </div>
                </details>
              </div>
            )}
          </div>

          {/* 2. Preferences & Display Card (Theme & Language) */}
          <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-4 sm:p-5 shadow-elev1 space-y-3.5">
            <h3 className="font-bold text-[14px] uppercase tracking-wider text-[var(--muted-foreground)]">
              {t('preferences', 'Preferences & Display')}
            </h3>

            {/* Theme Toggle Pills */}
            <div className="space-y-1.5">
              <span className="text-caption font-semibold text-[var(--foreground)] block">
                {t('theme_appearance', 'Theme Appearance')}
              </span>
              <div className="grid grid-cols-3 gap-1.5 bg-[var(--muted)] p-1 rounded-xl border border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => handleThemeChange('light')}
                  className={`py-1.5 px-2 rounded-lg text-caption font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    currentTheme === 'light'
                      ? 'bg-[var(--card)] text-[var(--foreground)] shadow-elev2 font-bold'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                  <span>{t('light_mode', 'Light')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleThemeChange('dark')}
                  className={`py-1.5 px-2 rounded-lg text-caption font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    currentTheme === 'dark'
                      ? 'bg-[var(--card)] text-[var(--foreground)] shadow-elev2 font-bold'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5 text-blue-400" />
                  <span>{t('dark_mode', 'Dark')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleThemeChange('sunlight')}
                  className={`py-1.5 px-2 rounded-lg text-caption font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    currentTheme === 'sunlight'
                      ? 'bg-[var(--card)] text-amber-700 dark:text-amber-400 shadow-elev2 font-bold border border-amber-500/30'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                  title={t('profile_sunlight_title', 'High-contrast mode for outdoor sunlight')}
                >
                  <Sun className="w-3.5 h-3.5 text-amber-600" />
                  <span>{t('sunlight_mode', 'Sunlight')}</span>
                </button>
              </div>
            </div>

            {/* Language Switcher */}
            <div className="space-y-1.5 pt-1">
              <span className="text-caption font-semibold text-[var(--foreground)] block">
                Language / ভাষা
              </span>
              <div className="grid grid-cols-2 gap-1.5 bg-[var(--muted)] p-1 rounded-xl border border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setLanguage('en')}
                  className={`py-1.5 px-3 rounded-lg text-caption font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    language === 'en'
                      ? 'bg-[var(--card)] text-emerald-700 dark:text-emerald-400 shadow-elev2 font-bold'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  <span>{t('profile_english', 'English')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage('bn')}
                  className={`py-1.5 px-3 rounded-lg text-caption font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    language === 'bn'
                      ? 'bg-[var(--card)] text-emerald-700 dark:text-emerald-400 shadow-elev2 font-bold'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  <span>বাংলা</span>
                </button>
              </div>
            </div>
          </div>

          {/* 3. System & Developer Diagnostics (Collapsible Disclosure) */}
          <details className="group text-caption text-[var(--muted-foreground)] bg-[var(--card)] rounded-2xl border border-[var(--border)] overflow-hidden shadow-elev1 transition-colors">
            <summary className="flex items-center justify-between p-4 cursor-pointer select-none hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                <Terminal className="w-4 h-4 shrink-0 text-emerald-500" />
                <span className="font-bold text-[12px] uppercase tracking-wider text-[var(--foreground)]">
                  {t('dev_diagnostics', 'System & Developer Diagnostics')}
                </span>
              </div>
              <ChevronDown className="w-4 h-4 text-[var(--muted-foreground)] transition-transform duration-200 group-open:rotate-180" />
            </summary>

            <div className="p-4 pt-1 space-y-3 text-[11px] border-t border-[var(--border)] bg-muted/20">
              <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-[var(--border)]">
                <span className="font-bold text-[var(--foreground)]">Cric Scorer Pro • Version 2.5.0</span>
                <GoogleConnectionStatusBadge user={user} isOnline={isOnline} />
              </div>

              <div className="space-y-1.5 text-[var(--muted-foreground)]">
                <p><strong>Rules Engine:</strong> Official ICC Rules Engine • MCC Law 18.11 • Event-Sourced Architecture</p>
                <p><strong>Local Storage:</strong> Dexie.js IndexedDB (100% Uninterrupted Offline Scoring)</p>
                <p><strong>Cloud Backend:</strong> Firebase Authentication &amp; Firestore (Project: cricket-proo)</p>
                <p><strong>Cloud Portability:</strong> Google Drive REST API (drive.file scope)</p>
              </div>

              <StorageDiagnosticsSection />
              <ErrorLogSection />

              <div className="pt-1 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleCopyDiagnostics}
                  className="bg-[var(--card)] hover:bg-[var(--muted)] border border-[var(--border)] px-2.5 py-1.5 rounded-lg font-semibold text-caption text-[var(--foreground)] inline-flex items-center gap-1.5 shadow-xs active:scale-95 cursor-pointer"
                >
                  {copiedDiagnostics ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedDiagnostics ? t('diagnostics_copied', 'Copied!') : t('copy_diagnostics', 'Copy Diagnostics')}</span>
                </button>
              </div>

              {!isConfigured && (
                <div className="bg-amber-500/10 border border-amber-500/25 rounded-lg p-2.5 space-y-1">
                  <p className="font-semibold text-amber-600 dark:text-amber-400">Firebase Cloud Config Notice:</p>
                  <p>Variables not detected in environment. Scoring &amp; Google Drive backups remain functional.</p>
                  {configDiagnostics.missingVariables.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {configDiagnostics.missingVariables.map((v) => (
                        <code key={v} className="bg-[var(--muted)] px-1 rounded text-[10px] font-mono border border-[var(--border)]">
                          {v}
                        </code>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </details>
        </div>

        {/* ── RIGHT COLUMN: Stats, Sync, Google Drive, Backups, Danger Zone (cols 12 -> 7) ── */}
        <div className="lg:col-span-7 space-y-4 sm:space-y-5">
          {/* 1. Interactive Account Overview Metrics */}
          <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-4 sm:p-5 shadow-elev1 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-[14px] uppercase tracking-wider text-[var(--muted-foreground)]">
                {t('quick_navigation', 'Account Overview & Quick Navigation')}
              </h3>
              <span className="text-[11px] text-[var(--muted-foreground)]">{t('profile_indexeddb_cache', 'IndexedDB Local Cache')}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3 text-left">
              {/* Local Matches Card */}
              <button
                type="button"
                onClick={() => router.push('/matches/history')}
                className="bg-muted/50 hover:bg-[var(--muted)] border border-[var(--border)] hover:border-emerald-500/50 p-3 rounded-xl transition-all text-left group active:scale-98 cursor-pointer"
                title={t('profile_view_history', 'View Match History')}
              >
                <div className="flex items-center justify-between text-[var(--muted-foreground)] mb-1">
                  <Activity className="w-4 h-4 text-emerald-500" />
                  <ChevronRight className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-xl sm:text-2xl font-bold text-[var(--foreground)] num-font" suppressHydrationWarning>
                  {stats.matchesCount}
                </p>
                <p className="text-[11px] sm:text-[12px] text-[var(--muted-foreground)] font-medium truncate mt-0.5">
                  {t('local_matches', 'Local Matches')}
                </p>
              </button>

              {/* Saved Squads Card */}
              <button
                type="button"
                onClick={() => router.push('/teams')}
                className="bg-muted/50 hover:bg-[var(--muted)] border border-[var(--border)] hover:border-blue-500/50 p-3 rounded-xl transition-all text-left group active:scale-98 cursor-pointer"
                title={t('profile_manage_teams', 'Manage Squads & Teams')}
              >
                <div className="flex items-center justify-between text-[var(--muted-foreground)] mb-1">
                  <Users className="w-4 h-4 text-blue-500" />
                  <ChevronRight className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-xl sm:text-2xl font-bold text-[var(--foreground)] num-font" suppressHydrationWarning>
                  {stats.teamsCount}
                </p>
                <p className="text-[11px] sm:text-[12px] text-[var(--muted-foreground)] font-medium truncate mt-0.5">
                  {t('saved_squads', 'Saved Squads')}
                </p>
              </button>

              {/* Tournaments Card */}
              <button
                type="button"
                onClick={() => router.push('/tournaments')}
                className="bg-muted/50 hover:bg-[var(--muted)] border border-[var(--border)] hover:border-amber-500/50 p-3 rounded-xl transition-all text-left group active:scale-98 cursor-pointer"
                title={t('profile_view_tournaments', 'View Tournaments')}
              >
                <div className="flex items-center justify-between text-[var(--muted-foreground)] mb-1">
                  <Trophy className="w-4 h-4 text-amber-500" />
                  <ChevronRight className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-xl sm:text-2xl font-bold text-[var(--foreground)] num-font" suppressHydrationWarning>
                  {stats.tournamentsCount}
                </p>
                <p className="text-[11px] sm:text-[12px] text-[var(--muted-foreground)] font-medium truncate mt-0.5">
                  {t('tournaments_count', 'Tournaments')}
                </p>
              </button>

              {/* Saved Grounds Card */}
              <button
                type="button"
                onClick={() => router.push('/grounds')}
                className="bg-muted/50 hover:bg-[var(--muted)] border border-[var(--border)] hover:border-emerald-500/50 p-3 rounded-xl transition-all text-left group active:scale-98 cursor-pointer"
                title={t('profile_manage_grounds', 'Manage Grounds & Venues')}
              >
                <div className="flex items-center justify-between text-[var(--muted-foreground)] mb-1">
                  <MapPin className="w-4 h-4 text-emerald-500" />
                  <ChevronRight className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-xl sm:text-2xl font-bold text-[var(--foreground)] num-font" suppressHydrationWarning>
                  {stats.groundsCount}
                </p>
                <p className="text-[11px] sm:text-[12px] text-[var(--muted-foreground)] font-medium truncate mt-0.5">
                  {t('venues_count', 'Venues')}
                </p>
              </button>

              {/* Pending Sync Card */}
              <div
                className="bg-muted/50 border border-[var(--border)] p-3 rounded-xl text-left"
                title={t('profile_pending_title', 'Pending local mutations awaiting background upload')}
              >
                <div className="flex items-center justify-between text-[var(--muted-foreground)] mb-1">
                  <Cloud className="w-4 h-4 text-emerald-500" />
                </div>
                <p className="text-xl sm:text-2xl font-bold text-[var(--foreground)] num-font" suppressHydrationWarning>
                  {stats.pendingSyncCount}
                </p>
                <p className="text-[11px] sm:text-[12px] text-[var(--muted-foreground)] font-medium truncate mt-0.5">
                  {t('pending_sync', 'Pending Sync')}
                </p>
              </div>
            </div>
          </div>

          {/* 2. Automatic Cloud Backup & Cross-Device Sync Card */}
          <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-4 sm:p-5 shadow-elev1 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <Cloud className="w-5 h-5 text-emerald-600 dark:text-emerald-400 stroke-[1.75]" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-base text-[var(--foreground)] truncate">
                    {t('auto_cloud_backup', 'Automatic Cloud Backup & Sync')}
                  </h3>
                  <p className="text-caption text-[var(--muted-foreground)] mt-0.5">
                    {t('auto_backup_desc', 'All scores, teams, and tournaments back up automatically in the background')}
                  </p>
                </div>
              </div>

              {/* Real-time sync status pill — BV-4: derived from
                  the shared SyncContext snapshot (falling back to
                  the local subscription/stats), so it always agrees
                  with the sidebar; a signed-out user with a pending
                  queue no longer reads 'Local Only (Offline)' while
                  the browser is online. */}
              <div className="shrink-0">
                {isAuthLoading ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold bg-[var(--muted)] text-[var(--muted-foreground)] border border-[var(--border)]">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Checking account…</span>
                  </span>
                ) : user ? (
                  !(sharedSync?.isOnline ?? isOnline) ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span>{t('network_offline', 'Offline')} ({sharedSync?.pendingCount ?? stats.pendingSyncCount} queued)</span>
                    </span>
                  ) : (sharedSync?.syncState ?? syncSnapshot?.state) === 'SYNCING' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>{t('syncing', 'Syncing...')}</span>
                    </span>
                  ) : syncSnapshot?.failedCount ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30">
                      <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                      <span>{syncSnapshot.failedCount} Sync Failed</span>
                    </span>
                  ) : (sharedSync?.pendingCount ?? stats.pendingSyncCount) > 0 ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                      <RefreshCw className="w-3 h-3 text-amber-500" />
                      <span>{sharedSync?.pendingCount ?? stats.pendingSyncCount} Pending Auto-Sync</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      <span>{t('auto_backup_active', 'Cloud Backup Active')}</span>
                    </span>
                  )
                ) : (sharedSync?.pendingCount ?? stats.pendingSyncCount) > 0 ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                    <RefreshCw className="w-3 h-3 text-amber-500" />
                    <span>
                      {sharedSync?.pendingCount ?? stats.pendingSyncCount} Pending — Sign In to Sync
                      {(sharedSync?.isOnline ?? isOnline) ? '' : ' (Offline)'}
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold bg-[var(--muted)] text-[var(--muted-foreground)] border border-[var(--border)]">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    <span>Local Only{(sharedSync?.isOnline ?? isOnline) ? '' : ' (Offline)'}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Failed sync operations (F12-1: a failed sync is never silent) */}
            {user && syncSnapshot && syncSnapshot.failedCount > 0 && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-red-600 dark:text-red-400">
                    {syncSnapshot.failedCount} item{syncSnapshot.failedCount === 1 ? '' : 's'} failed to sync
                  </p>
                  {syncSnapshot.failedError && (
                    <p className="text-[11.5px] text-[var(--muted-foreground)] leading-relaxed break-words mt-0.5">
                      {syncSnapshot.failedError}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => { void SyncEngine.retryFailed(); }}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-full text-caption font-semibold bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>{t('newm_retry', 'Retry')}</span>
                </button>
              </div>
            )}

            {/* Durable queue-write failure (P3-M4 follow-up): a save
                whose outbox insert failed is recorded in
                app_metadata so it is never silent. */}
            {queueFailure && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-amber-600 dark:text-amber-400">
                    A change could not be queued for sync ({queueFailure.operationType})
                  </p>
                  <p className="text-[11.5px] text-[var(--muted-foreground)] leading-relaxed break-words mt-0.5">
                    {queueFailure.error}
                    {queueFailure.at ? ` — ${queueFailure.at}` : ''}
                  </p>
                </div>
              </div>
            )}

            {/* Backed-up entity metrics summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-[var(--border)]">
              <div className="p-2.5 rounded-xl bg-muted/40 border border-[var(--border)]">
                <span className="text-[11px] text-[var(--muted-foreground)] block">{t('local_matches', 'Matches')}</span>
                <span className="text-base font-bold text-[var(--foreground)] num-font" suppressHydrationWarning>
                  {stats.matchesCount}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-muted/40 border border-[var(--border)]">
                <span className="text-[11px] text-[var(--muted-foreground)] block">{t('saved_squads', 'Squads')}</span>
                <span className="text-base font-bold text-[var(--foreground)] num-font" suppressHydrationWarning>
                  {stats.teamsCount}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-muted/40 border border-[var(--border)]">
                <span className="text-[11px] text-[var(--muted-foreground)] block">{t('tournaments_count', 'Tournaments')}</span>
                <span className="text-base font-bold text-[var(--foreground)] num-font" suppressHydrationWarning>
                  {stats.tournamentsCount}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-muted/40 border border-[var(--border)]">
                <span className="text-[11px] text-[var(--muted-foreground)] block">{t('venues_count', 'Venues')}</span>
                <span className="text-base font-bold text-[var(--foreground)] num-font" suppressHydrationWarning>
                  {stats.groundsCount}
                </span>
              </div>
            </div>

            {/* Auto-sync features explanation */}
            <div className="bg-muted/30 rounded-xl p-3 border border-[var(--border)] text-caption text-[var(--muted-foreground)] space-y-1.5">
              <p className="font-medium text-[var(--foreground)] text-[12px] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Zero-Friction Cross-Device Synchronization</span>
              </p>
              <p className="text-[11.5px] leading-relaxed">
                Log in with the same account on any smartphone, tablet, or desktop to instantly access your restored matches, teams, and settings. Offline scores queue locally and automatically upload the moment your connection is restored.
              </p>
              {syncSnapshot?.lastSyncedAt && (
                <p className="text-[11px] text-[var(--muted-foreground)] pt-0.5">
                  {t('last_sync_time', 'Last synchronized')}:{' '}
                  <span className="font-medium text-[var(--foreground)]">
                    {syncSnapshot.lastSyncedAt.toLocaleTimeString()}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Sync Conflicts (pick-a-version) — renders nothing when there are none */}
          <SyncConflictsSection
            onRestoreComplete={loadLocalStats}
            onNotify={handleNotify}
          />

          {/* Install App Card (PWA programme P3) */}
          <InstallAppCard />

          {/* 3. Google Drive Cloud Backup & Disaster Recovery Card */}
          <GoogleDriveBackupSection
            userUid={user?.uid}
            onRestoreComplete={loadLocalStats}
            onNotify={handleNotify}
          />

          {/* 3b. Local File Backup & Restore Card (PWA programme P6) */}
          <LocalFileBackupSection
            onRestoreComplete={loadLocalStats}
            onNotify={handleNotify}
          />

          {/* 4. Danger Zone (Collapsible Disclosure) */}
          <details className="group border border-red-500/25 bg-red-500/5 dark:bg-red-950/20 rounded-2xl overflow-hidden transition-colors shadow-elev1">
            <summary className="w-full flex items-center justify-between p-3.5 sm:p-4 text-left cursor-pointer select-none group-hover:opacity-90">
              <div className="flex items-center gap-3 min-w-0">
                <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 stroke-[1.75]" />
                <span className="font-bold text-base text-red-600 dark:text-red-400">
                  {t('danger_zone', 'Danger Zone')}
                </span>
              </div>
              <ChevronDown className="w-5 h-5 text-red-600 dark:text-red-400 transition-transform group-open:rotate-180 shrink-0" />
            </summary>

            <div className="p-4 pt-1 space-y-3 text-caption text-[var(--muted-foreground)] border-t border-red-500/20">
              <p className="font-medium text-[var(--foreground)] text-[12px]">
                {t('danger_zone_details', 'This will permanently delete all local matches, squads, tournaments, and pending sync queue items stored in IndexedDB.')}
              </p>
              <ul className="list-disc list-inside space-y-1 text-[11px] opacity-90 pl-1 text-red-600/90 dark:text-red-400/90">
                <li>{t('profile_danger_item_matches', 'All locally recorded match scorecards & ball-by-ball history')}</li>
                <li>{t('profile_danger_item_teams', 'Saved teams, squads, and custom player rosters')}</li>
                <li>{t('profile_danger_item_tournaments', 'Tournament brackets, standings, and net run rates')}</li>
                <li>{t('profile_danger_item_queue', 'Pending mutation queue awaiting cloud sync')}</li>
              </ul>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                ✓ {t('profile_cloud_protected', 'Remote cloud records in Firebase are protected.')}
              </p>
              <div className="pt-1.5">
                <DangerZoneClearButton
                  onConfirm={handleClearDatabase}
                  isClearing={isClearingDatabase}
                />
              </div>
            </div>
          </details>
        </div>
      </div>

      {/* ── EDIT PROFILE MODAL ── */}
      <EditProfileModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        currentDisplayName={activeDisplayName}
        currentPhotoURL={activePhoto || null}
        email={activeEmail}
        onSave={handleSaveModalProfile}
      />
    </div>
  );
}
