'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Play, ArrowLeft, UserCheck, Shield, Clock, MapPin } from 'lucide-react';
import { EventSourcedMatchEngine } from '@/domain/cricket/match-engine/EventSourcedMatchEngine';
import { MatchRepository } from '@/infrastructure/storage/MatchRepository';
import { FeatureHubRepository } from '@/infrastructure/storage/FeatureHubRepository';
import { SavedTeam } from '@/infrastructure/database/dexie-db';
import { TeamBadgeIcon } from '@/components/common/TeamBadgeIcon';

export default function OpeningPlayersPage() {
  const router = useRouter();

  const [setup, setSetup] = useState<any>(null);
  const [striker, setStriker] = useState('');
  const [strikerHand, setStrikerHand] = useState<'Right-hand Batsman' | 'Left-hand Batsman'>('Right-hand Batsman');
  const [nonStriker, setNonStriker] = useState('');
  const [nonStrikerHand, setNonStrikerHand] = useState<'Right-hand Batsman' | 'Left-hand Batsman'>('Right-hand Batsman');
  const [bowler, setBowler] = useState('');

  const [battingTeamSquad, setBattingTeamSquad] = useState<string[]>([]);
  const [bowlingTeamSquad, setBowlingTeamSquad] = useState<string[]>([]);

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

    const engine = setup.isChaseMode && setup.targetScore
      ? EventSourcedMatchEngine.createChaseMatch({
          chasingTeam: battingTeam,
          defendingTeam: bowlingTeam,
          targetScore: Number(setup.targetScore),
          totalOvers: setup.overs,
          strikerName: striker.trim() || '',
          nonStrikerName: nonStriker.trim() || '',
          bowlerName: bowler.trim() || '',
          venue: setup.venue,
          advancedSettings: setup.advancedSettings,
        })
      : new EventSourcedMatchEngine({
          teamA: setup.teamA,
          teamB: setup.teamB,
          tossWinner: setup.tossWinner,
          tossDecision: setup.tossDecision,
          totalOvers: setup.overs,
          advancedSettings: setup.advancedSettings,
          strikerName: striker.trim() || '',
          nonStrikerName: nonStriker.trim() || '',
          bowlerName: bowler.trim() || '',
          venue: setup.venue,
        });

    // Set batting hands
    if (engine.currentInnings.players.length >= 2) {
      engine.currentInnings.players[0].battingHand = strikerHand;
      engine.currentInnings.players[1].battingHand = nonStrikerHand;
    }

    const scorecard = engine.toScorecard();
    await MatchRepository.saveMatch(scorecard);
    await MatchRepository.saveEvents(engine.events);

    sessionStorage.removeItem('pending_match_setup');
    router.push(`/matches/score/${engine.id}`);
  };

  return (
    <div className="w-full max-w-5xl xl:max-w-6xl mx-auto flex flex-col gap-4 short:gap-3">
      {/* ── TOP HEADER ── */}
      <div className="flex items-center justify-between bg-[var(--card)] border border-[var(--border)] rounded-2xl p-3.5 sm:p-4 shadow-floating gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="bg-[var(--muted)] hover:bg-[var(--border)] transition-colors flex items-center justify-center rounded-xl min-h-[38px] min-w-[38px] p-2"
            title="Back to Match Setup"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="font-black tracking-tight text-h2 leading-tight">Opening Players</h1>
            <p className="text-caption text-[var(--muted-foreground)]">Step 2 of 2: Select Opening Batters & Bowler</p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-3 text-caption font-semibold bg-[var(--muted)]/60 px-3 py-1.5 rounded-xl">
          <span className="flex items-center gap-1 text-[var(--muted-foreground)]">
            <Clock className="w-3.5 h-3.5 text-emerald-600" /> {setup.overs} Overs
          </span>
          <span>•</span>
          <span className="flex items-center gap-1 text-[var(--muted-foreground)] truncate max-w-[150px]">
            <MapPin className="w-3.5 h-3.5 text-blue-600" /> {setup.venue}
          </span>
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
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={striker}
                    onChange={(e) => setStriker(e.target.value)}
                    placeholder="Striker batter name"
                    className="flex-1 bg-[var(--muted)] border border-[var(--border)] font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded-xl min-h-[36px] px-2.5 py-1 text-body-small min-w-0"
                  />
                  <select
                    value={strikerHand}
                    onChange={(e) => setStrikerHand(e.target.value as any)}
                    className="bg-[var(--muted)] border border-[var(--border)] font-semibold focus:outline-none shrink-0 px-2.5 rounded-xl min-h-[36px] py-1 text-caption"
                  >
                    <option value="Right-hand Batsman">RHB</option>
                    <option value="Left-hand Batsman">LHB</option>
                  </select>
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
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={nonStriker}
                    onChange={(e) => setNonStriker(e.target.value)}
                    placeholder="Non-striker batter name"
                    className="flex-1 bg-[var(--muted)] border border-[var(--border)] font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded-xl min-h-[36px] px-2.5 py-1 text-body-small min-w-0"
                  />
                  <select
                    value={nonStrikerHand}
                    onChange={(e) => setNonStrikerHand(e.target.value as any)}
                    className="bg-[var(--muted)] border border-[var(--border)] font-semibold focus:outline-none shrink-0 px-2.5 rounded-xl min-h-[36px] py-1 text-caption"
                  >
                    <option value="Right-hand Batsman">RHB</option>
                    <option value="Left-hand Batsman">LHB</option>
                  </select>
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
                  <input
                    type="text"
                    required
                    value={bowler}
                    onChange={(e) => setBowler(e.target.value)}
                    placeholder="Opening bowler name"
                    className="bg-[var(--muted)] border border-[var(--border)] font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded-xl min-h-[36px] w-full px-2.5 py-1 text-body-small"
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

          {/* Submit Action Button */}
          <button
            type="submit"
            className="flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 font-extrabold shadow-xl shadow-emerald-600/30 transition-all hover:scale-[1.01] active:scale-[0.99] py-3.5 rounded-xl text-body min-h-[50px] w-full gap-2 text-white"
          >
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
          </button>
        </div>
      </form>
    </div>
  );
}
