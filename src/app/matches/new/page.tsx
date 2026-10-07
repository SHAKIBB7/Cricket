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
    <div className="w-full max-w-6xl 2xl:max-w-7xl mx-auto flex flex-col gap-4 short:gap-3">
      {/* ── TOP HEADER & MODE CONTROLS ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--card)] border border-[var(--border)] rounded-2xl p-3.5 sm:p-4 shadow-floating">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-600/10 flex items-center justify-center font-bold shrink-0 rounded-xl text-emerald-600 w-10 h-10">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-black tracking-tight text-h2 leading-tight">New Match Setup</h1>
            <p className="text-caption text-[var(--muted-foreground)]">Step 1 of 2: Teams, Overs, Toss & Rules</p>
          </div>
        </div>

        {/* Chase Mode Toggle Button */}
        <button
          type="button"
          onClick={() => setIsChaseMode(!isChaseMode)}
          className={`px-4 py-2 rounded-xl border text-caption font-bold flex items-center justify-center gap-2 min-h-btn-sm transition-all active:scale-[0.98] ${
            isChaseMode
              ? 'bg-amber-500/15 border-amber-500 text-amber-500 shadow-sm'
              : 'bg-[var(--card)] hover:bg-[var(--muted)] border-[var(--border)] text-[var(--foreground)]'
          }`}
          title="Toggle Target Chase Mode"
        >
          <img
            src="/assets/illustrations/chase_batsman.png"
            alt="Chase Mode"
            className="object-contain w-4 h-4"
          />
          <span>{isChaseMode ? '🎯 Chase Mode Active' : 'Target Chase Mode'}</span>
        </button>
      </div>

      {/* Chase Mode Target Banner */}
      {isChaseMode && (
        <div className="bg-amber-500/10 border border-amber-500/30 flex justify-between items-center flex-wrap rounded-2xl p-3.5 sm:p-4 gap-3 animate-fadeIn shadow-floating">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500/20 flex items-center justify-center shrink-0 rounded-xl w-9 h-9">
              <img
                src="/assets/illustrations/chase_batsman.png"
                alt="Target Chase"
                className="object-contain w-6 h-6"
              />
            </div>
            <div>
              <h4 className="font-extrabold text-body-small">Target Chase Mode Setup</h4>
              <p className="text-caption text-[var(--muted-foreground)]">
                Chasing {targetRuns || 1} runs in {overs} ov • Required Run Rate: {(targetRuns / (Number(overs) || 1)).toFixed(2)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-bold text-caption">Target Runs:</span>
            <input
              type="number"
              min={1}
              max={999}
              value={targetRuns}
              onChange={(e) => setTargetRuns(Math.max(1, Number(e.target.value)))}
              className="bg-[var(--card)] border border-amber-500/40 font-black focus:outline-none focus:ring-2 focus:ring-amber-500 py-1.5 rounded-lg text-body-small w-24 px-3 text-center"
            />
          </div>
        </div>
      )}

      {/* ── RESPONSIVE FLOATING WORKSPACE FORM ── */}
      <form onSubmit={handleNext} className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-start">
        {/* LEFT COLUMN: TEAMS & OVERS (7 cols on Desktop) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Teams Selection Card */}
          <div className="floating-card p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="font-bold uppercase tracking-wider text-caption text-emerald-600 dark:text-emerald-400">
                  Participating Teams
                </span>
              </div>
              {savedTeams.length > 0 && (
                <span className="text-caption text-[var(--muted-foreground)] font-medium">
                  {savedTeams.length} teams available
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Home / Chasing Team */}
              <div className="space-y-1.5">
                <label className="font-semibold flex items-center justify-between text-caption">
                  <span className="flex items-center gap-1.5 truncate">
                    <TeamBadgeIcon type="home" size="xs" showLabel />
                    <span className="truncate">{isChaseMode ? 'Chasing Team (Batting)' : 'Home Team'}</span>
                  </span>
                  {savedTeams.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowTeamModal('home')}
                      className="hover:underline flex items-center font-bold text-emerald-600 text-[11px] gap-1 shrink-0 ml-1"
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
                    className="bg-[var(--muted)] border border-[var(--border)] font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 pr-3.5 py-2.5 rounded-xl min-h-btn w-full pl-11 text-body-small"
                  />
                </div>
              </div>

              {/* Away / Defending Team */}
              <div className="space-y-1.5">
                <label className="font-semibold flex items-center justify-between text-caption">
                  <span className="flex items-center gap-1.5 truncate">
                    <TeamBadgeIcon type="away" size="xs" showLabel />
                    <span className="truncate">{isChaseMode ? 'Defending Team (Bowling)' : 'Away Team'}</span>
                  </span>
                  {savedTeams.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowTeamModal('away')}
                      className="hover:underline flex items-center font-bold text-blue-600 dark:text-blue-400 text-[11px] gap-1 shrink-0 ml-1"
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
                    className="bg-[var(--muted)] border border-[var(--border)] font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 pr-3.5 py-2.5 rounded-xl min-h-btn w-full pl-11 text-body-small"
                  />
                </div>
              </div>
            </div>

            {/* Quick Saved Team Pickers */}
            {savedTeams.length > 0 && (
              <div className="pt-1 border-t border-[var(--border)]/60">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] block mb-1.5">
                  Quick Pick Saved Teams:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {savedTeams.slice(0, 5).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        if (homeTeam === t.name) setAwayTeam(t.name);
                        else setHomeTeam(t.name);
                      }}
                      className="text-caption font-semibold px-2.5 py-1 rounded-lg bg-[var(--muted)] hover:bg-emerald-500/10 hover:text-emerald-600 transition-colors border border-[var(--border)]"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Match Overs & Venue Card */}
          <div className="floating-card p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2.5">
              <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="font-bold uppercase tracking-wider text-caption text-emerald-600 dark:text-emerald-400">
                Match Overs & Venue
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Overs Selection */}
              <div className="space-y-1.5">
                <label className="font-semibold text-caption block">
                  Match Overs (1 - 90)
                </label>
                <div className="flex items-center gap-1.5">
                  {[5, 6, 10, 20].map((quickOver) => (
                    <button
                      key={quickOver}
                      type="button"
                      onClick={() => setOvers(quickOver)}
                      className={`flex-1 py-1.5 rounded-lg text-caption font-bold border transition-colors ${
                        overs === quickOver
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
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
                  className="bg-[var(--muted)] border border-[var(--border)] font-black focus:outline-none focus:ring-2 focus:ring-emerald-500 px-3.5 py-2 rounded-xl w-full text-body-small mt-1 text-center"
                />
              </div>

              {/* Venue Selection */}
              <div className="space-y-1.5">
                <label className="font-semibold flex items-center text-caption gap-1">
                  <MapPin className="w-3.5 h-3.5" /> Stadium / Venue
                </label>
                <input
                  type="text"
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  placeholder="e.g. National Stadium"
                  className="bg-[var(--muted)] border border-[var(--border)] font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 px-3.5 py-2.5 rounded-xl min-h-[42px] w-full text-body-small mt-1"
                />
                <span className="text-[11px] text-[var(--muted-foreground)] block">
                  Ground name recorded in match scorecard
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: TOSS, RULES & ACTION (5 cols on Desktop) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* Toss Results Card */}
          <div className="floating-card p-4 sm:p-5 space-y-3.5">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
              <span className="font-bold uppercase tracking-wider text-caption text-emerald-600 dark:text-emerald-400">
                Toss Results
              </span>
              <span className="text-[11px] text-[var(--muted-foreground)] font-semibold">
                {isChaseMode ? 'Pre-set' : 'Coin Toss'}
              </span>
            </div>

            {isChaseMode ? (
              <div className="bg-amber-500/10 border border-amber-500/20 flex items-center p-3 rounded-xl gap-3">
                <img
                  src="/assets/illustrations/chase_batsman.png"
                  alt="Chase"
                  className="object-contain shrink-0 w-7 h-7"
                />
                <div className="text-caption">
                  <p className="font-extrabold text-amber-500">Toss Bypassed in Chase Mode</p>
                  <p className="text-[var(--muted-foreground)] text-[11px] leading-snug mt-0.5">
                    <strong>{homeTeam || 'Chasing Team'}</strong> bats in 2nd Innings chasing {targetRuns} against <strong>{awayTeam || 'Defending Team'}</strong>.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="font-semibold text-caption mb-1.5 text-[var(--muted-foreground)]">Who won the toss?</p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setTossWinner('home')}
                      className={`p-2.5 rounded-xl border text-left font-bold text-caption transition-all flex items-center gap-2 ${
                        tossWinner === 'home'
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-xs'
                          : 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]'
                      }`}
                    >
                      <div className="shrink-0">
                        <TeamBadgeIcon type="home" size="xs" />
                      </div>
                      <div className="overflow-hidden min-w-0">
                        <span className="block truncate font-extrabold text-body-small">{homeTeam || 'Home'}</span>
                        <span className="uppercase font-bold text-[10px] block truncate text-emerald-500">
                          Winner
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTossWinner('away')}
                      className={`p-2.5 rounded-xl border text-left font-bold text-caption transition-all flex items-center gap-2 ${
                        tossWinner === 'away'
                          ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400 shadow-xs'
                          : 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]'
                      }`}
                    >
                      <div className="shrink-0">
                        <TeamBadgeIcon type="away" size="xs" />
                      </div>
                      <div className="overflow-hidden min-w-0">
                        <span className="block truncate font-extrabold text-body-small">{awayTeam || 'Away'}</span>
                        <span className="uppercase font-bold text-[10px] block truncate text-blue-500">
                          Winner
                        </span>
                      </div>
                    </button>
                  </div>
                </div>

                <div>
                  <p className="font-semibold text-caption mb-1.5 text-[var(--muted-foreground)]">Toss decision</p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setTossDecision('Batting')}
                      className={`p-2.5 rounded-xl border text-center font-bold text-caption transition-all flex items-center justify-center gap-2 min-h-btn-sm ${
                        tossDecision === 'Batting'
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-xs'
                          : 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]'
                      }`}
                    >
                      <img
                        src="/assets/illustrations/st_bat.png"
                        alt="Bat"
                        className="object-contain shrink-0 w-4 h-4"
                      />
                      <span className="truncate">Elected to Bat</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTossDecision('Bowling')}
                      className={`p-2.5 rounded-xl border text-center font-bold text-caption transition-all flex items-center justify-center gap-2 min-h-btn-sm ${
                        tossDecision === 'Bowling'
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-xs'
                          : 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]'
                      }`}
                    >
                      <img
                        src="/assets/illustrations/opening_bowler.png"
                        alt="Bowl"
                        className="object-contain shrink-0 w-4 h-4"
                      />
                      <span className="truncate">Elected to Bowl</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Advanced Rules Accordion Card */}
          <div className="floating-card overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between font-bold hover:bg-[var(--muted)]/50 transition-colors p-3.5 text-body-small min-h-[44px] w-full"
            >
              <div className="flex items-center gap-2">
                <Sliders className="text-emerald-600 w-4 h-4" />
                <span>Advanced Cricket Rules</span>
              </div>
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showAdvanced && (
              <div className="border-t border-[var(--border)] space-y-3 p-4 text-body-small animate-fadeIn">
                {/* Players per team */}
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-body-small">Players per team</div>
                    <div className="text-caption text-[var(--muted-foreground)]">Standard limit 2 to 20 players</div>
                  </div>
                  <input
                    type="number"
                    min={2}
                    max={20}
                    value={players}
                    onChange={(e) => setPlayers(Number(e.target.value))}
                    className="bg-[var(--muted)] border border-[var(--border)] font-bold shrink-0 py-1.5 rounded-lg text-center w-16 px-2 text-body-small"
                  />
                </div>

                {/* Wide Ball Rules */}
                <div className="border-t border-[var(--border)]/60 pt-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-body-small">Wide Ball Extra</div>
                      <div className="text-caption text-[var(--muted-foreground)]">Awards extra run to batting team</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={wideBall}
                      onChange={(e) => setWideBall(e.target.checked)}
                      className="accent-emerald-600 rounded shrink-0 w-4 h-4"
                    />
                  </div>

                  {wideBall && (
                    <div className="flex items-center justify-between pl-3 text-caption">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={wideReball}
                          onChange={(e) => setWideReball(e.target.checked)}
                          className="accent-emerald-600 w-3.5 h-3.5"
                        />
                        <span>Re-ball delivery</span>
                      </label>
                      <div className="flex items-center gap-1.5">
                        <span>Penalty:</span>
                        <input
                          type="number"
                          min={1}
                          value={wideRun}
                          onChange={(e) => setWideRun(Number(e.target.value))}
                          className="rounded bg-[var(--muted)] border font-bold text-center w-12 px-1 py-0.5 text-caption"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* No Ball Rules */}
                <div className="border-t border-[var(--border)]/60 pt-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-body-small">No Ball & Free Hit</div>
                      <div className="text-caption text-[var(--muted-foreground)]">Awards extra and activates Free Hit</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={noBall}
                      onChange={(e) => setNoBall(e.target.checked)}
                      className="accent-emerald-600 rounded shrink-0 w-4 h-4"
                    />
                  </div>

                  {noBall && (
                    <div className="flex items-center justify-between pl-3 text-caption">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={noBallReball}
                          onChange={(e) => setNoBallReball(e.target.checked)}
                          className="accent-emerald-600 w-3.5 h-3.5"
                        />
                        <span>Re-ball delivery</span>
                      </label>
                      <div className="flex items-center gap-1.5">
                        <span>Penalty:</span>
                        <input
                          type="number"
                          min={1}
                          value={noBallRun}
                          onChange={(e) => setNoBallRun(Number(e.target.value))}
                          className="rounded bg-[var(--muted)] border font-bold text-center w-12 px-1 py-0.5 text-caption"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Bowler Over Limit */}
                <div className="border-t border-[var(--border)]/60 pt-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-body-small">Manual Bowler Limit</div>
                      <div className="text-caption text-[var(--muted-foreground)]">
                        Default: ceil({overs}/5) = {Math.ceil(overs / 5)} ov max
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={isManualLimitEnabled}
                      onChange={(e) => setIsManualLimitEnabled(e.target.checked)}
                      className="accent-emerald-600 rounded w-4 h-4"
                    />
                  </div>

                  {isManualLimitEnabled && (
                    <div className="flex items-center justify-between text-caption pl-3">
                      <span>Max Overs Per Bowler:</span>
                      <input
                        type="number"
                        min={1}
                        max={overs}
                        value={manualOverLimit}
                        onChange={(e) => setManualOverLimit(Number(e.target.value))}
                        className="rounded bg-[var(--muted)] border font-bold text-center w-14 px-1 py-0.5"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Primary Action Button */}
          <button
            type="submit"
            className="flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 font-extrabold shadow-lg shadow-emerald-600/25 transition-all hover:scale-[1.01] active:scale-[0.99] py-3.5 rounded-xl text-body min-h-btn w-full gap-2 text-white"
          >
            <span>Next: Opening Players</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </form>

      {/* ── SAVED TEAM PICKER MODAL ── */}
      {showTeamModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="overflow-y-auto bg-[var(--card)] border border-[var(--border)] shadow-2xl max-w-md max-h-[85vh] rounded-2xl w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 className="font-bold text-body">Select Saved Team</h3>
              <button
                onClick={() => setShowTeamModal(null)}
                className="hover:underline text-caption p-1 text-[var(--muted-foreground)]"
              >
                Close
              </button>
            </div>

            <div className="overflow-y-auto max-h-64 space-y-2">
              {savedTeams.map((team) => (
                <button
                  key={team.id}
                  onClick={() => {
                    if (showTeamModal === 'home') setHomeTeam(team.name);
                    else setAwayTeam(team.name);
                    setShowTeamModal(null);
                  }}
                  className="border border-[var(--border)] hover:bg-[var(--muted)] flex items-center justify-between text-left rounded-xl w-full p-3 transition-colors"
                >
                  <span className="font-bold text-body-small">{team.name}</span>
                  <span className="text-caption text-[var(--muted-foreground)]">{team.players.length} players</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
