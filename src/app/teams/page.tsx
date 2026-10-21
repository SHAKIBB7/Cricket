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
import { motion, AnimatePresence } from 'framer-motion';
import { TeamCardSkeleton } from '@/components/common/Skeleton';
import { FadeInUp } from '@/components/common/FadeInUp';

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
  <div className="max-w-4xl mx-auto space-y-6 pb-safe pb-8">
 {/* Top Reversible Navigation Bar */}
 <div className="flex items-center justify-between pt-3 sm:pt-4">
 <button
 type="button"
 onClick={() => router.back()}
 className="flex items-center font-semibold hover:text-[var(--foreground)] active:scale-95 transition-transform gap-1.5 text-caption min-h-[38px] p-1"
 >
 <ArrowLeft className="w-4 h-4" />
 <span>Back</span>
 </button>

 <button
 type="button"
 onClick={() => handleOpenEditor()}
 className="flex items-center bg-emerald-600 hover:bg-emerald-500 font-bold shadow-xs active:scale-95 transition-transform gap-1.5 px-3.5 py-2 rounded-xl text-caption min-h-[38px]"
 >
 <PlusCircle className="w-4 h-4" />
 <span>New Team Profile</span>
 </button>
 </div>

 {/* Header */}
 <div>
 <h1 className="font-black tracking-tight flex items-center text-h2 gap-2">
 <Users className="text-blue-600 w-6 h-6" />
 <span>Team Squad Management</span>
 </h1>
 <p className="text-caption">
 Create club squads with captains, managers, and 15 structured squad positions
 </p>
 </div>

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
 <h3 className="font-bold text-body">No Saved Teams</h3>
 <p className="text-caption max-w-sm mx-auto">
 Build your team roster so you can easily pick them during match and tournament setups.
 </p>
 <button
 onClick={() => handleOpenEditor()}
 className="bg-emerald-600 font-bold rounded-xl text-caption min-h-[38px] px-4 py-2"
 >
 Create Team
 </button>
 </div>
) : (
 <div className="space-y-3">
 {teams.map((team) => {
 const isExpanded = expandedTeamId === team.id;

 return (
 <FadeInUp key={team.id}>
 <div
 className="floating-card overflow-hidden transition-all"
 >
 <div
 onClick={() => setExpandedTeamId(isExpanded ? null : team.id)}
 className="flex items-center justify-between cursor-pointer hover:bg-[var(--muted)]/40 transition-colors p-5 gap-2"
 >
 <div className="flex items-center flex-1 gap-3 min-w-0">
 <div className="bg-blue-500/10 dark:text-blue-400 flex items-center justify-center font-bold shrink-0 rounded-xl text-blue-600 w-10 h-10">
 <Shield className="w-5 h-5" />
 </div>
 <div className="min-w-0">
 <h3 className="font-black tracking-tight truncate text-card-title">{team.name}</h3>
 <div className="flex items-center font-medium flex-wrap text-caption gap-3">
 <span>Captain: <b>{team.captain || 'Not assigned'}</b></span>
 <span>•</span>
 <span>Manager: <b>{team.manager || 'Not assigned'}</b></span>
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
 <ChevronDown className={`text-[var(--muted-foreground)] w-5 h-5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
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
 <span className="font-bold truncate text-[var(--foreground)] ml-2">{playerName || '—'}</span>
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
)}

 {/* ── CREATE / EDIT TEAM MODAL ── */}
  {showEditor && (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="team-editor-title"
      className="fixed inset-0 !m-0 bg-black/60 backdrop-blur-xs z-[60] overflow-y-auto overscroll-contain flex justify-center items-start sm:items-center p-2.5 sm:p-4 md:p-6 pt-[max(1rem,calc(env(safe-area-inset-top,0px)+0.75rem))] pb-[max(5.5rem,calc(env(safe-area-inset-bottom,0px)+4.5rem))] sm:pb-6 min-h-full animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) setShowEditor(false);
      }}
    >
      <div
        className="bg-[var(--card)] border border-[var(--border)] shadow-2xl rounded-2xl flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[90vh] w-full max-w-2xl overflow-hidden my-auto animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 sm:px-6 py-3.5 sm:py-4 shrink-0 bg-[var(--card)]">
          <h3 id="team-editor-title" className="font-black text-card-title">
            {editingTeam ? 'Edit Team Profile' : 'New Team Profile'}
          </h3>
          <button
            type="button"
            onClick={() => setShowEditor(false)}
            className="hover:bg-[var(--muted)] flex items-center justify-center p-1.5 rounded-lg min-h-[40px] min-w-[40px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSaveTeam} className="flex flex-col flex-1 min-h-0 text-body-small">
          <div className="overflow-y-auto overscroll-contain flex-1 min-h-0 p-4 sm:p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-caption">Team Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dhaka Gladiators"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-[var(--muted)] border border-[var(--border)] font-bold p-card rounded-xl min-h-[42px] w-full text-body-small focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-caption">Captain</label>
                <input
                  type="text"
                  placeholder="Captain Name"
                  value={captain}
                  onChange={(e) => setCaptain(e.target.value)}
                  className="bg-[var(--muted)] border border-[var(--border)] p-card rounded-xl min-h-[42px] w-full text-body-small focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-caption">Manager</label>
                <input
                  type="text"
                  placeholder="Manager Name"
                  value={manager}
                  onChange={(e) => setManager(e.target.value)}
                  className="bg-[var(--muted)] border border-[var(--border)] p-card rounded-xl min-h-[42px] w-full text-body-small focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500"
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
                      placeholder={`Player ${index + 1}`}
                      value={playerSlots[index] || ''}
                      onChange={(e) => {
                        const next = [...playerSlots];
                        next[index] = e.target.value;
                        setPlayerSlots(next);
                      }}
                      className="bg-[var(--muted)] border border-[var(--border)] font-medium rounded-lg min-h-[38px] w-full p-2 text-caption focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500"
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
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-600/30 active:scale-[0.99] transition-all py-3 rounded-xl text-body-small min-h-btn w-full flex items-center justify-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Save Team Squad</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )}
</div>
);
}
