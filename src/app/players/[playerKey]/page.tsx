'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Trophy, UserX } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { PlayerProfileSkeleton } from '@/components/common/Skeleton';
import { useLoadReveal } from '@/hooks/useLoadReveal';
import { RevealGroup, RevealItem } from '@/components/motion/Reveal';
import { oversString } from '@/domain/cricket/formatters';
import {
  loadCareerPlayer,
  type CareerMatchAppearance,
  type CareerPlayer,
} from '@/features/players/careerStats';

function fmt2(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toFixed(2);
}

function fmt1(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toFixed(1);
}

function StatTable({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-[var(--border)] rounded-xl overflow-hidden border border-[var(--border)]">
      {rows.map((r) => (
        <div key={r.label} className="bg-[var(--card)] px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
            {r.label}
          </p>
          <p className="text-body font-black text-[var(--foreground)] num-font">
            {r.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function appearanceLine(app: CareerMatchAppearance): string {
  const bits: string[] = [];
  if (app.batting) {
    const b = app.batting;
    bits.push(
      `${b.runs}${b.dismissed ? '' : '*'} (${b.balls}b${b.fours ? `, ${b.fours}×4` : ''}${b.sixes ? `, ${b.sixes}×6` : ''})`
    );
  }
  if (app.bowling) {
    const bw = app.bowling;
    bits.push(`${oversString(bw.balls)}-0-${bw.runs}-${bw.wickets}`);
  }
  return bits.join('  ·  ');
}

export default function PlayerProfilePage() {
  const { t } = useLanguage();
  const params = useParams();
  const rawKey = useMemo(() => {
    const v = params?.playerKey;
    const s = Array.isArray(v) ? v[0] : v;
    if (!s) return '';
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  }, [params]);

  const [player, setPlayer] = useState<CareerPlayer | null>(null);
  const [loading, setLoading] = useState(true);
  // Motion system (2026-11-11): skeleton only past the grace
  // window; the loaded profile reveals as ONE block (no per-row
  // stagger on a stats page the user reads top-down).
  const { showSkeleton, reveal } = useLoadReveal(loading);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const found = rawKey ? await loadCareerPlayer(rawKey) : undefined;
        if (cancelled) return;
        if (found) setPlayer(found);
        else setNotFound(true);
      } catch (e) {
        console.warn('PlayerProfilePage', 'failed to load career player', e);
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rawKey]);

  const backLink = (
    <Link
      href="/players"
      className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] mb-4"
    >
      <ArrowLeft size={16} />
      {t('players_back', 'All players')}
    </Link>
  );

  if (showSkeleton) {
    return (
      <div className="min-h-screen pb-24 pt-4 px-4 max-w-3xl mx-auto w-full">
        {backLink}
        <PlayerProfileSkeleton />
      </div>
    );
  }

  if (loading) {
    // Inside the grace window: plain shell, no skeleton flash.
    return (
      <div className="min-h-screen pb-24 pt-4 px-4 max-w-3xl mx-auto w-full">
        {backLink}
      </div>
    );
  }

  if (notFound || !player) {
    return (
      <div className="min-h-screen pb-24 pt-4 px-4 max-w-3xl mx-auto w-full">
        {backLink}
        <div className="border border-dashed border-[var(--border)] rounded-2xl text-center py-14 px-6">
          <UserX size={30} className="mx-auto text-[var(--muted-foreground)] mb-3" />
          <p className="text-body-lg font-bold text-[var(--foreground)]">
            {t('player_not_found', 'Player not found')}
          </p>
          <p className="text-caption text-[var(--muted-foreground)] mt-1">
            {t(
              'player_not_found_hint',
              'This player has no recorded matches or squad entry on this device.'
            )}
          </p>
        </div>
      </div>
    );
  }

  const b = player.batting;
  const bw = player.bowling;
  const f = player.fielding;
  const otherNames = player.nameVariants.filter((v) => v !== player.name);

  return (
    <div className="min-h-screen pb-24 pt-4 px-4 max-w-3xl mx-auto w-full">
      {backLink}

      <RevealGroup reveal={reveal}>
      <RevealItem>
      {/* Header */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 mb-4 shadow-elev1">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-black text-display-xs shrink-0">
            {(player.name || '?').trim().charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="text-display-xs text-[var(--foreground)] truncate">
              {player.name}
            </h1>
            {player.teams.length > 0 && (
              <p className="text-caption text-[var(--muted-foreground)]">
                {player.teams.join(' · ')}
              </p>
            )}
            {otherNames.length > 0 && (
              <p className="text-caption text-[var(--muted-foreground)]">
                {t('player_also_recorded_as', 'Also recorded as')}: {otherNames.join(', ')}
              </p>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="text-caption font-bold bg-[var(--background)] border border-[var(--border)] rounded-full px-2.5 py-1 num-font">
                {player.matchesPlayed} {t('player_matches', 'Matches')}
              </span>
              {player.momCount > 0 && (
                <span className="inline-flex items-center gap-1 text-caption font-bold text-amber-600 bg-amber-500/10 rounded-full px-2.5 py-1 num-font">
                  <Trophy size={12} />
                  {player.momCount} {t('player_mom_awards', 'Player-of-the-Match awards')}
                </span>
              )}
              {f.total > 0 && (
                <span className="text-caption font-bold bg-[var(--background)] border border-[var(--border)] rounded-full px-2.5 py-1 num-font">
                  {f.total} {t('player_fielding_dismissals', 'fielding dismissals')}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Batting */}
      <h2 className="text-body font-black text-[var(--foreground)] mb-2">
        {t('player_batting', 'Batting')}
      </h2>
      <div className="mb-5">
        <StatTable
          rows={[
            { label: t('stat_matches', 'Matches'), value: String(b.matches) },
            { label: t('stat_innings', 'Innings'), value: String(b.innings) },
            { label: t('stat_not_outs', 'Not outs'), value: String(b.notOuts) },
            { label: t('stat_runs', 'Runs'), value: String(b.runs) },
            {
              label: t('stat_high_score', 'High score'),
              value: `${b.highScore}${b.highScoreNotOut ? '*' : ''}`,
            },
            { label: t('stat_average', 'Average'), value: fmt2(b.average) },
            { label: t('stat_strike_rate', 'Strike rate'), value: fmt1(b.strikeRate) },
            { label: t('stat_hundreds', '100s'), value: String(b.hundreds) },
            { label: t('stat_fifties', '50s'), value: String(b.fifties) },
            { label: t('stat_fours', 'Fours'), value: String(b.fours) },
            { label: t('stat_sixes', 'Sixes'), value: String(b.sixes) },
            { label: t('stat_ducks', 'Ducks'), value: String(b.ducks) },
          ]}
        />
      </div>

      {/* Bowling */}
      <h2 className="text-body font-black text-[var(--foreground)] mb-2">
        {t('player_bowling', 'Bowling')}
      </h2>
      <div className="mb-5">
        <StatTable
          rows={[
            { label: t('stat_matches', 'Matches'), value: String(bw.matches) },
            { label: t('stat_innings', 'Innings'), value: String(bw.innings) },
            { label: t('stat_overs', 'Overs'), value: oversString(bw.balls) },
            { label: t('stat_maidens', 'Maidens'), value: String(bw.maidens) },
            { label: t('stat_runs', 'Runs'), value: String(bw.runs) },
            { label: t('stat_wickets', 'Wickets'), value: String(bw.wickets) },
            {
              label: t('stat_best_figures', 'Best figures'),
              value: bw.wickets > 0 ? `${bw.bestWickets}/${bw.bestRuns}` : '—',
            },
            { label: t('stat_average', 'Average'), value: fmt2(bw.average) },
            { label: t('stat_economy', 'Economy'), value: fmt2(bw.economy) },
            { label: t('stat_strike_rate', 'Strike rate'), value: fmt1(bw.strikeRate) },
          ]}
        />
      </div>

      {/* Fielding */}
      <h2 className="text-body font-black text-[var(--foreground)] mb-2">
        {t('player_fielding', 'Fielding')}
      </h2>
      <div className="mb-6">
        <StatTable
          rows={[
            { label: t('stat_catches', 'Catches'), value: String(f.catches) },
            { label: t('stat_stumpings', 'Stumpings'), value: String(f.stumpings) },
            { label: t('stat_run_outs', 'Run outs'), value: String(f.runOuts) },
          ]}
        />
      </div>

      {/* Recent matches */}
      <h2 className="text-body font-black text-[var(--foreground)] mb-2">
        {t('player_recent_matches', 'Matches')}
      </h2>
      {player.appearances.length === 0 ? (
        <p className="text-caption text-[var(--muted-foreground)] border border-dashed border-[var(--border)] rounded-xl text-center py-6 px-4">
          {t('player_no_matches', 'No match appearances recorded yet.')}
        </p>
      ) : (
        <div className="space-y-2">
          {player.appearances.map((app) => (
            <Link
              key={app.matchId}
              href={`/matches/summary/${app.matchId}`}
              className="block bg-[var(--card)] border border-[var(--border)] rounded-2xl px-4 py-3 hover:border-emerald-500/50 active:scale-[0.99] transition-all"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-body-sm text-[var(--foreground)] truncate">
                  {app.teamFor} vs {app.teamAgainst}
                </span>
                <span className="text-[10px] font-bold text-[var(--muted-foreground)] shrink-0">
                  {app.createdAt
                    ? new Date(app.createdAt).toLocaleDateString()
                    : ''}
                </span>
              </div>
              {appearanceLine(app) && (
                <p className="text-caption text-foreground/85 num-font mt-0.5">
                  {appearanceLine(app)}
                  {app.isMom && (
                    <span className="inline-flex items-center gap-0.5 ml-2 text-amber-600 font-black">
                      <Trophy size={10} />
                      {t('player_mom_short', 'Player of the Match')}
                    </span>
                  )}
                </p>
              )}
              {app.result && (
                <p className="text-caption text-[var(--muted-foreground)] truncate mt-0.5">
                  {app.result}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
      </RevealItem>
      </RevealGroup>
    </div>
  );
}
