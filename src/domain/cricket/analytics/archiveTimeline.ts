import type { MatchScorecard } from '@/domain/cricket/types';

/** Calendar-day key in local time, used to group the archive timeline. */
export function dayKeyOf(ts?: string | number): string {
 if (!ts) return 'none';
 const d = new Date(ts);
 if (Number.isNaN(d.getTime())) return 'none';
 return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * The winning team's name as recorded on the innings rows, or null.
 * Prefers the scorecard's recorded `winner`; falls back to comparing
 * innings totals so legacy records without a winner still highlight.
 */
export function winnerTeamOf(m: MatchScorecard): string | null {
 if (m.status !== 'COMPLETED') return null;
 const inningsTeams = [m.firstInnings?.team, m.secondInnings?.team].filter(
 (x): x is string => !!x,
 );
 const recorded = (m.winner || '').trim().toLowerCase();
 if (recorded) {
 const hit = inningsTeams.find((x) => x.trim().toLowerCase() === recorded);
 if (hit) return hit;
 }
 if (m.firstInnings && m.secondInnings) {
 if (m.secondInnings.totalRuns > m.firstInnings.totalRuns) return m.secondInnings.team;
 if (m.firstInnings.totalRuns > m.secondInnings.totalRuns) return m.firstInnings.team;
 }
 return null;
}

export interface ChaseWords {
 template: string;
 runWord: string;
 runsWord: string;
 ballWord: string;
 ballsWord: string;
}

/**
 * "Thunder Storm need 86 runs from 33 balls" for a live chase, built
 * from the caller's localised template and unit words. Null when the
 * match is not a live chase or the chase is already decided.
 */
export function chaseEquationFor(m: MatchScorecard, words: ChaseWords): string | null {
 if (m.status !== 'ONGOING' || !m.firstInnings || !m.secondInnings) return null;
 const target = m.targetScore && m.targetScore > 0 ? m.targetScore : m.firstInnings.totalRuns + 1;
 const need = target - m.secondInnings.totalRuns;
 const ballsLeft = m.totalOvers * 6 - (m.secondInnings.totalBalls || 0);
 if (need <= 0 || ballsLeft <= 0) return null;
 const runsText = `${need} ${need === 1 ? words.runWord : words.runsWord}`;
 const ballsText = `${ballsLeft} ${ballsLeft === 1 ? words.ballWord : words.ballsWord}`;
 return words.template
 .replace('{team}', m.secondInnings.team)
 .replace('{runs}', runsText)
 .replace('{balls}', ballsText);
}
