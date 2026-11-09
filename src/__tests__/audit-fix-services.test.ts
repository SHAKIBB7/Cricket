/**
 * Audit-fix regression suite — SERVICES partition
 * (Full Codebase Audit 2026-11-09, Phase 3 findings).
 *
 * Covers:
 * - P3-M2: Drive restore merge mode is timestamp-aware (was a
 *   blind bulkPut that silently rolled back newer local data).
 * - P3-M5: UserProfileService clamps displayName into the
 *   Firestore rules window (2–50 chars) before writing.
 * - P3-M7: /api/pdf/export hardening — size cap, shape check,
 *   generic errors, per-IP rate limit.
 *
 * Every test in the M2/M5/M7 describes fails against the
 * pre-fix code.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { db } from '../infrastructure/database/dexie-db';
import { GoogleDriveService } from '../infrastructure/storage/GoogleDriveService';
import { UserProfileService } from '../infrastructure/auth/UserProfileService';
import { POST } from '../app/api/pdf/export/route';
import { renderPdfFromHtml } from '@/features/scoring/pdf/puppeteerBrowser';

// ─────────────────────────────────────────────────────────────────────────────
// Module mocks (hoisted): Firestore SDK + app firebase module, so the
// profile service takes its configured (cloud) path; PDF renderer +
// HTML generator, so route tests exercise route logic only.
// ─────────────────────────────────────────────────────────────────────────────
const firestoreWrites: any[] = [];

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    doc: vi.fn((...args: any[]) => ({ __mockDocRef: args.join('/') })),
    getDoc: vi.fn(async () => ({
      exists: () => false,
      data: () => ({}),
    })),
    setDoc: vi.fn(async (...args: any[]) => {
      firestoreWrites.push(args);
    }),
  };
});

vi.mock('../infrastructure/auth/firebase', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    firestore: { isMockFirestore: true },
    checkFirebaseConfigured: vi.fn().mockReturnValue(true),
    isFirebaseConfigured: true,
  };
});

vi.mock('@/features/scoring/pdf/puppeteerBrowser', () => ({
  renderPdfFromHtml: vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])), // '%PDF-'
}));

vi.mock('@/features/scoring/pdf/ScorecardHtmlGenerator', () => ({
  ScorecardHtmlGenerator: {
    generateHtml: vi.fn(() => '<html><body>scorecard</body></html>'),
  },
}));

const OLDER = '2026-01-01T00:00:00.000Z';
const NEWER = '2026-06-01T00:00:00.000Z';

function driveBackup(overrides: Record<string, any>): any {
  return {
    app: 'Cric Scorer Pro',
    version: '2.5.0',
    schemaVersion: 3,
    exportedAt: NEWER,
    userUid: null,
    matches: [],
    matchEvents: [],
    teams: [],
    tournaments: [],
    grounds: [],
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// P3-M2 — Drive restore merge is timestamp-aware
// ═════════════════════════════════════════════════════════════════════════════
describe('P3-M2: GoogleDriveService.restoreToIndexedDb merge mode', () => {
  beforeEach(async () => {
    await db.matches.clear();
    await db.match_events.clear();
    await db.teams.clear();
    await db.tournaments.clear();
    await db.grounds.clear();
    await db.app_metadata.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does NOT overwrite a newer local match with an older backup copy', async () => {
    await db.matches.put({
      id: 'm1',
      teamA: 'Local New',
      teamB: 'Rivals',
      updatedAt: NEWER,
      syncStatus: 'SYNCED',
    } as any);

    const summary = await GoogleDriveService.restoreToIndexedDb(
      driveBackup({
        matches: [{ id: 'm1', teamA: 'Backup Old', teamB: 'Rivals', updatedAt: OLDER }],
      }),
      { mode: 'merge' }
    );

    const local = await db.matches.get('m1');
    expect(local?.teamA).toBe('Local New');
    expect(summary.matchesCount).toBe(0);
    expect(summary.detail).toEqual({ added: 0, updated: 0, skipped: 1 });
  });

  it('applies a backup record that is strictly newer than the local copy', async () => {
    await db.matches.put({
      id: 'm1',
      teamA: 'Local Old',
      teamB: 'Rivals',
      updatedAt: OLDER,
      syncStatus: 'SYNCED',
    } as any);

    const summary = await GoogleDriveService.restoreToIndexedDb(
      driveBackup({
        matches: [{ id: 'm1', teamA: 'Backup New', teamB: 'Rivals', updatedAt: NEWER }],
      }),
      { mode: 'merge' }
    );

    const local = await db.matches.get('m1');
    expect(local?.teamA).toBe('Backup New');
    expect(summary.matchesCount).toBe(1);
    expect(summary.detail).toEqual({ added: 0, updated: 1, skipped: 0 });
  });

  it('adds new records and skips equal-age records (local wins ties)', async () => {
    await db.teams.put({
      id: 't1',
      name: 'Local Team',
      players: [],
      updatedAt: NEWER,
    } as any);

    const summary = await GoogleDriveService.restoreToIndexedDb(
      driveBackup({
        teams: [{ id: 't1', name: 'Backup Team', players: [], updatedAt: NEWER }],
        grounds: [{ id: 'g1', name: 'New Ground', updatedAt: OLDER }],
      }),
      { mode: 'merge' }
    );

    const team = await db.teams.get('t1');
    expect(team?.name).toBe('Local Team');
    const ground = await db.grounds.get('g1');
    expect(ground?.name).toBe('New Ground');
    expect(summary.teamsCount).toBe(0);
    expect(summary.groundsCount).toBe(1);
    expect(summary.detail).toEqual({ added: 1, updated: 0, skipped: 1 });
  });

  it('writes match events only for matches the merge actually wrote', async () => {
    await db.matches.put({
      id: 'm-stale',
      teamA: 'Local New',
      updatedAt: NEWER,
      syncStatus: 'SYNCED',
    } as any);

    const summary = await GoogleDriveService.restoreToIndexedDb(
      driveBackup({
        matches: [
          { id: 'm-stale', teamA: 'Backup Old', updatedAt: OLDER },
          { id: 'm-fresh', teamA: 'Fresh', updatedAt: OLDER },
        ],
        matchEvents: [
          { eventId: 'e-stale', matchId: 'm-stale', type: 'BALL' },
          { eventId: 'e-fresh', matchId: 'm-fresh', type: 'BALL' },
        ],
      }),
      { mode: 'merge' }
    );

    expect(await db.match_events.get('e-stale')).toBeUndefined();
    expect(await db.match_events.get('e-fresh')).toBeDefined();
    expect(summary.matchEventsCount).toBe(1);
  });

  it('replace mode still restores every record regardless of timestamps', async () => {
    await db.matches.put({
      id: 'm1',
      teamA: 'Local New',
      updatedAt: NEWER,
      syncStatus: 'SYNCED',
    } as any);

    const summary = await GoogleDriveService.restoreToIndexedDb(
      driveBackup({
        matches: [{ id: 'm1', teamA: 'Backup Old', updatedAt: OLDER }],
      }),
      { mode: 'replace' }
    );

    const local = await db.matches.get('m1');
    expect(local?.teamA).toBe('Backup Old');
    expect(summary.matchesCount).toBe(1);
    expect(summary.detail).toEqual({ added: 1, updated: 0, skipped: 0 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// P3-M5 — displayName clamped into the Firestore rules window (2–50)
// ═════════════════════════════════════════════════════════════════════════════
describe('P3-M5: UserProfileService displayName clamping', () => {
  it('clampDisplayNameForFirestore enforces the 2–50 window', () => {
    const clamp = (UserProfileService as any).clampDisplayNameForFirestore;
    expect(typeof clamp).toBe('function');

    // In-window names pass through (trimmed / whitespace-collapsed)
    expect(clamp('Sachin Tendulkar', 'sachin@cricket.org')).toBe('Sachin Tendulkar');
    expect(clamp('  Bob   Smith  ', null)).toBe('Bob Smith');

    // 1-char Google name falls back to the email local-part
    expect(clamp('A', 'alice@example.com')).toBe('alice');
    // …and to the neutral default when no usable local-part exists
    expect(clamp('A', null)).toBe('Cricket Scorer');
    expect(clamp('', '')).toBe('Cricket Scorer');
    expect(clamp(null, undefined)).toBe('Cricket Scorer');

    // Over-long names are truncated to exactly 50 chars
    const long = clamp('X'.repeat(60), 'x@example.com');
    expect(long).toHaveLength(50);
  });

  it('profile CREATE writes a clamped displayName for a 1-char Google name', async () => {
    firestoreWrites.length = 0;
    const profile = await UserProfileService.syncOrCreateUserProfile({
      uid: 'user_one_char_name',
      displayName: 'Z',
      email: 'zahir@example.com',
      photoURL: null,
    });

    expect(firestoreWrites.length).toBeGreaterThan(0);
    const createPayload = firestoreWrites[0][1];
    expect(createPayload.displayName).toBe('zahir');
    expect(createPayload.displayName.length).toBeGreaterThanOrEqual(2);
    expect(createPayload.displayName.length).toBeLessThanOrEqual(50);
    expect(profile.displayName).toBe('zahir');
    expect(profile.syncStatus).toBe('SYNCED');
  });

  it('profile CREATE truncates a >50-char Google name to 50 chars', async () => {
    firestoreWrites.length = 0;
    const longName = 'A'.repeat(70);
    await UserProfileService.syncOrCreateUserProfile({
      uid: 'user_long_name',
      displayName: longName,
      email: 'long@example.com',
      photoURL: null,
    });

    const createPayload = firestoreWrites[0][1];
    expect(createPayload.displayName).toHaveLength(50);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// P3-M7 — /api/pdf/export hardening
// ═════════════════════════════════════════════════════════════════════════════
describe('P3-M7: /api/pdf/export hardening', () => {
  const validMatch = { id: 'm1', teamA: 'Alpha', teamB: 'Beta', totalOvers: 20 };

  function pdfRequest(ip: string, body: string): NextRequest {
    return new NextRequest('http://localhost/api/pdf/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
      body,
    });
  }

  beforeEach(() => {
    vi.mocked(renderPdfFromHtml).mockResolvedValue(
      new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('serves a legitimate payload exactly as before (200 + PDF)', async () => {
    const res = await POST(pdfRequest('10.0.0.1', JSON.stringify({ match: validMatch })));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(String.fromCharCode(...bytes)).toBe('%PDF-');
  });

  it('rejects bodies over the 2 MB cap with 413', async () => {
    const oversized = JSON.stringify({ match: validMatch, pad: 'x'.repeat(2 * 1024 * 1024) });
    const res = await POST(pdfRequest('10.0.0.2', oversized));
    expect(res.status).toBe(413);
  });

  it('rejects a malformed JSON body with a generic 400', async () => {
    const res = await POST(pdfRequest('10.0.0.3', 'this is not json'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid request payload');
  });

  it('rejects a scorecard missing the minimal renderable shape with 400', async () => {
    const res = await POST(
      pdfRequest('10.0.0.4', JSON.stringify({ match: { teamA: 'Alpha' } }))
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid match scorecard payload');
  });

  it('never leaks internal error detail to the client', async () => {
    vi.mocked(renderPdfFromHtml).mockRejectedValueOnce(
      new Error('puppeteer exploded at /secret/internal/path')
    );
    const res = await POST(pdfRequest('10.0.0.5', JSON.stringify({ match: validMatch })));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('secret');
    expect(text).not.toContain('puppeteer exploded');
    const body = JSON.parse(text);
    expect(body.error).toBe('Failed to generate PDF');
  });

  it('rate-limits a single IP after 10 requests per minute', async () => {
    const ip = '10.0.0.6';
    for (let i = 0; i < 10; i++) {
      const res = await POST(pdfRequest(ip, JSON.stringify({ match: validMatch })));
      expect(res.status).toBe(200);
    }
    const eleventh = await POST(pdfRequest(ip, JSON.stringify({ match: validMatch })));
    expect(eleventh.status).toBe(429);
  });
});
