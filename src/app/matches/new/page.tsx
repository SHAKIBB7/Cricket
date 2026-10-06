'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Shield,
  Sliders,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  MapPin,
  Clock,
  Sparkles,
  Users,
} from 'lucide-react';
import { FeatureHubRepository } from '@/infrastructure/storage/FeatureHubRepository';
import { SavedTeam } from '@/infrastructure/database/dexie-db';
import { TeamBadgeIcon } from '@/components/common/TeamBadgeIcon';

export default function NewMatchPage() {
  const router = useRouter();

  // Basic Match Setup
  const [homeTeam, setHomeTeam] = useState('Dhaka Gladiators');
  const [awayTeam, setAwayTeam] = useState('Chittagong Kings');
  const [overs, setOvers] = useState(6);
  const [tossWinner, setTossWinner] = useState<'home' | 'away'>('home');
  const [tossDecision, setTossDecision] = useState<'Batting' | 'Bowling'>('Batting');
  const [venue, setVenue] = useState('National Stadium');

  // Advanced Match Settings
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [players, setPlayers] = useState(11);
  const [wideBall, setWideBall] = useState(true);
  const [wideReball, setWideReball] = useState(true);
  const [wideRun, setWideRun] = useState(1);
  const [noBall, setNoBall] = useState(true);
  const [noBallReball, setNoBallReball] = useState(true);
  const [noBallRun, setNoBallRun] = useState(1);
  const [isManualLimitEnabled, setIsManualLimitEnabled] = useState(false);
  const [manualOverLimit, setManualOverLimit] = useState(4);

  // Saved Teams
  const [savedTeams, setSavedTeams] = useState<SavedTeam[]>([]);
  const [showTeamModal, setShowTeamModal] = useState<'home' | 'away' | null>(null);

  // Chase Mode State (from Flutter ChaseSetupScreen)
  const [isChaseMode, setIsChaseMode] = useState(false);
  const [targetRuns, setTargetRuns] = useState(120);

  useEffect(() => {
    FeatureHubRepository.loadTeams().then((teams) => setSavedTeams(teams));
  }, []);

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();

    const actualTossWinner = isChaseMode ? homeTeam.trim() || 'Chasing Team' : (tossWinner === 'home' ? homeTeam.trim() : awayTeam.trim());
    const actualTossDecision = isChaseMode ? 'Batting' : tossDecision;

    const setupData = {
      teamA: homeTeam.trim() || 'Team A',
      teamB: awayTeam.trim() || 'Team B',
      overs: Number(overs) || 6,
      tossWinner: actualTossWinner,
      tossDecision: actualTossDecision,
      venue: venue.trim() || 'Cricket Ground',
      isChaseMode,
      targetScore: isChaseMode ? Number(targetRuns) || 100 : undefined,
      advancedSettings: {
        players: Number(players) || 11,
        wideBall,
        wideReball,
        wideRun: Number(wideRun) || 1,
        noBall,
        noBallReball,
        noBallRun: Number(noBallRun) || 1,
        isManualLimitEnabled,
        manualOverLimit: Number(manualOverLimit) || 4,
        venue: venue.trim(),
        matchType: isChaseMode ? 'CHASE' : 'LIMITED_OVERS',
      },
    };

    sessionStorage.setItem('pending_match_setup', JSON.stringify(setupData));
    router.push('/matches/opening-players');
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4 sm:space-y-6">
      {/* Title & Mode Switcher */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-600/10 text-emerald-600 flex items-center justify-center font-bold shrink-0">
            <Clock className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight">New Match Setup</h1>
            <p className="text-[11px] sm:text-xs text-[var(--muted-foreground)]">Step 1 of 2: Teams, Overs, Toss & Rules</p>
          </div>
        </div>

        {/* Chase Mode Toggle Button (from Flutter new_match_screen) */}
        <button
          type="button"
          onClick={() => setIsChaseMode(!isChaseMode)}
          className={`w-full sm:w-auto px-3.5 py-2 rounded-xl sm:rounded-full border text-xs font-bold flex items-center justify-center gap-2 min-h-[42px] transition-all active:scale-[0.98] ${
            isChaseMode
              ? 'bg-amber-500/15 border-amber-500 text-amber-500 shadow-xs'
              : 'bg-[var(--card)] hover:bg-[var(--muted)] border-[var(--border)] text-[var(--foreground)]'
          }`}
          title="Toggle Target Chase Mode"
        >
          <img
            src="/assets/illustrations/chase_batsman.png"
            alt="Chase Mode"
            className="w-4 h-4 sm:w-5 sm:h-5 object-contain"
          />
          <span>{isChaseMode ? '🎯 Chase Mode Active' : 'Chase Mode'}</span>
        </button>
      </div>

      <form onSubmit={handleNext} className="space-y-4 sm:space-y-5">
        {/* Chase Mode Target Banner */}
        {isChaseMode && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-fadeIn">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                <img
                  src="/assets/illustrations/chase_batsman.png"
                  alt="Target Chase"
                  className="w-7 h-7 object-contain"
                />
              </div>
              <div>
                <h4 className="font-extrabold text-sm text-amber-500">Target Chase Mode Setup</h4>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Chasing {targetRuns || 1} runs in {overs} ov • Required Run Rate: {(targetRuns / (Number(overs) || 1)).toFixed(2)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[var(--muted-foreground)]">Target Runs:</span>
              <input
                type="number"
                min={1}
                max={999}
                value={targetRuns}
                onChange={(e) => setTargetRuns(Math.max(1, Number(e.target.value)))}
                className="w-24 px-3 py-1.5 rounded-lg bg-[var(--card)] border border-amber-500/40 font-black text-center text-sm text-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>
        )}

        {/* ── TEAMS SECTION ── */}
        <div className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] space-y-3.5 sm:space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Teams
            </span>
            {savedTeams.length > 0 && (
              <span className="text-[11px] sm:text-xs text-[var(--muted-foreground)]">
                Select from saved teams
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {/* Home / Chasing Team */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--muted-foreground)] flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <TeamBadgeIcon type="home" size="xs" showLabel />
                  <span>{isChaseMode ? 'Chasing Team (Batting)' : 'Home Team'}</span>
                </span>
                {savedTeams.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowTeamModal('home')}
                    className="text-[11px] text-emerald-600 hover:underline flex items-center gap-1 font-semibold min-h-[32px]"
                  >
                    <Users className="w-3 h-3" /> Pick
                  </button>
                )}
              </label>
              <div className="relative flex items-center">
                <div className="absolute left-3 pointer-events-none">
                  <TeamBadgeIcon type="home" size="sm" />
                </div>
                <input
                  type="text"
                  required
                  value={homeTeam}
                  onChange={(e) => setHomeTeam(e.target.value)}
                  placeholder={isChaseMode ? 'e.g. Dhaka Gladiators (Chasing)' : 'e.g. Dhaka Gladiators'}
                  className="w-full pl-11 sm:pl-12 pr-3.5 py-2.5 rounded-xl bg-[var(--muted)] border border-[var(--border)] font-bold text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Away / Defending Team */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--muted-foreground)] flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <TeamBadgeIcon type="away" size="xs" showLabel />
                  <span>{isChaseMode ? 'Defending Team (Bowling)' : 'Away Team'}</span>
                </span>
                {savedTeams.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowTeamModal('away')}
                    className="text-[11px] text-emerald-600 hover:underline flex items-center gap-1 font-semibold min-h-[32px]"
                  >
                    <Users className="w-3 h-3" /> Pick
                  </button>
                )}
              </label>
              <div className="relative flex items-center">
                <div className="absolute left-3 pointer-events-none">
                  <TeamBadgeIcon type="away" size="sm" />
                </div>
                <input
                  type="text"
                  required
                  value={awayTeam}
                  onChange={(e) => setAwayTeam(e.target.value)}
                  placeholder={isChaseMode ? 'e.g. Chittagong Kings (Defending)' : 'e.g. Chittagong Kings'}
                  className="w-full pl-11 sm:pl-12 pr-3.5 py-2.5 rounded-xl bg-[var(--muted)] border border-[var(--border)] font-bold text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Overs & Venue */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--muted-foreground)]">
                Match Overs (1 - 90)
              </label>
              <div className="flex items-center gap-1.5 sm:gap-2">
                {[5, 6, 10, 20].map((quickOver) => (
                  <button
                    key={quickOver}
                    type="button"
                    onClick={() => setOvers(quickOver)}
                    className={`flex-1 py-2 rounded-lg sm:rounded-xl text-xs font-bold border min-h-[40px] transition-colors ${
                      overs === quickOver
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)] hover:border-emerald-500/40'
                    }`}
                  >
                    {quickOver} Ov
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={1}
                max={90}
                required
                value={overs}
                onChange={(e) => setOvers(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--muted)] border border-[var(--border)] font-bold text-sm min-h-[42px] focus:outline-none focus:ring-2 focus:ring-emerald-500 mt-1"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--muted-foreground)] flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> Venue
              </label>
              <input
                type="text"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="Ground name"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--muted)] border border-[var(--border)] text-sm min-h-[42px] focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* ── TOSS SECTION ── */}
        <div className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] space-y-3.5 sm:space-y-4 shadow-xs">
          <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Toss Results
          </span>

          {isChaseMode ? (
            <div className="p-3.5 sm:p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
              <img
                src="/assets/illustrations/chase_batsman.png"
                alt="Chase"
                className="w-8 h-8 object-contain shrink-0"
              />
              <div>
                <p className="text-xs font-extrabold text-amber-500">Toss Bypassed in Chase Mode</p>
                <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
                  <strong className="text-[var(--foreground)]">{homeTeam || 'Chasing Team'}</strong> will bat immediately in 2nd Innings chasing {targetRuns} runs against <strong className="text-[var(--foreground)]">{awayTeam || 'Defending Team'}</strong>.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-[var(--muted-foreground)] mb-2">Who won the toss?</p>
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => setTossWinner('home')}
                    className={`p-2 sm:p-3 rounded-xl border text-left font-bold text-xs sm:text-sm transition-all flex items-center gap-1.5 sm:gap-3 min-h-[52px] ${
                      tossWinner === 'home'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-xs'
                        : 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]'
                    }`}
                  >
                    <div className="shrink-0">
                      <TeamBadgeIcon type="home" size="sm" />
                    </div>
                    <div className="overflow-hidden min-w-0">
                      <span className="block truncate text-xs sm:text-sm font-extrabold">{homeTeam || 'Home Team'}</span>
                      <span className="text-[9px] sm:text-[10px] uppercase font-bold text-emerald-500 dark:text-emerald-400 block truncate">
                        Host Stadium
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTossWinner('away')}
                    className={`p-2 sm:p-3 rounded-xl border text-left font-bold text-xs sm:text-sm transition-all flex items-center gap-1.5 sm:gap-3 min-h-[52px] ${
                      tossWinner === 'away'
                        ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]'
                    }`}
                  >
                    <div className="shrink-0">
                      <TeamBadgeIcon type="away" size="sm" />
                    </div>
                    <div className="overflow-hidden min-w-0">
                      <span className="block truncate text-xs sm:text-sm font-extrabold">{awayTeam || 'Away Team'}</span>
                      <span className="text-[9px] sm:text-[10px] uppercase font-bold text-blue-500 dark:text-blue-400 block truncate">
                        Visiting Plane
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-[var(--muted-foreground)] mb-2">Toss decision</p>
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => setTossDecision('Batting')}
                    className={`p-2 sm:p-3 rounded-xl border text-center font-bold text-[11px] xs:text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 sm:gap-2 min-h-[46px] ${
                      tossDecision === 'Batting'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-xs'
                        : 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]'
                    }`}
                  >
                    <img
                      src="/assets/illustrations/st_bat.png"
                      alt="Bat"
                      className="w-4 h-4 object-contain shrink-0"
                    />
                    <span className="truncate">Elected to Bat</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTossDecision('Bowling')}
                    className={`p-2 sm:p-3 rounded-xl border text-center font-bold text-[11px] xs:text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 sm:gap-2 min-h-[46px] ${
                      tossDecision === 'Bowling'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-xs'
                        : 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]'
                    }`}
                  >
                    <img
                      src="/assets/illustrations/opening_bowler.png"
                      alt="Bowl"
                      className="w-4 h-4 object-contain shrink-0"
                    />
                    <span className="truncate">Elected to Bowl</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── ADVANCED SETTINGS ACCORDION ── */}
        <div className="rounded-xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] overflow-hidden shadow-xs">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between p-3.5 sm:p-4 text-xs sm:text-sm font-bold text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors min-h-[46px]"
          >
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-600" />
              <span>Advanced Cricket Rules</span>
            </div>
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showAdvanced && (
            <div className="p-4 sm:p-5 border-t border-[var(--border)] space-y-3.5 sm:space-y-4 text-xs sm:text-sm">
              {/* Players per team */}
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-xs sm:text-sm">Players per team</div>
                  <div className="text-[11px] sm:text-xs text-[var(--muted-foreground)]">Standard limit 2 to 20 players</div>
                </div>
                <input
                  type="number"
                  min={2}
                  max={20}
                  value={players}
                  onChange={(e) => setPlayers(Number(e.target.value))}
                  className="w-20 px-3 py-1.5 rounded-lg bg-[var(--muted)] border border-[var(--border)] font-bold text-center shrink-0"
                />
              </div>

              {/* Wide Ball Rules */}
              <div className="pt-3 border-t border-[var(--border)] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-xs sm:text-sm">Wide Ball Enabled</div>
                    <div className="text-[11px] sm:text-xs text-[var(--muted-foreground)]">Awards extra runs to batting team</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={wideBall}
                    onChange={(e) => setWideBall(e.target.checked)}
                    className="w-5 h-5 accent-emerald-600 rounded shrink-0"
                  />
                </div>

                {wideBall && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 pl-2 sm:pl-4">
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={wideReball}
                        onChange={(e) => setWideReball(e.target.checked)}
                        className="w-4 h-4 accent-emerald-600"
                      />
                      <span>Re-ball delivery</span>
                    </label>

                    <div className="flex items-center gap-2 text-xs">
                      <span>Penalty:</span>
                      <input
                        type="number"
                        min={1}
                        value={wideRun}
                        onChange={(e) => setWideRun(Number(e.target.value))}
                        className="w-14 px-2 py-1 rounded bg-[var(--muted)] border font-bold text-center"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* No Ball Rules */}
              <div className="pt-3 border-t border-[var(--border)] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-xs sm:text-sm">No Ball Enabled</div>
                    <div className="text-[11px] sm:text-xs text-[var(--muted-foreground)]">Awards extra run and triggers Free Hit</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={noBall}
                    onChange={(e) => setNoBall(e.target.checked)}
                    className="w-5 h-5 accent-emerald-600 rounded shrink-0"
                  />
                </div>

                {noBall && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 pl-2 sm:pl-4">
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={noBallReball}
                        onChange={(e) => setNoBallReball(e.target.checked)}
                        className="w-4 h-4 accent-emerald-600"
                      />
                      <span>Re-ball delivery</span>
                    </label>

                    <div className="flex items-center gap-2 text-xs">
                      <span>Penalty:</span>
                      <input
                        type="number"
                        min={1}
                        value={noBallRun}
                        onChange={(e) => setNoBallRun(Number(e.target.value))}
                        className="w-14 px-2 py-1 rounded bg-[var(--muted)] border font-bold text-center"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Bowler Over Limit */}
              <div className="pt-3 border-t border-[var(--border)] space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-xs sm:text-sm">Manual Bowler Limit</div>
                    <div className="text-[11px] sm:text-xs text-[var(--muted-foreground)]">
                      Default is ceil(overs / 5) = {Math.ceil(overs / 5)} overs max
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={isManualLimitEnabled}
                    onChange={(e) => setIsManualLimitEnabled(e.target.checked)}
                    className="w-5 h-5 accent-emerald-600 rounded"
                  />
                </div>

                {isManualLimitEnabled && (
                  <div className="flex items-center gap-2 text-xs pl-4">
                    <span>Max Overs Per Bowler:</span>
                    <input
                      type="number"
                      min={1}
                      max={overs}
                      value={manualOverLimit}
                      onChange={(e) => setManualOverLimit(Number(e.target.value))}
                      className="w-16 px-2 py-1 rounded bg-[var(--muted)] border font-bold text-center"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm sm:text-base min-h-[50px] shadow-lg shadow-emerald-600/30 transition-all hover:scale-[1.01] active:scale-[0.99]"
        >
          <span>Next: Opening Players</span>
          <ArrowRight className="w-5 h-5" />
        </button>
      </form>

      {/* ── SAVED TEAM PICKER MODAL ── */}
      {showTeamModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-[var(--card)] p-4 sm:p-5 border border-[var(--border)] shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">Select Saved Team</h3>
              <button
                onClick={() => setShowTeamModal(null)}
                className="text-xs text-[var(--muted-foreground)] hover:underline p-1"
              >
                Close
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-2">
              {savedTeams.map((team) => (
                <button
                  key={team.id}
                  onClick={() => {
                    if (showTeamModal === 'home') setHomeTeam(team.name);
                    else setAwayTeam(team.name);
                    setShowTeamModal(null);
                  }}
                  className="w-full text-left p-3 rounded-xl border border-[var(--border)] hover:bg-[var(--muted)] flex items-center justify-between"
                >
                  <span className="font-bold text-sm">{team.name}</span>
                  <span className="text-xs text-[var(--muted-foreground)]">{team.players.length} players</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
