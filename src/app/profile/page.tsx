'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { SyncEngine } from '@/infrastructure/sync/SyncEngine';
import { db } from '@/infrastructure/database/dexie-db';
import { UserProfileService } from '@/infrastructure/auth/UserProfileService';
import { getFirebaseConfigDiagnostics } from '@/infrastructure/auth/firebase';
import {
  GoogleDriveService,
  DriveBackupFile,
} from '@/infrastructure/storage/GoogleDriveService';
import { StorageManagerService } from '@/infrastructure/storage/StorageManagerService';
import { useRouter } from 'next/navigation';
import { GoogleConnectionStatusBadge } from '@/components/profile/GoogleConnectionStatusBadge';
import { DangerZoneClearButton } from '@/components/profile/DangerZoneClearButton';
import { EditProfileModal } from '@/components/profile/EditProfileModal';
import {
  Check,
  Edit2,
  Copy,
  LogOut,
  AlertCircle,
  RefreshCw,
  Download,
  Upload,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  User as UserIcon,
  Mail,
  Lock,
  Cloud,
  CloudUpload,
  CloudDownload,
  Calendar,
  X,
  ChevronRight,
  ChevronDown,
  Terminal,
  Activity,
  Users,
  Trophy,
  ExternalLink,
  Sun,
  Moon,
  Sparkles,
  Camera,
  KeyRound,
  CheckCircle2,
} from 'lucide-react';
import { ToastNotification } from '@/components/common/ToastNotification';

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
  const [guestLastBackup, setGuestLastBackup] = useState<string | null>(null);

  const [stats, setStats] = useState({
    matchesCount: 0,
    teamsCount: 0,
    tournamentsCount: 0,
    pendingSyncCount: 0,
  });

  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResultState, setSyncResultState] = useState<'idle' | 'syncing' | 'success' | 'partial' | 'error'>('idle');
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

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

  // Google Drive Backup & Restore state
  const [isDriveBackingUp, setIsDriveBackingUp] = useState(false);
  const [isFetchingDriveBackups, setIsFetchingDriveBackups] = useState(false);
  const [isDriveRestoring, setIsDriveRestoring] = useState(false);
  const [showDriveRestoreModal, setShowDriveRestoreModal] = useState(false);
  const [driveBackupsList, setDriveBackupsList] = useState<DriveBackupFile[]>([]);
  const [restoringFileId, setRestoringFileId] = useState<string | null>(null);

  // Cloud Backup Deletion state
  const [isDeletingDriveBackup, setIsDeletingDriveBackup] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [fileToDelete, setFileToDelete] = useState<DriveBackupFile | null>(null);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [modalFeedbackMessage, setModalFeedbackMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  const [isClearingDatabase, setIsClearingDatabase] = useState(false);

  useEffect(() => {
    setMounted(true);
    loadLocalStats();

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

    db.app_metadata
      .get('last_drive_backup_at_guest')
      .then((meta) => {
        if (meta?.value) setGuestLastBackup(meta.value);
      })
      .catch(() => {});

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOnline(navigator.onLine);

    // Listen for SyncEngine background queue changes
    const unsubSync = SyncEngine.subscribe(() => {
      loadLocalStats();
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
      setFeedbackMessage({ type: 'error', text: authError });
    }
  }, [authError]);

  async function loadLocalStats() {
    try {
      await SyncEngine.pruneCompletedQueue();
      const [matchesCount, teamsCount, tournamentsCount, pendingSyncCount] = await Promise.all([
        db.matches.count(),
        db.teams.count(),
        db.tournaments.count(),
        db.sync_queue.where('status').equals('PENDING').count(),
      ]);

      setStats({
        matchesCount,
        teamsCount,
        tournamentsCount,
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
    setFeedbackMessage(null);
    clearError();

    if (!isConfigured) {
      setFeedbackMessage({
        type: 'info',
        text: 'Cloud authentication is not configured in this deployment. Set NEXT_PUBLIC_FIREBASE_* variables in your environment to enable cloud sign-in. Local scoring and Google Drive backup remain 100% operational.',
      });
      return;
    }

    const result = await signInWithGoogle();
    if (result.success) {
      setFeedbackMessage({
        type: 'success',
        text: 'Successfully signed in with Google.',
      });
      loadLocalStats();
    } else if (result.error && !result.cancelled) {
      setFeedbackMessage({
        type: 'error',
        text: result.error,
      });
    }
  }

  async function handleEmailAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmittingAuth) return;
    setFeedbackMessage(null);
    clearError();

    if (!isConfigured) {
      setFeedbackMessage({
        type: 'info',
        text: 'Cloud authentication is not configured in this deployment. Set NEXT_PUBLIC_FIREBASE_* variables in your environment to enable cloud sign-in. Local scoring and Google Drive backup remain 100% operational.',
      });
      return;
    }

    const emailValidation = UserProfileService.validateEmail(emailInput);
    if (!emailValidation.isValid) {
      setFeedbackMessage({ type: 'error', text: emailValidation.error || 'Please enter a valid email address.' });
      return;
    }
    if (!passwordInput || passwordInput.length < 6) {
      setFeedbackMessage({ type: 'error', text: 'Password must be at least 6 characters long.' });
      return;
    }

    setIsSubmittingAuth(true);
    try {
      if (authMode === 'signin') {
        const result = await signInWithEmail(emailValidation.normalized, passwordInput);
        if (result.success) {
          setFeedbackMessage({ type: 'success', text: 'Successfully signed in!' });
          setEmailInput('');
          setPasswordInput('');
          loadLocalStats();
        } else if (result.error) {
          setFeedbackMessage({ type: 'error', text: result.error });
        }
      } else {
        const result = await signUpWithEmail(emailValidation.normalized, passwordInput, signupNameInput);
        if (result.success) {
          setFeedbackMessage({ type: 'success', text: 'Account created successfully!' });
          setEmailInput('');
          setPasswordInput('');
          setSignupNameInput('');
          loadLocalStats();
        } else if (result.error) {
          setFeedbackMessage({ type: 'error', text: result.error });
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
      setFeedbackMessage({
        type: 'error',
        text: 'Enter a valid email address to receive a password reset link.',
      });
      return;
    }

    setIsResettingPassword(true);
    try {
      const res = await sendPasswordReset(emailValidation.normalized);
      if (res.success) {
        setFeedbackMessage({
          type: 'success',
          text: `Password reset email sent to ${emailValidation.normalized}. Please check your inbox.`,
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
          setFeedbackMessage({
            type: 'success',
            text: t('verification_sent', 'Verification email sent. Please check your inbox.'),
          });
        } else {
          setFeedbackMessage({
            type: 'error',
            text: res.error || 'Failed to send verification email.',
          });
        }
      }
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'Failed to send verification email.',
      });
    } finally {
      setIsSendingVerification(false);
    }
  }

  async function handleSignOut() {
    setFeedbackMessage(null);
    try {
      await signOut();
      setIsEditingName(false);
      setNameError(null);
      setFeedbackMessage({
        type: 'info',
        text: 'Signed out successfully. Switched to offline guest mode.',
      });
      loadLocalStats();
    } catch (err: any) {
      setFeedbackMessage({
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
      setFeedbackMessage({
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
    setFeedbackMessage({
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

  // ── Google Drive Backup Handler ──
  async function handleGoogleDriveBackup() {
    if (!isOnline) {
      setFeedbackMessage({
        type: 'error',
        text: 'Cannot backup to Google Drive while offline. Check internet connection.',
      });
      return;
    }

    setIsDriveBackingUp(true);
    setFeedbackMessage(null);
    try {
      const token = await GoogleDriveService.requestAccessToken();
      const payload = await GoogleDriveService.createBackupPayload(user?.uid);
      const uploadedFile = await GoogleDriveService.uploadBackup(token, payload);

      const timestamp = new Date().toISOString();
      const backupUid = user?.uid || 'guest';
      await UserProfileService.recordDriveBackup(backupUid, timestamp);
      setGuestLastBackup(timestamp);
      if (user?.uid) {
        await refreshProfile();
      }

      setFeedbackMessage({
        type: 'success',
        text: `Backed up ${payload.stats.matchesCount} matches and ${payload.stats.teamsCount} squads to Google Drive (${uploadedFile.name})!`,
      });
    } catch (err: any) {
      console.error('Google Drive backup error:', err);
      setFeedbackMessage({
        type: 'error',
        text: `Google Drive Backup failed: ${err.message || err}`,
      });
    } finally {
      setIsDriveBackingUp(false);
    }
  }

  // ── Google Drive Open Restore Modal Handler ──
  async function handleOpenDriveRestoreModal() {
    if (!isOnline) {
      setFeedbackMessage({
        type: 'error',
        text: 'Cannot connect to Google Drive while offline.',
      });
      return;
    }

    setIsFetchingDriveBackups(true);
    setFeedbackMessage(null);
    setModalFeedbackMessage(null);
    try {
      const token = await GoogleDriveService.requestAccessToken();
      const files = await GoogleDriveService.listBackups(token);
      setDriveBackupsList(files);
      setShowDriveRestoreModal(true);
    } catch (err: any) {
      console.error('Google Drive list backups error:', err);
      setFeedbackMessage({
        type: 'error',
        text: `Failed to fetch backups from Google Drive: ${err.message || err}`,
      });
    } finally {
      setIsFetchingDriveBackups(false);
    }
  }

  // ── Google Drive Restore File Execution ──
  async function handleExecuteDriveRestore(fileId: string) {
    if (!confirm('This will restore all matches, events, squads, and tournaments from this backup into your local IndexedDB. Continue?')) {
      return;
    }

    setRestoringFileId(fileId);
    setIsDriveRestoring(true);
    setModalFeedbackMessage(null);
    try {
      const token = await GoogleDriveService.requestAccessToken();
      const data = await GoogleDriveService.downloadBackup(token, fileId);
      const summary = await GoogleDriveService.restoreToIndexedDb(data, {
        mode: 'merge',
        expectedUserUid: user?.uid,
      });

      await loadLocalStats();
      setShowDriveRestoreModal(false);
      setFeedbackMessage({
        type: 'success',
        text: `Successfully restored ${summary.matchesCount} matches, ${summary.teamsCount} squads, and ${summary.tournamentsCount} tournaments!`,
      });
    } catch (err: any) {
      console.error('Drive restore error:', err);
      const errMsg = `Restore failed: ${err.message || err}`;
      setModalFeedbackMessage({
        type: 'error',
        text: errMsg,
      });
      setFeedbackMessage({
        type: 'error',
        text: errMsg,
      });
    } finally {
      setIsDriveRestoring(false);
      setRestoringFileId(null);
    }
  }

  // ── Google Drive Delete Handlers ──
  function handlePromptDeleteBackup(file: DriveBackupFile) {
    setFileToDelete(file);
    setShowDeleteConfirmModal(true);
    setModalFeedbackMessage(null);
  }

  function handleCancelDelete() {
    setShowDeleteConfirmModal(false);
    setFileToDelete(null);
  }

  async function handleExecuteDriveDelete(fileId: string) {
    if (!isOnline) {
      setModalFeedbackMessage({
        type: 'error',
        text: 'Cannot delete cloud backups while offline.',
      });
      return;
    }

    setIsDeletingDriveBackup(true);
    setDeletingFileId(fileId);
    setModalFeedbackMessage(null);
    try {
      const token = await GoogleDriveService.requestAccessToken();
      await GoogleDriveService.deleteBackup(token, fileId);

      const deletedFileName = fileToDelete?.name || 'backup snapshot';
      setDriveBackupsList((prev) => prev.filter((f) => f.id !== fileId));
      setShowDeleteConfirmModal(false);
      setFileToDelete(null);

      const successMsg = `Cloud backup "${deletedFileName}" was deleted from Google Drive.`;
      setFeedbackMessage({
        type: 'success',
        text: successMsg,
      });
      setModalFeedbackMessage({
        type: 'success',
        text: successMsg,
      });
    } catch (err: any) {
      console.error('Drive delete error:', err);
      const errMsg = `Failed to delete backup from Google Drive: ${err.message || err}`;
      setModalFeedbackMessage({
        type: 'error',
        text: errMsg,
      });
      setFeedbackMessage({
        type: 'error',
        text: errMsg,
      });
    } finally {
      setIsDeletingDriveBackup(false);
      setDeletingFileId(null);
    }
  }

  async function handleTriggerSync() {
    if (!isOnline) {
      setSyncResultState('error');
      setFeedbackMessage({
        type: 'error',
        text: 'Cannot sync while offline. Check network connection.',
      });
      return;
    }
    setIsSyncing(true);
    setSyncResultState('syncing');
    setFeedbackMessage(null);
    try {
      await SyncEngine.syncNow();
      await loadLocalStats();

      const remainingPending = await db.sync_queue.where('status').equals('PENDING').count();
      const failedOps = await db.sync_queue.filter((op) => (op.retryCount || 0) > 0).count();

      if (failedOps > 0 && remainingPending > 0) {
        setSyncResultState('partial');
        setFeedbackMessage({
          type: 'info',
          text: `${remainingPending} item(s) pending sync (${failedOps} retrying).`,
        });
      } else if (remainingPending > 0) {
        setSyncResultState('partial');
        setFeedbackMessage({
          type: 'info',
          text: `${remainingPending} item(s) awaiting cloud synchronization.`,
        });
      } else {
        setSyncResultState('success');
        setFeedbackMessage({
          type: 'success',
          text: 'Cloud sync completed successfully.',
        });
        setTimeout(() => setSyncResultState('idle'), 4000);
      }
    } catch (err: any) {
      setSyncResultState('error');
      setFeedbackMessage({
        type: 'error',
        text: `Sync error: ${err.message || 'Unknown network error'}`,
      });
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleExportBackup() {
    try {
      const { jsonString, stats } = await StorageManagerService.exportDatabase();

      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cric-scorer-pro-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setFeedbackMessage({
        type: 'success',
        text: `Exported: ${stats.matches} matches, ${stats.teams} squads, ${stats.tournaments} tournaments.`,
      });
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: `Backup export failed: ${err.message}`,
      });
    }
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const result = await StorageManagerService.importDatabase(text);

        if (!result.success) {
          throw new Error(result.error || 'Failed to restore database from file.');
        }

        await loadLocalStats();
        setFeedbackMessage({
          type: 'success',
          text: `Restored ${result.restored.matches} matches, ${result.restored.teams} squads, ${result.restored.tournaments} tournaments.`,
        });
      } catch (err: any) {
        setFeedbackMessage({
          type: 'error',
          text: `Import error: ${err.message}`,
        });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
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
      setFeedbackMessage({
        type: 'success',
        text: 'Local database cleared successfully.',
      });
    } catch (err: any) {
      setFeedbackMessage({
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
        <div>
          <h1 className="font-extrabold tracking-tight text-h2 sm:text-h1 text-[var(--foreground)]">
            {t('account_profile', 'Account & Profile')}
          </h1>
          <p className="text-caption text-[var(--muted-foreground)] mt-0.5">
            {t('account_subtitle', 'Manage your profile, cloud sync, and data backups')}
          </p>
        </div>

        <span
          suppressHydrationWarning
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption font-semibold self-start sm:self-center shadow-xs transition-colors ${
            isOnline
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
              : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
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

      {/* ── Feedback Alert Toast ── */}
      <ToastNotification show={!!feedbackMessage}>
        {feedbackMessage && (
          <div
            className={`border flex items-start justify-between p-3.5 rounded-2xl text-caption gap-2.5 shadow-sm ${
              feedbackMessage.type === 'error'
                ? 'bg-red-500/10 border-red-500/30 text-red-500'
                : feedbackMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                : 'bg-blue-500/10 border-blue-500/30 text-blue-500'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="font-medium text-[var(--foreground)] break-words">{feedbackMessage.text}</span>
            </div>
            <button
              onClick={() => setFeedbackMessage(null)}
              className="hover:opacity-75 p-0.5 shrink-0"
              aria-label="Dismiss alert"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </ToastNotification>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* ── ENTERPRISE RESPONSIVE DASHBOARD LAYOUT ─────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
        {/* ── LEFT COLUMN: Profile Hero, Identity, Preferences (cols 12 -> 5) ── */}
        <div className="lg:col-span-5 space-y-4 sm:space-y-5">
          {/* 1. Main Profile Card */}
          <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-4 sm:p-5 shadow-xs space-y-4">
            {user ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {/* Circular Avatar with Camera Action */}
                    <div className="relative group shrink-0">
                      <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden border-2 border-emerald-500/40 shadow-xs">
                        {activePhoto ? (
                          <img
                            src={activePhoto}
                            alt={activeDisplayName}
                            className="object-cover w-full h-full"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <UserIcon className="w-8 h-8 text-slate-700 dark:text-slate-300 stroke-[1.75]" />
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowEditModal(true)}
                        className="absolute bottom-0 right-0 bg-emerald-600 hover:bg-emerald-500 text-white p-1.5 rounded-full shadow-md active:scale-90 transition-transform"
                        title={t('change_photo', 'Change Photo')}
                        aria-label="Change photo"
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
                              className="bg-[var(--card)] border border-[var(--border)] focus:border-emerald-500 px-2.5 py-1 rounded-lg text-body-small outline-hidden w-full text-[var(--foreground)]"
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
                                title="Pro Account"
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
                      className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors rounded-lg active:scale-95 shrink-0 self-start mt-0.5"
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
                  <div className="bg-[var(--muted)]/40 border border-[var(--border)] rounded-xl p-3 space-y-2 text-caption">
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
                    <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                      <UserIcon className="w-6 h-6 text-slate-600 dark:text-slate-400 stroke-[1.75]" />
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

                  <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 shrink-0">
                    Offline Active
                  </span>
                </div>

                <div className="pt-1">
                  <button
                    onClick={handleGoogleSignIn}
                    disabled={isAuthLoading || !isOnline}
                    className="w-full font-semibold bg-white hover:bg-slate-50 text-slate-900 border border-slate-300 dark:border-slate-700 py-2.5 px-3 rounded-xl text-body-small flex items-center justify-center gap-2 shadow-xs transition-transform active:scale-98"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    <span>Sign In with Google</span>
                  </button>
                </div>

                {/* Email/Password Toggle */}
                <details className="group pt-1">
                  <summary className="text-[12px] text-emerald-600 dark:text-emerald-400 cursor-pointer select-none font-medium hover:underline">
                    Or sign in with email &amp; password →
                  </summary>
                  <div className="pt-2 space-y-2.5">
                    <div className="flex bg-[var(--muted)] p-0.5 rounded-lg border border-[var(--border)]">
                      <button
                        type="button"
                        onClick={() => { setAuthMode('signin'); clearError(); }}
                        className={`flex-1 py-1 text-caption font-semibold rounded-md ${
                          authMode === 'signin' ? 'bg-emerald-600 text-white shadow-xs' : 'text-[var(--muted-foreground)]'
                        }`}
                      >
                        {t('sign_in', 'Sign In')}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAuthMode('signup'); clearError(); }}
                        className={`flex-1 py-1 text-caption font-semibold rounded-md ${
                          authMode === 'signup' ? 'bg-emerald-600 text-white shadow-xs' : 'text-[var(--muted-foreground)]'
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
                          placeholder="Display Name"
                          className="bg-[var(--card)] border border-[var(--border)] px-3 py-1.5 rounded-lg text-body-small w-full"
                        />
                      )}
                      <input
                        type="email"
                        required
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="Email address"
                        className="bg-[var(--card)] border border-[var(--border)] px-3 py-1.5 rounded-lg text-body-small w-full"
                      />
                      <input
                        type="password"
                        required
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        placeholder="Password"
                        minLength={6}
                        className="bg-[var(--card)] border border-[var(--border)] px-3 py-1.5 rounded-lg text-body-small w-full"
                      />
                      <button
                        type="submit"
                        disabled={isSubmittingAuth || !isOnline}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-lg text-caption shadow-xs"
                      >
                        {isSubmittingAuth ? 'Processing...' : authMode === 'signin' ? t('sign_in', 'Sign In') : t('create_account', 'Create Account')}
                      </button>
                    </form>
                  </div>
                </details>
              </div>
            )}
          </div>

          {/* 2. Preferences & Display Card (Theme & Language) */}
          <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-4 sm:p-5 shadow-xs space-y-3.5">
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
                      ? 'bg-[var(--card)] text-[var(--foreground)] shadow-xs font-bold'
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
                      ? 'bg-[var(--card)] text-[var(--foreground)] shadow-xs font-bold'
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
                      ? 'bg-[var(--card)] text-amber-600 dark:text-amber-400 shadow-xs font-bold border border-amber-500/30'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                  title="High-contrast mode for outdoor sunlight"
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
                      ? 'bg-[var(--card)] text-emerald-600 dark:text-emerald-400 shadow-xs font-bold'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  <span>English</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage('bn')}
                  className={`py-1.5 px-3 rounded-lg text-caption font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    language === 'bn'
                      ? 'bg-[var(--card)] text-emerald-600 dark:text-emerald-400 shadow-xs font-bold'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  <span>বাংলা</span>
                </button>
              </div>
            </div>
          </div>

          {/* 3. System & Developer Diagnostics (Collapsible Disclosure) */}
          <details className="group text-caption text-[var(--muted-foreground)] bg-[var(--card)] rounded-2xl border border-[var(--border)] overflow-hidden shadow-xs transition-colors">
            <summary className="flex items-center justify-between p-4 cursor-pointer select-none hover:bg-[var(--muted)]/50 transition-colors">
              <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                <Terminal className="w-4 h-4 shrink-0 text-emerald-500" />
                <span className="font-bold text-[12px] uppercase tracking-wider text-[var(--foreground)]">
                  {t('dev_diagnostics', 'System & Developer Diagnostics')}
                </span>
              </div>
              <ChevronDown className="w-4 h-4 text-[var(--muted-foreground)] transition-transform duration-200 group-open:rotate-180" />
            </summary>

            <div className="p-4 pt-1 space-y-3 text-[11px] border-t border-[var(--border)] bg-[var(--muted)]/20">
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
          <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-[14px] uppercase tracking-wider text-[var(--muted-foreground)]">
                {t('quick_navigation', 'Account Overview & Quick Navigation')}
              </h3>
              <span className="text-[11px] text-[var(--muted-foreground)]">IndexedDB Local Cache</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 text-left">
              {/* Local Matches Card */}
              <button
                type="button"
                onClick={() => router.push('/matches/history')}
                className="bg-[var(--muted)]/50 hover:bg-[var(--muted)] border border-[var(--border)] hover:border-emerald-500/50 p-3 rounded-xl transition-all text-left group active:scale-98 cursor-pointer"
                title="View Match History"
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
                className="bg-[var(--muted)]/50 hover:bg-[var(--muted)] border border-[var(--border)] hover:border-blue-500/50 p-3 rounded-xl transition-all text-left group active:scale-98 cursor-pointer"
                title="Manage Squads & Teams"
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
                className="bg-[var(--muted)]/50 hover:bg-[var(--muted)] border border-[var(--border)] hover:border-amber-500/50 p-3 rounded-xl transition-all text-left group active:scale-98 cursor-pointer"
                title="View Tournaments"
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

              {/* Pending Sync Card */}
              <button
                type="button"
                onClick={handleTriggerSync}
                disabled={isSyncing || !isOnline}
                className="bg-[var(--muted)]/50 hover:bg-[var(--muted)] border border-[var(--border)] hover:border-emerald-500/50 p-3 rounded-xl transition-all text-left group active:scale-98 cursor-pointer disabled:opacity-60"
                title="Trigger Outbox Synchronization"
              >
                <div className="flex items-center justify-between text-[var(--muted-foreground)] mb-1">
                  <RefreshCw className={`w-4 h-4 text-emerald-500 ${isSyncing ? 'animate-spin' : ''}`} />
                  <ChevronRight className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-xl sm:text-2xl font-bold text-[var(--foreground)] num-font" suppressHydrationWarning>
                  {stats.pendingSyncCount}
                </p>
                <p className="text-[11px] sm:text-[12px] text-[var(--muted-foreground)] font-medium truncate mt-0.5">
                  {t('pending_sync', 'Pending Sync')}
                </p>
              </button>
            </div>
          </div>

          {/* 2. Google Drive Backup Card */}
          <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-4 sm:p-5 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0">
                  <Cloud className="w-5 h-5 text-blue-500 stroke-[1.75]" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-base text-[var(--foreground)] truncate">
                    {t('google_drive_backup', 'Google Drive Backup')}
                  </h3>
                  <p className="text-caption text-[var(--muted-foreground)] mt-0.5">
                    {t('last_cloud_backup', 'Last backup')}:{' '}
                    <span suppressHydrationWarning className="font-medium text-[var(--foreground)]">
                      {mounted && (profile?.lastDriveBackupAt || guestLastBackup)
                        ? new Date(profile?.lastDriveBackupAt || guestLastBackup!).toLocaleString()
                        : t('never_backed_up', 'Never backed up')}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleGoogleDriveBackup}
                disabled={isDriveBackingUp || !isOnline}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 px-3 rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 text-caption disabled:opacity-50 active:scale-98 min-h-[42px] cursor-pointer"
              >
                {isDriveBackingUp ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <CloudUpload className="w-4 h-4" />
                )}
                <span>{t('backup_to_drive', 'Backup to Google Drive')}</span>
              </button>

              <button
                type="button"
                onClick={handleOpenDriveRestoreModal}
                disabled={isFetchingDriveBackups || !isOnline}
                className="bg-[var(--muted)] hover:bg-[var(--border)] border border-[var(--border)] text-[var(--foreground)] font-semibold py-2.5 px-3 rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 text-caption disabled:opacity-50 active:scale-98 min-h-[42px] cursor-pointer"
              >
                {isFetchingDriveBackups ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                ) : (
                  <CloudDownload className="w-4 h-4 text-blue-500" />
                )}
                <span>{t('manage_backups', 'Manage Backups / Restore')}</span>
              </button>
            </div>
          </div>

          {/* 3. Cloud Synchronization Card */}
          <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-[var(--foreground)]">
                  {t('cloud_sync', 'Cloud Synchronization')}
                </h3>
                <p className="text-caption text-[var(--muted-foreground)] mt-0.5">
                  {t('cloud_sync_desc', 'Durable outbox queue with automatic cloud sync')}
                </p>
              </div>
              <span className="text-caption font-semibold px-2.5 py-0.5 rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]">
                {stats.pendingSyncCount === 0 ? 'Fully Synced' : `${stats.pendingSyncCount} Pending`}
              </span>
            </div>

            <button
              type="button"
              onClick={handleTriggerSync}
              disabled={isSyncing || !isOnline}
              className={`w-full py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.99] min-h-[46px] shadow-xs text-base cursor-pointer ${
                isSyncing
                  ? 'bg-[var(--muted)] text-[var(--muted-foreground)] cursor-not-allowed'
                  : syncResultState === 'success'
                  ? 'bg-emerald-600 text-white'
                  : syncResultState === 'partial'
                  ? 'bg-amber-600 text-white'
                  : syncResultState === 'error'
                  ? 'bg-red-600 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{t('syncing', 'Syncing...')}</span>
                </>
              ) : syncResultState === 'success' ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>{t('synced', 'Synced')}</span>
                </>
              ) : syncResultState === 'partial' ? (
                <>
                  <AlertCircle className="w-4 h-4" />
                  <span>{t('partial_sync', 'Partial Sync')} ({stats.pendingSyncCount})</span>
                </>
              ) : syncResultState === 'error' ? (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>{t('sync_failed', 'Retry Sync')}</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>{t('sync_now', 'Sync Now')}</span>
                </>
              )}
            </button>
          </div>

          {/* 4. Data Backup & Portability Card */}
          <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-4 sm:p-5 shadow-xs space-y-3.5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0">
                <Download className="w-5 h-5 text-slate-700 dark:text-slate-300 stroke-[1.75]" />
              </div>
              <div>
                <h3 className="font-bold text-base text-[var(--foreground)]">
                  {t('data_portability', 'Data Backup & Portability')}
                </h3>
                <p className="text-caption text-[var(--muted-foreground)] mt-0.5">
                  {t('export_restore_desc', 'Export or restore your data')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleExportBackup}
                className="bg-[var(--muted)] hover:bg-[var(--border)] border border-[var(--border)] transition-colors flex items-center justify-center gap-2 p-2.5 rounded-xl text-caption font-semibold min-h-[42px] active:scale-98 cursor-pointer"
              >
                <Download className="w-4 h-4 text-[var(--muted-foreground)]" />
                <span>{t('export_json', 'Export JSON Backup')}</span>
              </button>

              <button
                type="button"
                onClick={handleImportClick}
                className="bg-[var(--muted)] hover:bg-[var(--border)] border border-[var(--border)] transition-colors flex items-center justify-center gap-2 p-2.5 rounded-xl text-caption font-semibold min-h-[42px] active:scale-98 cursor-pointer"
              >
                <Upload className="w-4 h-4 text-[var(--muted-foreground)]" />
                <span>{t('import_json', 'Import JSON Backup')}</span>
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelected}
                accept=".json,.cric"
                className="hidden"
              />
            </div>
          </div>

          {/* 5. Danger Zone (Collapsible Disclosure) */}
          <details className="group border border-red-500/25 bg-red-500/5 dark:bg-red-950/20 rounded-2xl overflow-hidden transition-colors shadow-xs">
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
                <li>All locally recorded match scorecards &amp; ball-by-ball history</li>
                <li>Saved teams, squads, and custom player rosters</li>
                <li>Tournament brackets, standings, and net run rates</li>
                <li>Pending mutation queue awaiting cloud sync</li>
              </ul>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                ✓ Google Drive cloud backups and remote cloud records are not affected.
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

      {/* ── GOOGLE DRIVE BACKUPS MANAGEMENT MODAL ── */}
      {showDriveRestoreModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 !m-0 bg-black/60 backdrop-blur-xs z-50 overflow-y-auto overscroll-contain flex justify-center items-start sm:items-center p-2.5 sm:p-4 min-h-full animate-fadeIn"
        >
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl max-w-lg w-full max-h-[calc(100dvh-2rem)] sm:max-h-[85vh] flex flex-col p-4 sm:p-5 shadow-2xl space-y-3.5 my-auto overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2">
                <Cloud className="w-5 h-5 text-blue-500" />
                <h3 className="font-bold text-card-title text-[var(--foreground)]">
                  Google Drive Cloud Backups
                </h3>
              </div>
              <button
                onClick={() => setShowDriveRestoreModal(false)}
                className="p-1 hover:bg-[var(--muted)] rounded-lg text-[var(--muted-foreground)] cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-caption text-[var(--muted-foreground)]">
              Manage snapshots saved in your private Google Drive. You can restore data into local storage or safely delete cloud snapshots:
            </p>

            <ToastNotification show={!!modalFeedbackMessage}>
              {modalFeedbackMessage && (
                <div
                  className={`p-3 rounded-xl border text-caption flex items-center justify-between gap-2 ${
                    modalFeedbackMessage.type === 'error'
                      ? 'bg-red-500/10 border-red-500/30 text-red-500'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{modalFeedbackMessage.text}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalFeedbackMessage(null)}
                    className="hover:opacity-75 p-0.5 cursor-pointer"
                    aria-label="Dismiss message"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </ToastNotification>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-2 pr-1">
              {driveBackupsList.length === 0 ? (
                <div className="text-center py-8 text-[var(--muted-foreground)] space-y-2">
                  <Cloud className="w-10 h-10 mx-auto opacity-40 text-blue-500" />
                  <p className="text-body-small font-semibold">No Backups Found in Google Drive</p>
                  <p className="text-caption">
                    Click &ldquo;Backup to Google Drive&rdquo; first to create your initial cloud snapshot.
                  </p>
                </div>
              ) : (
                driveBackupsList.map((file) => (
                  <div
                    key={file.id}
                    className="p-3.5 border border-[var(--border)] hover:border-blue-500/50 bg-[var(--muted)]/30 rounded-xl flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-body-small truncate text-[var(--foreground)]" title={file.name}>
                        {file.name}
                      </p>
                      <div className="flex items-center gap-3 text-caption text-[var(--muted-foreground)] mt-0.5">
                        <span className="flex items-center gap-1" suppressHydrationWarning>
                          <Calendar className="w-3 h-3" />
                          {file.createdTime ? new Date(file.createdTime).toLocaleString() : 'Unknown date'}
                        </span>
                        {file.size && (
                          <span>{(Number(file.size) / 1024).toFixed(1)} KB</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleExecuteDriveRestore(file.id)}
                        disabled={(isDriveRestoring && restoringFileId === file.id) || isDeletingDriveBackup}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1.5 rounded-lg text-caption flex items-center gap-1.5 transition-transform active:scale-95 disabled:opacity-50 cursor-pointer"
                        title="Restore this backup into local IndexedDB"
                      >
                        {isDriveRestoring && restoringFileId === file.id ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Restoring...</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5" />
                            <span>Restore</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handlePromptDeleteBackup(file)}
                        disabled={isDriveRestoring || (isDeletingDriveBackup && deletingFileId === file.id)}
                        className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/30 px-2.5 py-1.5 rounded-lg text-caption font-bold flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                        title="Delete this cloud backup snapshot from Google Drive"
                      >
                        {isDeletingDriveBackup && deletingFileId === file.id ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span className="hidden sm:inline">Deleting...</span>
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Delete</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-[var(--border)] pt-3 flex justify-end">
              <button
                onClick={() => setShowDriveRestoreModal(false)}
                className="bg-[var(--muted)] hover:bg-[var(--border)] px-4 py-2 rounded-xl text-body-small font-semibold text-[var(--foreground)] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CLOUD BACKUP DELETE CONFIRMATION MODAL ── */}
      {showDeleteConfirmModal && fileToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 !m-0 bg-black/70 backdrop-blur-xs z-60 overflow-y-auto overscroll-contain flex justify-center items-start sm:items-center p-2.5 sm:p-4 min-h-full animate-fadeIn"
        >
          <div className="bg-[var(--card)] border border-red-500/30 rounded-2xl max-w-md w-full max-h-[calc(100dvh-2rem)] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-5 shadow-2xl space-y-4 my-auto animate-scale-in pb-safe">
            <div className="flex items-center gap-3 text-red-500">
              <div className="p-2.5 bg-red-500/10 rounded-xl border border-red-500/20">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-card-title text-[var(--foreground)]">
                  Delete Cloud Backup?
                </h3>
                <p className="text-caption text-red-500 font-semibold">
                  Permanent Google Drive Deletion
                </p>
              </div>
            </div>

            <p className="text-body-small text-[var(--foreground)]">
              Are you sure you want to delete this backup snapshot from your personal Google Drive?
            </p>

            <div className="bg-[var(--muted)]/50 border border-[var(--border)] rounded-xl p-3.5 space-y-2 text-caption">
              <div>
                <span className="text-[var(--muted-foreground)] block font-medium">File Name:</span>
                <span className="font-mono font-bold text-[var(--foreground)] break-all">
                  {fileToDelete.name}
                </span>
              </div>
              <div className="flex justify-between items-center text-[var(--muted-foreground)] pt-1.5 border-t border-[var(--border)]">
                <span>Created: {fileToDelete.createdTime ? new Date(fileToDelete.createdTime).toLocaleString() : 'N/A'}</span>
                <span>{fileToDelete.size ? `${(Number(fileToDelete.size) / 1024).toFixed(1)} KB` : ''}</span>
              </div>
            </div>

            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-caption text-emerald-600 dark:text-emerald-400 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Strict Isolation &amp; Safety Guarantees:</span>
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-caption opacity-90 pl-1">
                <li>Only this selected snapshot will be removed from Google Drive.</li>
                <li>Your local matches, squads, and scorecards in IndexedDB will <strong>NOT</strong> be affected.</li>
                <li>Other cloud backup snapshots will remain safe.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleCancelDelete}
                disabled={isDeletingDriveBackup}
                className="bg-[var(--muted)] hover:bg-[var(--border)] px-4 py-2 rounded-xl text-body-small font-semibold text-[var(--foreground)] transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleExecuteDriveDelete(fileToDelete.id)}
                disabled={isDeletingDriveBackup}
                className="bg-red-600 hover:bg-red-500 text-white font-bold px-4 py-2 rounded-xl text-body-small transition-transform active:scale-95 disabled:opacity-50 flex items-center gap-2 shadow-md cursor-pointer"
              >
                {isDeletingDriveBackup ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Deleting from Cloud...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Yes, Delete from Cloud</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

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
