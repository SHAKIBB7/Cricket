/**
 * Career player profiles — cross-match aggregation.
 *
 * Builds one career record per person from every locally stored
 * match scorecard plus the saved-team squads. Identity follows the
 * F9 model used across the app:
 *
 *   1. A record carrying a stable `playerId` belongs to that id.
 *   2. A name-only record whose cleaned name is a known name variant
 *      of some stable id (see buildPlayerIdentityIndex) belongs to
 *      that id — so a player renamed in the teams editor keeps one
 *      unified career, in both directions.
 *   3. Anything else is keyed by its cleaned name alone (legacy and
 *      guest players who have no stable identity anywhere).
 *
 * Everything except `loadCareerPlayers` / `loadCareerPlayer` is a
 * pure function over scorecards, so the aggregation is unit-testable
 * without Dexie.
 *
 * ── playerKey scheme (used by /players/[playerKey]) ──────────────
 *   - Stable identity: the playerId itself (minted as `pl_<random>`
 *     by playerIdentity.newPlayerId, so it is URL-safe as-is).
 *   - Name-only identity: `n_` + encodeURIComponent(cleaned name).
 * `playerKeyForRecord` / `playerKeyForName` mint keys,
 * `parsePlayerKey` reads them back, and `findCareerPlayer` resolves
 * a key against aggregated careers (a name key also matches an
 * id-backed career when the name is one of its recorded variants).
 */

import type { MatchScorecard } from '@/domain/cricket/types';
import { cleanPlayerName } from '@/domain/cricket/formatters';
import {
  buildPlayerIdentityIndex,
  type PlayerIdentityIndex,
} from '@/domain/cricket/analytics/playerIdentityIndex';
import { playerHasBatted, isRetiredHurt } from '@/domain/cricket/battingCard';
import { isRetiredHurtFallOfWicket } from '@/domain/cricket/dismissals';
import {
  normalizeTeamPlayers,
  type TeamPlayer,
} from '@/domain/teams/playerIdentity';
import type { SavedTeam } from '@/infrastructure/database/dexie-db';
import { MatchRepository } from '@/infrastructure/storage/MatchRepository';
import { FeatureHubRepository } from '@/infrastructure/storage/FeatureHubRepository';

// ── playerKey scheme ─────────────────────────────────────────────

export type ParsedPlayerKey =
  | { kind: 'id'; playerId: string }
  | { kind: 'name'; name: string };

const NAME_KEY_PREFIX = 'n_';

/** Mint a profile key for a record that may carry a stable id. */
export function playerKeyForRecord(record: {
  playerId?: string;
  name?: string;
}): string {
  if (record?.playerId) return record.playerId;
  return playerKeyForName(record?.name || '');
}

/** Mint a profile key for a bare display name. */
export function playerKeyForName(name: string): string {
  return NAME_KEY_PREFIX + encodeURIComponent(cleanPlayerName(name || ''));
}

export function parsePlayerKey(key: string): ParsedPlayerKey {
  const raw = (key || '').trim();
  if (raw.startsWith(NAME_KEY_PREFIX)) {
    const encoded = raw.slice(NAME_KEY_PREFIX.length);
    let name = encoded;
    try {
      name = decodeURIComponent(encoded);
    } catch {
      // A name containing a literal '%' can arrive already decoded
      // by the router; fall back to the raw remainder.
      name = encoded;
    }
    return { kind: 'name', name: cleanPlayerName(name) };
  }
  if (raw.startsWith('pl_')) return { kind: 'id', playerId: raw };
  // Defensive: an unprefixed value is treated as a bare name.
  return { kind: 'name', name: cleanPlayerName(raw) };
}

/** The /players/[playerKey] href for a key (single-encoded). */
export function playerProfileHref(key: string): string {
  return `/players/${encodeURIComponent(key)}`;
}

