/**
 * @vitest-environment jsdom
 *
 * PWA programme P6 — local file backup:
 *  - envelope validation (app + supported version) shared by
 *    peek and import;
 *  - merge mode is updatedAt-aware (an old backup can never
 *    clobber newer local work), reports added/updated/skipped,
 *    and match events follow only the matches actually written;
 *  - team players are normalised on intake with stable ids
 *    preserved across re-imports;
 *  - replace mode clears and repopulates;
 *  - the profile section wires pick → peek → confirm → import.
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { db } from '@/infrastructure/database/dexie-db';
import { StorageManagerService } from '@/infrastructure/storage/StorageManagerService';
import { LocalFileBackupSection } from '@/components/profile/LocalFileBackupSection';

const T1 = '2026-01-01T10:00:00.000Z';
const T2 = '2026-06-01T10:00:00.000Z';
const T3 = '2026-11-01T10:00:00.000Z';

function backupJson(overrides: Record<string, unknown>): string {
  return JSON.stringify({
    app: 'Cric Scorer Pro',
    version: '2.5.0',
    exportedAt: T2,
    matches: [],
    matchEvents: [],
    teams: [],
    tournaments: [],
    grounds: [],
    ...overrides,
  });
}

beforeEach(async () => {
  await Promise.all([
    db.matches.clear(),
    db.match_events.clear(),
    db.teams.clear(),
    db.tournaments.clear(),
    db.grounds.clear(),
  ]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('P6 — envelope validation', () => {
  it('rejects a foreign file and an unsupported version, in peek and import alike', async () => {
    const foreign = backupJson({ app: 'Some Other App', matches: [{ id: 'x' }] });
    expect(StorageManagerService.peekBackupEnvelope(foreign).error).toContain('not exported by Cric Scorer Pro');
    const foreignResult = await StorageManagerService.importDatabase(foreign);
    expect(foreignResult.success).toBe(false);
    expect(foreignResult.error).toContain('not exported by Cric Scorer Pro');

    const oldVersion = backupJson({ version: '1.0.0', matches: [{ id: 'x' }] });
    expect(StorageManagerService.peekBackupEnvelope(oldVersion).error).toContain('Unsupported backup version');
    const oldResult = await StorageManagerService.importDatabase(oldVersion);
    expect(oldResult.success).toBe(false);
  });

  it('peek reports counts for a valid file without writing anything', async () => {
    const peek = StorageManagerService.peekBackupEnvelope(
      backupJson({ matches: [{ id: 'm1', updatedAt: T1 }], teams: [{ id: 't1', players: [] }] }),
    );
    expect(peek.ok).toBe(true);
    expect(peek.counts).toMatchObject({ matches: 1, teams: 1 });
    expect(await db.matches.count()).toBe(0);
  });
});

describe('P6 — merge semantics', () => {
  it('never overwrites a newer local record; reports added/updated/skipped honestly', async () => {
    await db.matches.put({ id: 'm1', winner: 'Local Newer', updatedAt: T2 } as never);

    const older = backupJson({
      matches: [
        { id: 'm1', winner: 'Backup Older', updatedAt: T1 },
        { id: 'm2', winner: 'Backup New', updatedAt: T1 },
      ],
    });
    const first = await StorageManagerService.importDatabase(older, 'merge');
    expect(first.success).toBe(true);
    expect(first.detail).toEqual({ added: 1, updated: 0, skipped: 1 });
    expect(first.restored.matches).toBe(1);
    expect((await db.matches.get('m1'))?.winner).toBe('Local Newer');
    expect((await db.matches.get('m2'))?.winner).toBe('Backup New');

    const newer = backupJson({ matches: [{ id: 'm1', winner: 'Backup Newest', updatedAt: T3 }] });
    const second = await StorageManagerService.importDatabase(newer, 'merge');
    expect(second.detail).toEqual({ added: 0, updated: 1, skipped: 0 });
    expect((await db.matches.get('m1'))?.winner).toBe('Backup Newest');
  });

  it('match events are written only for matches the merge actually wrote', async () => {
    await db.matches.put({ id: 'm1', winner: 'Local', updatedAt: T3 } as never);
    const json = backupJson({
      matches: [
        { id: 'm1', winner: 'Old', updatedAt: T1 },
        { id: 'm2', winner: 'New', updatedAt: T1 },
      ],
      matchEvents: [
        { eventId: 'e1', matchId: 'm1', version: 1 },
        { eventId: 'e2', matchId: 'm2', version: 1 },
      ],
    });
    await StorageManagerService.importDatabase(json, 'merge');
    expect(await db.match_events.get('e1')).toBeUndefined();
    expect(await db.match_events.get('e2')).toBeTruthy();
  });

  it('merge import converges event deletions for written matches (finding 6)', async () => {
    // Local copy of m1 carries a third ball that the backup's
    // (newer) scorecard no longer contains — it was edited away.
    await db.matches.put({ id: 'm1', winner: 'Local Old', updatedAt: T1 } as never);
    await db.match_events.bulkPut([
      { eventId: 'e1', matchId: 'm1', version: 1 },
      { eventId: 'e2', matchId: 'm1', version: 2 },
      { eventId: 'e3-stale', matchId: 'm1', version: 3 },
      { eventId: 'e9-other', matchId: 'm-other', version: 1 },
    ] as never[]);

    const json = backupJson({
      matches: [{ id: 'm1', winner: 'Backup Newer', updatedAt: T2 }],
      matchEvents: [
        { eventId: 'e1', matchId: 'm1', version: 1 },
        { eventId: 'e2', matchId: 'm1', version: 2 },
      ],
    });
    const result = await StorageManagerService.importDatabase(json, 'merge');
    expect(result.success).toBe(true);

    // The stale local event is gone; the backup's set is intact,
    // and events of matches the merge did not write are untouched.
    expect(await db.match_events.get('e3-stale')).toBeUndefined();
    expect(await db.match_events.get('e1')).toBeTruthy();
    expect(await db.match_events.get('e2')).toBeTruthy();
    expect(await db.match_events.get('e9-other')).toBeTruthy();
  });

  it('merge import never wipes local events when the backup carries none for a written match', async () => {
    await db.matches.put({ id: 'm1', winner: 'Local Old', updatedAt: T1 } as never);
    await db.match_events.bulkPut([
      { eventId: 'e1', matchId: 'm1', version: 1 },
      { eventId: 'e2', matchId: 'm1', version: 2 },
    ] as never[]);

    const json = backupJson({
      matches: [{ id: 'm1', winner: 'Backup Newer', updatedAt: T2 }],
      matchEvents: [],
    });
    await StorageManagerService.importDatabase(json, 'merge');
    expect(await db.match_events.get('e1')).toBeTruthy();
    expect(await db.match_events.get('e2')).toBeTruthy();
  });

  it('team players are normalised on intake and keep their stable ids on re-import', async () => {
    const v1 = backupJson({
      teams: [{ id: 't1', name: 'Tigers', players: ['Arif', 'Babul'], updatedAt: T1 }],
    });
    await StorageManagerService.importDatabase(v1, 'merge');
    const stored1 = await db.teams.get('t1');
    const players1 = (stored1 as { players: { id: string; name: string }[] }).players;
    expect(players1.map((p) => p.name)).toEqual(['Arif', 'Babul']);
    expect(players1.every((p) => p.id.startsWith('pl_'))).toBe(true);

    const v2 = backupJson({
      teams: [{ id: 't1', name: 'Tigers', players: ['Arif', 'Babul', 'Chanchal'], updatedAt: T2 }],
    });
    await StorageManagerService.importDatabase(v2, 'merge');
    const stored2 = await db.teams.get('t1');
    const players2 = (stored2 as { players: { id: string; name: string }[] }).players;
    expect(players2.map((p) => p.id)).toEqual([players1[0].id, players1[1].id, expect.stringMatching(/^pl_/)]);
    expect(players2).toHaveLength(3);
  });
});

describe('P6 — replace mode', () => {
  it('clears local-only records and restores exactly the file contents', async () => {
    await db.matches.put({ id: 'local_only', updatedAt: T3 } as never);
    const json = backupJson({ matches: [{ id: 'from_file', updatedAt: T1 }] });
    const result = await StorageManagerService.importDatabase(json, 'replace');
    expect(result.success).toBe(true);
    expect(result.detail).toEqual({ added: 1, updated: 0, skipped: 0 });
    expect(await db.matches.get('local_only')).toBeUndefined();
    expect(await db.matches.get('from_file')).toBeTruthy();
  });
});

describe('P6 — LocalFileBackupSection flow', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) await act(async () => { root?.unmount(); });
    root = null;
    container = null;
  });

  async function renderSection(onNotify = vi.fn(), onRestoreComplete = vi.fn()) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<LocalFileBackupSection onNotify={onNotify} onRestoreComplete={onRestoreComplete} />);
    });
    return { onNotify, onRestoreComplete };
  }

  async function pickFile(file: File) {
    const input = container?.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // file.text() + peek resolve asynchronously — wait until the
    // section settles into either the dialog or an error notice.
    for (let i = 0; i < 20; i++) {
      await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
      if (
        document.body.querySelector('[data-testid="file-restore-confirmation-modal"]') ||
        document.body.textContent?.includes('not a valid') ||
        document.body.textContent?.includes('recognized Cric Scorer Pro')
      ) {
        break;
      }
    }
  }

  it('a valid file opens the restore dialog with counts; merge confirm imports and notifies', async () => {
    const { onNotify, onRestoreComplete } = await renderSection();
    const json = backupJson({ matches: [{ id: 'fm1', winner: 'File Team', updatedAt: T1 }] });
    await pickFile(new File([json], 'backup.json', { type: 'application/json' }));

    const modal = document.body.querySelector('[data-testid="file-restore-confirmation-modal"]');
    expect(modal?.textContent).toContain('backup.json');
    expect(modal?.textContent).toContain('1 matches');

    const confirm = document.body.querySelector('[data-testid="file-confirm-restore-button"]') as HTMLButtonElement;
    await act(async () => { confirm.click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 150)); });

    expect((await db.matches.get('fm1'))?.winner).toBe('File Team');
    expect(onNotify).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
    expect(onRestoreComplete).toHaveBeenCalled();
  });

  it('an invalid file shows the error and opens no dialog', async () => {
    const { onNotify } = await renderSection();
    await pickFile(new File(['{"hello":"world"}'], 'nope.json', { type: 'application/json' }));
    expect(onNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        text: expect.stringContaining('recognized Cric Scorer Pro records'),
      }),
    );
    expect(document.body.querySelector('[data-testid="file-restore-confirmation-modal"]')).toBeNull();
  });
});
