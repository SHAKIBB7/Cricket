'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { X, Users, CheckCircle2, AlertTriangle, Shield, Search, PlusCircle, UserCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { cleanPlayerName } from '@/domain/cricket/formatters';
import { UnifiedSheet } from '@/components/overlay/UnifiedSheet';
import { useLanguage } from '@/context/LanguageContext';

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

/** Live match context for the bowler page's innings strip (score page composes the text). */
export interface LiveStripInfo {
  /** e.g. "OVER 3.0 / 10 Ov — 30%" */
  overText: string;
  /** 0–100 innings completion. */
  pct: number;
  /** e.g. "PALASH 86/3" */
  scoreText: string;
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
  liveStrip?: LiveStripInfo;
}

/** Balls bowled from a cricket overs string ("3.2" = 3 overs 2 balls = 20). */
export function bowlerBallsBowled(figures: BowlerFigureInfo): number {
  const [whole, part] = String(figures.overs).split('.');
  const overs = Number.parseInt(whole, 10) || 0;
  const balls = Number.parseInt(part ?? '0', 10) || 0;
  return overs * 6 + balls;
}

/** Economy rate (runs per 6 balls); null before the bowler has bowled a ball. */
export function bowlerEconomy(figures: BowlerFigureInfo): number | null {
  const balls = bowlerBallsBowled(figures);
  if (balls <= 0) return null;
  return figures.runs / (balls / 6);
}

/**
 * Full overs the bowler can still START under the per-bowler limit.
 * A part-bowled over already consumes its slot.
 */
export function bowlerOversRemaining(figures: BowlerFigureInfo, maxOversLimit: number): number {
  const balls = bowlerBallsBowled(figures);
  const oversStarted = Math.ceil(balls / 6);
  return Math.max(0, maxOversLimit - oversStarted);
}

const AVATAR_PALETTE = [
  'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
] as const;