/**
 * Resolve the best profile key for a display name within a set of
 * scorecards: the stable id when the name is a known variant of one,
 * otherwise a name key. Mirrors the analytics page's selection
 * semantics so links land on the same unified career.
 */
export function resolvePlayerKey(
  scorecards: readonly MatchScorecard[],
  name: string
): string {
  const cleaned = cleanPlayerName(name || '');
  if (!cleaned) return playerKeyForName('');
  const index = buildPlayerIdentityIndex(scorecards);
  for (const [playerId, variants] of index.namesByStableId) {
    if (variants.has(cleaned)) return playerId;
  }
  return playerKeyForName(cleaned);
}

// ── Career record shapes ─────────────────────────────────────────

export interface CareerBatting {
  matches: number;
  innings: number;
  notOuts: number;
  runs: number;
  balls: number;
  highScore: number;
  highScoreNotOut: boolean;
  fifties: number;
  hundreds: number;
  ducks: number;
  /** null when the player has never been dismissed. */
  average: number | null;
  strikeRate: number;
  fours: number;
  sixes: number;
}

export interface CareerBowling {
  matches: number;
  innings: number;
  balls: number;
  maidens: number;
  runs: number;
  wickets: number;
  /** Best single-innings figures, e.g. { wickets: 4, runs: 23 }. */
  bestWickets: number;
  bestRuns: number;
  /** null when the player has taken no wickets. */
  average: number | null;
  economy: number;
  /** Balls per wicket; null when the player has taken no wickets. */
  strikeRate: number | null;
}

export interface CareerFielding {
  catches: number;
  stumpings: number;
  runOuts: number;
  total: number;
}

export interface CareerMatchAppearance {
  matchId: string;
  createdAt: string;
  status: MatchScorecard['status'];
  teamFor: string;
  teamAgainst: string;
  result?: string;
  batting?: {
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
    dismissed: boolean;
  };
  bowling?: { balls: number; runs: number; wickets: number };
  isMom: boolean;
}

export interface CareerPlayer {
  /** Canonical profile key (see scheme above). */
  key: string;
  /** Stable identity when one is known, else null. */
  playerId: string | null;
  /** Most recently recorded display name. */
  name: string;
  /** Every cleaned display name this career has been recorded under. */
  nameVariants: string[];
  /** Teams the player has appeared for (squads + match records). */
  teams: string[];
  matchesPlayed: number;
  momCount: number;
  batting: CareerBatting;
  bowling: CareerBowling;
  fielding: CareerFielding;
  /** Most recent first. */
  appearances: CareerMatchAppearance[];
}

// ── Aggregation internals ────────────────────────────────────────

interface GroupState {
  playerId: string | null;
  name: string;
  nameLatestAt: string;
  variants: Set<string>;
  teams: Set<string>;
  batMatches: Set<string>;
  bowlMatches: Set<string>;
  inningsBatted: number;
  notOuts: number;
  batRuns: number;
  batBalls: number;
  highScore: number;
  highScoreNotOut: boolean;
  fifties: number;
  hundreds: number;
  ducks: number;
  dismissals: number;
  fours: number;
  sixes: number;
  bowlInnings: number;
  bowlBalls: number;
  maidens: number;
  bowlRuns: number;
  wickets: number;
  bestWickets: number;
  bestRuns: number;
  catches: number;
  stumpings: number;
  runOuts: number;
  momCount: number;
  appearances: Map<string, CareerMatchAppearance>;
}

function newGroup(playerId: string | null, name: string): GroupState {
  return {
    playerId,
    name,
    nameLatestAt: '',
    variants: new Set(name ? [name] : []),
    teams: new Set(),
    batMatches: new Set(),
    bowlMatches: new Set(),
    inningsBatted: 0,
    notOuts: 0,
    batRuns: 0,
    batBalls: 0,
    highScore: 0,
    highScoreNotOut: false,
    fifties: 0,
    hundreds: 0,
    ducks: 0,
    dismissals: 0,
    fours: 0,
    sixes: 0,
    bowlInnings: 0,
    bowlBalls: 0,
    maidens: 0,
    bowlRuns: 0,
    wickets: 0,
    bestWickets: 0,
    bestRuns: 0,
    catches: 0,
    stumpings: 0,
    runOuts: 0,
    momCount: 0,
    appearances: new Map(),
  };
}

