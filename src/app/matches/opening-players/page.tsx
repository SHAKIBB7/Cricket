'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Clock, MapPin } from 'lucide-react';
import { EventSourcedMatchEngine } from '@/domain/cricket/match-engine/EventSourcedMatchEngine';
import { MatchRepository } from '@/infrastructure/storage/MatchRepository';
import { FeatureHubRepository } from '@/infrastructure/storage/FeatureHubRepository';
import { TeamBadgeIcon } from '@/components/common/TeamBadgeIcon';
import { BackButton } from '@/components/navigation';
import { CompactDropdown } from '@/components/common/CompactDropdown';

export default function OpeningPlayersPage() {
  const router = useRouter();

  const [setup, setSetup] = useState<any>(null);
  const [striker, setStriker] = useState('');
  const [strikerHand, setStrikerHand] = useState<'Right-hand Batsman' | 'Left-hand Batsman'>('Right-hand Batsman');
  const [nonStriker, setNonStriker] = useState('');
  const [nonStrikerHand, setNonStrikerHand] = useState<'Right-hand Batsman' | 'Left-hand Batsman'>('Right-hand Batsman');
  const [bowler, setBowler] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [battingTeamSquad, setBattingTeamSquad] = useState<string[]>([]);
  const [bowlingTeamSquad, setBowlingTeamSquad] = useState<string[]>([]);

  const handOptions = [
    { value: 'Right-hand Batsman', label: 'RHB', badge: 'RHB' },
    { value: 'Left-hand Batsman', label: 'LHB', badge: 'LHB' },
  ];

  const strikerOptions = useMemo(
    () =>
      battingTeamSquad.map((name) => ({
        value: name,
        label: name,
        badge: name === nonStriker ? 'Non-Striker' : undefined,
        disabled: name === nonStriker,
      })),
    [battingTeamSquad, nonStriker]
  );

  const nonStrikerOptions = useMemo(
    () =>
      battingTeamSquad.map((name) => ({
        value: name,
        label: name,
        badge: name === striker ? 'Striker' : undefined,
        disabled: name === striker,
      })),
    [battingTeamSquad, striker]
  );

  const bowlerOptions = useMemo(
    () =>
      bowlingTeamSquad.map((name) => ({
        value: name,
        label: name,
      })),
    [bowlingTeamSquad]
  );

  useEffect(() => {
    const raw = sessionStorage.getItem('pending_match_setup');
    if (!raw) {
      router.push('/matches/new');
      return;
    }

    try {
      const data = JSON.parse(raw);
      setSetup(data);

      // Determine batting & bowling teams
      let batTeam = data.teamA;
      let bowlTeam = data.teamB;
      if (data.tossWinner === data.teamA) {
        if (data.tossDecision === 'Bowling') {
          batTeam = data.teamB;
          bowlTeam = data.teamA;
        }
      } else {
        if (data.tossDecision === 'Batting') {
          batTeam = data.teamB;
          bowlTeam = data.teamA;
        }
      }

      // Check for saved squads
      FeatureHubRepository.loadTeams().then((teams) => {
        const foundBatTeam = teams.find((t) => t.name.toLowerCase() === batTeam.toLowerCase());
        const foundBowlTeam = teams.find((t) => t.name.toLowerCase() === bowlTeam.toLowerCase());

        if (foundBatTeam && foundBatTeam.players.length >= 2) {
          setBattingTeamSquad(foundBatTeam.players);
          setStriker(foundBatTeam.players[0] || '');
          setNonStriker(foundBatTeam.players[1] || '');
        } else {
          setStriker('');
          setNonStriker('');
        }

        if (foundBowlTeam && foundBowlTeam.players.length >= 1) {
          setBowlingTeamSquad(foundBowlTeam.players);
          setBowler(foundBowlTeam.players[0] || '');
        } else {
          setBowler('');
        }
      });
    } catch {
      router.push('/matches/new');
    }
  }, [router]);

  if (!setup) return null;

  // Determine batting & bowling teams
  let battingTeam = setup.teamA;
  let bowlingTeam = setup.teamB;
  if (!setup.isChaseMode) {
    if (setup.tossWinner === setup.teamA) {
      if (setup.tossDecision === 'Bowling') {
        battingTeam = setup.teamB;
        bowlingTeam = setup.teamA;
      }
    } else {
      if (setup.tossDecision === 'Batting') {
        battingTeam = setup.teamB;
        bowlingTeam = setup.teamA;
      }
    }
  }

  const handleStartMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanStriker = striker.trim();
    const cleanNonStriker = nonStriker.trim();
    const cleanBowler = bowler.trim();

    if (!cleanStriker) {
      setErrorMessage('Please enter or select a Striker batsman.');
      return;
    }
    if (!cleanNonStriker) {
      setErrorMessage('Please enter or select a Non-Striker batsman.');
      return;
    }
    if (!cleanBowler) {
      setErrorMessage('Please enter or select an Opening bowler.');
      return;
    }
    if (cleanStriker.toLowerCase() === cleanNonStriker.toLowerCase()) {
      setErrorMessage('Striker and Non-Striker must be two different players.');
      return;
    }

    setIsSubmitting(true);

    try {
      const mergedAdvancedSettings = {
        ...setup.advancedSettings,
        teamASquad: setup.teamASquad || setup.advancedSettings?.teamASquad,
        teamBSquad: setup.teamBSquad || setup.advancedSettings?.teamBSquad,
      };

      const engine = setup.isChaseMode && setup.targetScore
        ? EventSourcedMatchEngine.createChaseMatch({
            chasingTeam: battingTeam,
            defendingTeam: bowlingTeam,
            targetScore: Number(setup.targetScore),
            totalOvers: setup.overs,
            strikerName: cleanStriker,
            nonStrikerName: cleanNonStriker,
            bowlerName: cleanBowler,
            venue: setup.venue,
            groundId: setup.groundId,
            location: setup.location,
            advancedSettings: mergedAdvancedSettings,
          })
        : new EventSourcedMatchEngine({
            teamA: setup.teamA,
            teamB: setup.teamB,
            tossWinner: setup.tossWinner,
            tossDecision: setup.tossDecision,
            totalOvers: setup.overs,
            advancedSettings: mergedAdvancedSettings,
            strikerName: cleanStriker,
            nonStrikerName: cleanNonStriker,
            bowlerName: cleanBowler,
            venue: setup.venue,
            groundId: setup.groundId,
            location: setup.location,
          });

      // Set batting hands
      if (engine.currentInnings.players.length >= 2) {
        engine.currentInnings.players[0].battingHand = strikerHand;
        engine.currentInnings.players[1].battingHand = nonStrikerHand;
      }

      const scorecard = engine.toScorecard();
      await MatchRepository.saveMatchWithEvents(scorecard, engine.events, 0);

      sessionStorage.removeItem('pending_match_setup');
      router.push(`/matches/score/${engine.id}`);
    } catch (err: any) {
      console.error('Failed to start match:', err);
      setErrorMessage(err?.message || 'Failed to start match. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-5xl xl:max-w-6xl mx-auto flex flex-col gap-4 short:gap-3 pb-safe pb-8">
      {/* ── COMPACT INLINE iOS HEADER ── */}
      <div className="flex items-center justify-between gap-3 min-w-0 py-1 border-b border-[var(--border)]/70 pb-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <BackButton
            fallbackUrl="/matches/new"
            showLabel={false}
            title="Back to Match Setup"
            size="sm"
          />
          <div className="min-w-0">
            <h1 className="font-extrabold text-base sm:text-lg tracking-tight text-[var(--foreground)] truncate leading-tight">
              Opening Players
            </h1>
            <p className="text-[11px] text-[var(--muted-foreground)] truncate hidden sm:block">
              Select opening batters and bowler for Innings 1
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-caption font-semibold bg-[var(--card)] border border-[var(--border)] px-3 py-1.5 rounded-xl shadow-2xs">
          <span className="flex items-center gap-1.5 text-[var(--muted-foreground)]">
            <Clock className="w-3.5 h-3.5 text-emerald-600" /> {setup.overs} Ov
          </span>
          {setup.venue && (
            <>
              <span className="opacity-40">•</span>
              <span className="hidden sm:flex items-center gap-1 text-[var(--muted-foreground)] truncate max-w-[140px]">
                <MapPin className="w-3.5 h-3.5 text-blue-600" /> {setup.venue}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── RESPONSIVE 2-COLUMN LAYOUT FORM ── */}
      <form onSubmit={handleStartMatch} className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5 items-start">
        {/* LEFT COLUMN: BATTING TEAM (STRIKER & NON-STRIKER) */}
        <div className="floating-card p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between border-b border-[var(--border)] pb-2.5 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <TeamBadgeIcon type={battingTeam === setup.teamA ? 'home' : 'away'} size="sm" showLabel />
              <span className="font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 truncate text-caption">
                Batting: {battingTeam}
              </span>
            </div>
            <span className={`text-caption font-extrabold shrink-0 ${setup.isChaseMode ? 'text-amber-500' : 'text-[var(--muted-foreground)]'}`}>
              {setup.isChaseMode ? `2nd Innings • Target: ${setup.targetScore}` : '1st Innings'}
            </span>
          </div>

          {/* Striker */}
          <div className="bg-emerald-500/5 border border-emerald-500/20 p-2.5 sm:p-3 rounded-xl space-y-2">
            <div className="flex items-center gap-3">
              <img
                src="/assets/illustrations/strike_batsman.png"
                alt="Striker"
                className="w-10 h-10 object-contain shrink-0 drop-shadow"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-caption mb-1">
                  <span className="font-bold text-body-small">Striker Batsman</span>
                  <span className="bg-emerald-500/20 font-extrabold text-[10px] text-emerald-600 dark:text-emerald-400 py-0.5 rounded-full px-2">
                    Takes Strike
                  </span>
                </div>
                <div className="flex gap-2 items-center">
                  <div className="flex-1 min-w-0">
                    <CompactDropdown
                      value={striker}
                      options={strikerOptions}
                      onChange={(val) => setStriker(String(val))}
                      allowCustomInput
                      required
                      placeholder="Striker batter name"
                      inputPlaceholder="Striker batter name"
                      size="sm"
                      emptyMessage="Type batter name or pick from squad."
                      testId="striker-dropdown"
                    />
                  </div>
                  <div className="w-24 shrink-0">
                    <CompactDropdown
                      value={strikerHand}
                      options={handOptions}
                      onChange={(val) => setStrikerHand(val as any)}
                      size="sm"
                      testId="striker-hand-dropdown"
                    />
                  </div>
                </div>
              </div>
            </div>

            {battingTeamSquad.length > 0 && (
              <div className="border-t border-emerald-500/15 pt-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] block mb-1">
                  Quick Squad Pick:
                </span>
                <div className="flex flex-wrap gap-1">
                  {battingTeamSquad.slice(0, 6).map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setStriker(name)}
                      className={`font-semibold transition-colors px-2.5 rounded-lg text-caption py-0.5 border ${
                        striker === name
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-[var(--muted)] hover:bg-emerald-500/10 text-[var(--foreground)] border-[var(--border)]'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Non-Striker */}
          <div className="bg-[var(--muted)]/40 border border-[var(--border)] p-2.5 sm:p-3 rounded-xl space-y-2">
            <div className="flex items-center gap-3">
              <img
                src="/assets/illustrations/non_strike_batsman.png"
                alt="Non-Striker"
                className="w-10 h-10 object-contain shrink-0 drop-shadow"
              />
              <div className="flex-1 min-w-0">
                <label className="font-bold block text-caption mb-1">
                  Non-Striker Batsman
                </label>
                <div className="flex gap-2 items-center">
                  <div className="flex-1 min-w-0">
                    <CompactDropdown
                      value={nonStriker}
                      options={nonStrikerOptions}
                      onChange={(val) => setNonStriker(String(val))}
                      allowCustomInput
                      required
                      placeholder="Non-striker batter name"
                      inputPlaceholder="Non-striker batter name"
                      size="sm"
                      emptyMessage="Type batter name or pick from squad."
                      testId="non-striker-dropdown"
                    />
                  </div>
                  <div className="w-24 shrink-0">
                    <CompactDropdown
                      value={nonStrikerHand}
                      options={handOptions}
                      onChange={(val) => setNonStrikerHand(val as any)}
                      size="sm"
                      testId="non-striker-hand-dropdown"
                    />
                  </div>
                </div>
              </div>
            </div>

            {battingTeamSquad.length > 0 && (
              <div className="border-t border-[var(--border)] pt-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] block mb-1">
                  Quick Squad Pick:
                </span>
                <div className="flex flex-wrap gap-1">
                  {battingTeamSquad.slice(0, 6).map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setNonStriker(name)}
                      className={`font-semibold transition-colors px-2.5 rounded-lg text-caption py-0.5 border ${
                        nonStriker === name
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-[var(--muted)] hover:bg-emerald-500/10 text-[var(--foreground)] border-[var(--border)]'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: BOWLING TEAM & SUBMIT ACTION */}
        <div className="flex flex-col gap-4">
          <div className="floating-card p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between border-b border-[var(--border)] pb-2.5 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <TeamBadgeIcon type={bowlingTeam === setup.teamA ? 'home' : 'away'} size="sm" showLabel />
                <span className="font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 truncate text-caption">
                  Bowling: {bowlingTeam}
                </span>
              </div>
              <span className="font-medium shrink-0 text-caption text-[var(--muted-foreground)]">
                {setup.isChaseMode ? `Defending ${setup.targetScore} runs` : 'Opening Over'}
              </span>
            </div>

            {/* Opening Bowler Input */}
            <div className="bg-blue-500/5 border border-blue-500/20 p-2.5 sm:p-3 rounded-xl space-y-2">
              <div className="flex items-center gap-3">
                <img
                  src="/assets/illustrations/opening_bowler.png"
                  alt="Opening Bowler"
                  className="w-10 h-10 object-contain shrink-0 drop-shadow"
                />
                <div className="flex-1 min-w-0">
                  <label className="font-bold block text-caption mb-1">
                    Opening Bowler
                  </label>
                  <CompactDropdown
                    value={bowler}
                    options={bowlerOptions}
                    onChange={(val) => setBowler(String(val))}
                    allowCustomInput
                    required
                    placeholder="Opening bowler name"
                    inputPlaceholder="Opening bowler name"
                    size="sm"
                    emptyMessage="Type bowler name or pick from squad."
                    testId="bowler-dropdown"
                  />
                </div>
              </div>

              {bowlingTeamSquad.length > 0 && (
                <div className="border-t border-blue-500/15 pt-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] block mb-1">
                    Quick Squad Pick:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {bowlingTeamSquad.slice(0, 6).map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setBowler(name)}
                        className={`font-semibold transition-colors px-2.5 rounded-lg text-caption py-0.5 border ${
                          bowler === name
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-[var(--muted)] hover:bg-blue-500/10 text-[var(--foreground)] border-[var(--border)]'
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Match Snapshot */}
            <div className="bg-[var(--muted)]/50 rounded-xl p-3 text-caption space-y-1.5">
              <span className="font-bold uppercase tracking-wider text-[10px] text-[var(--muted-foreground)] block">
                Match Details Summary
              </span>
              <div className="flex items-center justify-between text-[var(--foreground)] font-medium">
                <span>Total Match Overs:</span>
                <span className="font-bold num-font">{setup.overs} Overs</span>
              </div>
              <div className="flex items-center justify-between text-[var(--foreground)] font-medium">
                <span>Toss Result:</span>
                <span className="font-semibold">{setup.tossWinner} opted to {setup.tossDecision}</span>
              </div>
              <div className="flex items-center justify-between text-[var(--foreground)] font-medium">
                <span>Ground Venue:</span>
                <span className="font-semibold truncate max-w-[200px]">{setup.venue}</span>
              </div>
            </div>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div
              data-testid="opening-players-error"
              className="bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 p-3 rounded-xl text-caption font-bold flex items-center gap-2"
            >
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Submit Action Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 font-extrabold shadow-xl shadow-emerald-600/30 transition-all hover:scale-[1.01] active:scale-[0.99] py-3.5 rounded-xl text-body min-h-[50px] w-full gap-2 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Starting Match...</span>
              </span>
            ) : (
              <>
                {setup.isChaseMode ? (
                  <img
                    src="/assets/illustrations/chase_batsman.png"
                    alt="Chase"
                    className="object-contain w-5 h-5"
                  />
                ) : (
                  <Play className="fill-current w-4 h-4" />
                )}
                <span>{setup.isChaseMode ? 'Start Target Chase Scoring' : 'Start Live Scoring'}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