function avatarClasses(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

/** Column template shared by the bowler grid header and its rows. */
const BOWLER_GRID_COLS =
  'grid-cols-[minmax(0,1fr)_1.7rem_2rem_2rem_2.7rem_4.2rem]';

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
  liveStrip,
}: PlayerSelectionModalProps) {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [manualName, setManualName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Lifecycle (scroll lock, Escape) is owned by UnifiedSheet, which
  // funnels Escape through onClose exactly as useModalOverlay did.

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
      setErrorMessage(`${clean} ${t('psm_cannot_mid', 'cannot be selected:')} ${ineligibilityReason}`);
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
      setErrorMessage(t('psm_err_name', 'Please enter a valid player name.'));
      return;
    }

    const ineligibilityReason = ineligibleMap.get(clean.toLowerCase());
    if (ineligibilityReason) {
      setErrorMessage(`${clean} ${t('psm_cannot_mid', 'cannot be selected:')} ${ineligibilityReason}`);
      return;
    }

    setErrorMessage(null);
    onSelectPlayer(clean);
    onClose();
  };

  // The manual entry sits at the bottom of the scroll area; once the
  // keyboard has settled, centre the field inside the visible region so
  // the typed name is never hidden behind it (bug report 2026-11-10).
  const handleManualFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    window.setTimeout(() => {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 350);
  };

  const modalTitle = title || (type === 'batter' ? t('psm_next_batter', 'Select Next Batter') : t('select_bowler', 'Select Bowler'));
  const accentColor = type === 'batter' ? 'emerald' : 'blue';
  void accentColor;

  const searchBlock = squadMembers.length > 5 && (
    <div className="px-4 sm:px-5 pt-3">
      <div className="relative">
        <Search className="w-4 h-4 text-[var(--muted-foreground)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('psm_search_ph', 'Search squad players...')}
          className="w-full bg-muted/60 border border-[var(--border)] rounded-xl pl-9 pr-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 text-[var(--foreground)] shadow-inset"
        />
      </div>
    </div>
  );

  const errorBlock = errorMessage && (
    <div className="mx-4 sm:mx-5 mt-3 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-2">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span>{errorMessage}</span>
    </div>
  );

  const manualForm = (
    <form onSubmit={handleManualSubmit} className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <label className="font-bold text-[var(--foreground)] flex items-center gap-1.5">
          <PlusCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>{t('psm_manual_label', 'Enter Player Name Manually')}</span>
        </label>
        <span className="text-[10px] text-[var(--muted-foreground)]">
          {t('psm_custom_unlisted', 'Custom / Unlisted')}
        </span>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={manualName}
          onFocus={handleManualFocus}
          onChange={(e) => {
            setManualName(e.target.value);
            if (errorMessage) setErrorMessage(null);
          }}
          placeholder={`e.g. ${type === 'batter' ? t('psm_batter_name', 'Batter Name') : t('psm_bowler_name', 'Bowler Name')}`}
          className="input-field flex-1 text-xs font-semibold shadow-inset"
        />
        <button
          type="submit"
          disabled={!manualName.trim()}
          className="btn-primary shrink-0 !py-2 !px-4 text-xs font-bold disabled:opacity-50 cursor-pointer shadow-elev2"
        >
          {t('psm_assign', 'Assign')}
        </button>
      </div>
    </form>
  );

  const emptySquadBlock = (
    <div className="text-center py-5 px-3 bg-muted/30 border border-dashed border-[var(--border)] rounded-xl space-y-1.5">
      <Users className="w-7 h-7 mx-auto text-[var(--muted-foreground)] opacity-60" />
      <p className="font-bold text-xs text-[var(--foreground)]">
        {t('psm_no_squad_pre', 'No Saved Squad for')} {teamName || t('psm_this_team', 'this team')}
      </p>
      <p className="text-[11px] text-[var(--muted-foreground)]">
        {t('psm_empty_hint', "Enter the player's name manually below.")}
      </p>
    </div>
  );

  /* ── Bowler: full-page enterprise grid (approved design 2026-11-10) ── */
  if (type === 'bowler') {
    return (
      <UnifiedSheet
        open={isOpen}
        onClose={onClose}
        overlayId="player-selection-sheet"
        ariaLabel={modalTitle}
        presentation="page"
        dismissOnBackdrop={false}
        header={
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 sm:px-5 py-3 shrink-0 bg-[var(--card)]">
            <button
              type="button"
              onClick={onClose}
              aria-label={t('psm_close', 'Close Selector')}
              className="btn-icon rounded-xl -ml-1.5 shrink-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
              <Users className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-extrabold text-base tracking-tight text-[var(--foreground)] truncate">
                {modalTitle}
              </h3>
              <p className="text-[11px] text-[var(--muted-foreground)] truncate">
                {teamName ? `${teamName} ${t('psm_squad_suffix', 'Squad')}` : t('psm_select_player', 'Select Player')}
              </p>
            </div>
            {maxOversLimit !== undefined && maxOversLimit > 0 && (
              <span className="hidden min-[420px]:inline-flex items-center gap-1 shrink-0 max-w-[36vw] text-[10px] font-bold text-[var(--foreground)] bg-muted/60 border border-[var(--border)] rounded-full px-2 py-1">
                <Shield className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="truncate">{t('psm_limit_pre', 'Limit: Max')} {maxOversLimit} {t('psm_limit_post', 'overs per bowler')}</span>
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={t('psm_close', 'Close Selector')}
              className="btn-icon rounded-xl shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        }
      >
        <div className="flex min-h-full flex-col">
          {errorBlock}

          {/* Live innings strip — dynamic match context */}
          {liveStrip && (
            <div className="mx-4 sm:mx-5 mt-3 rounded-xl bg-gradient-to-r from-emerald-950 via-emerald-900 to-emerald-950 text-white px-3.5 py-2.5 shadow-elev1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <span className="text-white/85 shrink-0">{t('mp_innings_progress', 'INNINGS PROGRESS')}</span>
                  <span className="num-font text-white truncate">{liveStrip.overText}</span>
                </div>
                <span className="shrink-0 max-w-[42%] truncate text-[10px] font-extrabold num-font bg-emerald-400/20 text-emerald-300 px-2 py-0.5 rounded-md">
                  {liveStrip.scoreText}
                </span>
              </div>
              <div className="mt-2 h-1 rounded-full bg-white/15 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, liveStrip.pct))}%` }}
                />
              </div>
            </div>
          )}

          {searchBlock}

          {/* Enterprise grid */}
          {squadMembers.length > 0 ? (
            <div className="mt-3">
              <div
                className={`grid ${BOWLER_GRID_COLS} items-center gap-x-1.5 px-4 sm:px-5 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]`}
                aria-hidden="true"
              >
                <span>{t('psm_col_player', 'Player')}</span>
                <span className="text-right">{t('psm_col_ov', 'Ov')}</span>
                <span className="text-right">{t('psm_col_runs', 'Runs')}</span>
                <span className="text-right">{t('psm_col_wkts', 'Wkts')}</span>
                <span className="text-right">{t('psm_col_econ', 'Econ')}</span>
                <span className="text-right">{t('psm_status', 'Status')}</span>
              </div>
              <div className="border-t border-[var(--border)]">
                {filteredSquad.map((player) => {
                  const cleanName = cleanPlayerName(player);
                  const isCurrent = cleanName.toLowerCase() === cleanCurrent;
                  const ineligibilityReason = ineligibleMap.get(cleanName.toLowerCase());
                  const isExcluded = Boolean(ineligibilityReason);
                  const figures = bowlerFiguresMap[cleanName.toLowerCase()];
                  const econ = figures ? bowlerEconomy(figures) : null;
                  const remaining =
                    figures && maxOversLimit !== undefined && maxOversLimit > 0
                      ? bowlerOversRemaining(figures, maxOversLimit)
                      : null;

                  return (
                    <button
                      key={player}
                      type="button"
                      disabled={isExcluded}
                      onClick={() => handleSelect(player)}
                      data-testid={`squad-player-option-${cleanName}`}
                      className={`relative grid ${BOWLER_GRID_COLS} items-center gap-x-1.5 w-full text-left px-4 sm:px-5 py-2.5 border-b border-[var(--border)] transition-all select-none ${
                        isCurrent
                          ? 'bg-emerald-500/[0.07]'
                          : isExcluded
                          ? 'opacity-50 cursor-not-allowed'
                          : 'hover:bg-muted/60 active:bg-muted cursor-pointer'
                      }`}
                    >
                      {isCurrent && (
                        <span className="absolute inset-y-0 left-0 w-[3px] bg-emerald-500" aria-hidden="true" />
                      )}
                      {/* Player cell */}
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-extrabold shrink-0 ${
                            isCurrent
                              ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                              : avatarClasses(cleanName)
                          }`}
                          aria-hidden="true"
                        >
                          {cleanName.charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-bold text-[13px] sm:text-sm text-[var(--foreground)] truncate">
                            {cleanName}
                          </span>
                          {remaining !== null ? (
                            <span className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)] num-font">
                              {maxOversLimit !== undefined && maxOversLimit <= 6 && (
                                <span className="flex items-center gap-[3px]" aria-hidden="true">
                                  {Array.from({ length: maxOversLimit }).map((_, i) => (
                                    <span
                                      key={i}
                                      className={`w-1.5 h-1.5 rounded-full ${
                                        i < remaining ? 'bg-emerald-500' : 'bg-muted-foreground/25'
                                      }`}
                                    />
                                  ))}
                                </span>
                              )}
                              <span>
                                {remaining} {t('psm_ov_left', 'ov left')}
                              </span>
                            </span>
                          ) : !figures ? (
                            <span className="block text-[10px] text-[var(--muted-foreground)]">
                              {t('psm_yet_to_bowl', 'Yet to bowl')}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      {/* Figures cells */}
                      <span className="text-right text-[13px] num-font text-[var(--foreground)]">
                        {figures ? figures.overs : '0.0'}
                      </span>
                      <span className="text-right text-[13px] num-font text-[var(--foreground)]">
                        {figures ? figures.runs : 0}
                      </span>
                      <span className="text-right text-[13px] num-font text-[var(--foreground)]">
                        {figures ? figures.wickets : 0}
                      </span>
                      <span className="text-right text-[13px] num-font text-[var(--muted-foreground)]">
                        {econ !== null ? econ.toFixed(2) : '—'}
                      </span>
                      {/* Status cell */}
                      <span className="flex flex-col items-end gap-0.5">
                        {isCurrent ? (
                          <>
                            <span className="text-[9px] sm:text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                              {t('psm_bowling_now', 'Bowling now')}
                            </span>
                            {ineligibilityReason && (
                              <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                                {ineligibilityReason}
                              </span>
                            )}
                          </>
                        ) : isExcluded ? (
                          <span className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20 whitespace-nowrap">
                            {ineligibilityReason}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                            {t('psm_select', 'Select')}
                            <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="px-4 sm:px-5 pt-3">{emptySquadBlock}</div>
          )}

          {/* Sticky bottom bar: manual entry + cancel */}
          <div className="mt-auto sticky bottom-0 border-t border-[var(--border)] bg-[var(--card)] px-4 sm:px-5 py-3">
            {manualForm}
            <div className="flex justify-end mt-2.5">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary !py-2 !px-4 text-xs font-bold"
              >
                {t('cancel', 'Cancel')}
              </button>
            </div>
          </div>
        </div>
      </UnifiedSheet>
    );
  }

  /* ── Batter: established sheet + list ── */
  return (
    <UnifiedSheet
      open={isOpen}
      onClose={onClose}
      overlayId="player-selection-sheet"
      ariaLabel={modalTitle}
      detents={[0.5, 0.92]}
      initialDetent={0}
      dismissOnBackdrop={false}
      header={
        <>
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
                    {teamName ? `${teamName} ${t('psm_squad_suffix', 'Squad')}` : t('psm_select_player', 'Select Player')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t('psm_close', 'Close Selector')}
                className="btn-icon rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
        </>
      }
    >

            {/* Error Banner */}
            {errorBlock}

            {/* Search Input (if squad has multiple members) */}
            {searchBlock}

            {/* Scrollable Squad Members List */}
            <div className="overflow-y-auto overscroll-contain flex-1 min-h-0 px-4 sm:px-5 py-3 space-y-2">
              {squadMembers.length > 0 ? (
                <>
                  <div className="flex items-center justify-between text-[11px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider mb-1">
                    <span>{t('psm_saved_squad', 'Saved Squad Players')} ({squadMembers.length})</span>
                    <span>{t('psm_status', 'Status')}</span>
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
                              ? 'opacity-40 bg-muted/40 border-transparent cursor-not-allowed text-[var(--muted-foreground)]'
                              : 'bg-[var(--card)] hover:bg-muted/80 text-[var(--foreground)] border-[var(--border)] hover:border-emerald-500/40 active:scale-[0.99] cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {isCurrent ? (
                              <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-muted-foreground/40 shrink-0" />
                            )}
                            <span className="font-bold text-xs sm:text-sm truncate">
                              {cleanName}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {figures && (
                              <span className="text-[11px] text-[var(--muted-foreground)] num-font">
                                {figures.overs} {t('dls_ov_suffix', 'ov')} ({figures.wickets}-{figures.runs})
                              </span>
                            )}

                            {isCurrent && (
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                {t('psm_current', 'Current')}
                              </span>
                            )}

                            {isExcluded && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                {ineligibilityReason}
                              </span>
                            )}

                            {!isCurrent && !isExcluded && (
                              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                {t('psm_select', 'Select')}
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
                emptySquadBlock
              )}

              {/* Manual Player Entry Section */}
              <div className="border-t border-[var(--border)] pt-3 mt-3">
                {manualForm}
              </div>
            </div>

            {/* Sticky Footer */}
            <div className="border-t border-[var(--border)] bg-[var(--card)] px-4 sm:px-5 py-2.5 shrink-0 pb-safe flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary !py-2 !px-4 text-xs font-bold"
              >
                {t('cancel', 'Cancel')}
              </button>
            </div>
    </UnifiedSheet>
  );
}
