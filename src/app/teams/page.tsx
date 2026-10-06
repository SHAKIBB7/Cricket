'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users,
  PlusCircle,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Shield,
  User,
  X,
  Check,
  ArrowLeft,
} from 'lucide-react';
import { FeatureHubRepository } from '@/infrastructure/storage/FeatureHubRepository';
import { SavedTeam } from '@/infrastructure/database/dexie-db';

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
  const [teams, setTeams] = useState<SavedTeam[]>([]);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTeam, setEditingTeam] = useState<SavedTeam | null>(null);
  const [loading, setLoading] = useState(true);

  // Form
  const [name, setName] = useState('');
  const [captain, setCaptain] = useState('');
  const [manager, setManager] = useState('');
  const [playerSlots, setPlayerSlots] = useState<string[]>(Array(15).fill(''));

  useEffect(() => {
    loadTeams();
  }, []);

  async function loadTeams() {
    const list = await FeatureHubRepository.loadTeams();
    setTeams(list);
    setLoading(false);
  }

  const handleOpenEditor = (team?: SavedTeam) => {
    if (team) {
      setEditingTeam(team);
      setName(team.name);
      setCaptain(team.captain);
      setManager(team.manager);
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
    if (!name.trim()) return;

    const filteredPlayers = playerSlots.map((p) => p.trim()).filter(Boolean);

    const teamRecord: SavedTeam = {
      id: editingTeam ? editingTeam.id : `team_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: name.trim(),
      captain: captain.trim(),
      manager: manager.trim(),
      players: filteredPlayers,
      createdAt: editingTeam ? editingTeam.createdAt : new Date().toISOString(),
    };

    await FeatureHubRepository.saveTeam(teamRecord);
    setShowEditor(false);
    loadTeams();
  };

  const handleDeleteTeam = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this team?')) return;
    await FeatureHubRepository.deleteTeam(id);
    loadTeams();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
      {/* Top Reversible Navigation Bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] min-h-[38px] p-1 active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <button
          type="button"
          onClick={() => handleOpenEditor()}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs min-h-[38px] active:scale-95 transition-transform"
        >
          <PlusCircle className="w-4 h-4" />
          <span>New Team Profile</span>
        </button>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
          <Users className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
          <span>Team Squad Management</span>
        </h1>
        <p className="text-xs sm:text-xs text-[var(--muted-foreground)]">
          Create club squads with captains, managers, and 15 structured squad positions
        </p>
      </div>

      {/* Teams Grid */}
      {teams.length === 0 && !loading ? (
        <div className="p-10 text-center rounded-2xl bg-[var(--card)] border border-[var(--border)] border-dashed space-y-3">
          <Users className="w-10 h-10 text-[var(--muted-foreground)] mx-auto opacity-50" />
          <h3 className="font-bold text-base">No Saved Teams</h3>
          <p className="text-xs text-[var(--muted-foreground)] max-w-sm mx-auto">
            Build your team roster so you can easily pick them during match and tournament setups.
          </p>
          <button
            onClick={() => handleOpenEditor()}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs min-h-[38px]"
          >
            Create Team
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {teams.map((team) => {
            const isExpanded = expandedTeamId === team.id;

            return (
              <div
                key={team.id}
                className="rounded-xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] overflow-hidden shadow-xs transition-all"
              >
                <div
                  onClick={() => setExpandedTeamId(isExpanded ? null : team.id)}
                  className="p-3.5 sm:p-4 md:p-5 flex items-center justify-between cursor-pointer hover:bg-[var(--muted)]/40 transition-colors gap-2"
                >
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold shrink-0">
                      <Shield className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-black text-base sm:text-lg tracking-tight truncate">{team.name}</h3>
                      <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-xs text-[var(--muted-foreground)] font-medium flex-wrap">
                        <span>Captain: <b>{team.captain || 'Not assigned'}</b></span>
                        <span>•</span>
                        <span>Manager: <b>{team.manager || 'Not assigned'}</b></span>
                        <span>•</span>
                        <span>{team.players.length} Squad Members</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEditor(team);
                      }}
                      className="p-2 rounded-xl hover:bg-[var(--muted)] text-[var(--muted-foreground)] min-h-[36px] min-w-[36px] flex items-center justify-center"
                      title="Edit Team"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={(e) => handleDeleteTeam(team.id, e)}
                      className="p-2 rounded-xl hover:bg-red-500/10 text-red-500 min-h-[36px] min-w-[36px] flex items-center justify-center"
                      title="Delete Team"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <div className="p-1 min-h-[36px] flex items-center">
                      {isExpanded ? <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--muted-foreground)]" /> : <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--muted-foreground)]" />}
                    </div>
                  </div>
                </div>

                {/* Expanded Squad Members List */}
                {isExpanded && (
                  <div className="p-3.5 sm:p-5 border-t border-[var(--border)] bg-[var(--muted)]/20 space-y-2.5 sm:space-y-3">
                    <span className="text-xs sm:text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                      Roster & Positions
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {PLAYER_SLOT_LABELS.map((label, idx) => {
                        const playerName = team.players[idx];
                        return (
                          <div
                            key={idx}
                            className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-[var(--card)] border border-[var(--border)] text-xs flex items-center justify-between"
                          >
                            <span className="text-xs sm:text-xs text-[var(--muted-foreground)] font-medium">{label}</span>
                            <span className="font-bold text-[var(--foreground)] truncate ml-2">{playerName || '—'}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── CREATE / EDIT TEAM MODAL ── */}
      {showEditor && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-[var(--card)] p-3.5 sm:p-6 border border-[var(--border)] shadow-2xl space-y-3.5 sm:space-y-4 max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
              <h3 className="font-black text-base sm:text-lg">
                {editingTeam ? 'Edit Team Profile' : 'New Team Profile'}
              </h3>
              <button
                onClick={() => setShowEditor(false)}
                className="p-1.5 rounded-lg hover:bg-[var(--muted)] min-h-[40px] min-w-[40px] flex items-center justify-center"
              >
                <X className="w-5 h-5 text-[var(--muted-foreground)]" />
              </button>
            </div>

            <form onSubmit={handleSaveTeam} className="space-y-3.5 sm:space-y-4 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[var(--muted-foreground)]">Team Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dhaka Gladiators"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-[var(--muted)] border border-[var(--border)] font-bold text-sm min-h-[42px]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[var(--muted-foreground)]">Captain</label>
                  <input
                    type="text"
                    placeholder="Captain Name"
                    value={captain}
                    onChange={(e) => setCaptain(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-[var(--muted)] border border-[var(--border)] text-sm min-h-[42px]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[var(--muted-foreground)]">Manager</label>
                  <input
                    type="text"
                    placeholder="Manager Name"
                    value={manager}
                    onChange={(e) => setManager(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-[var(--muted)] border border-[var(--border)] text-sm min-h-[42px]"
                  />
                </div>
              </div>

              {/* 15 Squad Slots */}
              <div className="space-y-2 pt-2 border-t border-[var(--border)]">
                <label className="text-xs font-bold uppercase tracking-wider text-emerald-600">
                  15 Squad Positions
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-2.5 max-h-72 sm:max-h-80 overflow-y-auto p-1">
                  {PLAYER_SLOT_LABELS.map((slotLabel, index) => (
                    <div key={index} className="space-y-1">
                      <label className="text-xs font-semibold text-[var(--muted-foreground)]">
                        {slotLabel}
                      </label>
                      <input
                        type="text"
                        placeholder={`Player ${index + 1}`}
                        value={playerSlots[index] || ''}
                        onChange={(e) => {
                          const next = [...playerSlots];
                          next[index] = e.target.value;
                          setPlayerSlots(next);
                        }}
                        className="w-full p-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-xs font-medium min-h-[38px]"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 sm:py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 min-h-[46px] active:scale-[0.99] transition-all"
              >
                Save Team Squad
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
