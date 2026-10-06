'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Trophy,
  ArrowLeft,
  Calendar,
  Award,
  Layers,
  BarChart2,
  CheckCircle2,
  Play,
  Share2,
} from 'lucide-react';
import { FeatureHubRepository } from '@/infrastructure/storage/FeatureHubRepository';
import { MatchRepository } from '@/infrastructure/storage/MatchRepository';
import { Tournament, TournamentFixture } from '@/domain/tournament/types';
import { TournamentEngine } from '@/domain/tournament/TournamentEngine';
import { NetRunRateEngine } from '@/domain/tournament/NetRunRateEngine';
import { MatchScorecard } from '@/domain/cricket/types';
import { TeamBadgeIcon } from '@/components/common/TeamBadgeIcon';

export default function TournamentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tournamentId = params.id as string;

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [activeTab, setActiveTab] = useState<'fixtures' | 'standings' | 'playoffs' | 'leaders'>('fixtures');
  const [matches, setMatches] = useState<MatchScorecard[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTournament = useCallback(async () => {
    if (!tournamentId) return;
    const tourney = await FeatureHubRepository.getTournament(tournamentId);
    const allMatches = await MatchRepository.getAllMatches();
    setTournament(tourney || null);
    setMatches(allMatches);
    setLoading(false);
  }, [tournamentId]);

  useEffect(() => {
    loadTournament();
  }, [loadTournament]);

  if (loading || !tournament) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const standings = TournamentEngine.standings(tournament);
  const { battingLeaders, bowlingLeaders } = NetRunRateEngine.generateLeaderboard(tournament.id, matches);

  const handleRecordWinner = async (fixtureId: string, winner: string) => {
    const updated = TournamentEngine.recordWinner({
      tournament,
      fixtureId,
      winner,
    });
    await FeatureHubRepository.saveTournament(updated);
    setTournament(updated);
  };

  const handleRecordTie = async (fixtureId: string) => {
    const updated = TournamentEngine.recordTie({
      tournament,
      fixtureId,
    });
    await FeatureHubRepository.saveTournament(updated);
    setTournament(updated);
  };

  const handleLaunchMatch = (fixture: TournamentFixture) => {
    const setupData = {
      teamA: fixture.homeTeam,
      teamB: fixture.awayTeam || 'Team B',
      overs: tournament.matchOvers,
      tossWinner: fixture.homeTeam,
      tossDecision: 'Batting',
      venue: `${tournament.name} Ground`,
      advancedSettings: {
        tournamentId: tournament.id,
        players: 11,
        wideBall: true,
        wideReball: true,
        wideRun: 1,
        noBall: true,
        noBallReball: true,
        noBallRun: 1,
        isManualLimitEnabled: false,
        manualOverLimit: 4,
      },
    };

    sessionStorage.setItem('pending_match_setup', JSON.stringify(setupData));
    router.push('/matches/opening-players');
  };

  const playoffFixtures = tournament.fixtures.filter((f) => f.stage !== 'league' && f.stage !== 'knockout');

  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/tournaments')}
          className="flex items-center gap-1.5 text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] min-h-[38px] p-1"
        >
          <ArrowLeft className="w-4 h-4" /> Tournaments
        </button>

        <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold text-[10px] sm:text-xs uppercase tracking-wider">
          {tournament.format}
        </span>
      </div>

      {/* Hero Banner */}
      <div className="rounded-2xl sm:rounded-3xl bg-gradient-to-r from-amber-950 via-slate-900 to-emerald-950 p-4 sm:p-6 md:p-8 text-white shadow-xl border border-white/10 space-y-2.5 sm:space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] sm:text-xs font-bold text-amber-400 uppercase tracking-widest mb-1 flex-wrap">
              <span>{tournament.teams.length} Teams</span>
              <span>•</span>
              <span>{tournament.matchOvers} Overs</span>
              <span>•</span>
              <span>{tournament.fixtures.length} Fixtures</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{tournament.name}</h1>
          </div>

          {tournament.champion && (
            <div className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center gap-2.5 sm:gap-3">
              <Award className="w-6 h-6 sm:w-8 sm:h-8 text-amber-400 shrink-0" />
              <div>
                <span className="text-[9px] sm:text-[10px] uppercase font-bold text-amber-300">Tournament Champion</span>
                <p className="text-base sm:text-lg font-black text-white">{tournament.champion}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)] gap-4 sm:gap-6 text-xs sm:text-sm font-bold overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('fixtures')}
          className={`pb-2.5 sm:pb-3 border-b-2 transition-colors shrink-0 whitespace-nowrap min-h-[40px] ${
            activeTab === 'fixtures'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-[var(--muted-foreground)]'
          }`}
        >
          Fixtures ({tournament.fixtures.length})
        </button>

        {tournament.format === 'league' && (
          <button
            onClick={() => setActiveTab('standings')}
            className={`pb-2.5 sm:pb-3 border-b-2 transition-colors shrink-0 whitespace-nowrap min-h-[40px] ${
              activeTab === 'standings'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-[var(--muted-foreground)]'
            }`}
          >
            Points Table
          </button>
        )}

        {tournament.format === 'league' && tournament.teams.length >= 4 && (
          <button
            onClick={() => setActiveTab('playoffs')}
            className={`pb-2.5 sm:pb-3 border-b-2 transition-colors shrink-0 whitespace-nowrap min-h-[40px] ${
              activeTab === 'playoffs'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-[var(--muted-foreground)]'
            }`}
          >
            IPL Playoffs
          </button>
        )}

        <button
          onClick={() => setActiveTab('leaders')}
          className={`pb-2.5 sm:pb-3 border-b-2 transition-colors shrink-0 whitespace-nowrap min-h-[40px] ${
            activeTab === 'leaders'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-[var(--muted-foreground)]'
          }`}
        >
          Leaderboards
        </button>
      </div>

      {/* Tab 1: Fixtures */}
      {activeTab === 'fixtures' && (
        <div className="space-y-3">
          {tournament.fixtures.map((fixture, idx) => {
            const isBye = !fixture.awayTeam;
            const isComplete = !!fixture.winner || fixture.isTie;

            return (
              <div
                key={fixture.id}
                className="p-3.5 sm:p-4 md:p-5 rounded-xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4"
              >
                <div className="space-y-1 min-w-0 w-full md:w-auto">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                      Match {idx + 1} • Round {fixture.round} • {fixture.stage}
                    </span>
                    {fixture.isTie && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-extrabold text-[10px]">
                        TIED
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 font-extrabold text-sm sm:text-base md:text-lg tracking-tight">
                      <TeamBadgeIcon type="home" size="xs" />
                      <span>{fixture.homeTeam}</span>
                    </div>
                    <span className="text-xs text-[var(--muted-foreground)] font-bold">vs</span>
                    <div className="flex items-center gap-1.5 font-extrabold text-sm sm:text-base md:text-lg tracking-tight">
                      <TeamBadgeIcon type="away" size="xs" />
                      <span>{fixture.awayTeam || 'BYE'}</span>
                    </div>
                  </div>

                  {fixture.winner && (
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      Winner: {fixture.winner}
                    </p>
                  )}
                </div>

                {!isBye && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-[var(--border)]">
                    {/* Launch Live Match */}
                    <button
                      onClick={() => handleLaunchMatch(fixture)}
                      className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 min-h-[40px] active:scale-[0.98] transition-all"
                    >
                      <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                      <span>Score Match</span>
                    </button>

                    {/* Manual Quick Record Options */}
                    <div className="grid grid-cols-3 gap-1.5 w-full sm:w-auto">
                      <button
                        onClick={() => handleRecordWinner(fixture.id, fixture.homeTeam)}
                        className={`px-2 py-2 rounded-lg border text-xs font-bold min-h-[40px] transition-colors truncate text-center ${
                          fixture.winner === fixture.homeTeam
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)] hover:border-emerald-500/40'
                        }`}
                        title={`${fixture.homeTeam} Won`}
                      >
                        <span className="truncate block">{fixture.homeTeam} Won</span>
                      </button>

                      {fixture.awayTeam ? (
                        <button
                          onClick={() => handleRecordWinner(fixture.id, fixture.awayTeam!)}
                          className={`px-2 py-2 rounded-lg border text-xs font-bold min-h-[40px] transition-colors truncate text-center ${
                            fixture.winner === fixture.awayTeam
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)] hover:border-emerald-500/40'
                          }`}
                          title={`${fixture.awayTeam} Won`}
                        >
                          <span className="truncate block">{fixture.awayTeam} Won</span>
                        </button>
                      ) : (
                        <div />
                      )}

                      <button
                        onClick={() => handleRecordTie(fixture.id)}
                        className={`px-2 py-2 rounded-lg border text-xs font-bold min-h-[40px] transition-colors flex items-center justify-center ${
                          fixture.isTie
                            ? 'bg-amber-500 text-slate-950 border-amber-500'
                            : 'bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)]'
                        }`}
                      >
                        Tie
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 2: Standings / Points Table */}
      {activeTab === 'standings' && (
        <div className="rounded-2xl bg-[var(--card)] border border-[var(--border)] overflow-hidden shadow-xs">
          <div className="overflow-x-auto table-scroll-container">
            <table className="w-full text-left text-xs min-w-[420px]">
              <thead className="bg-[var(--muted)] text-[var(--muted-foreground)] font-bold uppercase border-b border-[var(--border)]">
                <tr>
                  <th className="py-2.5 sm:py-3 px-2 sm:px-4">Pos</th>
                  <th className="py-2.5 sm:py-3 px-2.5 sm:px-4">Team</th>
                  <th className="py-2.5 sm:py-3 px-1.5 sm:px-3 text-center">
                    <span className="sm:hidden">P</span>
                    <span className="hidden sm:inline">Played</span>
                  </th>
                  <th className="py-2.5 sm:py-3 px-1.5 sm:px-3 text-center">
                    <span className="sm:hidden">W</span>
                    <span className="hidden sm:inline">Won</span>
                  </th>
                  <th className="py-2.5 sm:py-3 px-1.5 sm:px-3 text-center">
                    <span className="sm:hidden">T</span>
                    <span className="hidden sm:inline">Tied</span>
                  </th>
                  <th className="py-2.5 sm:py-3 px-1.5 sm:px-3 text-center">
                    <span className="sm:hidden">L</span>
                    <span className="hidden sm:inline">Lost</span>
                  </th>
                  <th className="py-2.5 sm:py-3 px-2.5 sm:px-4 text-center font-black text-emerald-600">
                    <span className="sm:hidden">Pts</span>
                    <span className="hidden sm:inline">Points</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] num-font">
                {standings.map((s, idx) => (
                  <tr key={s.team} className="hover:bg-[var(--muted)]/40">
                    <td className="py-2.5 sm:py-3 px-2 sm:px-4 font-bold text-[var(--muted-foreground)]">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 sm:py-3 px-2.5 sm:px-4 font-black text-xs sm:text-sm text-[var(--foreground)] truncate max-w-[150px]">
                      {s.team}
                    </td>
                    <td className="py-2.5 sm:py-3 px-1.5 sm:px-3 text-center font-semibold">{s.played}</td>
                    <td className="py-2.5 sm:py-3 px-1.5 sm:px-3 text-center font-bold text-emerald-600">{s.wins}</td>
                    <td className="py-2.5 sm:py-3 px-1.5 sm:px-3 text-center text-amber-500">{s.ties}</td>
                    <td className="py-2.5 sm:py-3 px-1.5 sm:px-3 text-center text-red-500">{s.losses}</td>
                    <td className="py-2.5 sm:py-3 px-2.5 sm:px-4 text-center font-black text-sm sm:text-base text-emerald-600">
                      {s.points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: IPL Playoffs */}
      {activeTab === 'playoffs' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-600 dark:text-blue-400">
            IPL-Style Playoff Bracket: Qualifier 1 (Top 2), Eliminator (3rd vs 4th), Qualifier 2, and Final!
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {playoffFixtures.map((fix) => (
              <div
                key={fix.id}
                className="p-5 rounded-2xl bg-[var(--card)] border border-[var(--border)] space-y-3 shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-extrabold text-[10px] uppercase">
                    {fix.stage}
                  </span>
                  {fix.winner && (
                    <span className="text-xs font-bold text-emerald-600">
                      Winner: {fix.winner}
                    </span>
                  )}
                </div>

                <h3 className="font-black text-lg">
                  {fix.homeTeam} vs {fix.awayTeam || 'TBD'}
                </h3>

                {fix.awayTeam && !fix.winner && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-[var(--border)]">
                    <button
                      onClick={() => handleRecordWinner(fix.id, fix.homeTeam)}
                      className="w-full py-2 px-2.5 rounded-lg bg-[var(--muted)] hover:bg-emerald-600 hover:text-white text-xs font-bold transition-colors min-h-[40px] truncate"
                      title={`${fix.homeTeam} Won`}
                    >
                      <span className="truncate block">{fix.homeTeam} Won</span>
                    </button>
                    <button
                      onClick={() => handleRecordWinner(fix.id, fix.awayTeam!)}
                      className="w-full py-2 px-2.5 rounded-lg bg-[var(--muted)] hover:bg-emerald-600 hover:text-white text-xs font-bold transition-colors min-h-[40px] truncate"
                      title={`${fix.awayTeam} Won`}
                    >
                      <span className="truncate block">{fix.awayTeam} Won</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Leaderboards (Orange Cap & Purple Cap) */}
      {activeTab === 'leaders' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Orange Cap (Batting) */}
          <div className="rounded-2xl bg-[var(--card)] border border-[var(--border)] overflow-hidden shadow-xs space-y-2">
            <div className="p-4 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between">
              <span className="font-black text-sm text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                Orange Cap — Most Runs
              </span>
            </div>

            <div className="divide-y divide-[var(--border)] text-xs">
              {battingLeaders.length === 0 ? (
                <p className="p-6 text-center text-[var(--muted-foreground)] italic">
                  No match data recorded for this tournament yet.
                </p>
              ) : (
                battingLeaders.slice(0, 10).map((b, i) => (
                  <div key={i} className="p-3 flex items-center justify-between hover:bg-[var(--muted)]/30">
                    <div>
                      <span className="font-bold text-sm text-[var(--foreground)]">{b.name}</span>
                      <p className="text-[11px] text-[var(--muted-foreground)]">{b.team} • {b.innings} innings</p>
                    </div>
                    <div className="text-right num-font">
                      <span className="text-base font-black text-amber-500">{b.runs}</span>
                      <p className="text-[11px] text-[var(--muted-foreground)]">SR: {b.strikeRate.toFixed(1)} | Avg: {b.average.toFixed(1)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Purple Cap (Bowling) */}
          <div className="rounded-2xl bg-[var(--card)] border border-[var(--border)] overflow-hidden shadow-xs space-y-2">
            <div className="p-4 bg-purple-500/10 border-b border-purple-500/20 flex items-center justify-between">
              <span className="font-black text-sm text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                Purple Cap — Most Wickets
              </span>
            </div>

            <div className="divide-y divide-[var(--border)] text-xs">
              {bowlingLeaders.length === 0 ? (
                <p className="p-6 text-center text-[var(--muted-foreground)] italic">
                  No bowling data recorded for this tournament yet.
                </p>
              ) : (
                bowlingLeaders.slice(0, 10).map((b, i) => (
                  <div key={i} className="p-3 flex items-center justify-between hover:bg-[var(--muted)]/30">
                    <div>
                      <span className="font-bold text-sm text-[var(--foreground)]">{b.name}</span>
                      <p className="text-[11px] text-[var(--muted-foreground)]">{b.team} • {b.innings} innings</p>
                    </div>
                    <div className="text-right num-font">
                      <span className="text-base font-black text-purple-500">{b.wickets} wkts</span>
                      <p className="text-[11px] text-[var(--muted-foreground)]">Econ: {b.economy.toFixed(2)} | Best: {b.bestFigures}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
