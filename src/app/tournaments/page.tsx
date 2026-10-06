'use client';

import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { FeatureHubRepository } from '@/infrastructure/storage/FeatureHubRepository';
import { Tournament, TournamentFormat } from '@/domain/tournament/types';
import { TournamentEngine } from '@/domain/tournament/TournamentEngine';
import { SavedTeam } from '@/infrastructure/database/dexie-db';

export default function TournamentsPage() {
  const router = useRouter();

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [savedTeams, setSavedTeams] = useState<SavedTeam[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form State
  const [name, setName] = useState('');
  const [format, setFormat] = useState<TournamentFormat>('league');
  const [matchOvers, setMatchOvers] = useState(16);
  const [leagueMeetings, setLeagueMeetings] = useState(1);
  const [selectedTeamNames, setSelectedTeamNames] = useState<string[]>([]);
  const [customTeamInput, setCustomTeamInput] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const tourneys = await FeatureHubRepository.loadTournaments();
    const teams = await FeatureHubRepository.loadTeams();
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
    if (selectedTeamNames.length < 2) {
      alert('Please add at least 2 teams to create a tournament');
      return;
    }

    try {
      const tourney = TournamentEngine.createTournament({
        name: name.trim() || 'Premier Cup',
        format,
        teams: selectedTeamNames,
        matchOvers,
        leagueMeetings,
      });

      await FeatureHubRepository.saveTournament(tourney);
      setShowCreateModal(false);
      setName('');
      setSelectedTeamNames([]);
      loadData();
      router.push(`/tournaments/${tourney.id}`);
    } catch (err: any) {
      alert(err.message || 'Error creating tournament');
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this tournament?')) return;
    await FeatureHubRepository.deleteTournament(id);
    loadData();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
            <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-amber-500" />
            <span>Tournaments & Leagues</span>
          </h1>
          <p className="text-[11px] sm:text-xs text-[var(--muted-foreground)]">
            Manage Knockout brackets, Round-Robin leagues, IPL playoffs & standings
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 min-h-[40px]"
        >
          <PlusCircle className="w-4 h-4" />
          <span>New Tournament</span>
        </button>
      </div>

      {/* Tournaments Grid */}
      {tournaments.length === 0 && !loading ? (
        <div className="p-10 text-center rounded-2xl bg-[var(--card)] border border-[var(--border)] border-dashed space-y-3">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
            <Trophy className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-base">No Tournaments Yet</h3>
          <p className="text-xs text-[var(--muted-foreground)] max-w-sm mx-auto">
            Create an IPL-style league tournament or a knockout cup with automatic fixtures and standings.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs min-h-[38px]"
          >
            Create Tournament
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {tournaments.map((t) => {
            const completedFixtures = t.fixtures.filter((f) => f.winner || f.isTie).length;
            const progress = t.fixtures.length > 0 ? (completedFixtures / t.fixtures.length) * 100 : 0;

            return (
              <div
                key={t.id}
                onClick={() => router.push(`/tournaments/${t.id}`)}
                className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-xs hover:border-amber-500/50 transition-all cursor-pointer flex flex-col justify-between gap-3 sm:gap-4"
              >
                <div className="space-y-1.5 sm:space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 sm:px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-extrabold text-[9px] sm:text-[10px] uppercase tracking-wider">
                      {t.format}
                    </span>

                    <button
                      onClick={(e) => handleDelete(t.id, e)}
                      className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-red-500 hover:bg-red-500/10 min-h-[32px] min-w-[32px] flex items-center justify-center"
                      title="Delete Tournament"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <h3 className="font-black text-base sm:text-lg tracking-tight">{t.name}</h3>

                  <div className="flex items-center gap-2 sm:gap-3 text-[11px] sm:text-xs text-[var(--muted-foreground)] font-medium flex-wrap">
                    <span>{t.teams.length} Teams</span>
                    <span>•</span>
                    <span>{t.matchOvers} Overs per match</span>
                    {t.format === 'league' && (
                      <>
                        <span>•</span>
                        <span>{t.leagueMeetings}x Meetings</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Champion or Progress */}
                {t.champion ? (
                  <div className="p-2.5 sm:p-3 rounded-lg sm:rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2">
                    <Award className="w-5 h-5 text-amber-500 shrink-0" />
                    <div>
                      <span className="text-[9px] sm:text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400">Champion</span>
                      <p className="font-black text-xs sm:text-sm text-[var(--foreground)]">{t.champion}</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] sm:text-[11px] font-semibold text-[var(--muted-foreground)]">
                      <span>Progress</span>
                      <span>{completedFixtures} / {t.fixtures.length} matches</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[var(--muted)] overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── CREATE TOURNAMENT MODAL ── */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-lg rounded-2xl bg-[var(--card)] p-4 sm:p-6 border border-[var(--border)] shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-base sm:text-lg">Create Tournament</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-1 rounded-lg hover:bg-[var(--muted)]">
                <X className="w-5 h-5 text-[var(--muted-foreground)]" />
              </button>
            </div>

            <form onSubmit={handleCreateTournament} className="space-y-4 text-sm">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--muted-foreground)]">Tournament Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bangladesh Premier League"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-[var(--muted)] border border-[var(--border)] font-bold text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--muted-foreground)]">Format</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormat('league')}
                    className={`p-3 rounded-xl border text-center font-bold text-xs min-h-[44px] flex items-center justify-center ${
                      format === 'league'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600'
                        : 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]'
                    }`}
                  >
                    League (Round Robin + Playoffs)
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormat('knockout')}
                    className={`p-3 rounded-xl border text-center font-bold text-xs min-h-[44px] flex items-center justify-center ${
                      format === 'knockout'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600'
                        : 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]'
                    }`}
                  >
                    Knockout (Bracket Cup)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[var(--muted-foreground)]">Match Overs</label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={matchOvers}
                    onChange={(e) => setMatchOvers(Number(e.target.value))}
                    className="w-full p-2.5 rounded-xl bg-[var(--muted)] border font-bold text-sm min-h-[42px]"
                  />
                </div>

                {format === 'league' && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[var(--muted-foreground)]">Meetings per Pair</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={leagueMeetings}
                      onChange={(e) => setLeagueMeetings(Number(e.target.value))}
                      className="w-full p-2.5 rounded-xl bg-[var(--muted)] border font-bold text-sm min-h-[42px]"
                    />
                  </div>
                )}
              </div>

              {/* Teams Selection */}
              <div className="space-y-2 pt-2 border-t border-[var(--border)]">
                <label className="text-xs font-semibold text-[var(--muted-foreground)] flex items-center justify-between">
                  <span>Selected Teams ({selectedTeamNames.length})</span>
                  <span className="text-[11px] text-emerald-600">Minimum 2 teams</span>
                </label>

                {/* Team chips */}
                <div className="flex flex-wrap gap-1.5 min-h-12 p-2 rounded-xl bg-[var(--muted)]/50 border border-[var(--border)]">
                  {selectedTeamNames.length === 0 ? (
                    <span className="text-xs text-[var(--muted-foreground)] italic p-1">No teams selected yet</span>
                  ) : (
                    selectedTeamNames.map((t) => (
                      <span
                        key={t}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold text-xs flex items-center gap-1.5 max-w-full"
                      >
                        <span className="truncate max-w-[180px]">{t}</span>
                        <button type="button" onClick={() => toggleSavedTeam(t)} className="p-0.5 hover:opacity-80">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>

                {/* Add Custom Team */}
                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Add team name..."
                    value={customTeamInput}
                    onChange={(e) => setCustomTeamInput(e.target.value)}
                    className="flex-1 min-w-0 p-2.5 rounded-xl bg-[var(--muted)] border text-xs font-bold min-h-[42px]"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomTeam}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 text-white font-bold text-xs shrink-0 min-h-[42px]"
                  >
                    Add
                  </button>
                </div>

                {/* Saved Teams Quick Toggles */}
                {savedTeams.length > 0 && (
                  <div className="pt-2">
                    <span className="text-[11px] font-bold text-[var(--muted-foreground)]">Saved Teams:</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {savedTeams.map((st) => {
                        const isSel = selectedTeamNames.includes(st.name);
                        return (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => toggleSavedTeam(st.name)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors max-w-full truncate ${
                              isSel
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)]'
                            }`}
                          >
                            {st.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 min-h-[44px]"
              >
                Create Tournament & Fixtures
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
