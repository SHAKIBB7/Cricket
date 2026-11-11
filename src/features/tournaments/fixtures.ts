/**
 * Schedule fixtures & knockout bracket (feature layer).
 *
 * This module is deliberately separate from the domain
 * `TournamentEngine`: the engine's `fixtures` drive standings and
 * its IPL-style playoff progression, while this SCHEDULE is the
 * user-facing fixture list with proper round grouping (circle
 * method round-robin) and a simple top-4 single-elimination
 * bracket (SF 1v4, SF 2v3, Final).
 *
 * Persistence: the schedule lives on the tournament record under
 * the additive optional `schedule` field. Dexie records are
 * schemaless, and the sync layer writes explicit field lists to
 * Firestore (whose rules allowlist the domain fields), so the
 * schedule stays local-first data with no migration and no rules
 * change. All functions here are pure — the page persists results
 * through FeatureHubRepository.saveTournament.
 */

import type { MatchScorecard } from '@/domain/cricket/types';
import type { Tournament } from '@/domain/tournament/types';

export type ScheduleStage = 'LEAGUE' | 'SEMI' | 'FINAL';
export type ScheduleFixtureStatus = 'SCHEDULED' | 'COMPLETED';

export interface ScheduleFixture {
  id: string;
  round: number;
  homeTeam: string;
  /** Undefined means the home team has a bye this round. */
  awayTeam?: string;
  stage: ScheduleStage;
  status: ScheduleFixtureStatus;
  /** Linked scorecard id, once a played match is matched at load. */
  matchId?: string;
  winner?: string;
  resultText?: string;
}

/** A tournament record carrying the optional schedule field. */
export type TournamentWithSchedule = Tournament & {
  schedule?: ScheduleFixture[];
};

export const WINNER_SF1_PLACEHOLDER = 'Winner SF1';
export const WINNER_SF2_PLACEHOLDER = 'Winner SF2';

export function isPlaceholderTeam(name: string | undefined): boolean {
  return name === WINNER_SF1_PLACEHOLDER || name === WINNER_SF2_PLACEHOLDER;
}

function cleanTeams(teams: string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const raw of teams) {
    const name = (raw || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(name);
  }
  return cleaned;
}

/**
 * Round-robin fixtures via the circle method: every team plays
 * every other team exactly once, grouped into rounds (n-1 rounds
 * for even n, n rounds for odd n). With an odd team count one
 * team has a bye each round (a fixture with no awayTeam).
 * Home/away alternates by round+pairing parity for balance.
 */
export function generateRoundRobinFixtures(
  teams: string[],
  options?: { idPrefix?: string; startRound?: number; meetings?: number }
): ScheduleFixture[] {
  const cleaned = cleanTeams(teams);
  if (cleaned.length < 2) return [];

  const prefix = options?.idPrefix ?? 'sched';
  const startRound = Math.max(1, options?.startRound ?? 1);
  const meetings = Math.max(1, options?.meetings ?? 1);
  if (meetings > 1) {
    // One circle per meeting: return fixtures swap venues and
    // the round numbers continue where the previous meeting
    // stopped, mirroring the engine's league fixtures.
    const all: ScheduleFixture[] = [];
    let nextStart = startRound;
    for (let m = 0; m < meetings; m++) {
      const leg = generateRoundRobinFixtures(cleaned, {
        idPrefix: `${prefix}-m${m + 1}`,
        startRound: nextStart,
      });
      if (m % 2 === 1) {
        for (const f of leg) {
          if (f.awayTeam) {
            const home = f.homeTeam;
            f.homeTeam = f.awayTeam;
            f.awayTeam = home;
          }
        }
      }
      all.push(...leg);
      nextStart =
        leg.reduce((max, f) => Math.max(max, f.round), nextStart - 1) + 1;
    }
    return all;
  }

  // Pad to an even count with a bye sentinel.
  const BYE = null as unknown as string;
  const ring: string[] = [...cleaned];
  if (ring.length % 2 === 1) ring.push(BYE);
  const m = ring.length;
  const rounds = m - 1;

  const fixtures: ScheduleFixture[] = [];
  let positions = [...ring];

  for (let r = 0; r < rounds; r++) {
    const round = startRound + r;
    let pairingIndex = 0;
    for (let i = 0; i < m / 2; i++) {
      const a = positions[i];
      const b = positions[m - 1 - i];
      if (a === BYE && b === BYE) continue;
      // Alternate orientation so no team is always "home".
      const flip = (r + i) % 2 === 1;
      const home = a === BYE ? b : b === BYE ? a : flip ? b : a;
      const away = a === BYE || b === BYE ? undefined : flip ? a : b;
      fixtures.push({
        id: `${prefix}-r${round}-${pairingIndex}`,
        round,
        homeTeam: home,
        awayTeam: away,
        stage: 'LEAGUE',
        status: 'SCHEDULED',
      });
      pairingIndex++;
    }
    // Circle rotation: fix positions[0], rotate the rest by one.
    positions = [positions[0], positions[m - 1], ...positions.slice(1, m - 1)];
  }

  return fixtures;
}

