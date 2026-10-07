'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Play, ArrowLeft, UserCheck, Shield } from 'lucide-react';
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
          setStriker(foundBatTeam.players[0] || 'Opener 1');
          setNonStriker(foundBatTeam.players[1] || 'Opener 2');
        } else {
          setStriker('Striker');
          setNonStriker('Non-Striker');
        }

        if (foundBowlTeam && foundBowlTeam.players.length >= 1) {
          setBowlingTeamSquad(foundBowlTeam.players);
          setBowler(foundBowlTeam.players[0] || 'Opening Bowler');
        } else {
          setBowler('Bowler 1');
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
          strikerName: striker.trim() || 'Striker',
          nonStrikerName: nonStriker.trim() || 'Non-Striker',
          bowlerName: bowler.trim() || 'Bowler 1',
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
          strikerName: striker.trim() || 'Striker',
          nonStrikerName: nonStriker.trim() || 'Non-Striker',
          bowlerName: bowler.trim() || 'Bowler 1',
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
    <div className="max-w-xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="bg-[var(--muted)] hover:bg-[var(--border)] transition-colors flex items-center justify-center rounded-xl min-h-[40px] min-w-[40px] p-2"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="font-black tracking-tight text-2xl">Opening Players</h1>
          <p className="text-xs">Step 2 of 2: Select Opening Batters & Bowler</p>
        </div>
      </div>

      <form onSubmit={handleStartMatch} className="space-y-5">
        {/* Batting Team Players */}
        <div className="bg-[var(--card)] border border-[var(--border)] shadow-xs p-5 rounded-2xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <TeamBadgeIcon type={battingTeam === setup.teamA ? 'home' : 'away'} size="sm" showLabel />
              <span className="font-bold uppercase tracking-wider dark:text-emerald-400 truncate text-xs">
                Batting: {battingTeam}
              </span>
            </div>
            <span className={`text-xs sm:text-sm sm:text-xs font-extrabold shrink-0 ${setup.isChaseMode ? 'text-amber-500' : 'text-[var(--muted-foreground)]'}`}>
              {setup.isChaseMode ? `2nd Innings • Chasing ${setup.targetScore}` : '1st Innings'}
            </span>
          </div>

          {/* Striker */}
          <div className="bg-emerald-500/5 border border-emerald-500/20 p-3 rounded-xl space-y-2">
            <div className="flex items-center gap-3">
              <img
                src="/assets/illustrations/strike_batsman.png"
                alt="Striker"
                className="xs:w-10 xs:h-10 object-contain shrink-0 drop-shadow w-12 h-12 mt-0"
              />
              <div className="flex-1 min-w-0">
                <label className="font-semibold flex items-center justify-between text-xs mb-1">
                  <span className="font-bold text-sm">Striker Batsman</span>
                  <span className="bg-emerald-500/20 font-extrabold shrink-0 text-emerald-400 py-0.5 rounded-full px-2">Takes Strike</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={striker}
                    onChange={(e) => setStriker(e.target.value)}
                    placeholder="Striker batter name"
                    className="flex-1 bg-[var(--muted)] border border-[var(--border)] font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded-xl min-h-[42px] min-w-0 px-3 py-2 text-sm"
                  />
                  <select
                    value={strikerHand}
                    onChange={(e) => setStrikerHand(e.target.value as any)}
                    className="bg-[var(--muted)] border border-[var(--border)] font-semibold focus:outline-none shrink-0 px-3 rounded-xl min-h-[42px] py-2 text-xs"
                  >
                    <option value="Right-hand Batsman">RHB</option>
                    <option value="Left-hand Batsman">LHB</option>
                  </select>
                </div>
              </div>
            </div>

            {battingTeamSquad.length > 0 && (
              <div className="border-t border-emerald-500/10 pt-2">
                <span className="font-bold uppercase block text-[var(--muted-foreground)] mb-1">Quick Pick:</span>
                <div className="flex flex-wrap gap-1.5">
                  {battingTeamSquad.slice(0, 6).map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setStriker(name)}
                      className="bg-[var(--muted)] font-semibold hover:bg-emerald-500/10 hover:text-emerald-600 transition-colors px-4 rounded-lg text-xs sm:text-sm min-h-[30px] py-1"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Non-Striker */}
          <div className="bg-[var(--muted)]/40 border border-[var(--border)] p-3 rounded-xl space-y-2">
            <div className="flex items-center gap-3">
              <img
                src="/assets/illustrations/non_strike_batsman.png"
                alt="Non-Striker"
                className="xs:w-10 xs:h-10 object-contain shrink-0 drop-shadow w-12 h-12 mt-0"
              />
              <div className="flex-1 min-w-0">
                <label className="font-bold block text-xs mb-1">
                  Non-Striker Batsman
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={nonStriker}
                    onChange={(e) => setNonStriker(e.target.value)}
                    placeholder="Non-striker batter name"
                    className="flex-1 bg-[var(--muted)] border border-[var(--border)] font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded-xl min-h-[42px] min-w-0 px-3 py-2 text-sm"
                  />
                  <select
                    value={nonStrikerHand}
                    onChange={(e) => setNonStrikerHand(e.target.value as any)}
                    className="bg-[var(--muted)] border border-[var(--border)] font-semibold focus:outline-none shrink-0 px-3 rounded-xl min-h-[42px] py-2 text-xs"
                  >
                    <option value="Right-hand Batsman">RHB</option>
                    <option value="Left-hand Batsman">LHB</option>
                  </select>
                </div>
              </div>
            </div>

            {battingTeamSquad.length > 0 && (
              <div className="border-t border-[var(--border)]/50 pt-2">
                <span className="font-bold uppercase block text-[var(--muted-foreground)] mb-1">Quick Pick:</span>
                <div className="flex flex-wrap gap-1.5">
                  {battingTeamSquad.slice(0, 6).map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setNonStriker(name)}
                      className="bg-[var(--muted)] font-semibold hover:bg-emerald-500/10 hover:text-emerald-600 transition-colors px-4 rounded-lg text-xs sm:text-sm min-h-[30px] py-1"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bowling Team Players */}
        <div className="bg-[var(--card)] border border-[var(--border)] shadow-xs p-5 rounded-2xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <TeamBadgeIcon type={bowlingTeam === setup.teamA ? 'home' : 'away'} size="sm" showLabel />
              <span className="font-bold uppercase tracking-wider dark:text-blue-400 truncate text-xs">
                Bowling: {bowlingTeam}
              </span>
            </div>
            <span className="font-medium shrink-0 text-xs">
              {setup.isChaseMode ? `Defending ${setup.targetScore}` : 'Over 1'}
            </span>
          </div>

          <div className="bg-blue-500/5 border border-blue-500/20 p-3 rounded-xl space-y-2">
            <div className="flex items-center gap-3">
              <img
                src="/assets/illustrations/opening_bowler.png"
                alt="Opening Bowler"
                className="xs:w-10 xs:h-10 object-contain shrink-0 drop-shadow w-12 h-12 mt-0"
              />
              <div className="flex-1 min-w-0">
                <label className="font-bold block text-xs mb-1">
                  Opening Bowler
                </label>
                <input
                  type="text"
                  required
                  value={bowler}
                  onChange={(e) => setBowler(e.target.value)}
                  placeholder="Opening bowler name"
                  className="bg-[var(--muted)] border border-[var(--border)] font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded-xl min-h-[42px] w-full px-3 py-2 text-sm"
                />
              </div>
            </div>

            {bowlingTeamSquad.length > 0 && (
              <div className="border-t border-blue-500/10 pt-2">
                <span className="font-bold uppercase block text-[var(--muted-foreground)] mb-1">Quick Pick:</span>
                <div className="flex flex-wrap gap-1.5">
                  {bowlingTeamSquad.slice(0, 6).map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setBowler(name)}
                      className="bg-[var(--muted)] font-semibold hover:bg-blue-500/10 hover:text-blue-600 transition-colors px-4 rounded-lg text-xs sm:text-sm min-h-[30px] py-1"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Start Button */}
        <button
          type="submit"
          className="flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 font-extrabold shadow-xl shadow-emerald-600/30 transition-all hover:scale-[1.01] active:scale-[0.99] py-4 rounded-xl text-base min-h-[54px] w-full gap-2"
        >
          {setup.isChaseMode ? (
            <img
              src="/assets/illustrations/chase_batsman.png"
              alt="Chase"
              className="object-contain w-6 h-6"
            />
          ) : (
            <Play className="fill-current w-5 h-5" />
          )}
          <span>{setup.isChaseMode ? 'Start Target Chase Scoring' : 'Start Live Scoring'}</span>
        </button>
      </form>
    </div>
  );
}
