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
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between flex-wrap items-center gap-4">
        <div>
          <h1 className="font-black tracking-tight flex items-center text-2xl gap-2">
            <Trophy className="text-amber-500 w-6 h-6" />
            <span>Tournaments & Leagues</span>
          </h1>
          <p className="text-xs">
            Manage Knockout brackets, Round-Robin leagues, IPL playoffs & standings
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center bg-emerald-600 hover:bg-emerald-500 font-bold shadow-md shadow-emerald-600/20 gap-2 px-4 py-2 rounded-xl text-xs min-h-[40px]"
        >
          <PlusCircle className="w-4 h-4" />
          <span>New Tournament</span>
        </button>
      </div>

      {/* Tournaments Grid */}
      {tournaments.length === 0 && !loading ? (
        <div className="bg-[var(--card)] border border-[var(--border)] border-dashed text-center rounded-2xl p-10 space-y-3">
          <div className="bg-amber-500/10 flex items-center justify-center rounded-full text-amber-500 mx-auto w-12 h-12">
            <Trophy className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-base">No Tournaments Yet</h3>
          <p className="text-xs max-w-sm mx-auto">
            Create an IPL-style league tournament or a knockout cup with automatic fixtures and standings.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-emerald-600 font-bold rounded-xl text-xs min-h-[38px] px-4 py-2"
          >
            Create Tournament
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-4">
          {tournaments.map((t) => {
            const completedFixtures = t.fixtures.filter((f) => f.winner || f.isTie).length;
            const progress = t.fixtures.length > 0 ? (completedFixtures / t.fixtures.length) * 100 : 0;

            return (
              <div
                key={t.id}
                onClick={() => router.push(`/tournaments/${t.id}`)}
                className="bg-[var(--card)] border border-[var(--border)] shadow-xs hover:border-amber-500/50 transition-all cursor-pointer flex flex-col justify-between p-5 rounded-2xl gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="bg-amber-500/10 dark:text-amber-400 font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full text-xs">
                      {t.format}
                    </span>

                    <button
                      onClick={(e) => handleDelete(t.id, e)}
                      className="hover:text-red-500 hover:bg-red-500/10 flex items-center justify-center p-1.5 rounded-lg text-[var(--muted-foreground)] min-h-[32px] min-w-[32px]"
                      title="Delete Tournament"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <h3 className="font-black tracking-tight text-lg">{t.name}</h3>

                  <div className="flex items-center font-medium flex-wrap text-xs gap-3">
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
                  <div className="bg-amber-500/10 border border-amber-500/30 flex items-center p-3 rounded-xl gap-2">
                    <Award className="shrink-0 text-amber-500 w-5 h-5" />
                    <div>
                      <span className="uppercase font-bold dark:text-amber-400 text-amber-600">Champion</span>
                      <p className="font-black text-sm">{t.champion}</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex justify-between font-semibold text-[var(--muted-foreground)]">
                      <span>Progress</span>
                      <span>{completedFixtures} / {t.fixtures.length} matches</span>
                    </div>
                    <div className="bg-[var(--muted)] overflow-hidden h-1.5 rounded-full w-full">
                      <div
                        className="bg-emerald-500 rounded-full h-full"
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--card)] border border-[var(--border)] shadow-2xl overflow-y-auto max-w-lg rounded-2xl max-h-[90vh] w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-lg">Create Tournament</h3>
              <button onClick={() => setShowCreateModal(false)} className="hover:bg-[var(--muted)] rounded-lg p-1">
                <X className="text-[var(--muted-foreground)] w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTournament} className="space-y-4 text-sm">
              <div className="space-y-1">
                <label className="font-semibold text-xs">Tournament Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bangladesh Premier League"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-[var(--muted)] border border-[var(--border)] font-bold p-card rounded-xl w-full text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-xs">Format</label>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-2">
                  <button
                    type="button"
                    onClick={() => setFormat('league')}
                    className={`p-3 rounded-xl border text-center font-bold text-xs min-h-btn flex items-center justify-center ${
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
                    className={`p-3 rounded-xl border text-center font-bold text-xs min-h-btn flex items-center justify-center ${
                      format === 'knockout'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600'
                        : 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]'
                    }`}
                  >
                    Knockout (Bracket Cup)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-xs">Match Overs</label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={matchOvers}
                    onChange={(e) => setMatchOvers(Number(e.target.value))}
                    className="bg-[var(--muted)] border font-bold p-card rounded-xl min-h-[42px] w-full text-sm"
                  />
                </div>

                {format === 'league' && (
                  <div className="space-y-1">
                    <label className="font-semibold text-xs">Meetings per Pair</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={leagueMeetings}
                      onChange={(e) => setLeagueMeetings(Number(e.target.value))}
                      className="bg-[var(--muted)] border font-bold p-card rounded-xl min-h-[42px] w-full text-sm"
                    />
                  </div>
                )}
              </div>

              {/* Teams Selection */}
              <div className="border-t border-[var(--border)] space-y-2 pt-2">
                <label className="font-semibold flex items-center justify-between text-xs">
                  <span>Selected Teams ({selectedTeamNames.length})</span>
                  <span className="text-emerald-600">Minimum 2 teams</span>
                </label>

                {/* Team chips */}
                <div className="flex flex-wrap bg-[var(--muted)]/50 border border-[var(--border)] gap-1.5 min-h-12 rounded-xl p-2">
                  {selectedTeamNames.length === 0 ? (
                    <span className="italic text-xs p-1">No teams selected yet</span>
                  ) : (
                    selectedTeamNames.map((t) => (
                      <span
                        key={t}
                        className="bg-emerald-600 font-bold flex items-center px-4 rounded-lg text-xs gap-1.5 max-w-full py-1"
                      >
                        <span className="truncate max-w-[180px]">{t}</span>
                        <button type="button" onClick={() => toggleSavedTeam(t)} className="hover:opacity-80 p-0.5">
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
                    className="flex-1 bg-[var(--muted)] border font-bold min-w-0 p-card rounded-xl min-h-[42px] text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomTeam}
                    className="bg-slate-800 font-bold shrink-0 py-2.5 rounded-xl text-xs min-h-[42px] px-4"
                  >
                    Add
                  </button>
                </div>

                {/* Saved Teams Quick Toggles */}
                {savedTeams.length > 0 && (
                  <div className="pt-2">
                    <span className="font-bold text-[var(--muted-foreground)]">Saved Teams:</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {savedTeams.map((st) => {
                        const isSel = selectedTeamNames.includes(st.name);
                        return (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => toggleSavedTeam(st.name)}
                            className={`px-4 py-1 rounded-lg text-xs font-semibold border transition-colors max-w-full truncate ${
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
                className="bg-emerald-600 hover:bg-emerald-500 font-bold shadow-lg shadow-emerald-600/30 py-3.5 rounded-xl text-sm min-h-btn w-full"
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
