'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import {
  Users,
  PlusCircle,
  Edit2,
  Trash2,
  ChevronDown,
  X,
  Check,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { FeatureHubRepository } from '@/infrastructure/storage/FeatureHubRepository';
import { reconcileSlotPlayerIds } from '@/domain/teams/playerIdentity';
import { SavedTeam } from '@/infrastructure/database/dexie-db';
import { motion, AnimatePresence } from 'framer-motion';
import { TeamCardSkeleton } from '@/components/common/Skeleton';
import { showAppToast } from '@/components/common/AppToast';
import { CompactDropdown } from '@/components/common/CompactDropdown';
import { ConfirmationDialog } from '@/components/overlay/ConfirmationDialog';
import { useDismissGuard } from '@/hooks/useUnsavedChanges';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import {
  playerKeyForRecord,
  playerProfileHref,
} from '@/features/players/careerStats';

const PLAYER_SLOT_LABELS = [
  'Opener 1',
  'Opener 2',
  'One Down',
  'Two Down',
  'Middle Order 1',
  'Middle Order 2',
  'All-rounder',
  'Finisher',
  'Wicketkeeper',
  'Bowler 1',
  'Bowler 2',
  'Bowler 3',
  'Bowler 4',
  'Bowler 5',
  'Reserve',
];

// Matchday monogram: first letters of the first two words, or the
// first two letters of a single-word name (HUNGRY XI → HX,
// SULTANPUR → SU).
const teamInitials = (teamName: string): string => {
  const words = teamName.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
  return teamName.trim().slice(0, 2).toUpperCase();
};

const PLAYER_SLOT_LABEL_KEYS = [
  'teams_slot_opener_1',
  'teams_slot_opener_2',
  'teams_slot_one_down',
  'teams_slot_two_down',
  'teams_slot_middle_1',
  'teams_slot_middle_2',
  'teams_slot_allrounder',
  'teams_slot_finisher',
  'teams_slot_wicketkeeper',
  'teams_slot_bowler_1',
  'teams_slot_bowler_2',
  'teams_slot_bowler_3',
  'teams_slot_bowler_4',
  'teams_slot_bowler_5',
  'teams_slot_reserve',
];

