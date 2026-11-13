// @vitest-environment jsdom
/**
 * Bug hunt Batch B (2026-11-12) — C-3 / C-4 / P-9 pins.
 *
 * C-3: the app had NO error boundary anywhere, and the match
 * summary page's top-performer memo dereferenced innings
 * players/bowlers arrays guarded only by the innings object — one
 * malformed stored record white-screened the whole app.
 * C-4: delete/save executors in tournaments, grounds, history,
 * centre and the summary super-over start awaited storage with no
 * try/catch and no user feedback (silent hangs, unhandled
 * rejections, state pretending success).
 * P-9: the grounds page Maps auth-failure fallback leaked a GCP
 * project number and internal deployment instructions.
 */
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToHtml } from './helpers/render-dom';
import AppError from '@/app/error';
import GlobalError from '@/app/global-error';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('C-3: error boundaries exist and render bilingual recovery UI', () => {
  it('error.tsx is a dependency-light client boundary with reload + home', () => {
    const src = read('src/app/error.tsx');
    expect(src.startsWith("'use client'")).toBe(true);
    expect(src).toContain('Something went wrong');
    expect(src).toContain('আবার চেষ্টা করুন');
    expect(src).toContain('window.location.reload()');
    expect(src).toContain('href="/"');
    // No provider or client-only first-render reads.
    expect(src).not.toContain('useLanguage');
    expect(src).not.toContain('localStorage.');
    expect(src).not.toContain('navigator.');
  });

  it('global-error.tsx renders its own html/body with inline styles only', () => {
    const src = read('src/app/global-error.tsx');
    expect(src.startsWith("'use client'")).toBe(true);
    expect(src).toContain('<html');
    expect(src).toContain('<body');
    expect(src).toContain('আবার চেষ্টা করুন');
    expect(src).toContain('window.location.reload()');
  });

  it('error boundary renders the bilingual message and actions', () => {
    const html = renderToHtml(
      <AppError error={new Error('boom')} reset={() => {}} />
    );
    expect(html).toContain('Something went wrong');
    expect(html).toContain('আবার চেষ্টা করুন');
    expect(html).toContain('Go home');
  });

  it('global error boundary renders the bilingual message', () => {
    const html = renderToHtml(
      <GlobalError error={new Error('boom')} reset={() => {}} />
    );
    expect(html).toContain('Something went wrong');
    expect(html).toContain('আবার চেষ্টা করুন');
  });
});

describe('C-3: summary page guards innings arrays everywhere', () => {
  const src = read('src/app/matches/summary/[matchId]/client.tsx');

  it('top-performer memo guards players/bowlers with (arr || [])', () => {
    expect(src).toContain('(match.firstInnings.players || []).forEach');
    expect(src).toContain('(match.secondInnings.players || []).forEach');
    expect(src).toContain('(match.firstInnings.bowlers || []).forEach');
    expect(src).toContain('(match.secondInnings.bowlers || []).forEach');
    expect(src).not.toContain('match.firstInnings.players.forEach');
    expect(src).not.toContain('match.secondInnings.bowlers.forEach');
  });

  it('innings-of-player/bowler lookups guard the arrays too', () => {
    const block = src.slice(src.indexOf('const summaryInningsOfPlayer'), src.indexOf('const summaryBatsmanInnings'));
    expect(block).toContain('(first?.players || []).some');
    expect(block).toContain('(second?.players || []).some');
    expect(block).toContain('(first?.bowlers || []).some');
    expect(block).toContain('(second?.bowlers || []).some');
    // The unguarded chained form must not return in these lookups.
    expect(block).not.toContain('Innings?.players.some');
    expect(block).not.toContain('Innings?.bowlers.some');
  });
});