/**
 * Top-4 single-elimination bracket: SF1 = seed 1 vs seed 4,
 * SF2 = seed 2 vs seed 3, then a Final whose teams stay as
 * "Winner SF1" / "Winner SF2" placeholders until the semis are
 * decided (see resolveKnockoutAdvancement).
 */
export function generateKnockoutFixtures(
  seededTopFour: string[],
  options?: { idPrefix?: string; startRound?: number }
): ScheduleFixture[] {
  const seeds = cleanTeams(seededTopFour);
  if (seeds.length < 4) return [];

  const prefix = options?.idPrefix ?? 'sched';
  const startRound = Math.max(1, options?.startRound ?? 1);
  const [s1, s2, s3, s4] = seeds;

  return [
    {
      id: `${prefix}-sf1`,
      round: startRound,
      homeTeam: s1,
      awayTeam: s4,
      stage: 'SEMI',
      status: 'SCHEDULED',
    },
    {
      id: `${prefix}-sf2`,
      round: startRound,
      homeTeam: s2,
      awayTeam: s3,
      stage: 'SEMI',
      status: 'SCHEDULED',
    },
    {
      id: `${prefix}-final`,
      round: startRound + 1,
      homeTeam: WINNER_SF1_PLACEHOLDER,
      awayTeam: WINNER_SF2_PLACEHOLDER,
      stage: 'FINAL',
      status: 'SCHEDULED',
    },
  ];
}

function samePairing(
  fixture: ScheduleFixture,
  match: MatchScorecard
): boolean {
  if (!fixture.awayTeam || isPlaceholderTeam(fixture.homeTeam) || isPlaceholderTeam(fixture.awayTeam)) {
    return false;
  }
  const home = fixture.homeTeam.trim().toLowerCase();
  const away = fixture.awayTeam.trim().toLowerCase();
  const a = (match.teamA || '').trim().toLowerCase();
  const b = (match.teamB || '').trim().toLowerCase();
  return (home === a && away === b) || (home === b && away === a);
}

function applyMatchToFixture(
  fixture: ScheduleFixture,
  match: MatchScorecard
): ScheduleFixture {
  const next: ScheduleFixture = {
    ...fixture,
    matchId: match.id,
    status: 'SCHEDULED',
    winner: undefined,
    resultText: undefined,
  };
  if (match.status === 'COMPLETED') {
    next.status = 'COMPLETED';
    const winner = (match.winner || '').trim();
    if (
      winner &&
      (winner.toLowerCase() === fixture.homeTeam.trim().toLowerCase() ||
        winner.toLowerCase() === (fixture.awayTeam || '').trim().toLowerCase())
    ) {
      next.winner =
        winner.toLowerCase() === fixture.homeTeam.trim().toLowerCase()
          ? fixture.homeTeam
          : fixture.awayTeam;
      if (match.result) next.resultText = match.result;
    }
  }
  return next;
}

