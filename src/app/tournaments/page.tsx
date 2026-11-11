'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
 Trophy,
 PlusCircle,
 Users,
 Calendar,
 ArrowRight,
 Trash2,
 Award,
 Layers,
 X,
 Loader2,
 AlertCircle,
 CheckCircle2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { FeatureHubRepository } from '@/infrastructure/storage/FeatureHubRepository';
import { Tournament, TournamentFormat } from '@/domain/tournament/types';
import { TournamentEngine } from '@/domain/tournament/TournamentEngine';
import { SavedTeam } from '@/infrastructure/database/dexie-db';
import { ConfirmationDialog } from '@/components/overlay/ConfirmationDialog';
import { useDismissGuard } from '@/hooks/useUnsavedChanges';
import { NumericInput } from '@/components/common/NumericInput';
import { TournamentCardSkeleton } from '@/components/common/Skeleton';
import { FadeInUp } from '@/components/common/FadeInUp';
import { CompactDropdown } from '@/components/common/CompactDropdown';
import { useLanguage } from '@/context/LanguageContext';

export default function TournamentsPage() {
 const { t: tr } = useLanguage();
 const router = useRouter();
 const { user } = useAuth();

 const [mounted, setMounted] = useState(false);
 const [tournaments, setTournaments] = useState<Tournament[]>([]);
 const [savedTeams, setSavedTeams] = useState<SavedTeam[]>([]);
 const [showCreateModal, setShowCreateModal] = useState(false);
 const [tournamentToDelete, setTournamentToDelete] = useState<string | null>(null);
 const [loading, setLoading] = useState(true);
 const [isSaving, setIsSaving] = useState(false);
 const savingRef = useRef(false);
 const [formError, setFormError] = useState<string | null>(null);
 const [successToast, setSuccessToast] = useState<string | null>(null);

 // Form State
 const [name, setName] = useState('');
 const [format, setFormat] = useState<TournamentFormat>('league');
 const [matchOvers, setMatchOvers] = useState<number | string>(16);
 const [leagueMeetings, setLeagueMeetings] = useState<number | string>(1);
 const [selectedTeamNames, setSelectedTeamNames] = useState<string[]>([]);
 const [customTeamInput, setCustomTeamInput] = useState('');

 // F4-06: unsaved-changes protection for the create dialog. The
 // create form's pristine state is its initial values (it resets
 // after a successful save), so "dirty" = any field moved off them.
 const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
 const isCreateDirty =
   name.trim() !== '' ||
   format !== 'league' ||
   String(matchOvers) !== '16' ||
   String(leagueMeetings) !== '1' ||
   selectedTeamNames.length > 0 ||
   customTeamInput.trim() !== '';
 const closeCreateModal = () => {
   setShowCreateModal(false);
   setFormError(null);
 };
 const requestCreateDismiss = useDismissGuard(isCreateDirty && !isSaving, () =>
   setShowDiscardConfirm(true)
 );

 // F4-08: Escape closes the dialog (through the dismiss guard when
 // dirty). While the discard confirmation is up, Escape belongs to
 // that dialog (it cancels back to the form).
 useEffect(() => {
   if (!showCreateModal || showDiscardConfirm) return;
   const handler = (e: KeyboardEvent) => {
     if (e.key === 'Escape' && !isSaving) requestCreateDismiss(closeCreateModal);
   };
   window.addEventListener('keydown', handler);
   return () => window.removeEventListener('keydown', handler);
 }, [showCreateModal, showDiscardConfirm, isSaving, requestCreateDismiss]);

 useEffect(() => {
   setMounted(true);
   loadData();
 }, []);

 useEffect(() => {
   if (showCreateModal) {
     const originalOverflow = document.body.style.overflow;
     document.body.style.overflow = 'hidden';
     return () => {
       document.body.style.overflow = originalOverflow;
     };
   }
 }, [showCreateModal]);

 useEffect(() => {
   if (successToast) {
     const timer = setTimeout(() => {
       setSuccessToast(null);
     }, 4000);
     return () => clearTimeout(timer);
   }
 }, [successToast]);

 async function loadData() {
 const [tourneys, teams] = await Promise.all([
 FeatureHubRepository.loadTournaments(),
 FeatureHubRepository.loadTeams(),
 ]);
 setTournaments(tourneys);
 setSavedTeams(teams);
 setLoading(false);
 }

 const handleAddCustomTeam = () => {
 if (!customTeamInput.trim()) return;
 if (!selectedTeamNames.includes(customTeamInput.trim())) {
 setSelectedTeamNames([...selectedTeamNames, customTeamInput.trim()]);
 }
 setCustomTeamInput('');
 };

 const toggleSavedTeam = (teamName: string) => {
 if (selectedTeamNames.includes(teamName)) {
 setSelectedTeamNames(selectedTeamNames.filter((t) => t !== teamName));
 } else {
 setSelectedTeamNames([...selectedTeamNames, teamName]);
 }
 };

 const handleCreateTournament = async (e: React.FormEvent) => {
 e.preventDefault();
 if (isSaving) return;
 if (savingRef.current) return;
 savingRef.current = true;
 setFormError(null);

 const trimmedName = name.trim();
 if (!trimmedName) {
   setFormError(tr('tournaments_err_name_required', 'Please enter a tournament name.'));
   savingRef.current = false;
   return;
 }
 if (trimmedName.length < 2) {
   setFormError(tr('tournaments_err_name_short', 'Tournament name must be at least 2 characters.'));
   savingRef.current = false;
   return;
 }
 if (trimmedName.length > 100) {
   setFormError(tr('tournaments_err_name_long', 'Tournament name cannot exceed 100 characters.'));
   savingRef.current = false;
   return;
 }

 const isDuplicate = tournaments.some(
   (t) => t.name.trim().toLowerCase() === trimmedName.toLowerCase()
 );
 if (isDuplicate) {
   setFormError(`${tr('tournaments_err_duplicate_prefix', 'A tournament with the name')} "${trimmedName}" ${tr('tournaments_err_duplicate_suffix', 'already exists. Please choose a distinct name.')}`);
   savingRef.current = false;
   return;
 }

 if (selectedTeamNames.length < 2) {
   setFormError(tr('tournaments_err_min_teams', 'Please add at least 2 teams to create a tournament.'));
   savingRef.current = false;
   return;
 }
 if (selectedTeamNames.length > 64) {
   setFormError(tr('tournaments_err_max_teams', 'A tournament cannot exceed 64 participating teams.'));
   savingRef.current = false;
   return;
 }

 const cleanTeams = selectedTeamNames.map((t) => t.trim()).filter(Boolean);
 const uniqueTeams = Array.from(new Set(cleanTeams));
 if (uniqueTeams.length < 2) {
   setFormError(tr('tournaments_err_unique_teams', 'Please ensure at least 2 unique teams are selected.'));
   savingRef.current = false;
   return;
 }

 const parsedOvers = Number(matchOvers);
 if (isNaN(parsedOvers) || parsedOvers < 1 || parsedOvers > 90) {
   setFormError(tr('tournaments_err_overs_range', 'Match overs must be between 1 and 90.'));
   savingRef.current = false;
   return;
 }

 const parsedMeetings = Number(leagueMeetings);
 if (format === 'league' && (isNaN(parsedMeetings) || parsedMeetings < 1 || parsedMeetings > 5)) {
   setFormError(tr('tournaments_err_meetings_range', 'Meetings per pair must be between 1 and 5.'));
   savingRef.current = false;
   return;
 }

 setIsSaving(true);
 try {
   const tourney = TournamentEngine.createTournament({
     name: trimmedName,
     format,
     teams: uniqueTeams,
     matchOvers: parsedOvers,
     leagueMeetings: parsedMeetings,
   });

   if (user?.uid) {
     tourney.userId = user.uid;
   }
   tourney.updatedAt = new Date().toISOString();

   await FeatureHubRepository.saveTournament(tourney);

   const verified = await FeatureHubRepository.getTournament(tourney.id);
   if (!verified) {
     throw new Error('Verification failed: Tournament was not saved to storage.');
   }

   setSuccessToast(`${tr('tournaments_toast_created_prefix', 'Tournament')} "${tourney.name}" ${tr('tournaments_toast_created_suffix', 'created and synced successfully!')}`);
   setShowCreateModal(false);
   setName('');
   setSelectedTeamNames([]);
   setFormError(null);
   await loadData();
   router.push(`/tournaments/${tourney.id}`);
 } catch (err: any) {
   setFormError(err.message || tr('tournaments_err_create_failed', 'Error creating tournament. Please try again.'));
 } finally {
   setIsSaving(false);
   savingRef.current = false;
 }
 };

 const handleDelete = (id: string, e: React.MouseEvent) => {
 e.stopPropagation();
 setTournamentToDelete(id);
 };

 const executeDelete = async () => {
 if (!tournamentToDelete) return;
 await FeatureHubRepository.deleteTournament(tournamentToDelete);
 setTournamentToDelete(null);
 loadData();
 };

 return (
 <div className="max-w-5xl xl:max-w-6xl mx-auto space-y-4 sm:space-y-5 w-full pb-safe pb-8">
 <ConfirmationDialog
 open={!!tournamentToDelete}
 destructive
 title={tr('tournaments_delete_title', 'Delete this tournament?')}
 description={tr('history_delete_desc', 'This cannot be undone.')}
 confirmLabel={tr('history_delete', 'Delete')}
 onConfirm={executeDelete}
 onCancel={() => setTournamentToDelete(null)}
 />
 {/* F4-06: discard confirmation for the create dialog's dismiss guard */}
 <ConfirmationDialog
 open={showDiscardConfirm}
 destructive
 title={tr('teams_discard_title', 'Discard changes?')}
 description={tr('tournaments_discard_desc', 'You have unsaved changes in this tournament. Discard them?')}
 confirmLabel={tr('teams_discard', 'Discard')}
 cancelLabel={tr('teams_keep_editing', 'Keep editing')}
 onConfirm={() => {
   setShowDiscardConfirm(false);
   closeCreateModal();
 }}
 onCancel={() => setShowDiscardConfirm(false)}
 />
 {/* Header */}
 <div className="pt-3 sm:pt-4">
 <h1 className="font-black tracking-tight flex items-center text-h2 gap-2">
 <Trophy className="text-amber-500 w-6 h-6" />
 <span>{tr('home_tournaments_leagues', 'Tournaments & Leagues')}</span>
 </h1>
 <p className="text-caption">
 {tr('tournaments_subtitle', 'Manage Knockout brackets, Round-Robin leagues, IPL playoffs & standings')}
 </p>
 </div>

 {/* Tournaments Grid */}
 {loading ? (
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4" data-testid="tournaments-skeleton-grid">
 <TournamentCardSkeleton />
 <TournamentCardSkeleton />
 <TournamentCardSkeleton />
 </div>
 ) : tournaments.length === 0 ? (
 <div className="bg-[var(--card)] border border-[var(--border)] border-dashed text-center rounded-2xl p-10 space-y-3 shadow-elev1">
 <div className="bg-amber-500/10 flex items-center justify-center rounded-full text-amber-500 mx-auto w-12 h-12">
 <Trophy className="w-6 h-6" />
 </div>
 <h2 className="font-bold text-body">{tr('tournaments_empty_title', 'No Tournaments Yet')}</h2>
 <p className="text-caption max-w-sm mx-auto">
 {tr('tournaments_empty_desc', 'Create an IPL-style league tournament or a knockout cup with automatic fixtures and standings.')}
 </p>
 <button
 type="button"
 onClick={() => setShowCreateModal(true)}
 className="bg-emerald-600 font-bold rounded-xl text-caption min-h-[38px] px-4 py-2 shadow-elev2"
 >
 {tr('tournaments_create', 'Create Tournament')}
 </button>
 </div>
) : (
 <div className="space-y-4">
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
 {tournaments.map((t) => {
 const completedFixtures = t.fixtures.filter((f) => f.winner || f.isTie).length;

 return (
 <FadeInUp key={t.id}>
 <div
 onClick={() => router.push(`/tournaments/${t.id}`)}
 className="floating-card shadow-elev1 overflow-hidden transition-all cursor-pointer flex flex-col"
 >
 {/* Matchday band (TAIMUR pick, 2026-11-11): the same navy band
     as the Teams page — a gold trophy medallion, the name in
     white, a format pill, and delete as a white circular button. */}
 <div className="bg-[#181868] px-4 py-3.5 space-y-2">
 <div className="flex items-center gap-3">
 <div className="flex items-center justify-center w-12 h-12 rounded-full border-2 border-amber-400/70 shrink-0">
 <Trophy className="w-6 h-6 text-amber-400" />
 </div>
 <h2 className="font-black tracking-tight truncate text-2xl leading-tight text-white flex-1 min-w-0">{t.name}</h2>
 <button
 onClick={(e) => handleDelete(t.id, e)}
 className="flex items-center justify-center rounded-full bg-white hover:bg-red-100 text-[#181868] hover:text-red-600 min-h-[40px] min-w-[40px] p-2 shrink-0 transition-colors"
 title={tr('tournaments_delete', 'Delete Tournament')}
 >
 <Trash2 className="w-4 h-4" />
 </button>
 </div>
 {/* The format pill sits under the name: at 393px the mockup's
     one-row band cannot hold medallion + a 20px name + pill +
     delete without truncating real names like NARSINGDI TOPY. */}
 <div className="pl-[60px]">
 <span className="inline-block bg-[#e8b850] text-[#181868] font-extrabold uppercase tracking-wider px-3.5 py-2 rounded-full text-[13px]">
 {t.format === 'league'
 ? tr('tournaments_format_league_short', 'League')
 : tr('tournaments_format_knockout_short', 'Knockout')}
 </span>
 </div>
 </div>

 {/* Stat strip: Teams / Overs / Meetings (league) or Matches */}
 <div className="grid grid-cols-3 divide-x divide-[var(--border)]">
 <div className="py-3.5 px-2 text-center min-w-0">
 <div className="text-[13px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
 {tr('tournaments_teams_suffix', 'Teams')}
 </div>
 <div className="font-black truncate text-4xl num-font">{t.teams.length}</div>
 </div>
 <div className="py-3.5 px-2 text-center min-w-0">
 <div className="text-[13px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
 {tr('tournaments_overs_label', 'Overs')}
 </div>
 <div className="font-black truncate text-4xl num-font">{t.matchOvers}</div>
 </div>
 {t.format === 'league' ? (
 <div className="py-3.5 px-2 text-center min-w-0">
 <div className="text-[13px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
 {tr('tournaments_meetings_suffix', 'Meetings')}
 </div>
 <div className="font-black truncate text-4xl num-font">{t.leagueMeetings}x</div>
 </div>
 ) : (
 <div className="py-3.5 px-2 text-center min-w-0">
 <div className="text-[13px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
 {tr('tournaments_matches_label', 'Matches')}
 </div>
 <div className="font-black truncate text-4xl num-font">{t.fixtures.length}</div>
 </div>
 )}
 </div>

 {/* Champion band or segmented progress — one segment per
     fixture, emerald as each match completes. */}
 {t.champion ? (
 <div className="bg-[#e8b850] flex items-center gap-2.5 px-4 py-3 mt-auto">
 <span className="flex items-center justify-center w-9 h-9 rounded-full border-2 border-[#181868]/50 shrink-0"><Trophy className="text-[#181868] w-5 h-5" /></span>
 <span className="uppercase font-bold text-white text-[13px]">{tr('tournaments_champion', 'Champion')}</span>
 <span className="font-black text-2xl text-[#181868] truncate">{t.champion}</span>
 </div>
) : (
 <div className="px-4 py-3 space-y-2 mt-auto border-t border-[var(--border)]">
 <div className="flex justify-between font-semibold text-[var(--muted-foreground)] text-[13px]">
 <span>{tr('tournaments_progress', 'Progress')}</span>
 <span>{completedFixtures} / {t.fixtures.length} {tr('tournaments_matches_suffix', 'matches')}</span>
 </div>
 {t.fixtures.length > 0 ? (
 <div className="flex gap-[3px]">
 {t.fixtures.map((f, i) => (
 <span
 key={i}
 className={`h-2 flex-1 rounded-full ${f.winner || f.isTie ? 'bg-emerald-500' : 'bg-[var(--muted)]'}`}
 />
 ))}
 </div>
) : (
 <div className="bg-[var(--muted)] overflow-hidden h-1.5 rounded-full w-full" />
 )}
 </div>
)}
 </div>
 </FadeInUp>
);
 })}
 </div>

 <div className="flex justify-center pt-2">
 <button
 type="button"
 onClick={() => setShowCreateModal(true)}
 className="bg-emerald-600 hover:bg-emerald-500 font-bold rounded-xl text-caption min-h-[38px] px-4 py-2 flex items-center gap-1.5 transition-colors text-white shadow-elev2"
 >
 <PlusCircle className="w-4 h-4" />
 <span>{tr('tournaments_create', 'Create Tournament')}</span>
 </button>
 </div>
 </div>
)}

  {/* Success Toast */}
  {successToast && (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-4 right-4 z-[70] bg-emerald-600 text-white font-bold px-4 py-3 rounded-xl shadow-elev3 flex items-center gap-2 text-caption animate-fade-in"
    >
      <CheckCircle2 className="w-4 h-4 shrink-0" />
      <span>{successToast}</span>
      <button
        type="button"
        onClick={() => setSuccessToast(null)}
        className="ml-2 hover:opacity-80 p-0.5"
        aria-label={tr('teams_dismiss_message', 'Dismiss message')}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )}

  {/* ── CREATE TOURNAMENT MODAL (Portalled to document.body to break free from ancestor stacking contexts) ── */}
  {mounted && showCreateModal && createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tournament-create-title"
      className="fixed inset-0 !m-0 bg-black/60 backdrop-blur-xs z-[60] overflow-y-auto overscroll-contain flex justify-center items-start sm:items-center p-2.5 sm:p-4 md:p-6 pt-[max(1rem,calc(env(safe-area-inset-top,0px)+0.75rem))] pb-[max(5.5rem,calc(env(safe-area-inset-bottom,0px)+4.5rem))] sm:pb-6 min-h-full animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) {
          requestCreateDismiss(closeCreateModal);
        }
      }}
    >
      <div
        className="bg-[var(--card)] border border-[var(--border)] shadow-elev3 rounded-2xl flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[90vh] w-full max-w-lg overflow-hidden my-auto animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 sm:px-6 py-3.5 sm:py-4 shrink-0 bg-[var(--card)]">
          <h2 id="tournament-create-title" className="font-black text-card-title">{tr('tournaments_create', 'Create Tournament')}</h2>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => {
              requestCreateDismiss(closeCreateModal);
            }}
            className="hover:bg-[var(--muted)] flex items-center justify-center p-1.5 rounded-lg min-h-[40px] min-w-[40px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors disabled:opacity-40"
            aria-label={tr('teams_close_dialog', 'Close dialog')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleCreateTournament} className="flex flex-col flex-1 min-h-0 text-body-small">
          <div className="overflow-y-auto overscroll-contain flex-1 min-h-0 p-4 sm:p-6 space-y-4 pb-4">
            {formError && (
              <div
                role="alert"
                className="bg-red-500/10 border border-red-500/30 text-red-500 dark:text-red-400 p-3 rounded-xl flex items-start gap-2.5 text-xs font-semibold animate-fade-in"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1">{formError}</div>
                <button
                  type="button"
                  onClick={() => setFormError(null)}
                  className="text-red-400 hover:text-red-300 p-0.5"
                  aria-label={tr('tournaments_dismiss_error', 'Dismiss error')}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="space-y-1">
              <label className="font-semibold text-caption">{tr('tournaments_name_label', 'Tournament Name')}</label>
              <input
                type="text"
                required
                disabled={isSaving}
                placeholder={tr('tournaments_name_placeholder', 'e.g. Bangladesh Premier League')}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (formError) setFormError(null);
                }}
                className="bg-[var(--muted)] border border-[var(--border)] font-bold p-card rounded-xl w-full text-body-small disabled:opacity-60 shadow-inset"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-caption">{tr('tournaments_format', 'Format')}</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setFormat('league')}
                  className={`p-3 rounded-xl border text-center font-bold text-caption min-h-btn flex items-center justify-center transition-all ${
                    format === 'league'
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 shadow-elev2'
                      : 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)] shadow-elev1'
                  } disabled:opacity-60`}
                >
                  {tr('tournaments_format_league', 'League (Round Robin + Playoffs)')}
                </button>

                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setFormat('knockout')}
                  className={`p-3 rounded-xl border text-center font-bold text-caption min-h-btn flex items-center justify-center transition-all ${
                    format === 'knockout'
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 shadow-elev2'
                      : 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)] shadow-elev1'
                  } disabled:opacity-60`}
                >
                  {tr('tournaments_format_knockout', 'Knockout (Bracket Cup)')}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-caption">{tr('tournaments_match_overs', 'Match Overs')}</label>
                <NumericInput
                  min={1}
                  max={90}
                  fallback={16}
                  value={matchOvers}
                  disabled={isSaving}
                  onChange={(val) => setMatchOvers(val)}
                  className="bg-[var(--muted)] border font-bold p-card rounded-xl min-h-[42px] w-full text-body-small text-center shadow-inset"
                />
              </div>

              {format === 'league' && (
                <div className="space-y-1">
                  <label className="font-semibold text-caption">{tr('tournaments_meetings_per_pair', 'Meetings per Pair')}</label>
                  <NumericInput
                    min={1}
                    max={5}
                    fallback={1}
                    value={leagueMeetings}
                    disabled={isSaving}
                    onChange={(val) => setLeagueMeetings(val)}
                    className="bg-[var(--muted)] border font-bold p-card rounded-xl min-h-[42px] w-full text-body-small text-center shadow-inset"
                  />
                </div>
              )}
            </div>

            {/* Teams Selection */}
            <div className="border-t border-[var(--border)] space-y-2 pt-2">
              <label className="font-semibold flex items-center justify-between text-caption">
                <span>{tr('tournaments_selected_teams', 'Selected Teams')} ({selectedTeamNames.length})</span>
                <span className="text-emerald-600">{tr('tournaments_min_teams', 'Minimum 2 teams')}</span>
              </label>

              {/* Team chips */}
              <div className="flex flex-wrap bg-muted/50 border border-[var(--border)] gap-1.5 min-h-12 rounded-xl p-2 shadow-inset">
                {selectedTeamNames.length === 0 ? (
                  <span className="italic text-caption p-1">{tr('tournaments_no_teams_selected', 'No teams selected yet')}</span>
                ) : (
                  selectedTeamNames.map((t) => (
                    <span
                      key={t}
                      className="bg-emerald-600 font-bold flex items-center px-4 rounded-lg text-caption gap-1.5 max-w-full py-1 text-white"
                    >
                      <span className="truncate max-w-[180px]">{t}</span>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => toggleSavedTeam(t)}
                        className="hover:opacity-80 p-0.5 disabled:opacity-40"
                        aria-label={`${tr('tournaments_remove', 'Remove')} ${t}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>

              {/* Add Team Dropdown / Input */}
              <div className="flex gap-2 pt-1 items-center">
                <div className="flex-1 min-w-0">
                  <CompactDropdown
                    value={customTeamInput}
                    options={savedTeams
                      .filter((st) => !selectedTeamNames.includes(st.name))
                      .map((st) => ({
                        value: st.name,
                        label: st.name,
                        sublabel: `${st.players.length} ${tr('tournaments_players_squad', 'players squad')}`,
                        badge: tr('tournaments_saved_squad', 'Saved Squad'),
                      }))}
                    onChange={(teamName) => {
                      if (teamName && !selectedTeamNames.includes(String(teamName))) {
                        setSelectedTeamNames([...selectedTeamNames, String(teamName)]);
                        setCustomTeamInput('');
                        if (formError) setFormError(null);
                      }
                    }}
                    onInputChange={(val) => setCustomTeamInput(val)}
                    allowCustomInput
                    disabled={isSaving}
                    placeholder={tr('tournaments_team_picker_placeholder', 'Type or pick team from saved squads...')}
                    inputPlaceholder={tr('tournaments_team_picker_placeholder', 'Type or pick team from saved squads...')}
                    size="sm"
                    emptyMessage={tr('tournaments_team_picker_empty', 'All saved squads selected, or type a custom team name.')}
                    testId="tournament-team-picker"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddCustomTeam}
                  disabled={!customTeamInput.trim() || isSaving}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold shrink-0 py-2 rounded-xl text-caption min-h-[38px] px-3.5 transition-colors cursor-pointer shadow-elev2"
                >
                  {tr('tournaments_add', 'Add')}
                </button>
              </div>

              {/* Saved Teams Quick Toggles */}
              {savedTeams.length > 0 ? (
                <div className="pt-2">
                  <span className="font-bold text-[var(--muted-foreground)]">{tr('tournaments_saved_teams', 'Saved Teams:')}</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {savedTeams.map((st) => {
                      const isSel = selectedTeamNames.includes(st.name);
                      return (
                        <button
                          key={st.id}
                          type="button"
                          disabled={isSaving}
                          onClick={() => {
                            toggleSavedTeam(st.name);
                            if (formError) setFormError(null);
                          }}
                          className={`px-4 py-1 rounded-lg text-caption font-semibold border transition-colors max-w-full truncate disabled:opacity-50 ${
                            isSel
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-elev2'
                              : 'bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)] shadow-elev1'
                          }`}
                        >
                          {st.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="pt-2 flex items-center justify-between text-caption bg-muted/50 p-2.5 rounded-xl border border-dashed border-[var(--border)]">
                  <span className="text-[var(--muted-foreground)] text-xs">
                    {tr('tournaments_no_saved_teams', 'No saved teams yet. Add custom teams above or create reusable squads.')}
                  </span>
                  <Link
                    href="/teams"
                    className="font-bold text-emerald-600 hover:underline shrink-0 text-xs ml-2"
                  >
                    {tr('tournaments_squad_manager', 'Squad Manager')}
                  </Link>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-[var(--border)] bg-[var(--card)] px-4 sm:px-6 py-3.5 shrink-0 pb-safe">
            <button
              type="submit"
              disabled={isSaving}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold shadow-elev2 active:scale-[0.99] transition-all py-3 rounded-xl text-body-small min-h-btn w-full flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>{tr('tournaments_saving', 'Saving Tournament...')}</span>
                </>
              ) : (
                <>
                  <Trophy className="w-4 h-4 shrink-0" />
                  <span>{tr('tournaments_create_fixtures', 'Create Tournament & Fixtures')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )}
</div>
);
}