describe('C-4: write executors are guarded with user-visible feedback', () => {
  it('summary: super-over start failure surfaces a toast', () => {
    const src = read('src/app/matches/summary/[matchId]/client.tsx');
    const block = src.slice(src.indexOf('const handleStartSuperOver'), src.indexOf('if (loading)'));
    expect(block).toContain('try {');
    expect(block).toContain('catch (err: any)');
    expect(block).toContain("showAppToast(t('summary_err_super_over_failed'");
    expect(block).toContain("variant: 'error'");
  });

  it('tournaments list: executeDelete is guarded and toasts on failure', () => {
    const src = read('src/app/tournaments/page.tsx');
    const block = src.slice(src.indexOf('const executeDelete'), src.indexOf('return (', src.indexOf('const executeDelete')));
    expect(block).toContain('try {');
    expect(block).toContain('await FeatureHubRepository.deleteTournament(tournamentToDelete);');
    expect(block).toContain("showAppToast(err?.message || tr('tournaments_err_delete_failed'");
    expect(block).toContain('setTournamentToDelete(null);');
  });

  it('grounds: executeDeleteGround is guarded and toasts on failure', () => {
    const src = read('src/app/grounds/page.tsx');
    const block = src.slice(src.indexOf('const executeDeleteGround'), src.indexOf('const groundDeleteMessage'));
    expect(block).toContain('try {');
    expect(block).toContain('await GroundRepository.deleteGround(groundToDelete.id);');
    expect(block).toContain("showAppToast(err?.message || t('grounds_err_delete_failed'");
  });

  it('history: executeDelete is guarded and toasts on failure', () => {
    const src = read('src/app/matches/history/page.tsx');
    const block = src.slice(src.indexOf('const executeDelete'), src.indexOf('const toggleSelect'));
    expect(block).toContain('try {');
    expect(block).toContain('await MatchRepository.deleteMatch(deleteTarget.id);');
    expect(block).toContain('await MatchRepository.deleteMatches(Array.from(selectedIds));');
    expect(block).toContain("showAppToast(err?.message || t('history_err_delete_failed'");
  });

  it('history: the PDF button guards the full-record fetch', () => {
    const src = read('src/app/matches/history/page.tsx');
    const block = src.slice(src.indexOf('await MatchRepository.getMatch(m.id)') - 400, src.indexOf('await MatchRepository.getMatch(m.id)') + 700);
    expect(block).toContain('try {');
    expect(block).toContain("t('history_err_pdf_load_failed'");
    expect(block).toContain('await downloadPdf(full);');
  });

  it('centre: venue save keeps the editor open and toasts on failure', () => {
    const src = read('src/app/matches/center/[matchId]/client.tsx');
    const block = src.slice(src.indexOf('const handleSaveVenue'), src.indexOf('const handleRenamePlayer'));
    expect(block).toContain('try {');
    expect(block).toContain('await MatchRepository.updateMatchVenue(match.id, clean);');
    expect(block).toContain("t('center_err_venue_save_failed'");
    // The editor only closes on success (inside the try, after setMatch).
    expect(block.indexOf('setIsEditingVenue(false);')).toBeGreaterThan(block.indexOf('setMatch(updated);'));
  });

  it('centre: rename save is guarded and toasts on failure', () => {
    const src = read('src/app/matches/center/[matchId]/client.tsx');
    const block = src.slice(src.indexOf('const handleRenamePlayer'), src.indexOf('const mom = useMemo'));
    expect(block).toContain('try {');
    expect(block).toContain('await MatchRepository.saveMatchWithEvents(updated, engine.events, 0);');
    expect(block).toContain("t('center_err_rename_save_failed'");
    // setMatch happens only after the guarded save block.
    expect(block.indexOf('setMatch(updated);')).toBeGreaterThan(block.indexOf('await MatchRepository.saveMatchWithEvents'));
  });
});

describe('P-9: grounds page leaks no project number or deploy instructions', () => {
  it('the Maps auth-failure fallback is clean user copy', () => {
    const src = read('src/app/grounds/page.tsx');
    expect(src).not.toContain('687129620648');
    expect(src).not.toContain('If you deployed to Vercel');
    expect(src).toContain('Google Maps could not be loaded right now.');
  });
});

describe('Batch B i18n keys exist in both dictionaries (parity)', () => {
  const keys = [
    'center_err_rename_save_failed',
    'center_err_venue_save_failed',
    'grounds_err_delete_failed',
    'history_err_delete_failed',
    'history_err_pdf_load_failed',
    'summary_err_super_over_failed',
    'tournaments_err_delete_failed',
  ];
  it('every new key is present in en.ts and bn.ts', () => {
    const en = read('src/i18n/en.ts');
    const bn = read('src/i18n/bn.ts');
    for (const key of keys) {
      expect(en).toContain(`${key}:`);
      expect(bn).toContain(`${key}:`);
    }
  });
});
