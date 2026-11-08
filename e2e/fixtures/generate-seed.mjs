#!/usr/bin/env node
/**
 * Generates e2e/fixtures/seeded-matches.json — the deterministic Dexie seed
 * used by the seeded visual + offline-scoring specs.
 *
 * Provenance: the base object is the hand-written MatchScorecard fixture
 * from src/__tests__/dynamic-pdf-match-report.test.ts (Thunder Storm vs
 * Hungry Eleven), extracted verbatim, then transformed into two records:
 *
 *   e2e-seed-completed — the fixture as-is (COMPLETED), fixed timestamps,
 *                        full 11-name squads, Man of the Match set.
 *   e2e-seed-live      — same match re-opened mid-chase: ONGOING, 2nd
 *                        innings at 64/1 after 4.3 overs, target 150.
 *
 * Seeding only the `matches` row is sufficient: the score page rebuilds
 * its engine from the stored scorecard snapshot and tolerates an empty
 * event log (see loadMatch in src/app/matches/score/[matchId]/page.tsx).
 *
 * Run: node e2e/fixtures/generate-seed.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const source = readFileSync(
  join(repoRoot, 'src/__tests__/dynamic-pdf-match-report.test.ts'),
  'utf8',
);

const marker = 'const sampleMatchThunderVsHungry: MatchScorecard = ';
const start = source.indexOf(marker);
if (start < 0) throw new Error('fixture marker not found');
let depth = 0;
let end = -1;
for (let i = start + marker.length; i < source.length; i++) {
  if (source[i] === '{') depth++;
  else if (source[i] === '}') {
    depth--;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }
}
if (end < 0) throw new Error('fixture object not closed');
const literal = source
  .slice(start + marker.length, end)
  .replaceAll('new Date().toISOString()', `'2025-06-15T10:00:00.000Z'`);
// The fixture is a plain data literal; evaluating it is safe and exact.
// eslint-disable-next-line no-eval
const base = eval(`(${literal})`);

const TEAM_A_SQUAD = [
  'Sanaj', 'Roman', 'Saiful', 'Muh', 'Arif', 'Biplob',
  'Chanchal', 'Dolon', 'Emon', 'Fahim', 'Galib',
];
const TEAM_B_SQUAD = [
  'Rajib', 'Soykot', 'Taimur', 'Sajib', 'Rana', 'Naeem',
  'Rakibul', 'Mahin', 'Imran', 'Joy', 'Kamal',
];

const completed = structuredClone(base);
// The source fixture carries striker indices from the full XI (9/10) while
// listing only a few player rows. Point them at listed, not-out rows so no
// page component can index out of bounds.
completed.firstInnings.strikerIdx = 2; // Taimur, not out
completed.secondInnings.strikerIdx = 2; // Saiful, not out
completed.secondInnings.nonStrikerIdx = 0;
completed.id = 'e2e-seed-completed';
completed.syncStatus = 'SYNCED';
completed.mom = 'Taimur';
completed.teamASquad = TEAM_A_SQUAD;
completed.teamBSquad = TEAM_B_SQUAD;

const live = structuredClone(base);
live.id = 'e2e-seed-live';
live.status = 'ONGOING';
live.syncStatus = 'SYNCED';
live.createdAt = '2025-06-16T10:00:00.000Z';
live.updatedAt = '2025-06-16T10:00:00.000Z';
live.teamASquad = TEAM_A_SQUAD;
live.teamBSquad = TEAM_B_SQUAD;
delete live.winner;
delete live.loser;
delete live.result;
delete live.resultType;
delete live.margin;
delete live.marginType;

const inn2 = live.secondInnings;
inn2.totalRuns = 64;
inn2.totalWickets = 1;
inn2.totalBalls = 27;
inn2.oversString = '4.3';
inn2.thisOverLog = ['1', '4', '0'];
inn2.isOverComplete = false;
inn2.strikerIdx = 0;
inn2.nonStrikerIdx = 1;
inn2.nextPlayerIdx = 3;
inn2.currentBowlerIdx = 0;
inn2.currentPartnership = { batter1: 'Sanaj', batter2: 'Roman', runs: 33, balls: 21 };
inn2.players[0].isDismissed = false; // Sanaj — on strike
delete inn2.players[0].dismissalText;
inn2.players[1].isDismissed = false; // Roman — non-striker
delete inn2.players[1].dismissalText;
inn2.players[2].isDismissed = true; // Saiful — the one wicket
inn2.players[2].dismissalText = 'Bowled';

// Bowler figures must respect the per-bowler quota (10 overs / 5 = 2 overs
// each) and add up to totalBalls (27). The source fixture's current bowler
// had 18 balls — over quota — and the engine rightly refuses to score off
// an ineligible bowler, which would break the offline scoring journey.
inn2.bowlers = [
  { id: 'hb1', name: 'Naeem', ballsBowled: 9, maidens: 0, runs: 21, wickets: 1, overHistory: [] },
  { id: 'hb2', name: 'Roman', ballsBowled: 12, maidens: 0, runs: 28, wickets: 0, overHistory: [] },
  { id: 'hb3', name: 'Rakibul', ballsBowled: 6, maidens: 0, runs: 15, wickets: 0, overHistory: [] },
];

const out = { completed, live };
writeFileSync(join(here, 'seeded-matches.json'), JSON.stringify(out, null, 2) + '\n');
console.log('wrote seeded-matches.json:', Object.keys(out));
