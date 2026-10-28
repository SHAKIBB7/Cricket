'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import {
  Users,
  PlusCircle,
  Edit2,
  Trash2,
  ChevronDown,
  Shield,
  X,
  Check,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { FeatureHubRepository } from '@/infrastructure/storage/FeatureHubRepository';
import { SavedTeam } from '@/infrastructure/database/dexie-db';
import { motion, AnimatePresence } from 'framer-motion';
import { TeamCardSkeleton } from '@/components/common/Skeleton';
import { FadeInUp } from '@/components/common/FadeInUp';
import { CompactDropdown } from '@/components/common/CompactDropdown';
import { useAuth } from '@/context/AuthContext';

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

export default function TeamsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [teams, setTeams] = useState<SavedTeam[]>([]);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTeam, setEditingTeam] = useState<SavedTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
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
        badge: 'Squad Player',
      }));
  }, [playerSlots]);

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
        if (i < 15) slots[i] = p;
      });
      setPlayerSlots(slots);
    } else {
      setEditingTeam(null);
      setName('');
      setCaptain('');
      setManager('');
      setPlayerSlots(Array(15).fill(''));
    }
    setShowEditor(true);
  };

  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setFormError(null);

    // 1. Team Name Validation
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('Please enter a team name.');
      return;
    }
    if (trimmedName.length < 2) {
      setFormError('Team name must be at least 2 characters.');
      return;
    }
    if (trimmedName.length > 100) {
      setFormError('Team name cannot exceed 100 characters.');
      return;
    }

    // Check duplicate team name (case-insensitive) excluding current team when editing
    const duplicate = teams.some(
      (t) => t.name.toLowerCase() === trimmedName.toLowerCase() && t.id !== editingTeam?.id
    );
    if (duplicate) {
      setFormError(`A team named "${trimmedName}" already exists. Please choose a unique name.`);
      return;
    }

    // 2. Validate & Sanitize Player Squad
    const filteredPlayers = playerSlots.map((p) => p.trim()).filter(Boolean);
    for (const player of filteredPlayers) {
      if (player.length > 60) {
        setFormError(`Player name "${player.substring(0, 20)}..." exceeds 60 characters.`);
        return;
      }
    }

    // Check for duplicate player names in squad
    const lowerPlayers = filteredPlayers.map((p) => p.toLowerCase());
    const uniquePlayers = new Set(lowerPlayers);
    if (uniquePlayers.size !== lowerPlayers.length) {
      setFormError('Squad contains duplicate player names. Please ensure each player name is unique.');
      return;
    }

    // Captain and Manager validation
    const trimmedCaptain = captain.trim();
    if (trimmedCaptain.length > 60) {
      setFormError('Captain name cannot exceed 60 characters.');
      return;
    }
    const trimmedManager = manager.trim();
    if (trimmedManager.length > 60) {
      setFormError('Manager name cannot exceed 60 characters.');
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
        players: filteredPlayers,
        createdAt: editingTeam ? editingTeam.createdAt : now,
        updatedAt: now,
      };

      await FeatureHubRepository.saveTeam(teamRecord);
      await loadTeams();

      setSuccessToast(
        editingTeam
          ? `Team "${teamRecord.name}" updated successfully.`
          : `Team "${teamRecord.name}" created and saved successfully.`
      );
      setShowEditor(false);
      setEditingTeam(null);
    } catch (err: any) {
      console.error('[TeamsPage] Failed to save team:', err);
      // Actionable error message, preserve form data
      setFormError(err?.message || 'Failed to save team squad. Please check your storage or network and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTeam = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this team?')) return;
    try {
      await FeatureHubRepository.deleteTeam(id);
      await loadTeams();
      setSuccessToast('Team deleted successfully.');
    } catch (err: any) {
      console.error('[TeamsPage] Failed to delete team:', err);
      alert(err?.message || 'Failed to delete team.');
    }
  };

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="team-editor-title"
      className="fixed inset-0 !m-0 bg-black/60 backdrop-blur-xs z-[60] overflow-y-auto overscroll-contain flex justify-center items-start sm:items-center p-2.5 sm:p-4 md:p-6 pt-[max(1rem,calc(env(safe-area-inset-top,0px)+0.75rem))] pb-[max(5.5rem,calc(env(safe-area-inset-bottom,0px)+4.5rem))] sm:pb-6 min-h-full animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) setShowEditor(false);
      }}
    >
      <div
        className="bg-[var(--card)] border border-[var(--border)] shadow-2xl rounded-2xl flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[90vh] w-full max-w-2xl overflow-hidden my-auto animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 sm:px-6 py-3.5 sm:py-4 shrink-0 bg-[var(--card)]">
          <h2 id="team-editor-title" className="font-black text-card-title">
            {editingTeam ? 'Edit Team Profile' : 'New Team Profile'}
          </h2>
          <button
            type="button"
            onClick={() => {
              if (!isSaving) setShowEditor(false);
            }}
            disabled={isSaving}
            className="hover:bg-[var(--muted)] flex items-center justify-center p-1.5 rounded-lg min-h-[40px] min-w-[40px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
            aria-label="Close dialog"
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
                <label className="font-semibold text-caption">Team Name *</label>
                <input
                  type="text"
                  required
                  disabled={isSaving}
                  placeholder="e.g. Dhaka Gladiators"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  className="bg-[var(--muted)] border border-[var(--border)] font-bold p-card rounded-xl min-h-[42px] w-full text-body-small focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500 disabled:opacity-60"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-caption">Captain</label>
                <CompactDropdown
                  value={captain}
                  options={captainOptions}
                  onChange={(val) => {
                    setCaptain(String(val));
                    if (formError) setFormError(null);
                  }}
                  allowCustomInput
                  placeholder="Captain Name"
                  inputPlaceholder="Captain Name"
                  size="sm"
                  emptyMessage="Enter squad player names below, or type captain name."
                  testId="captain-dropdown"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-caption">Manager</label>
                <input
                  type="text"
                  disabled={isSaving}
                  placeholder="Manager Name"
                  value={manager}
                  onChange={(e) => {
                    setManager(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  className="bg-[var(--muted)] border border-[var(--border)] p-card rounded-xl min-h-[42px] w-full text-body-small focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500 disabled:opacity-60"
                />
              </div>
            </div>

            {/* 15 Squad Slots */}
            <div className="border-t border-[var(--border)] space-y-2 pt-3">
              <div className="flex items-center justify-between">
                <label className="font-bold uppercase tracking-wider text-caption">
                  15 Squad Positions
                </label>
                <span className="text-[11px] text-[var(--muted-foreground)]">Scroll down to view all slots</span>
              </div>

              <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 p-1 pb-4">
                {PLAYER_SLOT_LABELS.map((slotLabel, index) => (
                  <div key={index} className="space-y-1">
                    <label className="font-semibold text-[var(--muted-foreground)] text-caption">
                      {slotLabel}
                    </label>
                    <input
                      type="text"
                      disabled={isSaving}
                      placeholder={`Player ${index + 1}`}
                      value={playerSlots[index] || ''}
                      onChange={(e) => {
                        const next = [...playerSlots];
                        next[index] = e.target.value;
                        setPlayerSlots(next);
                        if (formError) setFormError(null);
                      }}
                      className="bg-[var(--muted)] border border-[var(--border)] font-medium rounded-lg min-h-[38px] w-full p-2 text-caption focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500 disabled:opacity-60"
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
              className={`bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-600/30 active:scale-[0.99] transition-all py-3 rounded-xl text-body-small min-h-btn w-full flex items-center justify-center gap-2 ${
                isSaving ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving Team Squad...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Save Team Squad</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-safe pb-8">
      {/* Header */}
      <div className="pt-3 sm:pt-4">
        <h1 className="font-black tracking-tight flex items-center text-h2 gap-2">
          <Users className="text-blue-600 w-6 h-6" />
          <span>Team Squad Management</span>
        </h1>
        <p className="text-caption">
          Create club squads with captains, managers, and 15 structured squad positions
        </p>
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
            aria-label="Dismiss message"
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
        <div className="bg-[var(--card)] border border-[var(--border)] border-dashed text-center rounded-2xl p-10 space-y-3">
          <Users className="opacity-50 text-[var(--muted-foreground)] mx-auto w-10 h-10" />
          <h2 className="font-bold text-body">No Saved Teams</h2>
          <p className="text-caption max-w-sm mx-auto">
            Build your team roster so you can easily pick them during match and tournament setups.
          </p>
          <button
            type="button"
            onClick={() => handleOpenEditor()}
            className="bg-emerald-600 font-bold rounded-xl text-caption min-h-[38px] px-4 py-2"
          >
            Create Team
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-3">
            {teams.map((team) => {
              const isExpanded = expandedTeamId === team.id;

              return (
                <FadeInUp key={team.id}>
                  <div className="floating-card overflow-hidden transition-all">
                    <div
                      onClick={() => setExpandedTeamId(isExpanded ? null : team.id)}
                      className="flex items-center justify-between cursor-pointer hover:bg-[var(--muted)]/40 transition-colors p-5 gap-2"
                    >
                      <div className="flex items-center flex-1 gap-3 min-w-0">
                        <div className="bg-blue-500/10 dark:text-blue-400 flex items-center justify-center font-bold shrink-0 rounded-xl text-blue-600 w-10 h-10">
                          <Shield className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <h2 className="font-black tracking-tight truncate text-card-title">{team.name}</h2>
                          <div className="flex items-center font-medium flex-wrap text-caption gap-3">
                            <span>
                              Captain: <b>{team.captain || 'Not assigned'}</b>
                            </span>
                            <span>•</span>
                            <span>
                              Manager: <b>{team.manager || 'Not assigned'}</b>
                            </span>
                            <span>•</span>
                            <span>{team.players.length} Squad Members</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center shrink-0 gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditor(team);
                          }}
                          className="hover:bg-[var(--muted)] flex items-center justify-center rounded-xl text-[var(--muted-foreground)] min-h-[36px] min-w-[36px] p-2"
                          title="Edit Team"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={(e) => handleDeleteTeam(team.id, e)}
                          className="hover:bg-red-500/10 flex items-center justify-center rounded-xl text-red-500 min-h-[36px] min-w-[36px] p-2"
                          title="Delete Team"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        <div className="flex items-center min-h-[36px] p-1">
                          <ChevronDown
                            className={`text-[var(--muted-foreground)] w-5 h-5 transition-transform duration-200 ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </div>
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
                          <div className="border-t border-[var(--border)] bg-[var(--muted)]/20 p-5 space-y-3">
                            <span className="font-bold uppercase tracking-wider text-caption">
                              Roster & Positions
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {PLAYER_SLOT_LABELS.map((label, idx) => {
                                const playerName = team.players[idx];
                                return (
                                  <div
                                    key={idx}
                                    className="bg-[var(--card)] border border-[var(--border)] flex items-center justify-between p-2 rounded-xl text-caption"
                                  >
                                    <span className="font-medium text-[var(--muted-foreground)]">{label}</span>
                                    <span className="font-bold truncate text-[var(--foreground)] ml-2">
                                      {playerName || '—'}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </FadeInUp>
              );
            })}
          </div>

          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={() => handleOpenEditor()}
              className="bg-emerald-600 hover:bg-emerald-500 font-bold rounded-xl text-caption min-h-[38px] px-4 py-2 flex items-center gap-1.5 transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create Team</span>
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
