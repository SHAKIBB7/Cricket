'use client';

/**
 * LiveMatchPage — the public broadcast view for one live match (Live
 * Spectating, 2026-11-25). Read-only and sign-in-free: it renders the
 * published LiveMatchDocument and updates in realtime as the scorer's
 * phone publishes each ball. Layout follows the approved mockup:
 * score hero → win predictor → batting/bowling → recent balls →
 * ball-by-ball feed, with Scorecard / Overs / Info tabs.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/context/LanguageContext';
import { useShellRouteParam } from '@/lib/useShellRouteParam';
import { LIVE_STALE_AFTER_MS, subscribeLiveMatch } from '@/infrastructure/live/LiveWatchService';
import type { LiveMatchDocument } from '@/domain/live/types';

type Tab = 'live' | 'scorecard' | 'overs' | 'info';

function ballTokenClass(token: string, isLast: boolean): string {
  let base = 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300';
  if (token === 'W') base = 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300';
  else if (token === '4') base = 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300';
  else if (token === '6') base = 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300';
  else if (token.includes('wd') || token.includes('nb'))
    base = 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300';
  return `flex h-[31px] w-[31px] items-center justify-center rounded-full text-[12px] font-extrabold ${base} ${
    isLast ? 'ring-2 ring-emerald-500 ring-offset-1 dark:ring-offset-slate-900' : ''
  }`;
}

export default function LiveMatchPage() {
  const { t } = useLanguage();
  const matchId = useShellRouteParam('matchId', 1);
  const [doc, setDoc] = useState<LiveMatchDocument | null>(null);
  const [resolved, setResolved] = useState(false);
  const [tab, setTab] = useState<Tab>('live');

  useEffect(() => {
    if (!matchId) return;
    setResolved(false);
    return subscribeLiveMatch(matchId, (next) => {
      setDoc(next);
      setResolved(true);
    });
  }, [matchId]);

  // Bug hunt 2026-11-26 D-M2: re-evaluate staleness every minute so
  // an abandoned broadcast stops presenting as live even when no new
  // snapshot ever arrives.
  const [, setStaleTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStaleTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!matchId || !resolved) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="animate-pulse text-sm font-bold text-[var(--muted-foreground)]">
          {t('live_loading', 'Loading live match…')}
        </p>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="mx-auto flex min-h-[50vh] w-full max-w-xl flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-base font-extrabold text-slate-800 dark:text-slate-100">
          {t('live_not_available', 'This live match is not available')}
        </p>
        <p className="text-sm font-medium text-[var(--muted-foreground)]">
          {t('live_not_available_hint', 'It may have ended or the broadcast was stopped.')}
        </p>
        <Link href="/" className="mt-1 rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white active:scale-95">
          {t('live_back_home', 'Back to home')}
        </Link>
      </div>
    );
  }

  // D-M2: a doc with no update for LIVE_STALE_AFTER_MS is ended,
  // not live — the scorer's app is gone (see LivePublishService's
  // unpublish queue for the delete side of this).
  const isLive =
    doc.status === 'live' && Date.now() - (doc.updatedAtMs ?? 0) < LIVE_STALE_AFTER_MS;
  const cur = doc.current;
  const firstInn = doc.innings[0];
  const heroKicker = !cur
    ? `${doc.teamA} vs ${doc.teamB}`
    : cur.target != null && firstInn
      ? `${cur.battingTeam} · ${t('live_chasing', 'CHASING')} vs ${firstInn.team} ${firstInn.runs}/${firstInn.wickets}`
      : `${cur.battingTeam} · ${t('live_innings', 'Innings')} ${doc.innings.length}`;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3 px-4 pb-28 pt-2">
      {/* Top bar */}
      <div className="flex items-center gap-2">
        <Link
          href="/"
          aria-label={t('live_back_home', 'Back to home')}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-bold text-slate-700 shadow-sm dark:bg-white/10 dark:text-slate-200"
        >
          ‹
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-[var(--foreground)]">
          {[doc.tournamentName, doc.formatLabel].filter(Boolean).join(' · ') || `${doc.teamA} vs ${doc.teamB}`}
        </h1>
        {isLive ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-red-500 px-2.5 py-1 text-[10.5px] font-extrabold tracking-[0.08em] text-white">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute h-full w-full animate-ping rounded-full bg-white opacity-75" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-white" />
            </span>
            LIVE
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-slate-700 px-2.5 py-1 text-[10.5px] font-extrabold tracking-[0.08em] text-white">
            {t('live_result_badge', 'RESULT')}
          </span>
        )}
      </div>

      {/* Score hero */}
      <div className="overflow-hidden rounded-[22px] bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-600 p-4 text-white shadow-[0_12px_26px_rgba(4,120,87,0.3)]">
        <p className="truncate text-[11.5px] font-bold uppercase tracking-[0.05em] text-white/85">{heroKicker}</p>
        {cur ? (
          <>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="truncate text-[17px] font-extrabold">{cur.battingTeam}</span>
              <span className="ml-auto shrink-0 text-[30px] font-extrabold tabular-nums leading-none">
                {cur.runs}/{cur.wickets}{' '}
                <span className="text-[14px] font-semibold text-white/85">({cur.oversText} ov)</span>
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[12.5px] font-semibold text-white/92 tabular-nums">
              <span>CRR {cur.crr.toFixed(2)}</span>
              {cur.reqRate != null && <span>REQ {cur.reqRate.toFixed(2)}</span>}
              {cur.target != null && <span>Target {cur.target}</span>}
            </div>
            <div className="mt-2.5 rounded-[10px] bg-white/15 px-2.5 py-1.5 text-[12.5px] font-bold">
              {isLive ? doc.statusLine : (doc.resultText ?? doc.statusLine)}
            </div>
          </>
        ) : (
          <p className="mt-2 text-[15px] font-bold">
            {doc.teamA} vs {doc.teamB} — {t('live_yet_to_start', 'yet to start')}
          </p>
        )}
      </div>

      {/* Win predictor (chase only) */}
      {cur && cur.winPct != null && isLive && (
        <div>
          <div className="mb-1 flex items-baseline justify-between text-[11px] font-extrabold tracking-wide text-[var(--muted-foreground)]">
            <span>
              {cur.battingTeam} {cur.winPct}%
            </span>
            <span className="tracking-[0.07em]">{t('live_win_predictor', 'WIN PREDICTOR')}</span>
            <span>
              {cur.bowlingTeam} {100 - cur.winPct}%
            </span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full">
            <div className="bg-emerald-500 transition-all duration-500" style={{ width: `${cur.winPct}%` }} />
            <div className="flex-1 bg-slate-300 dark:bg-slate-600" />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1.5">
        {(
          [
            ['live', t('live_tab_live', 'Live')],
            ['scorecard', t('live_tab_scorecard', 'Scorecard')],
            ['overs', t('live_tab_overs', 'Overs')],
            ['info', t('live_tab_info', 'Info')],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 rounded-full border px-2 py-2 text-[12.5px] font-bold transition-all active:scale-95 ${
              tab === key
                ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                : 'border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'live' && cur && (
        <>
          {/* Batting / bowling now */}
          <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-3.5">
            <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.07em] text-slate-400">
              {t('live_batting', 'Batting')}
            </p>
            {[cur.striker, cur.nonStriker].map(
              (bat, i) =>
                bat && (
                  <div key={`${bat.name}-${i}`} className="flex items-baseline py-0.5 text-[14px]">
                    <span className="font-bold text-[var(--foreground)]">
                      {bat.name}
                      {i === 0 && <span className="text-emerald-600 dark:text-emerald-400"> *</span>}
                    </span>
                    <span className="ml-auto font-extrabold tabular-nums text-[var(--foreground)]">
                      {bat.runs}{' '}
                      <span className="text-[12px] font-semibold text-slate-400">
                        ({bat.balls}b · {bat.fours}×4 · {bat.sixes}×6)
                      </span>
                    </span>
                  </div>
                ),
            )}
            <p className="mb-1.5 mt-3 text-[11px] font-extrabold uppercase tracking-[0.07em] text-slate-400">
              {t('live_bowling', 'Bowling')}
            </p>
            {cur.bowler && (
              <div className="flex items-baseline py-0.5 text-[14px]">
                <span className="font-bold text-[var(--foreground)]">{cur.bowler.name}</span>
                <span className="ml-auto font-extrabold tabular-nums text-[var(--foreground)]">
                  {cur.bowler.wickets}/{cur.bowler.runs}{' '}
                  <span className="text-[12px] font-semibold text-slate-400">({cur.bowler.oversText} ov)</span>
                </span>
              </div>
            )}
          </div>

          {/* Recent balls */}
          {cur.recentBalls.length > 0 && (
            <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-3.5">
              <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.07em] text-slate-400">
                {t('live_recent_balls', 'Recent balls')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {cur.recentBalls.map((token, i) => (
                  <span key={i} className={ballTokenClass(token, i === cur.recentBalls.length - 1)}>
                    {token}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Ball-by-ball feed */}
          {cur.feed.length > 0 && (
            <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-3.5">
              <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.07em] text-slate-400">
                {t('live_ball_by_ball', 'Ball by ball')}
              </p>
              {cur.feed.map((item, i) => (
                <div
                  key={`${item.ts}-${i}`}
                  className="flex gap-3 border-b border-slate-100 py-2 last:border-none dark:border-white/5"
                >
                  <span className="min-w-[34px] pt-px text-[12px] font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {item.overText}
                  </span>
                  <span
                    className={`text-[13px] leading-snug ${item.kind === 'wicket' ? 'font-semibold text-red-700 dark:text-red-300' : 'text-slate-600 dark:text-slate-300'}`}
                  >
                    {item.text}
                  </span>
                </div>
              ))}
              {isLive && (
                <p className="pt-2 text-center text-[11px] font-semibold text-slate-400">
                  {t('live_auto_update', 'Auto-updates after every ball · no refresh needed')}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {tab === 'scorecard' && (
        <div className="flex flex-col gap-3">
          {doc.innings.map((inn) => (
            <div
              key={inn.inningsNumber}
              className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-3.5"
            >
              <div className="mb-2 flex items-baseline">
                <span className="text-[14.5px] font-extrabold text-[var(--foreground)]">{inn.team}</span>
                <span className="ml-auto text-[14.5px] font-extrabold tabular-nums text-[var(--foreground)]">
                  {inn.runs}/{inn.wickets} <span className="text-[12px] font-semibold text-slate-400">({inn.oversText} ov)</span>
                </span>
              </div>
              {inn.batting.map((bat) => (
                <div key={bat.name} className="flex items-baseline gap-2 border-b border-slate-50 py-1.5 text-[13px] last:border-none dark:border-white/5">
                  <span className="min-w-0">
                    <span className="block truncate font-bold text-slate-800 dark:text-slate-100">{bat.name}</span>
                    <span className="block truncate text-[11px] font-medium text-slate-400">
                      {bat.out ? (bat.dismissalText ?? 'out') : 'not out'}
                    </span>
                  </span>
                  <span className="ml-auto shrink-0 font-extrabold tabular-nums text-[var(--foreground)]">
                    {bat.runs} <span className="text-[11.5px] font-semibold text-slate-400">({bat.balls})</span>
                  </span>
                  <span className="w-10 shrink-0 text-right text-[11.5px] font-semibold tabular-nums text-slate-400">
                    {bat.fours}×4 {bat.sixes}×6
                  </span>
                </div>
              ))}
              <p className="mb-1 mt-3 text-[11px] font-extrabold uppercase tracking-[0.07em] text-slate-400">
                {t('live_bowling', 'Bowling')}
              </p>
              {inn.bowling.map((bowl) => (
                <div key={bowl.name} className="flex items-baseline py-1 text-[13px]">
                  <span className="font-bold text-slate-800 dark:text-slate-100">{bowl.name}</span>
                  <span className="ml-auto font-extrabold tabular-nums text-[var(--foreground)]">
                    {bowl.wickets}/{bowl.runs}{' '}
                    <span className="text-[11.5px] font-semibold text-slate-400">
                      ({bowl.oversText} ov · {bowl.maidens}M)
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ))}
          {doc.innings.length === 0 && (
            <p className="py-6 text-center text-sm font-semibold text-slate-400">{t('live_yet_to_start', 'Yet to start')}</p>
          )}
        </div>
      )}

      {tab === 'overs' && cur && (
        <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-3.5">
          {[...cur.overs].reverse().map((over) => (
            <div key={over.over} className="flex items-center gap-3 border-b border-slate-100 py-2 last:border-none dark:border-white/5">
              <span className="min-w-[52px] text-[12.5px] font-extrabold text-[var(--foreground)]">
                Ov {over.over}
              </span>
              <span className="flex flex-1 flex-wrap gap-1">
                {over.balls.map((token, i) => (
                  <span key={i} className={ballTokenClass(token, false)}>
                    {token}
                  </span>
                ))}
              </span>
              <span className="shrink-0 text-[12.5px] font-extrabold tabular-nums text-[var(--foreground)]">
                {over.runs} runs{over.wickets > 0 ? ` · ${over.wickets}W` : ''}
              </span>
            </div>
          ))}
          {cur.overs.length === 0 && (
            <p className="py-4 text-center text-sm font-semibold text-slate-400">{t('live_yet_to_start', 'Yet to start')}</p>
          )}
        </div>
      )}

      {tab === 'info' && (
        <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-3.5">
          {[
            [t('live_info_teams', 'Teams'), `${doc.teamA} vs ${doc.teamB}`],
            ...(doc.tournamentName ? [[t('live_info_tournament', 'Tournament'), doc.tournamentName] as [string, string]] : []),
            [t('live_info_format', 'Format'), doc.formatLabel],
            ...(doc.tossText ? [[t('live_info_toss', 'Toss'), doc.tossText] as [string, string]] : []),
            ...(doc.venue ? [[t('live_info_venue', 'Venue'), doc.venue] as [string, string]] : []),
            [t('live_info_started', 'Started'), new Date(doc.startedAt).toLocaleString()],
          ].map(([label, value]) => (
            <div key={label} className="flex gap-3 border-b border-slate-100 py-2 text-[13px] last:border-none dark:border-white/5">
              <span className="min-w-[92px] font-extrabold uppercase tracking-wide text-[11px] text-slate-400 pt-0.5">{label}</span>
              <span className="font-semibold text-[var(--foreground)]">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
