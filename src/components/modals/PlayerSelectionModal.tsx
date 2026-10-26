'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Users, CheckCircle2, AlertTriangle, Shield, Search, PlusCircle, UserCheck } from 'lucide-react';
import { cleanPlayerName } from '@/domain/cricket/formatters';
import { MODAL_VARIANTS, BACKDROP_VARIANTS } from '@/lib/animations';
import { useModalOverlay } from '@/hooks/useModalOverlay';

export interface IneligiblePlayerInfo {
  name: string;
  reason: string;
}

export interface BowlerFigureInfo {
  overs: string;
  maidens: number;
  runs: number;
  wickets: number;
}

export interface PlayerSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'batter' | 'bowler';
  title?: string;
  teamName: string;
  squadMembers: string[];
  currentSelectedName?: string;
  ineligiblePlayers?: IneligiblePlayerInfo[];
  bowlerFiguresMap?: Record<string, BowlerFigureInfo>;
  onSelectPlayer: (playerName: string) => void;
  maxOversLimit?: number;
}

export function PlayerSelectionModal({
  isOpen,
  onClose,
  type,
  title,
  teamName,
  squadMembers = [],
  currentSelectedName = '',
  ineligiblePlayers = [],
  bowlerFiguresMap = {},
  onSelectPlayer,
  maxOversLimit,
}: PlayerSelectionModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [manualName, setManualName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Standardized modal lifecycle, body scroll locking, and Escape-key listener
  useModalOverlay({ isOpen, onClose });

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setManualName('');
      setErrorMessage(null);
    }
  }, [isOpen]);

  const ineligibleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of ineligiblePlayers) {
      map.set(cleanPlayerName(item.name).toLowerCase(), item.reason);
    }
    return map;
  }, [ineligiblePlayers]);

  const cleanCurrent = cleanPlayerName(currentSelectedName).toLowerCase();

  // Filter squad by search query
  const filteredSquad = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return squadMembers;
    return squadMembers.filter((name) =>
      cleanPlayerName(name).toLowerCase().includes(q)
    );
  }, [squadMembers, searchQuery]);

  const handleSelect = (playerName: string) => {
    const clean = cleanPlayerName(playerName).trim();
    if (!clean) return;

    // Check if player is ineligible
    const ineligibilityReason = ineligibleMap.get(clean.toLowerCase());
    if (ineligibilityReason) {
      setErrorMessage(`${clean} cannot be selected: ${ineligibilityReason}`);
      return;
    }

    setErrorMessage(null);
    onSelectPlayer(clean);
    onClose();
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = cleanPlayerName(manualName).trim();
    if (!clean) {
      setErrorMessage('Please enter a valid player name.');
      return;
    }

    const ineligibilityReason = ineligibleMap.get(clean.toLowerCase());
    if (ineligibilityReason) {
      setErrorMessage(`${clean} cannot be selected: ${ineligibilityReason}`);
      return;
    }

    setErrorMessage(null);
    onSelectPlayer(clean);
    onClose();
  };

  const modalTitle = title || (type === 'batter' ? 'Select Next Batter' : 'Select Bowler');
  const accentColor = type === 'batter' ? 'emerald' : 'blue';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          variants={BACKDROP_VARIANTS}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed inset-0 !m-0 bg-slate-950/70 backdrop-blur-sm z-50 overflow-y-auto overscroll-contain flex justify-center items-end sm:items-center p-2.5 sm:p-4 min-h-full"
        >
          <motion.div
            variants={MODAL_VARIANTS}
            className="overflow-hidden bg-[var(--card)] border border-[var(--border)] shadow-floating-lg max-w-md rounded-2xl w-full flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[85vh] text-sm text-[var(--foreground)] my-auto"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 sm:px-5 py-3 shrink-0 bg-[var(--card)]">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${
                    type === 'batter'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                      : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                  }`}
                >
                  <Users className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-extrabold text-base tracking-tight text-[var(--foreground)] truncate">
                    {modalTitle}
                  </h3>
                  <p className="text-[11px] text-[var(--muted-foreground)] truncate">
                    {teamName ? `${teamName} Squad` : 'Select Player'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close Selector"
                className="btn-icon rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div className="mx-4 sm:mx-5 mt-3 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Bowler Max Limit Info Badge */}
            {type === 'bowler' && maxOversLimit !== undefined && maxOversLimit > 0 && (
              <div className="mx-4 sm:mx-5 mt-3 bg-[var(--muted)]/60 border border-[var(--border)] rounded-xl p-2.5 flex items-center justify-between text-caption">
                <div className="flex items-center gap-1.5 font-bold text-[var(--foreground)]">
                  <Shield className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>Limit: Max {maxOversLimit} overs per bowler</span>
                </div>
              </div>
            )}

            {/* Search Input (if squad has multiple members) */}
            {squadMembers.length > 5 && (
              <div className="px-4 sm:px-5 pt-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-[var(--muted-foreground)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search squad players..."
                    className="w-full bg-[var(--muted)]/60 border border-[var(--border)] rounded-xl pl-9 pr-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 text-[var(--foreground)]"
                  />
                </div>
              </div>
            )}

            {/* Scrollable Squad Members List */}
            <div className="overflow-y-auto overscroll-contain flex-1 min-h-0 px-4 sm:px-5 py-3 space-y-2">
              {squadMembers.length > 0 ? (
                <>
                  <div className="flex items-center justify-between text-[11px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider mb-1">
                    <span>Saved Squad Players ({squadMembers.length})</span>
                    <span>Status</span>
                  </div>

                  <div className="space-y-1.5">
                    {filteredSquad.map((player) => {
                      const cleanName = cleanPlayerName(player);
                      const isCurrent = cleanName.toLowerCase() === cleanCurrent;
                      const ineligibilityReason = ineligibleMap.get(cleanName.toLowerCase());
                      const isExcluded = Boolean(ineligibilityReason);
                      const figures = bowlerFiguresMap[cleanName.toLowerCase()];

                      return (
                        <button
                          key={player}
                          type="button"
                          disabled={isExcluded}
                          onClick={() => handleSelect(player)}
                          data-testid={`squad-player-option-${cleanName}`}
                          className={`w-full text-left p-2.5 sm:p-3 rounded-xl border flex items-center justify-between gap-2.5 transition-all select-none ${
                            isCurrent
                              ? 'bg-emerald-500/10 border-emerald-500/40 text-[var(--foreground)] font-bold'
                              : isExcluded
                              ? 'opacity-40 bg-[var(--muted)]/40 border-transparent cursor-not-allowed text-[var(--muted-foreground)]'
                              : 'bg-[var(--card)] hover:bg-[var(--muted)]/80 text-[var(--foreground)] border-[var(--border)] hover:border-emerald-500/40 active:scale-[0.99] cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {isCurrent ? (
                              <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-[var(--muted-foreground)]/40 shrink-0" />
                            )}
                            <span className="font-bold text-xs sm:text-sm truncate">
                              {cleanName}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {figures && (
                              <span className="text-[11px] text-[var(--muted-foreground)] num-font">
                                {figures.overs} ov ({figures.wickets}-{figures.runs})
                              </span>
                            )}

                            {isCurrent && (
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                Current
                              </span>
                            )}

                            {isExcluded && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                {ineligibilityReason}
                              </span>
                            )}

                            {!isCurrent && !isExcluded && (
                              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                Select
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                /* Empty squad fallback */
                <div className="text-center py-5 px-3 bg-[var(--muted)]/30 border border-dashed border-[var(--border)] rounded-xl space-y-1.5">
                  <Users className="w-7 h-7 mx-auto text-[var(--muted-foreground)] opacity-60" />
                  <p className="font-bold text-xs text-[var(--foreground)]">
                    No Saved Squad for {teamName || 'this team'}
                  </p>
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    Enter the player&apos;s name manually below.
                  </p>
                </div>
              )}

              {/* Manual Player Entry Section */}
              <div className="border-t border-[var(--border)] pt-3 mt-3">
                <form onSubmit={handleManualSubmit} className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-bold text-[var(--foreground)] flex items-center gap-1.5">
                      <PlusCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Enter Player Name Manually</span>
                    </label>
                    <span className="text-[10px] text-[var(--muted-foreground)]">
                      Custom / Unlisted
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={manualName}
                      onChange={(e) => {
                        setManualName(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      placeholder={`e.g. ${type === 'batter' ? 'Batter Name' : 'Bowler Name'}`}
                      className="input-field flex-1 text-xs font-semibold"
                    />
                    <button
                      type="submit"
                      disabled={!manualName.trim()}
                      className="btn-primary shrink-0 !py-2 !px-4 text-xs font-bold disabled:opacity-50 cursor-pointer"
                    >
                      Assign
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Sticky Footer */}
            <div className="border-t border-[var(--border)] bg-[var(--card)] px-4 sm:px-5 py-2.5 shrink-0 pb-safe flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary !py-2 !px-4 text-xs font-bold"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
