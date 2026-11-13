/**
 * Enterprise programme (2026-11-12) — hydration + guarded-write pins.
 *
 * The production build threw React hydration errors (#418/#423/
 * #425) on every cold load: for saved-Bengali users the root was
 * discarded and re-rendered client-side, and on /profile for
 * everyone (InstallAppCard's branch came from UA sniffing during
 * the first render). Root cause class: first-render state read
 * client-only sources (localStorage / navigator) that the server
 * render cannot know. These pins keep every provider's first
 * render server-identical, with the real values applied by mount
 * effects — and keep the tournament/analytics writes guarded.
 */
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('enterprise hydration: first render is server-identical', () => {
  it('LanguageProvider initialises to en (no localStorage in the initializer)', () => {
    const src = read('src/context/LanguageContext.tsx');
    expect(src).toContain("useState<Language>('en')");
    // The saved language is applied by the mount effect instead.
    expect(src).toContain("localStorage.getItem('preferred_language')");
    const initBlock = src.slice(src.indexOf("useState<Language>('en')") - 400, src.indexOf("useState<Language>('en')"));
    expect(initBlock).not.toContain('localStorage.getItem');
  });

  it('PlatformProvider initialises platform + UA to the server values', () => {
    const src = read('src/context/PlatformContext.tsx');
    expect(src).toContain('useState<PlatformInfo>(() => SERVER_PLATFORM)');
    expect(src).toContain("const [userAgent, setUserAgent] = useState('')");
    // deriveInstallState inside the provider consumes the state,
    // never a direct navigator read during render.
    const memo = src.slice(src.indexOf('const value = useMemo'), src.indexOf('promptInstall,', src.indexOf('const value = useMemo')));
    expect(memo).not.toContain('navigator.userAgent');
    // platform.ts owns the shared server default.
    const platform = read('src/lib/platform.ts');
    expect(platform).toContain('export const SERVER_PLATFORM');
    expect(platform).toContain('return SERVER_PLATFORM;');
  });
});


describe('enterprise robustness: guarded writes and loads', () => {
  it('tournament details: all result/schedule writes go through persistTournament', () => {
    const src = read('src/app/tournaments/[id]/client.tsx');
    expect(src).toContain('const persistTournament = async');
    expect(src).toContain("showAppToast(t('tournament_save_failed'");
    // No bare save+set pairs remain outside the guarded helper
    // (the load path uses the `as Tournament` cast form inside
    // its own try/catch and is intentionally untouched).
    expect(src).not.toContain('await FeatureHubRepository.saveTournament(updated);\n setTournament(updated);');
  });

  it('analytics: the match load is guarded with a retryable error state', () => {
    const src = read('src/app/analytics/page.tsx');
    expect(src).toContain('const [loadError, setLoadError] = useState(false);');
    expect(src).toContain("console.error('[Analytics] Failed to load matches:'");
    expect(src).toContain("t('analytics_load_error'");
    expect(src).toContain('setLoadAttempt((n) => n + 1)');
  });

  it('opening-players: the loading state renders a skeleton, never null', () => {
    const src = read('src/app/matches/opening-players/page.tsx');
    expect(src).not.toContain('if (!setup) return null;');
    expect(src).toContain("role=\"status\"");
    expect(src).toContain("import { Skeleton } from '@/components/common/Skeleton';");
  });

  it('card icon buttons carry explicit aria-labels (not title alone)', () => {
    expect(read('src/app/teams/page.tsx')).toContain("aria-label={t('teams_edit', 'Edit Team')}");
    expect(read('src/app/teams/page.tsx')).toContain("aria-label={t('teams_delete', 'Delete Team')}");
    expect(read('src/app/tournaments/page.tsx')).toContain("aria-label={tr('tournaments_delete', 'Delete Tournament')}");
    expect(read('src/app/matches/history/page.tsx')).toContain("aria-label={t('download_pdf', 'Download PDF Scorecard')}");
    // The audit's two truly unnamed buttons:
    expect(read('src/components/common/CompactDropdown.tsx')).toContain("aria-label={t('clear_search', 'Clear search')}");
    expect(read('src/app/matches/score/[matchId]/client.tsx')).toContain("aria-label={t('dismiss', 'Dismiss')}");
    // Placeholder-only auth inputs gained programmatic labels:
    expect(read('src/app/profile/page.tsx')).toContain("aria-label={t('profile_email', 'Email address')}");
    expect(read('src/app/profile/page.tsx')).toContain("aria-label={t('profile_password', 'Password')}");
  });

  it('cards are keyboard-operable and <html lang> follows the UI language', () => {
    for (const f of ['src/app/matches/history/page.tsx', 'src/app/tournaments/page.tsx', 'src/app/teams/page.tsx']) {
      const src = read(f);
      expect(src).toContain('tabIndex={0}');
      expect(src).toContain("e.key === 'Enter'");
      expect(src).toContain('e.currentTarget !== e.target');
    }
    expect(read('src/context/LanguageContext.tsx')).toContain("document.documentElement.lang = language === 'bn' ? 'bn' : 'en'");
  });
});
