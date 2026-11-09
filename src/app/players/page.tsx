'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Trophy, Users } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { CompactDropdown } from '@/components/common/CompactDropdown';
import {
  loadCareerPlayers,
  playerProfileHref,
  type CareerPlayer,
} from '@/features/players/careerStats';

type SortMode = 'matches' | 'runs' | 'wickets' | 'name';

function headlineLine(p: CareerPlayer): string {
  const bits: string[] = [];
  if (p.batting.innings > 0) {
    bits.push(
      `${p.batting.runs} runs · HS ${p.batting.highScore}${p.batting.highScoreNotOut ? '*' : ''}`
    );
  }
  if (p.bowling.wickets > 0) {
    bits.push(
      `${p.bowling.wickets} wkts · Best ${p.bowling.bestWickets}/${p.bowling.bestRuns}`
    );
  }
  if (p.fielding.total > 0) {
    bits.push(`${p.fielding.total} fielding dismissals`);
  }
  return bits.join('  ·  ');
}

export default function PlayersPage() {
  const { t } = useLanguage();
  const [players, setPlayers] = useState<CareerPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('matches');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await loadCareerPlayers();
        if (!cancelled) setPlayers(all);
      } catch (e) {
        console.warn('PlayersPage', 'failed to load career players', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? players.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.nameVariants.some((v) => v.toLowerCase().includes(q)) ||
            p.teams.some((tm) => tm.toLowerCase().includes(q))
        )
      : [...players];
    switch (sortMode) {
      case 'runs':
        filtered.sort(
          (a, b) => b.batting.runs - a.batting.runs || b.bowling.wickets - a.bowling.wickets
        );
        break;
      case 'wickets':
        filtered.sort(
          (a, b) => b.bowling.wickets - a.bowling.wickets || b.batting.runs - a.batting.runs
        );
        break;
      case 'name':
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        filtered.sort(
          (a, b) =>
            b.matchesPlayed - a.matchesPlayed ||
            b.batting.runs - a.batting.runs ||
            a.name.localeCompare(b.name)
        );
    }
    return filtered;
  }, [players, query, sortMode]);

  const totalMatches = useMemo(
    () => players.reduce((sum, p) => Math.max(sum, p.matchesPlayed), 0),
    [players]
  );

  return (
    <div className="min-h-screen pb-24 pt-4 px-4 max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
          <Users size={20} />
        </div>
        <div>
          <h1 className="text-display-sm text-[var(--foreground)]">
            {t('players_title', 'Players')}
          </h1>
          <p className="text-caption text-[var(--muted-foreground)]">
            {t(
              'players_subtitle',
              'Career profiles aggregated across all your stored matches'
            )}
          </p>
        </div>
      </div>

      {/* Search + sort */}
      <div className="flex items-center gap-2 mt-4 mb-4">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('players_search_placeholder', 'Search players or teams…')}
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[var(--card)] border border-[var(--border)] text-body-sm text-[var(--foreground)] outline-none focus:border-emerald-500/60"
          />
        </div>
        <CompactDropdown
          value={sortMode}
          onChange={(v) => setSortMode(v as SortMode)}
          options={[
            { value: 'matches', label: t('players_sort_matches', 'Most matches') },
            { value: 'runs', label: t('players_sort_runs', 'Most runs') },
            { value: 'wickets', label: t('players_sort_wickets', 'Most wickets') },
            { value: 'name', label: t('players_sort_name', 'Name A–Z') },
          ]}
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[76px] rounded-2xl bg-[var(--card)] border border-[var(--border)] animate-pulse"
            />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="border border-dashed border-[var(--border)] rounded-2xl text-center py-12 px-6">
          <Users size={28} className="mx-auto text-[var(--muted-foreground)] mb-3" />
          <p className="text-body font-semibold text-[var(--foreground)]">
            {players.length === 0
              ? t('players_empty', 'No players yet')
              : t('players_no_match', 'No players match your search')}
          </p>
          <p className="text-caption text-[var(--muted-foreground)] mt-1">
            {players.length === 0
              ? t(
                  'players_empty_hint',
                  'Players appear here once they are added to a team or play a match.'
                )
              : t('players_no_match_hint', 'Try a different name or team.')}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((p) => (
            <Link
              key={p.key}
              href={playerProfileHref(p.key)}
              className="flex items-center gap-3 bg-[var(--card)] border border-[var(--border)] rounded-2xl px-4 py-3 hover:border-emerald-500/50 active:scale-[0.99] transition-all"
            >
              <div className="w-11 h-11 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-black text-body shrink-0">
                {(p.name || '?').trim().charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-body text-[var(--foreground)] truncate">
                    {p.name}
                  </span>
                  {p.momCount > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-black text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded-full shrink-0">
                      <Trophy size={10} />
                      {p.momCount}
                    </span>
                  )}
                </div>
                <p className="text-caption text-[var(--muted-foreground)] truncate">
                  {p.teams.length > 0 ? p.teams.join(' · ') : t('players_no_team', 'No team')}
                </p>
                {headlineLine(p) && (
                  <p className="text-caption text-foreground/80 truncate num-font">
                    {headlineLine(p)}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-body font-black text-[var(--foreground)] num-font">
                  {p.matchesPlayed}
                </p>
                <p className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">
                  {t('players_matches_short', 'Matches')}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {!loading && players.length > 0 && (
        <p className="text-center text-caption text-[var(--muted-foreground)] mt-6">
          {t('players_footer_count', `${players.length} players · up to ${totalMatches} matches each`)}
        </p>
      )}
    </div>
  );
}
