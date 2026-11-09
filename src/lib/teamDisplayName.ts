/**
 * Display name for a match's team field across storage eras: current
 * records store the team name as a plain string, while some legacy
 * records stored an object carrying a `name`. Anything else falls
 * back to the supplied placeholder.
 */
export function teamDisplayName(team: unknown, fallback: string): string {
  if (typeof team === 'string' && team.trim()) return team;
  if (team && typeof team === 'object') {
    const name = (team as { name?: unknown }).name;
    if (typeof name === 'string' && name.trim()) return name;
  }
  return fallback;
}
