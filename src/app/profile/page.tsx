'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { SyncEngine } from '@/infrastructure/sync/SyncEngine';
import { db } from '@/infrastructure/database/dexie-db';
import { UserProfileService } from '@/infrastructure/auth/UserProfileService';
import {
  GoogleDriveService,
  DriveBackupFile,
} from '@/infrastructure/storage/GoogleDriveService';
import { useRouter } from 'next/navigation';
import { GoogleConnectionStatusBadge } from '@/components/profile/GoogleConnectionStatusBadge';
import { DangerZoneClearButton } from '@/components/profile/DangerZoneClearButton';
import {
  ArrowLeft,
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
  User as UserIcon,
  Mail,
  Lock,
  CloudUpload,
  CloudDownload,
  HardDrive,
  Calendar,
  X,
} from 'lucide-react';

export default function ProfilePage() {
  const router = useRouter();
  const {
    user,
    profile,
    isLoading: isAuthLoading,
    error: authError,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    signOut,
    updateDisplayName,
    refreshProfile,
    clearError,
  } = useAuth();

  const [stats, setStats] = useState({
    matchesCount: 0,
    teamsCount: 0,
    tournamentsCount: 0,
    pendingSyncCount: 0,
  });

  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
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

  // Display name editing state
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [copiedUid, setCopiedUid] = useState(false);

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

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
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

  async function handleGoogleSignIn() {
    setFeedbackMessage(null);
    clearError();
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
    setFeedbackMessage(null);
    clearError();

    if (!emailInput || !emailInput.includes('@')) {
      setFeedbackMessage({ type: 'error', text: 'Please enter a valid email address.' });
      return;
    }
    if (!passwordInput || passwordInput.length < 6) {
      setFeedbackMessage({ type: 'error', text: 'Password must be at least 6 characters long.' });
      return;
    }

    setIsSubmittingAuth(true);
    try {
      if (authMode === 'signin') {
        const result = await signInWithEmail(emailInput, passwordInput);
        if (result.success) {
          setFeedbackMessage({ type: 'success', text: 'Successfully signed in!' });
          setEmailInput('');
          setPasswordInput('');
          loadLocalStats();
        } else if (result.error) {
          setFeedbackMessage({ type: 'error', text: result.error });
        }
      } else {
        const result = await signUpWithEmail(emailInput, passwordInput, signupNameInput);
        if (result.success) {
          setFeedbackMessage({ type: 'success', text: 'Account created and profile initialized in Firestore!' });
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
    if (!emailInput || !emailInput.includes('@')) {
      setFeedbackMessage({
        type: 'error',
        text: 'Enter your email address in the field above to receive a password reset link.',
      });
      return;
    }

    setIsResettingPassword(true);
    try {
      const res = await sendPasswordReset(emailInput);
      if (res.success) {
        setFeedbackMessage({
          type: 'success',
          text: `Password reset email sent to ${emailInput}. Check your inbox.`,
        });
      }
    } finally {
      setIsResettingPassword(false);
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
    setNameError(null);

    const trimmed = nameInput.trim();
    if (trimmed.length < 2) {
      setNameError('Name must be at least 2 characters long.');
      return;
    }
    if (trimmed.length > 50) {
      setNameError('Name cannot exceed 50 characters.');
      return;
    }

    setIsSavingName(true);
    try {
      await updateDisplayName(trimmed);
      setIsEditingName(false);
      setFeedbackMessage({
        type: 'success',
        text: 'Display name updated and synced to Firestore successfully.',
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

  function handleCopyUid() {
    if (!user?.uid) return;
    navigator.clipboard.writeText(user.uid);
    setCopiedUid(true);
    setTimeout(() => setCopiedUid(false), 2000);
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
      if (user?.uid) {
        await UserProfileService.recordDriveBackup(user.uid, timestamp);
        await refreshProfile();
      }

      setFeedbackMessage({
        type: 'success',
        text: `Successfully backed up ${payload.stats.matchesCount} matches and ${payload.stats.teamsCount} squads to Google Drive (${uploadedFile.name})!`,
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
      const summary = await GoogleDriveService.restoreToIndexedDb(data);

      await loadLocalStats();
      setShowDriveRestoreModal(false);
      setFeedbackMessage({
        type: 'success',
        text: `Successfully restored ${summary.matchesCount} matches, ${summary.teamsCount} squads, and ${summary.tournamentsCount} tournaments from Google Drive!`,
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

      const successMsg = `Cloud backup "${deletedFileName}" was successfully deleted from Google Drive.`;
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
      setFeedbackMessage({
        type: 'error',
        text: 'Cannot sync while offline. Check network connection.',
      });
      return;
    }
    setIsSyncing(true);
    setFeedbackMessage(null);
    try {
      await SyncEngine.syncNow();
      await loadLocalStats();
      setFeedbackMessage({
        type: 'success',
        text: 'Cloud sync check completed successfully.',
      });
    } catch (err: any) {
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
      const allMatches = await db.matches.toArray();
      const allEvents = await db.match_events.toArray();
      const allTeams = await db.teams.toArray();
      const allTournaments = await db.tournaments.toArray();

      const backupData = {
        app: 'Cric Scorer Pro',
        version: '2.5.0',
        exportedAt: new Date().toISOString(),
        matches: allMatches,
        matchEvents: allEvents,
        teams: allTeams,
        tournaments: allTournaments,
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
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
        text: 'Full JSON backup downloaded successfully.',
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
        const data = JSON.parse(text);

        if (!data.matches && !data.teams && !data.tournaments) {
          throw new Error('Invalid Cric Scorer Pro backup file format');
        }

        if (Array.isArray(data.matches)) {
          await db.matches.bulkPut(data.matches);
        }
        if (Array.isArray(data.matchEvents)) {
          await db.match_events.bulkPut(data.matchEvents);
        }
        if (Array.isArray(data.teams)) {
          await db.teams.bulkPut(data.teams);
        }
        if (Array.isArray(data.tournaments)) {
          await db.tournaments.bulkPut(data.tournaments);
        }

        await loadLocalStats();
        setFeedbackMessage({
          type: 'success',
          text: `Restored ${data.matches?.length || 0} matches and ${data.teams?.length || 0} squads.`,
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
    <div className="max-w-5xl xl:max-w-6xl mx-auto space-y-4 sm:space-y-5 w-full pb-10">
      {/* Header */}
      <div className="flex sm:items-center justify-between border-b border-[var(--border)] flex-wrap gap-4 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button
              type="button"
              onClick={() => router.back()}
              className="hover:text-emerald-500 flex items-center transition-colors -ml-1 active:scale-95 text-body-small gap-1.5 p-1"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
          </div>
          <h1 className="font-extrabold tracking-tight flex items-center text-h1 gap-3 flex-wrap">
            <span>Account &amp; User Profile</span>
            <GoogleConnectionStatusBadge user={user} isOnline={isOnline} />
          </h1>
          <p className="text-body-small mt-1 text-[var(--muted-foreground)]">
            Firebase Auth, Firestore Profile Sync &amp; Personal Google Drive Backups
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span
            suppressHydrationWarning
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold ${
              isOnline
                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                : 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            <span suppressHydrationWarning>{isOnline ? 'Network Online' : 'Offline Mode'}</span>
          </span>
        </div>
      </div>

      {/* Feedback Alert Toast */}
      {feedbackMessage && (
        <div
          className={`border flex items-start justify-between animate-fadeIn p-4 rounded-xl text-body-small gap-3 ${
            feedbackMessage.type === 'error'
              ? 'bg-red-500/10 border-red-500/30 text-red-500'
              : feedbackMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              : 'bg-blue-500/10 border-blue-500/30 text-blue-500'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="font-medium text-[var(--foreground)]">{feedbackMessage.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="hover:opacity-75 text-caption p-0.5"
            aria-label="Dismiss alert"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* User Profile Card (When Signed In) */}
      {user ? (
        <div className="floating-card p-4 sm:p-6 space-y-4">
          <div className="flex justify-between flex-wrap items-start sm:items-center gap-4">
            <div className="flex items-center min-w-0 gap-4">
              <div className="bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center font-bold shadow-lg overflow-hidden border-2 border-emerald-400/30 shrink-0 rounded-full text-h2 w-16 h-16">
                {activePhoto ? (
                  <img
                    src={activePhoto}
                    alt={activeDisplayName}
                    className="object-cover w-full h-full"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-white">
                    {(activeDisplayName?.[0] || 'U').toUpperCase()}
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                {isEditingName ? (
                  <form onSubmit={handleSaveDisplayName} className="space-y-2 max-w-sm">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={nameInput}
                        onChange={(e) => {
                          setNameInput(e.target.value);
                          if (nameError) setNameError(null);
                        }}
                        maxLength={50}
                        disabled={isSavingName}
                        placeholder="Enter display name"
                        className="bg-[var(--card)] border border-[var(--border)] focus:border-emerald-500 px-3 py-1.5 rounded-lg text-body-small outline-hidden w-full text-[var(--foreground)]"
                        autoFocus
                      />
                      <button
                        type="submit"
                        disabled={isSavingName}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold p-2 rounded-lg flex items-center justify-center text-caption disabled:opacity-50"
                        title="Save display name"
                      >
                        {isSavingName ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelEditName}
                        disabled={isSavingName}
                        className="bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--foreground)] p-2 rounded-lg flex items-center justify-center text-caption"
                        title="Cancel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex justify-between items-center text-caption">
                      <span className="text-red-500 font-medium">{nameError || ''}</span>
                      <span className="text-[var(--muted-foreground)]">{nameInput.length} / 50</span>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center flex-wrap gap-2">
                      <h2 className="font-bold truncate text-h3">{activeDisplayName}</h2>
                      <button
                        onClick={() => {
                          setNameInput(activeDisplayName);
                          setIsEditingName(true);
                        }}
                        className="p-1 hover:text-emerald-500 text-[var(--muted-foreground)] transition-colors rounded-md hover:bg-[var(--muted)]"
                        title="Edit display name"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {isGoogleUser ? (
                        <span className="rounded bg-emerald-500/20 font-semibold border border-emerald-500/30 shrink-0 text-emerald-600 dark:text-emerald-400 py-0.5 px-2 text-caption inline-flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Pro Mode Activated
                        </span>
                      ) : (
                        <span className="rounded bg-emerald-500/20 font-semibold border border-emerald-500/30 shrink-0 text-emerald-600 dark:text-emerald-400 py-0.5 px-2 text-caption">
                          Email Account
                        </span>
                      )}
                    </div>
                    <p className="truncate text-body-small text-[var(--muted-foreground)]">
                      {activeEmail}
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-caption font-mono text-[var(--muted-foreground)] bg-[var(--muted)]/60 px-2 py-0.5 rounded-md border border-[var(--border)]">
                    UID: {user.uid.slice(0, 8)}...{user.uid.slice(-4)}
                  </span>
                  <button
                    onClick={handleCopyUid}
                    className="text-caption text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    {copiedUid ? (
                      <>
                        <Check className="w-3 h-3" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy UID</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSignOut}
                disabled={isAuthLoading}
                className="bg-slate-800 hover:bg-slate-700 text-white font-semibold border border-slate-700 transition-colors py-2.5 rounded-xl text-body-small min-h-[42px] px-4 flex items-center gap-2 active:scale-95"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>

          <div className="bg-[var(--muted)]/40 border border-[var(--border)] rounded-xl p-3 text-caption flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span className="text-[var(--foreground)] font-medium">Firestore Profile Sync:</span>
              <span className="text-[var(--muted-foreground)]">
                Document `users/{user.uid}` is synchronized and protected by Firestore Security Rules.
              </span>
            </div>
            {mounted && profile?.lastDriveBackupAt && (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium" suppressHydrationWarning>
                Last Drive backup: {new Date(profile.lastDriveBackupAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      ) : (
        /* Sign-In & Registration Hub (When Logged Out) */
        <div className="floating-card p-4 sm:p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-bold text-h3">Connect to Cricket Scorer Pro</h2>
              <p className="text-body-small text-[var(--muted-foreground)] mt-0.5">
                Sign in with Google or use your email and password to sync your profile
              </p>
            </div>
            {/* Quick Google Sign In Button */}
            <button
              onClick={handleGoogleSignIn}
              disabled={isAuthLoading || !isOnline}
              className={`font-bold flex items-center justify-center shadow-md transition-transform active:scale-95 py-2.5 rounded-xl text-body-small min-h-[44px] px-5 gap-2.5 ${
                !isOnline
                  ? 'bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed'
                  : 'bg-white hover:bg-slate-100 text-slate-900 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {isAuthLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-700" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Sign In with Google</span>
                </>
              )}
            </button>
          </div>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-[var(--border)]" />
            </div>
            <div className="relative flex justify-center text-caption uppercase">
              <span className="bg-[var(--card)] px-3 text-[var(--muted-foreground)] font-semibold">
                Or Continue With Email &amp; Password
              </span>
            </div>
          </div>

          {/* Email / Password Card */}
          <div className="max-w-md mx-auto space-y-4">
            <div className="flex bg-[var(--muted)]/60 p-1 rounded-xl border border-[var(--border)]">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signin');
                  clearError();
                }}
                className={`flex-1 py-1.5 text-body-small font-semibold rounded-lg transition-colors ${
                  authMode === 'signin'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signup');
                  clearError();
                }}
                className={`flex-1 py-1.5 text-body-small font-semibold rounded-lg transition-colors ${
                  authMode === 'signup'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                Create Account
              </button>
            </div>

            <form onSubmit={handleEmailAuthSubmit} className="space-y-3">
              {authMode === 'signup' && (
                <div>
                  <label className="block text-caption font-semibold mb-1 text-[var(--foreground)]">
                    Display Name (Optional)
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-[var(--muted-foreground)] absolute left-3 top-3" />
                    <input
                      type="text"
                      value={signupNameInput}
                      onChange={(e) => setSignupNameInput(e.target.value)}
                      placeholder="e.g. Scorer Pro"
                      maxLength={50}
                      className="bg-[var(--card)] border border-[var(--border)] focus:border-emerald-500 pl-9 pr-3 py-2 rounded-xl text-body-small outline-hidden w-full text-[var(--foreground)]"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-caption font-semibold mb-1 text-[var(--foreground)]">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[var(--muted-foreground)] absolute left-3 top-3" />
                  <input
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="name@example.com"
                    className="bg-[var(--card)] border border-[var(--border)] focus:border-emerald-500 pl-9 pr-3 py-2 rounded-xl text-body-small outline-hidden w-full text-[var(--foreground)]"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-caption font-semibold text-[var(--foreground)]">
                    Password
                  </label>
                  {authMode === 'signin' && (
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={isResettingPassword}
                      className="text-caption text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      {isResettingPassword ? 'Sending...' : 'Forgot password?'}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[var(--muted-foreground)] absolute left-3 top-3" />
                  <input
                    type="password"
                    required
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="••••••••"
                    minLength={6}
                    className="bg-[var(--card)] border border-[var(--border)] focus:border-emerald-500 pl-9 pr-3 py-2 rounded-xl text-body-small outline-hidden w-full text-[var(--foreground)]"
                  />
                </div>
                {authMode === 'signup' && (
                  <p className="text-caption text-[var(--muted-foreground)] mt-1">
                    Must be at least 6 characters.
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmittingAuth || !isOnline}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-body-small transition-all flex items-center justify-center gap-2 shadow-md active:scale-98 mt-2"
              >
                {isSubmittingAuth ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>{authMode === 'signin' ? 'Sign In' : 'Create Free Account'}</span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── GOOGLE DRIVE CLOUD BACKUP & RESTORE ── */}
      <div className="floating-card space-y-4 p-4 sm:p-6 border-2 border-blue-500/20 bg-gradient-to-b from-blue-500/5 to-transparent">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-card-title flex items-center gap-2 text-[var(--foreground)]">
                <HardDrive className="w-5 h-5 text-blue-500" />
                <span>Personal Google Drive Backup</span>
              </h3>
              <span className="font-semibold bg-blue-500/20 text-blue-500 dark:text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full text-caption">
                LEAST PRIVILEGE: drive.file
              </span>
            </div>
            <p className="text-caption text-[var(--muted-foreground)] mt-1">
              Backup your entire scoring history, squads, and tournaments directly into your private Google Drive.
              Only files created by Cric Scorer Pro can be accessed.
            </p>
          </div>

          <div className="text-caption text-right shrink-0">
            <span className="text-[var(--muted-foreground)]">Last Cloud Backup: </span>
            <span className="font-semibold text-[var(--foreground)]" suppressHydrationWarning>
              {mounted && profile?.lastDriveBackupAt
                ? new Date(profile.lastDriveBackupAt).toLocaleString()
                : 'Never backed up'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {/* Backup to Drive Button */}
          <button
            onClick={handleGoogleDriveBackup}
            disabled={isDriveBackingUp || !isOnline}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold p-4 rounded-xl transition-all shadow-md flex items-center justify-between group disabled:opacity-50 active:scale-98 min-h-[58px]"
          >
            <div className="flex items-center gap-3">
              <CloudUpload className="w-6 h-6 shrink-0" />
              <div className="text-left">
                <p className="font-bold text-body-small">Backup to Google Drive</p>
                <p className="text-blue-100 text-caption font-normal">
                  Upload current IndexedDB snapshot
                </p>
              </div>
            </div>
            {isDriveBackingUp ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <span className="text-h3 font-light">↑</span>
            )}
          </button>

          {/* Restore & Manage Drive Backups Button */}
          <button
            onClick={handleOpenDriveRestoreModal}
            disabled={isFetchingDriveBackups || !isOnline}
            className="bg-[var(--card)] hover:bg-[var(--muted)] border border-blue-500/30 text-[var(--foreground)] font-bold p-4 rounded-xl transition-all shadow-xs flex items-center justify-between group disabled:opacity-50 active:scale-98 min-h-[58px]"
          >
            <div className="flex items-center gap-3">
              <CloudDownload className="w-6 h-6 shrink-0 text-blue-500" />
              <div className="text-left">
                <p className="font-bold text-body-small group-hover:text-blue-500 transition-colors">
                  Manage Cloud Backups / Restore
                </p>
                <p className="text-[var(--muted-foreground)] text-caption font-normal">
                  View, restore, or delete cloud backups
                </p>
              </div>
            </div>
            {isFetchingDriveBackups ? (
              <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
            ) : (
              <span className="text-h3 font-light text-blue-500">↓</span>
            )}
          </button>
        </div>
      </div>

      {/* ── GOOGLE DRIVE BACKUPS MANAGEMENT MODAL ── */}
      {showDriveRestoreModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-blue-500" />
                <h3 className="font-bold text-card-title text-[var(--foreground)]">
                  Google Drive Cloud Backups
                </h3>
              </div>
              <button
                onClick={() => setShowDriveRestoreModal(false)}
                className="p-1 hover:bg-[var(--muted)] rounded-lg text-[var(--muted-foreground)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-caption text-[var(--muted-foreground)]">
              Manage snapshots saved in your private Google Drive. You can restore data into local storage or safely delete cloud snapshots:
            </p>

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
                  className="hover:opacity-75 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[45vh]">
              {driveBackupsList.length === 0 ? (
                <div className="text-center py-8 text-[var(--muted-foreground)] space-y-2">
                  <HardDrive className="w-10 h-10 mx-auto opacity-40" />
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
                      {/* Restore Button */}
                      <button
                        onClick={() => handleExecuteDriveRestore(file.id)}
                        disabled={(isDriveRestoring && restoringFileId === file.id) || isDeletingDriveBackup}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1.5 rounded-lg text-caption flex items-center gap-1.5 transition-transform active:scale-95 disabled:opacity-50"
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

                      {/* Delete Button */}
                      <button
                        onClick={() => handlePromptDeleteBackup(file)}
                        disabled={isDriveRestoring || (isDeletingDriveBackup && deletingFileId === file.id)}
                        className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/30 px-2.5 py-1.5 rounded-lg text-caption font-bold flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
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
                className="bg-[var(--muted)] hover:bg-[var(--border)] px-4 py-2 rounded-xl text-body-small font-semibold text-[var(--foreground)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CLOUD BACKUP DELETE CONFIRMATION MODAL ── */}
      {showDeleteConfirmModal && fileToDelete && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-60 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[var(--card)] border border-red-500/30 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
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
                className="bg-[var(--muted)] hover:bg-[var(--border)] px-4 py-2 rounded-xl text-body-small font-semibold text-[var(--foreground)] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleExecuteDriveDelete(fileToDelete.id)}
                disabled={isDeletingDriveBackup}
                className="bg-red-600 hover:bg-red-500 text-white font-bold px-4 py-2 rounded-xl text-body-small transition-transform active:scale-95 disabled:opacity-50 flex items-center gap-2 shadow-md"
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

      {/* Local Storage & Cricket Data Statistics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5">
        <div className="floating-card p-3.5 sm:p-4">
          <p className="uppercase font-semibold text-caption text-[var(--muted-foreground)]">
            Local Matches
          </p>
          <p className="font-black num-font text-h2 mt-1" suppressHydrationWarning>{stats.matchesCount}</p>
        </div>
        <div className="floating-card p-3.5 sm:p-4">
          <p className="uppercase font-semibold text-caption text-[var(--muted-foreground)]">
            Saved Squads
          </p>
          <p className="font-black num-font text-h2 mt-1" suppressHydrationWarning>{stats.teamsCount}</p>
        </div>
        <div className="floating-card p-3.5 sm:p-4">
          <p className="uppercase font-semibold text-caption text-[var(--muted-foreground)]">
            Tournaments
          </p>
          <p className="font-black num-font text-h2 mt-1" suppressHydrationWarning>{stats.tournamentsCount}</p>
        </div>
        <div className="floating-card p-3.5 sm:p-4">
          <p className="uppercase font-semibold text-caption text-[var(--muted-foreground)]">
            Pending Sync
          </p>
          <p className="font-black num-font text-h2 mt-1" suppressHydrationWarning>{stats.pendingSyncCount}</p>
        </div>
      </div>

      {/* Cloud Synchronization Safeguards */}
      <div className="floating-card space-y-3.5 p-4 sm:p-5">
        <div className="flex sm:items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-bold text-card-title">Cloud Synchronization &amp; Storage</h3>
            <p className="text-caption text-[var(--muted-foreground)]">
              Offline-first persistence via Dexie IndexedDB with durable mutation queue
            </p>
          </div>
          <button
            onClick={handleTriggerSync}
            disabled={isSyncing || !isOnline}
            className={`w-full sm:w-auto px-4 py-2.5 rounded-xl text-caption font-bold flex items-center justify-center gap-2 transition-all min-h-[42px] ${
              isSyncing
                ? 'bg-[var(--muted)] text-[var(--muted-foreground)] cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md active:scale-95'
            }`}
          >
            {isSyncing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Checking...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                <span>Sync Now</span>
              </>
            )}
          </button>
        </div>

        <div className="bg-[var(--muted)]/50 border border-[var(--border)] rounded-xl text-caption p-4 space-y-2">
          <div className="flex sm:justify-between sm:items-center flex-wrap gap-0.5">
            <span className="text-[var(--muted-foreground)]">Authentication Backend:</span>
            <span className="font-semibold text-emerald-500">Firebase Auth (Google &amp; Email/Password)</span>
          </div>
          <div className="flex sm:justify-between sm:items-center flex-wrap gap-0.5">
            <span className="text-[var(--muted-foreground)]">Firestore Database:</span>
            <span className="font-semibold text-[var(--foreground)]">cricket-proo (users/&#123;uid&#125;)</span>
          </div>
          <div className="flex sm:justify-between sm:items-center flex-wrap gap-0.5">
            <span className="text-[var(--muted-foreground)]">Personal Cloud Backup:</span>
            <span className="font-semibold text-blue-500">Google Drive API (drive.file scope)</span>
          </div>
          <div className="flex sm:justify-between sm:items-center flex-wrap gap-0.5">
            <span className="text-[var(--muted-foreground)]">Match Scoring Mode:</span>
            <span className="font-semibold text-[var(--foreground)]">
              Dexie.js IndexedDB (100% Uninterrupted Offline Scoring)
            </span>
          </div>
        </div>
      </div>

      {/* Data Backup & Portability */}
      <div className="floating-card space-y-3.5 p-4 sm:p-5">
        <div>
          <h3 className="font-bold text-card-title">Data Backup &amp; Portability</h3>
          <p className="text-caption text-[var(--muted-foreground)]">
            Export and import your entire scoring history, squads, and tournament brackets in JSON format
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <button
            onClick={handleExportBackup}
            className="bg-[var(--muted)] hover:bg-[var(--border)] border border-[var(--border)] transition-colors flex items-center justify-between group p-4 rounded-xl text-left min-h-[52px]"
          >
            <div>
              <p className="font-bold group-hover:text-emerald-500 transition-colors text-body-small">
                Export JSON Backup
              </p>
              <p className="text-[var(--muted-foreground)] text-caption mt-0.5">
                Download matches, squads &amp; tournaments to file
              </p>
            </div>
            <Download className="w-5 h-5 text-[var(--muted-foreground)] group-hover:text-emerald-500 transition-colors" />
          </button>

          <button
            onClick={handleImportClick}
            className="bg-[var(--muted)] hover:bg-[var(--border)] border border-[var(--border)] transition-colors flex items-center justify-between group p-4 rounded-xl text-left min-h-[52px]"
          >
            <div>
              <p className="font-bold group-hover:text-blue-500 transition-colors text-body-small">
                Import JSON Backup
              </p>
              <p className="text-[var(--muted-foreground)] text-caption mt-0.5">
                Restore data from an exported file
              </p>
            </div>
            <Upload className="w-5 h-5 text-[var(--muted-foreground)] group-hover:text-blue-500 transition-colors" />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelected}
            accept=".json"
            className="hidden"
          />
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-red-500/10 border border-red-500/30 rounded-2xl space-y-3 p-6">
        <h3 className="font-bold uppercase tracking-wider text-body-small text-red-500">
          Danger Zone
        </h3>
        <p className="text-caption text-[var(--muted-foreground)]">
          Permanently clear all locally saved matches, squads, and ball-by-ball events stored in IndexedDB. (Press and hold for 3 seconds to clear)
        </p>
        <DangerZoneClearButton
          onConfirm={handleClearDatabase}
          isClearing={isClearingDatabase}
        />
      </div>

      {/* System & Architecture Info */}
      <div className="bg-[var(--card)]/50 border border-[var(--border)] rounded-2xl text-caption space-y-2 p-6 text-[var(--muted-foreground)]">
        <p className="font-semibold text-[var(--foreground)]">Cric Scorer Pro • Version 2.5.0</p>
        <p>
          Official ICC Rules Engine • MCC Law 18.11 • Event-Sourced Architecture • Free Hit &amp; DLS Ready
        </p>
        <p>
          Backend: Firebase Authentication, Cloud Firestore (Project: cricket-proo) &amp; Google Drive Cloud Backup
        </p>
      </div>
    </div>
  );
}