function dismissalKind(fow: {
  dismissalType?: string;
  dismissal?: string;
}): 'Caught' | 'Stumped' | 'Run Out' | null {
  const type = fow.dismissalType || '';
  if (type === 'Caught' || type === 'Stumped' || type === 'Run Out') {
    return type;
  }
  const text = (fow.dismissal || '').trim();
  if (text.startsWith('Caught')) return 'Caught';
  if (text.startsWith('Stumped')) return 'Stumped';
  if (text.startsWith('Run Out')) return 'Run Out';
  return null;
}

/**
 * Aggregate careers from scorecards (+ saved-team squads, which seed
 * identity/team affiliation for players who have not played yet).
 * Pure: no storage access, deterministic for a given input order —
 * matches are processed oldest-first so the display name ends as the
 * most recently recorded variant.
 */
export function aggregateCareers(
  scorecards: readonly MatchScorecard[],
  teams: readonly SavedTeam[] = []
): CareerPlayer[] {
  const matches = [...(scorecards || [])].sort((a, b) =>
    (a.createdAt || '').localeCompare(b.createdAt || '')
  );
  const index: PlayerIdentityIndex = buildPlayerIdentityIndex(matches);

  // Cleaned-name → stable id, for attributing name-only records
  // (including fielder credits, which never carry an id).
  const idByVariantName = new Map<string, string>();
  for (const [playerId, variants] of index.namesByStableId) {
    for (const variant of variants) {
      const lower = variant.toLowerCase();
      if (!idByVariantName.has(lower)) idByVariantName.set(lower, playerId);
    }
  }

  const groups = new Map<string, GroupState>();
  const groupFor = (record: {
    playerId?: string;
    name?: string;
  }): GroupState | null => {
    const cleaned = cleanPlayerName(record?.name || '');
    let playerId: string | null = record?.playerId || null;
    if (!playerId && cleaned) {
      playerId = idByVariantName.get(cleaned.toLowerCase()) || null;
    }
    if (!playerId && !cleaned) return null;
    const gKey = playerId ? `id:${playerId}` : `name:${cleaned.toLowerCase()}`;
    let g = groups.get(gKey);
    if (!g) {
      g = newGroup(playerId, cleaned);
      groups.set(gKey, g);
    }
    if (cleaned) g.variants.add(cleaned);
    return g;
  };

  const touchName = (g: GroupState, name: string, at: string) => {
    const cleaned = cleanPlayerName(name || '');
    if (!cleaned) return;
    g.variants.add(cleaned);
    if (!g.name || at >= g.nameLatestAt) {
      g.name = cleaned;
      g.nameLatestAt = at;
    }
  };

  // Seed from saved squads: identity + team affiliation even for
  // players who have never appeared in a stored match.
  for (const team of teams || []) {
    const players: TeamPlayer[] = normalizeTeamPlayers(team?.players);
    for (const p of players) {
      const g = groupFor({ playerId: p.id, name: p.name });
      if (!g) continue;
      touchName(g, p.name, team.updatedAt || team.createdAt || '');
      if (team.name) g.teams.add(team.name);
    }
  }

  const appearanceFor = (
    g: GroupState,
    match: MatchScorecard,
    teamFor: string,
    teamAgainst: string
  ): CareerMatchAppearance => {
    let app = g.appearances.get(match.id);
    if (!app) {
      app = {
        matchId: match.id,
        createdAt: match.createdAt || '',
        status: match.status,
        teamFor,
        teamAgainst,
        result: match.result,
        isMom: false,
      };
      g.appearances.set(match.id, app);
    }
    return app;
  };

  for (const match of matches) {
    const inningsList = [match.firstInnings, match.secondInnings].filter(
      Boolean
    ) as NonNullable<MatchScorecard['firstInnings']>[];

    for (const inn of inningsList) {
      // ── Batting ──
      (inn.players || []).forEach((p, idx) => {
        if (!playerHasBatted(p, idx, inn)) return;
        const g = groupFor(p);
        if (!g) return;
        touchName(g, p.name, match.createdAt || '');
        g.teams.add(inn.team);
        g.batMatches.add(match.id);
        g.inningsBatted += 1;
        const runs = p.runs || 0;
        g.batRuns += runs;
        g.batBalls += p.balls || 0;
        g.fours += p.fours || 0;
        g.sixes += p.sixes || 0;
        // Retired hurt is not a dismissal (F1): the engine leaves
        // isDismissed false for it; isRetiredHurt is belt-and-braces
        // for legacy records that predate that convention.
        const dismissed = Boolean(p.isDismissed) && !isRetiredHurt(p);
        if (dismissed) {
          g.dismissals += 1;
          if (runs === 0) g.ducks += 1;
        } else {
          g.notOuts += 1;
        }
        if (runs >= 100) g.hundreds += 1;
        else if (runs >= 50) g.fifties += 1;
        if (
          runs > g.highScore ||
          (runs === g.highScore && !dismissed && g.highScoreNotOut === false && runs > 0)
        ) {
          g.highScore = runs;
          g.highScoreNotOut = !dismissed;
        } else if (runs === g.highScore && !dismissed) {
          g.highScoreNotOut = true;
        }
        const app = appearanceFor(g, match, inn.team, inn.bowlingTeam);
        app.batting = {
          runs,
          balls: p.balls || 0,
          fours: p.fours || 0,
          sixes: p.sixes || 0,
          dismissed,
        };
      });

      // ── Bowling ──
      for (const b of inn.bowlers || []) {
        const bowled =
          (b.ballsBowled || 0) > 0 ||
          (b.runs || 0) > 0 ||
          (b.wickets || 0) > 0 ||
          (b.overHistory?.length || 0) > 0;
        if (!bowled) continue;
        const g = groupFor(b);
        if (!g) continue;
        touchName(g, b.name, match.createdAt || '');
        g.teams.add(inn.bowlingTeam);
        g.bowlMatches.add(match.id);
        g.bowlInnings += 1;
        g.bowlBalls += b.ballsBowled || 0;
        g.maidens += b.maidens || 0;
        g.bowlRuns += b.runs || 0;
        g.wickets += b.wickets || 0;
        const wkts = b.wickets || 0;
        const runs = b.runs || 0;
        if (
          wkts > g.bestWickets ||
          (wkts === g.bestWickets && wkts > 0 && runs < g.bestRuns)
        ) {
          g.bestWickets = wkts;
          g.bestRuns = runs;
        }
        const app = appearanceFor(g, match, inn.bowlingTeam, inn.team);
        app.bowling = {
          balls: b.ballsBowled || 0,
          runs: b.runs || 0,
          wickets: b.wickets || 0,
        };
      }

      // ── Fielding (from fall-of-wicket fielder credits) ──
      for (const fow of inn.fallOfWickets || []) {
        if (isRetiredHurtFallOfWicket(fow)) continue;
        const fielderName = cleanPlayerName(fow.fielder || '');
        if (!fielderName) continue;
        const kind = dismissalKind(fow);
        if (!kind) continue;
        const g = groupFor({ name: fielderName });
        if (!g) continue;
        touchName(g, fielderName, match.createdAt || '');
        if (kind === 'Caught') g.catches += 1;
        else if (kind === 'Stumped') g.stumpings += 1;
        else g.runOuts += 1;
      }
    }

    // ── Man of the Match ──
    const momId = match.momStats?.playerId || null;
    const momName = cleanPlayerName(match.momStats?.name || match.mom || '');
    if (momId || momName) {
      const g = groupFor({ playerId: momId || undefined, name: momName });
      if (g) {
        if (momName) touchName(g, momName, match.createdAt || '');
        g.momCount += 1;
        const app = g.appearances.get(match.id);
        if (app) app.isMom = true;
      }
    }
  }

  const careers: CareerPlayer[] = [];
  for (const g of groups.values()) {
    const appearances = [...g.appearances.values()].sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    );
    const batDismissals = g.dismissals;
    careers.push({
      key: g.playerId ? g.playerId : playerKeyForName(g.name),
      playerId: g.playerId,
      name: g.name,
      nameVariants: [...g.variants].sort(),
      teams: [...g.teams].sort(),
      matchesPlayed: g.appearances.size,
      momCount: g.momCount,
      batting: {
        matches: g.batMatches.size,
        innings: g.inningsBatted,
        notOuts: g.notOuts,
        runs: g.batRuns,
        balls: g.batBalls,
        highScore: g.highScore,
        highScoreNotOut: g.highScoreNotOut,
        fifties: g.fifties,
        hundreds: g.hundreds,
        ducks: g.ducks,
        average: batDismissals > 0 ? g.batRuns / batDismissals : null,
        strikeRate: g.batBalls > 0 ? (g.batRuns / g.batBalls) * 100 : 0,
        fours: g.fours,
        sixes: g.sixes,
      },
      bowling: {
        matches: g.bowlMatches.size,
        innings: g.bowlInnings,
        balls: g.bowlBalls,
        maidens: g.maidens,
        runs: g.bowlRuns,
        wickets: g.wickets,
        bestWickets: g.bestWickets,
        bestRuns: g.bestRuns,
        average: g.wickets > 0 ? g.bowlRuns / g.wickets : null,
        economy: g.bowlBalls > 0 ? g.bowlRuns / (g.bowlBalls / 6) : 0,
        strikeRate: g.wickets > 0 ? g.bowlBalls / g.wickets : null,
      },
      fielding: {
        catches: g.catches,
        stumpings: g.stumpings,
        runOuts: g.runOuts,
        total: g.catches + g.stumpings + g.runOuts,
      },
      appearances,
    });
  }
  return careers;
}

