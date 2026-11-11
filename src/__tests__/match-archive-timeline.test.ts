/**
 * Season Timeline redesign (Match Archive) — TAIMUR picked mockup (6)
 * on 2026-11-10: matches group under a date rail, the winner carries a
 * trophy, live chases show the equation, and checkboxes live behind a
 * Select mode instead of an always-visible Select All bar.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
 dayKeyOf,
 winnerTeamOf,
 chaseEquationFor,
} from '@/domain/cricket/analytics/archiveTimeline';
import type { MatchScorecard } from '@/domain/cricket/types';

function innings(team: string, runs: number, wkts: number, balls = 60, overs = '10.0') {
 return { team, totalRuns: runs, totalWickets: wkts, totalBalls: balls, oversString: overs } as any;
}
function match(partial: Partial<MatchScorecard>): MatchScorecard {
 return {
 id: 'm1',
 teamA: 'HUNGRY XI',
 teamB: 'PALASH',
 totalOvers: 10,
 status: 'COMPLETED',
 ...partial,
 } as MatchScorecard;
}
const EN = {
 template: '{team} need {runs} from {balls}',
 runWord: 'run',
 runsWord: 'runs',
 ballWord: 'ball',
 ballsWord: 'balls',
};
const BN = {
 template: '{team}-এর দরকার {runs}, বাকি {balls}',
 runWord: 'রান',
 runsWord: 'রান',
 ballWord: 'বল',
 ballsWord: 'বল',
};

describe('dayKeyOf', () => {
 it('groups by local calendar day and treats missing dates as none', () => {
 const a = new Date(2026, 10, 10, 9, 15).getTime();
 const b = new Date(2026, 10, 10, 23, 59).getTime();
 const c = new Date(2026, 10, 8, 12, 0).getTime();
 expect(dayKeyOf(a)).toBe(dayKeyOf(b));
 expect(dayKeyOf(a)).not.toBe(dayKeyOf(c));
 expect(dayKeyOf(undefined)).toBe('none');
 });
});

describe('winnerTeamOf', () => {
 it('prefers the recorded winner, matched case-insensitively to the innings team', () => {
 const m = match({
 winner: 'hungry xi',
 firstInnings: innings('HUNGRY XI', 140, 2),
 secondInnings: innings('PALASH', 139, 4),
 });
 expect(winnerTeamOf(m)).toBe('HUNGRY XI');
 });

 it('falls back to totals for legacy records without a winner', () => {
 const chaseWin = match({
 firstInnings: innings('RAIPURA XI', 124, 0, 120, '20.0'),
 secondInnings: innings('SEKENDORDI XI', 125, 5, 77, '12.5'),
 });
 expect(winnerTeamOf(chaseWin)).toBe('SEKENDORDI XI');
 const defendWin = match({
 firstInnings: innings('HUNGRY XI', 140, 2),
 secondInnings: innings('PALASH', 139, 4),
 });
 expect(winnerTeamOf(defendWin)).toBe('HUNGRY XI');
 });

 it('returns null for ties and for matches still in progress', () => {
 const tied = match({
 firstInnings: innings('A', 100, 5),
 secondInnings: innings('B', 100, 7),
 });
 expect(winnerTeamOf(tied)).toBeNull();
 const live = match({
 status: 'ONGOING',
 winner: 'HUNGRY XI',
 firstInnings: innings('HUNGRY XI', 140, 2),
 });
 expect(winnerTeamOf(live)).toBeNull();
 });
});

describe('chaseEquationFor', () => {
 it('builds the equation from the recorded target and balls remaining', () => {
 const m = match({
 status: 'ONGOING',
 targetScore: 150,
 firstInnings: innings('Hungry Eleven', 149, 8),
 secondInnings: innings('Thunder Storm', 64, 1, 27, '4.3'),
 });
 expect(chaseEquationFor(m, EN)).toBe('Thunder Storm need 86 runs from 33 balls');
 expect(chaseEquationFor(m, BN)).toBe('Thunder Storm-এর দরকার 86 রান, বাকি 33 বল');
 });

 it('derives the target from the first innings when targetScore is unset, and handles singulars', () => {
 const m = match({
 status: 'ONGOING',
 totalOvers: 1,
 firstInnings: innings('A', 6, 0, 6, '1.0'),
 secondInnings: innings('B', 6, 0, 5, '0.5'),
 });
 expect(chaseEquationFor(m, EN)).toBe('B need 1 run from 1 ball');
 });

 it('returns null when not chasing, already past the target, or out of balls', () => {
 const firstInn = match({ status: 'ONGOING', firstInnings: innings('A', 50, 2, 30, '5.0') });
 expect(chaseEquationFor(firstInn, EN)).toBeNull();
 const passed = match({
 status: 'ONGOING',
 targetScore: 100,
 firstInnings: innings('A', 99, 5),
 secondInnings: innings('B', 100, 2, 40, '6.4'),
 });
 expect(chaseEquationFor(passed, EN)).toBeNull();
 const done = match({ status: 'COMPLETED', firstInnings: innings('A', 99, 5), secondInnings: innings('B', 90, 9, 60, '10.0') });
 expect(chaseEquationFor(done, EN)).toBeNull();
 });
});

describe('history page — timeline wiring (source pins)', () => {
 const src = fs.readFileSync(
 path.resolve(__dirname, '../app/matches/history/page.tsx'),
 'utf8',
 );

 it('groups matches into day groups and renders the rail', () => {
 expect(src).toContain('dayGroups');
 expect(src).toContain('dayKeyOf(m.createdAt)');
 expect(src).toContain("t('history_today', 'Today')");
 expect(src).toContain("t('history_yesterday', 'Yesterday')");
 });

 it('shows tabs with live counts', () => {
 expect(src).toContain('completedCount');
 expect(src).toContain('ongoingCount');
 });

 it('hides checkboxes and the batch bar behind Select mode', () => {
 expect(src).toContain('selectMode');
 expect(src).toContain("{selectMode && filteredMatches.length > 0 && (");
 expect(src).toContain("{!selectMode && (");
 // card click toggles selection instead of navigating in select mode
 expect(src).toContain('if (selectMode) {');
 });

 it('marks the winner with a trophy and shows the chase equation as the live verdict', () => {
 expect(src).toContain('winnerTeamOf(m)');
 expect(src).toContain('<Trophy');
 expect(src).toContain('chaseEquation(m)');
 });

 it('Polish B: numbered day nodes, connector tick, fading rail (TAIMUR picked B)', () => {
 expect(src).toContain('dayNum: number | null');
 expect(src).toContain('{group.dayNum}');
 expect(src).toContain('Connector tick from the rail to the first card (Polish B)');
 expect(src).toContain('linear-gradient(to bottom, var(--border) 0%, var(--border) 88%, transparent 100%)');
 expect(src).toContain('uppercase tracking-wider text-caption');
 });

 it('search is an icon at the right of the tabs row, not a permanent box (TAIMUR)', () => {
 expect(src).not.toContain('w-64 pl-9');
 expect(src).toContain('searchOpen');
 expect(src).toContain('setSearchOpen(true)');
 // shifted off the right edge with a safe-area gap
 expect(src).toContain('h-11 w-11 mr-2 rounded-full');
 // active query shows the emerald dot on the icon
 expect(src).toContain("search.trim() !== ''");
 expect(src).toContain("t('history_search_close', 'Close search')");
 });

 it('places the PDF button beside Scorecard with Delete at the far right (TAIMUR)', () => {
 const scorecardAt = src.indexOf("t('history_scorecard', 'Scorecard')");
 const pdfAt = src.indexOf("t('download_pdf', 'Download PDF Scorecard')");
 const spacerAt = src.indexOf('<span className="flex-1" />', scorecardAt);
 expect(scorecardAt).toBeGreaterThan(-1);
 expect(pdfAt).toBeGreaterThan(scorecardAt);
 expect(spacerAt).toBeGreaterThan(pdfAt);
 });

 it('has no duplicate live banner above the timeline (TAIMUR, 2026-11-11)', () => {
 // The Live Return Banner duplicated the live card's progress info;
 // TAIMUR asked for it to go — the timeline card alone carries it.
 expect(src).not.toContain('history_return_scoring');
 expect(src).not.toContain('Active Match Return Banner');
 });

 it('keeps the safety rails: skeleton testid, pb-safe spacing, ConfirmationDialog deletes', () => {
 expect(src).toContain('data-testid="match-history-skeleton-container"');
 expect(src).toContain('pb-safe pb-8');
 expect(src).toContain('<ConfirmationDialog');
 });
});