/**
 * Best-effort linking at load time: a fixture is linked to a
 * match of this tournament whose pairing matches (either
 * orientation). A match already claimed by another fixture is
 * not reused; among candidates the earliest created wins.
 * Completed matches also fill status/winner/resultText.
 */
export function linkScheduleToMatches(
  schedule: ScheduleFixture[],
  matches: MatchScorecard[],
  tournamentId: string
): ScheduleFixture[] {
  const candidates = matches
    .filter((m) => m.advancedSettings?.tournamentId === tournamentId)
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

  const claimed = new Set<string>(
    schedule.filter((f) => f.matchId).map((f) => f.matchId as string)
  );

  return schedule.map((fixture) => {
    if (fixture.matchId) {
      const existing = candidates.find((m) => m.id === fixture.matchId);
      if (!existing) {
        // The linked match was deleted: the fixture returns
        // to an unplayed state instead of keeping a phantom
        // result forever.
        return {
          ...fixture,
          matchId: undefined,
          status: 'SCHEDULED' as const,
          winner: undefined,
          resultText: undefined,
        };
      }
      return applyMatchToFixture(fixture, existing);
    }
    if (!fixture.awayTeam) return fixture; // bye
    const match = candidates.find(
      (m) => !claimed.has(m.id) && samePairing(fixture, m)
    );
    if (!match) return fixture;
    claimed.add(match.id);
    return applyMatchToFixture(fixture, match);
  });
}

/**
 * When both semi-finals have winners, the Final's placeholder
 * teams are replaced by the actual finalists.
 */
export function resolveKnockoutAdvancement(
  schedule: ScheduleFixture[]
): ScheduleFixture[] {
  const semis = schedule.filter((f) => f.stage === 'SEMI');
  const final = schedule.find((f) => f.stage === 'FINAL');
  if (!final || semis.length < 2) return schedule;

  const sf1 = semis.find((f) => f.id.endsWith('-sf1')) ?? semis[0];
  const sf2 = semis.find((f) => f.id.endsWith('-sf2')) ?? semis[1];

  const resetFinal = (homeTeam: string, awayTeam?: string) =>
    schedule.map((f) =>
      f.id === final.id
        ? {
            ...f,
            homeTeam,
            awayTeam,
            matchId: undefined,
            status: 'SCHEDULED' as const,
            winner: undefined,
            resultText: undefined,
          }
        : f
    );

  if (!sf1?.winner || !sf2?.winner) {
    // A semi result was cleared or changed: any finalists or
    // champion recorded from the old semis are stale.
    const expectedHome = WINNER_SF1_PLACEHOLDER;
    const expectedAway = WINNER_SF2_PLACEHOLDER;
    if (
      final.homeTeam === expectedHome &&
      final.awayTeam === expectedAway &&
      !final.winner &&
      !final.matchId
    ) {
      return schedule;
    }
    return resetFinal(expectedHome, expectedAway);
  }

  if (final.homeTeam === sf1.winner && final.awayTeam === sf2.winner) {
    return schedule;
  }

  // The finalists changed: the old final's link and result go.
  return resetFinal(sf1.winner, sf2.winner);
}

/**
 * Full load-time resolution: link played matches, advance the
 * bracket, then link again so a decided final pairing can pick
 * up its played match in the same pass.
 */
export function resolveSchedule(
  schedule: ScheduleFixture[],
  matches: MatchScorecard[],
  tournamentId: string
): ScheduleFixture[] {
  const linked = linkScheduleToMatches(schedule, matches, tournamentId);
  const advanced = resolveKnockoutAdvancement(linked);
  return linkScheduleToMatches(advanced, matches, tournamentId);
}