export default function TeamsPage() {
  const { t } = useLanguage();
  const slotLabelText = (index: number) => t(PLAYER_SLOT_LABEL_KEYS[index], PLAYER_SLOT_LABELS[index]);
  const router = useRouter();
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [teams, setTeams] = useState<SavedTeam[]>([]);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTeam, setEditingTeam] = useState<SavedTeam | null>(null);
  const [teamToDelete, setTeamToDelete] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
 const savingRef = useRef(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Form
  const [name, setName] = useState('');
  const [captain, setCaptain] = useState('');
  const [manager, setManager] = useState('');
  const [playerSlots, setPlayerSlots] = useState<string[]>(Array(15).fill(''));

  const captainOptions = useMemo(() => {
    return playerSlots
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => ({
        value: p,
        label: p,
        badge: t('teams_squad_player', 'Squad Player'),
      }));
    // C5: `t` is a dependency — it changes identity with the
    // language, and the badge label must follow an EN<->BN switch.
  }, [playerSlots, t]);

  useEffect(() => {
    setMounted(true);
    loadTeams();
  }, []);

  // Auto-dismiss success feedback notification
  useEffect(() => {
    if (!successToast) return;
    const timer = setTimeout(() => {
      setSuccessToast(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [successToast]);

  // Lock body scroll while modal dialog is active to prevent scroll bleeding
  useEffect(() => {
    if (showEditor) {
      const original = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [showEditor]);

  async function loadTeams() {
    try {
      const list = await FeatureHubRepository.loadTeams();
      setTeams(list);
    } catch (err) {
      console.error('[TeamsPage] Failed to load teams:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleOpenEditor = (team?: SavedTeam) => {
    setFormError(null);
    if (team) {
      setEditingTeam(team);
      setName(team.name);
      setCaptain(team.captain || '');
      setManager(team.manager || '');
      const slots = Array(15).fill('');
      team.players.forEach((p, i) => {
        if (i < 15) slots[i] = p.name;
      });
      setPlayerSlots(slots);
      // F4-06: snapshot the opened form — the dismiss guard compares
      // against this to decide whether closing would lose input.
      initialFormRef.current = {
        name: team.name,
        captain: team.captain || '',
        manager: team.manager || '',
        slots: [...slots],
      };
    } else {
      setEditingTeam(null);
      setName('');
      setCaptain('');
      setManager('');
      setPlayerSlots(Array(15).fill(''));
      initialFormRef.current = { name: '', captain: '', manager: '', slots: Array(15).fill('') };
    }
    setShowEditor(true);
  };

  // ── F4-06: unsaved-changes protection for the editor ──
  const initialFormRef = useRef<{ name: string; captain: string; manager: string; slots: string[] } | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const isEditorDirty = (() => {
    const init = initialFormRef.current;
    if (!init || !showEditor) return false;
    return (
      name !== init.name ||
      captain !== init.captain ||
      manager !== init.manager ||
      playerSlots.some((slot, i) => slot !== init.slots[i])
    );
  })();

  const closeEditor = () => setShowEditor(false);
  const requestEditorDismiss = useDismissGuard(isEditorDirty && !isSaving, () =>
    setShowDiscardConfirm(true)
  );

  // F4-08: Escape closes the editor (through the dismiss guard when
  // dirty). While the discard confirmation is up, Escape belongs to
  // that dialog (it cancels back to the editor).
  useEffect(() => {
    if (!showEditor || showDiscardConfirm) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) requestEditorDismiss(closeEditor);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showEditor, showDiscardConfirm, isSaving, requestEditorDismiss]);

  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
 if (savingRef.current) return;
 savingRef.current = true;
    setFormError(null);

    // 1. Team Name Validation
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError(t('teams_err_name_required', 'Please enter a team name.'));
      savingRef.current = false;
      return;
    }
    if (trimmedName.length < 2) {
      setFormError(t('teams_err_name_short', 'Team name must be at least 2 characters.'));
      savingRef.current = false;
      return;
    }
    if (trimmedName.length > 100) {
      setFormError(t('teams_err_name_long', 'Team name cannot exceed 100 characters.'));
      savingRef.current = false;
      return;
    }

    // Check duplicate team name (case-insensitive) excluding current team when editing
    const duplicate = teams.some(
      (t) => t.name.toLowerCase() === trimmedName.toLowerCase() && t.id !== editingTeam?.id
    );
    if (duplicate) {
      setFormError(`${t('teams_err_duplicate_prefix', 'A team named')} "${trimmedName}" ${t('teams_err_duplicate_suffix', 'already exists. Please choose a unique name.')}`);
      savingRef.current = false;
      return;
    }

    // 2. Validate & Sanitize Player Squad
    const filteredPlayers = playerSlots.map((p) => p.trim()).filter(Boolean);
    for (const player of filteredPlayers) {
      if (player.length > 60) {
        setFormError(`${t('teams_err_player_prefix', 'Player name')} "${player.substring(0, 20)}..." ${t('teams_err_player_suffix', 'exceeds 60 characters.')}`);
        savingRef.current = false;
        return;
      }
    }

    // Check for duplicate player names in squad
    const lowerPlayers = filteredPlayers.map((p) => p.toLowerCase());
    const uniquePlayers = new Set(lowerPlayers);
    if (uniquePlayers.size !== lowerPlayers.length) {
      setFormError(t('teams_err_dup_players', 'Squad contains duplicate player names. Please ensure each player name is unique.'));
      savingRef.current = false;
      return;
    }

    // Captain and Manager validation
    const trimmedCaptain = captain.trim();
    if (trimmedCaptain.length > 60) {
      setFormError(t('teams_err_captain_long', 'Captain name cannot exceed 60 characters.'));
      savingRef.current = false;
      return;
    }
    const trimmedManager = manager.trim();
    if (trimmedManager.length > 60) {
      setFormError(t('teams_err_manager_long', 'Manager name cannot exceed 60 characters.'));
      savingRef.current = false;
      return;
    }

    setIsSaving(true);

    try {
      const now = new Date().toISOString();
      const teamRecord: SavedTeam = {
        id: editingTeam ? editingTeam.id : `team_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId: user?.uid,
        name: trimmedName,
        captain: trimmedCaptain,
        manager: trimmedManager,
        // F9-β2: persist stable identities — slot edits reconcile
        // against the previous squad (names keep ids, same-slot
        // renames keep ids, new players get fresh ids).
        players: reconcileSlotPlayerIds(editingTeam?.players, playerSlots),
        createdAt: editingTeam ? editingTeam.createdAt : now,
        updatedAt: now,
      };

      await FeatureHubRepository.saveTeam(teamRecord);
      await loadTeams();

      setSuccessToast(
        editingTeam
          ? `${t('teams_toast_updated_prefix', 'Team')} "${teamRecord.name}" ${t('teams_toast_updated_suffix', 'updated successfully.')}`
          : `${t('teams_toast_created_prefix', 'Team')} "${teamRecord.name}" ${t('teams_toast_created_suffix', 'created and saved successfully.')}`
      );
      setShowEditor(false);
      setEditingTeam(null);
    } catch (err: any) {
      console.error('[TeamsPage] Failed to save team:', err);
      // Actionable error message, preserve form data
      setFormError(err?.message || t('teams_err_save_failed', 'Failed to save team squad. Please check your storage or network and try again.'));
    } finally {
      setIsSaving(false);
      savingRef.current = false;
    }
  };

  const handleDeleteTeam = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTeamToDelete(id);
  };

  const executeDeleteTeam = async () => {
    if (!teamToDelete) return;
    try {
      await FeatureHubRepository.deleteTeam(teamToDelete);
      await loadTeams();
      setSuccessToast(t('teams_toast_deleted', 'Team deleted successfully.'));
    } catch (err: any) {
      console.error('[TeamsPage] Failed to delete team:', err);
      showAppToast(err?.message || t('teams_err_delete_failed', 'Failed to delete team.'));
    } finally {
      setTeamToDelete(null);
    }
  };

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="team-editor-title"
      className="fixed inset-0 !m-0 bg-black/60 backdrop-blur-xs z-[60] overflow-y-auto overscroll-contain flex justify-center items-start sm:items-center p-2.5 sm:p-4 md:p-6 pt-[max(1rem,calc(env(safe-area-inset-top,0px)+0.75rem))] pb-[max(5.5rem,calc(env(safe-area-inset-bottom,0px)+4.5rem))] sm:pb-6 min-h-full animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) requestEditorDismiss(closeEditor);
      }}
    >
      <div
        className="bg-[var(--card)] border border-[var(--border)] shadow-elev3 rounded-2xl flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[90vh] w-full max-w-2xl overflow-hidden my-auto animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 sm:px-6 py-3.5 sm:py-4 shrink-0 bg-[var(--card)]">
          <h2 id="team-editor-title" className="font-black text-card-title">
            {editingTeam ? t('teams_edit_profile', 'Edit Team Profile') : t('teams_new_profile', 'New Team Profile')}
          </h2>
          <button
            type="button"
            onClick={() => {
              if (!isSaving) requestEditorDismiss(closeEditor);
            }}
            disabled={isSaving}
            className="hover:bg-[var(--muted)] flex items-center justify-center p-1.5 rounded-lg min-h-[40px] min-w-[40px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
            aria-label={t('teams_close_dialog', 'Close dialog')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSaveTeam} className="flex flex-col flex-1 min-h-0 text-body-small">
          <div className="overflow-y-auto overscroll-contain flex-1 min-h-0 p-4 sm:p-6 space-y-4">
            {/* Form Actionable Error Banner */}
            {formError && (
              <div
                role="alert"
                className="p-3 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 rounded-xl text-caption flex items-center gap-2 animate-fade-in"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-caption">{t('teams_name_label', 'Team Name')} *</label>
                <input
                  type="text"
                  required
                  disabled={isSaving}
                  placeholder={t('teams_name_placeholder', 'e.g. Dhaka Gladiators')}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  className="bg-[var(--muted)] border border-[var(--border)] font-bold p-card rounded-xl min-h-[42px] w-full text-body-small focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500 disabled:opacity-60 shadow-inset focus:shadow-elev1"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-caption">{t('teams_captain', 'Captain')}</label>
                <CompactDropdown
                  value={captain}
                  options={captainOptions}
                  onChange={(val) => {
                    setCaptain(String(val));
                    if (formError) setFormError(null);
                  }}
                  allowCustomInput
                  placeholder={t('teams_captain_placeholder', 'Captain Name')}
                  inputPlaceholder={t('teams_captain_placeholder', 'Captain Name')}
                  size="sm"
                  emptyMessage={t('teams_captain_empty', 'Enter squad player names below, or type captain name.')}
                  testId="captain-dropdown"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-caption">{t('teams_manager', 'Manager')}</label>
                <input
                  type="text"
                  disabled={isSaving}
                  placeholder={t('teams_manager_placeholder', 'Manager Name')}
                  value={manager}
                  onChange={(e) => {
                    setManager(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  className="bg-[var(--muted)] border border-[var(--border)] p-card rounded-xl min-h-[42px] w-full text-body-small focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500 disabled:opacity-60 shadow-inset focus:shadow-elev1"
                />
              </div>
            </div>

            {/* 15 Squad Slots */}
            <div className="border-t border-[var(--border)] space-y-2 pt-3">
              <div className="flex items-center justify-between">
                <label className="font-bold uppercase tracking-wider text-caption">
                  {t('teams_squad_positions', '15 Squad Positions')}
                </label>
                <span className="text-[11px] text-[var(--muted-foreground)]">{t('teams_scroll_slots', 'Scroll down to view all slots')}</span>
              </div>

              <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 p-1 pb-4">
                {PLAYER_SLOT_LABELS.map((_slotLabel, index) => (
                  <div key={index} className="space-y-1">
                    <label className="font-semibold text-[var(--muted-foreground)] text-caption">
                      {slotLabelText(index)}
                    </label>
                    <input
                      type="text"
                      disabled={isSaving}
                      placeholder={`${t('teams_player_placeholder', 'Player')} ${index + 1}`}
                      value={playerSlots[index] || ''}
                      onChange={(e) => {
                        const next = [...playerSlots];
                        next[index] = e.target.value;
                        setPlayerSlots(next);
                        if (formError) setFormError(null);
                      }}
                      className="bg-[var(--muted)] border border-[var(--border)] font-medium rounded-lg min-h-[38px] w-full p-2 text-caption focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500 disabled:opacity-60 shadow-inset focus:shadow-elev1"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Dedicated Sticky Footer: Save button permanently visible and accessible */}
          <div className="border-t border-[var(--border)] bg-[var(--card)] px-4 sm:px-6 py-3.5 shrink-0 pb-safe">
            <button
              type="submit"
              disabled={isSaving}
              className={`bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-elev2 active:scale-[0.99] transition-all py-3 rounded-xl text-body-small min-h-btn w-full flex items-center justify-center gap-2 ${
                isSaving ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t('teams_saving', 'Saving Team Squad...')}</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{t('teams_save', 'Save Team Squad')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-safe pb-8">
      <ConfirmationDialog
        open={!!teamToDelete}
        destructive
        title={t('teams_delete_title', 'Delete this team?')}
        description={t('history_delete_desc', 'This cannot be undone.')}
        confirmLabel={t('history_delete', 'Delete')}
        onConfirm={executeDeleteTeam}
        onCancel={() => setTeamToDelete(null)}
      />
      {/* F4-06: discard confirmation for the editor's dismiss guard */}
      <ConfirmationDialog
        open={showDiscardConfirm}
        destructive
        title={t('teams_discard_title', 'Discard changes?')}
        description={t('teams_discard_desc', 'You have unsaved changes in this team. Discard them?')}
        confirmLabel={t('teams_discard', 'Discard')}
        cancelLabel={t('teams_keep_editing', 'Keep editing')}
        onConfirm={() => {
          setShowDiscardConfirm(false);
          setShowEditor(false);
        }}
        onCancel={() => setShowDiscardConfirm(false)}
      />
      {/* Header — Light Refined (TAIMUR pick, 2026-11-11), the
          same treatment as the Tournaments page header. */}
      <div className="pt-3 sm:pt-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-11 h-11 rounded-full bg-[#181868] shrink-0">
            <Users className="text-[#e8b850] w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h1 className="font-black tracking-tight text-h2 text-[#181868] dark:text-white">
              <span>{t('teams_title', 'Team Squad Management')}</span>
            </h1>
            <p className="text-caption">
              {t('teams_subtitle', 'Create club squads with captains, managers, and 15 structured squad positions')}
            </p>
          </div>
        </div>
        <div className="h-[3px] rounded-full bg-[#e8b850] mt-3" />
      </div>

      {/* Success Notification Banner */}
      {successToast && (
        <div
          role="status"
          className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 rounded-xl text-caption flex items-center justify-between gap-2 shadow-xs animate-fade-in"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Check className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="font-semibold truncate">{successToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessToast(null)}
            className="p-1 hover:bg-emerald-500/20 rounded-lg text-emerald-700 dark:text-emerald-400 transition-colors shrink-0"
            aria-label={t('teams_dismiss_message', 'Dismiss message')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Teams Grid */}
      {loading ? (
        <div className="space-y-3" data-testid="teams-skeleton-container">
          <TeamCardSkeleton />
          <TeamCardSkeleton />
          <TeamCardSkeleton />
        </div>
      ) : teams.length === 0 ? (
        <div className="bg-[var(--card)] border border-[var(--border)] border-dashed text-center rounded-2xl p-10 space-y-3 shadow-elev1">
          <Users className="opacity-50 text-[var(--muted-foreground)] mx-auto w-10 h-10" />
          <h2 className="font-bold text-body">{t('teams_empty_title', 'No Saved Teams')}</h2>
          <p className="text-caption max-w-sm mx-auto">
            {t('teams_empty_desc', 'Build your team roster so you can easily pick them during match and tournament setups.')}
          </p>
          <button
            type="button"
            onClick={() => handleOpenEditor()}
            className="bg-emerald-600 font-bold rounded-xl text-caption min-h-[38px] px-4 py-2 shadow-elev2"
          >
            {t('teams_create', 'Create Team')}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-3">
            {teams.map((team) => {
              const isExpanded = expandedTeamId === team.id;

              // F3/H-4: no per-card FadeInUp wrapper — cards mount
              // mid-slide when the Dexie load resolves; a nested
              // 250ms transform+opacity animation inside the sliding
              // page reads as a second, unsynchronised settle.
              return (
                  <div key={team.id} className="floating-card shadow-elev1 overflow-hidden transition-all">
                    <div
                      onClick={() => setExpandedTeamId(isExpanded ? null : team.id)}
                      className="cursor-pointer"
                    >
                      {/* Matchday band (TAIMUR pick, 2026-11-10): deep-navy
                          header with a monogram crest, the team name in
                          white, and the edit/delete actions. */}
                      <div className="bg-[#181868] flex items-center gap-2 px-3 py-2.5">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-white/40 font-black text-white shrink-0 text-body-small">
                          {teamInitials(team.name)}
                        </div>
                        <h2 className="font-black tracking-tight truncate text-[20px] leading-tight text-white flex-1 min-w-0">{team.name}</h2>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditor(team);
                          }}
                          className="flex items-center justify-center rounded-full bg-white hover:bg-slate-100 text-[#181868] min-h-[36px] min-w-[36px] p-1.5 shrink-0 transition-colors"
                          title={t('teams_edit', 'Edit Team')}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={(e) => handleDeleteTeam(team.id, e)}
                          className="flex items-center justify-center rounded-full bg-white hover:bg-red-100 text-[#181868] hover:text-red-600 min-h-[36px] min-w-[36px] p-1.5 shrink-0 transition-colors"
                          title={t('teams_delete', 'Delete Team')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Stat strip: Captain / Manager / Squad n/15 */}
                      <div className="grid grid-cols-3 divide-x divide-[var(--border)]">
                        <div className="py-2 px-2 text-center min-w-0">
                          <div className="text-[11px] font-bold uppercase tracking-wider leading-none text-[var(--muted-foreground)]">
                            {t('teams_captain', 'Captain')}
                          </div>
                          <div className="font-extrabold truncate text-2xl leading-none mt-1">
                            {team.captain || t('teams_not_assigned', 'Not assigned')}
                          </div>
                        </div>
                        <div className="py-2 px-2 text-center min-w-0">
                          <div className="text-[11px] font-bold uppercase tracking-wider leading-none text-[var(--muted-foreground)]">
                            {t('teams_manager', 'Manager')}
                          </div>
                          <div className="font-extrabold truncate text-2xl leading-none mt-1">
                            {team.manager || t('teams_not_assigned', 'Not assigned')}
                          </div>
                        </div>
                        <div className="py-2 px-2 text-center min-w-0">
                          <div className="text-[11px] font-bold uppercase tracking-wider leading-none text-[var(--muted-foreground)]">
                            {t('teams_squad_label', 'Squad')}
                          </div>
                          <div className="font-extrabold truncate text-2xl leading-none mt-1 leading-none mt-1 num-font">
                            {team.players.length}/{PLAYER_SLOT_LABELS.length}
                          </div>
                        </div>
                      </div>

                      {/* Squad strength: one segment per slot — amber while
                          the squad is incomplete, emerald when full. */}
                      <div className="flex items-center gap-2 px-4 pb-2.5">
                        <div className="flex flex-1 gap-[3px]">
                          {PLAYER_SLOT_LABELS.map((_, i) => (
                            <span
                              key={i}
                              className={`h-1.5 flex-1 rounded-full ${
                                i < team.players.length
                                  ? team.players.length >= PLAYER_SLOT_LABELS.length
                                    ? 'bg-emerald-500'
                                    : 'bg-amber-500'
                                  : 'bg-[var(--muted)]'
                              }`}
                            />
                          ))}
                        </div>
                        <ChevronDown
                          className={`text-[var(--muted-foreground)] w-5 h-5 shrink-0 transition-transform duration-200 ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                    </div>

                    {/* Expanded Squad Members List */}
                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          key="squad-roster"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="border-t border-[var(--border)] bg-muted/20 p-5 space-y-3">
                            <span className="font-bold uppercase tracking-wider text-caption">
                              {t('teams_roster_positions', 'Roster & Positions')}
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5">
                              {PLAYER_SLOT_LABELS.map((label, idx) => {
                                const playerName = team.players[idx]?.name;
                                return (
                                  <div
                                    key={idx}
                                    className="flex items-center gap-2 border-b border-[var(--border)] py-2 text-caption"
                                  >
                                    <span className="num-font font-bold text-[var(--muted-foreground)] w-5 shrink-0">{idx + 1}</span>
                                    <span className="shrink-0 rounded bg-[var(--muted)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--muted-foreground)]">
                                      {slotLabelText(idx)}
                                    </span>
                                    {playerName ? (
                                      <Link
                                        href={playerProfileHref(playerKeyForRecord(team.players[idx]))}
                                        onClick={(e) => e.stopPropagation()}
                                        className="font-bold truncate text-[var(--foreground)] ml-auto hover:text-emerald-600 hover:underline"
                                        title={t('players_view_profile', 'View career profile')}
                                      >
                                        {playerName}
                                      </Link>
                                    ) : (
                                      <span className="font-bold truncate text-[var(--muted-foreground)] ml-auto">—</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
              );
            })}
          </div>

          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={() => handleOpenEditor()}
              className="bg-emerald-600 hover:bg-emerald-500 font-bold rounded-xl text-caption min-h-[38px] px-4 py-2 flex items-center gap-1.5 transition-colors shadow-elev2"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{t('teams_create', 'Create Team')}</span>
            </button>
          </div>
        </div>
      )}

      {/* ── CREATE / EDIT TEAM MODAL ── */}
      {showEditor && mounted && typeof document !== 'undefined'
        ? createPortal(modalContent, document.body)
        : null}
    </div>
  );
}