/** Default list ordering: most matches, then runs, wickets, name. */
export function sortCareerPlayers(players: CareerPlayer[]): CareerPlayer[] {
  return [...players].sort(
    (a, b) =>
      b.matchesPlayed - a.matchesPlayed ||
      b.batting.runs - a.batting.runs ||
      b.bowling.wickets - a.bowling.wickets ||
      a.name.localeCompare(b.name)
  );
}

/**
 * Resolve a route key against aggregated careers. A name key also
 * matches an id-backed career when the name is one of its recorded
 * variants (rename unification), preferring an exact key match.
 */
export function findCareerPlayer(
  players: readonly CareerPlayer[],
  rawKey: string
): CareerPlayer | undefined {
  const exact = players.find((p) => p.key === rawKey);
  if (exact) return exact;
  const parsed = parsePlayerKey(rawKey);
  if (parsed.kind === 'id') {
    return players.find((p) => p.playerId === parsed.playerId);
  }
  const lower = parsed.name.toLowerCase();
  if (!lower) return undefined;
  return players.find((p) =>
    p.nameVariants.some((v) => v.toLowerCase() === lower)
  );
}

// ── Async loaders (the only storage-touching functions) ──────────

export async function loadCareerPlayers(): Promise<CareerPlayer[]> {
  const [matches, teams] = await Promise.all([
    MatchRepository.getAllMatches(),
    FeatureHubRepository.loadTeams(),
  ]);
  return sortCareerPlayers(aggregateCareers(matches, teams));
}

export async function loadCareerPlayer(
  key: string
): Promise<CareerPlayer | undefined> {
  const players = await loadCareerPlayers();
  return findCareerPlayer(players, key);
}
