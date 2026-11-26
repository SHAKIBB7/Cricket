'use client';

/**
 * LiveNowSection — the Home screen "LIVE NOW" list (Live Spectating,
 * 2026-11-25). Shows every match currently being broadcast publicly;
 * tapping a card opens the broadcast view at /live/{matchId}.
 *
 * Hydration-safe: the first render (server + client) is always the
 * empty state; the Firestore subscription starts in an effect and the
 * section simply does not exist when nothing is live. Stale docs
 * (scorer's app closed mid-match without ending the broadcast) age
 * out after 6 hours without an update.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/context/LanguageContext';
import { LIVE_STALE_AFTER_MS, subscribeLiveMatches } from '@/infrastructure/live/LiveWatchService';
import type { LiveMatchDocument } from '@/domain/live/types';

function teamScoreLine(doc: LiveMatchDocument, team: string): { text: string; batting: boolean } {
  const inn = doc.innings.find((i) => i.team === team);
  if (!inn) return { text: 'Yet to bat', batting: false };
  return {
    text: `${inn.runs}/${inn.wickets} (${inn.oversText} ov)`,
    batting: doc.current?.battingTeam === team && doc.status === 'live',
  };
}

export function LiveNowSection() {
  const { t } = useLanguage();
  const [docs, setDocs] = useState<LiveMatchDocument[]>([]);

  useEffect(() => {
    return subscribeLiveMatches((next) => {
      setDocs(next);
    });
  }, []);

  // Bug hunt 2026-11-26 P-F3: the staleness filter used to run only
  // inside the snapshot callback, so on an idle Home screen a dead
  // match (scorer's app closed, no further doc changes anywhere)
  // stayed "LIVE NOW" forever. Re-evaluate every minute.
  const [, setStaleTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStaleTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const now = Date.now();
  const visibleDocs = docs.filter((d) => now - (d.updatedAtMs ?? 0) < LIVE_STALE_AFTER_MS);

  if (visibleDocs.length === 0) return null;

  return (
    <section aria-label={t('live_now', 'Live now')} className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 px-0.5">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
        </span>
        <h2 className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-red-600 dark:text-red-400">
          {t('live_now', 'Live now')}
        </h2>
        <span className="ml-auto text-xs font-semibold text-[var(--muted-foreground)]">
          {visibleDocs.length} {visibleDocs.length === 1 ? t('live_match', 'match') : t('live_matches', 'matches')}
        </span>
      </div>

      {visibleDocs.map((doc) => {
        const a = teamScoreLine(doc, doc.teamA);
        const b = teamScoreLine(doc, doc.teamB);
        const striker = doc.current?.striker;
        const bowler = doc.current?.bowler;
        return (
          <Link
            key={doc.matchId}
            href={`/live/${doc.matchId}`}
            className="block rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-3.5 shadow-[0_6px_18px_rgba(15,23,42,0.05)] transition-transform active:scale-[0.99]"
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-extrabold tracking-[0.08em] text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                LIVE
              </span>
              <span className="truncate text-[11.5px] font-bold uppercase tracking-wide text-[var(--muted-foreground)]">
                {[doc.tournamentName, doc.formatLabel].filter(Boolean).join(' · ')}
              </span>
              <span className="ml-auto shrink-0 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                {t('live_watch', 'Watch')} ›
              </span>
            </div>

            {[doc.teamA, doc.teamB].map((team, i) => {
              const line = i === 0 ? a : b;
              return (
                <div key={team} className="flex items-baseline gap-2 py-0.5">
                  <span
                    className={`truncate text-[15px] font-bold ${line.batting ? 'text-[var(--foreground)]' : 'text-slate-600 dark:text-slate-300'}`}
                  >
                    {team}
                  </span>
                  {line.batting && (
                    <span className="shrink-0 text-[10px] font-extrabold tracking-wide text-emerald-600 dark:text-emerald-400">
                      ● BAT
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-[15px] font-extrabold tabular-nums text-[var(--foreground)]">
                    {line.text}
                  </span>
                </div>
              );
            })}

            <div className="mt-2 rounded-[10px] bg-emerald-50 px-2.5 py-1.5 text-[12.5px] font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              {doc.statusLine}
            </div>

            {(striker || bowler) && (
              <p className="mt-1.5 truncate px-0.5 text-[11.5px] font-semibold text-[var(--muted-foreground)]">
                {striker && (
                  <>
                    {t('live_batting', 'Batting')}:{' '}
                    <span className="font-bold text-[var(--foreground)]">
                      {striker.name} {striker.runs}* ({striker.balls})
                    </span>
                  </>
                )}
                {striker && bowler && ' · '}
                {bowler && (
                  <>
                    {t('live_bowling', 'Bowling')}: {bowler.name} {bowler.wickets}/{bowler.runs}
                  </>
                )}
              </p>
            )}
          </Link>
        );
      })}
    </section>
  );
}
