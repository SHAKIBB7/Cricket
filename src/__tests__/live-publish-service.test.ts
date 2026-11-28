/**
 * Bug hunt 2026-11-26 — LivePublishService hardening pins.
 *
 *  - D-H2: a persistently failing write retries with bounded
 *    exponential backoff and then PARKS (the pre-fix code derived
 *    a 0 ms wait from a lastSentAt that only advanced on success
 *    and spun a tight setDoc loop for the whole session).
 *  - D-H3: a failed unpublish delete is persisted to a local
 *    queue and retried on later activity instead of being lost.
 *  - D-M3 (service side): clearLivePublishState() drops pending
 *    snapshots and timers so a signed-out user's queue cannot
 *    keep retrying.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fsMock = vi.hoisted(() => ({
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: any, col: string, id: string) => ({ col, id })),
  setDoc: fsMock.setDoc,
  deleteDoc: fsMock.deleteDoc,
}));

vi.mock('../infrastructure/auth/firebase', () => ({
  firestore: { isMock: true },
  checkFirebaseConfigured: vi.fn().mockReturnValue(true),
}));

function stubWindow() {
  const store = new Map<string, string>();
  const shim = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  vi.stubGlobal('window', { localStorage: shim, addEventListener: vi.fn() });
  vi.stubGlobal('localStorage', shim);
  return shim;
}

const snapshot = (matchId: string, status: 'live' | 'completed' = 'live') =>
  ({
    schemaVersion: 1,
    matchId,
    status,
    teamA: 'Alpha',
    teamB: 'Beta',
    tournamentName: null,
    venue: null,
    formatLabel: 'T20',
    tossText: null,
    innings: [],
    current: null,
    statusLine: 'Alpha batting',
    resultText: null,
    startedAt: '2026-11-26T00:00:00.000Z',
  }) as any;

async function loadService() {
  vi.resetModules();
  return import('../infrastructure/live/LivePublishService');
}

beforeEach(() => {
  fsMock.setDoc.mockReset();
  fsMock.deleteDoc.mockReset();
  stubWindow();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('D-H2 — bounded backoff, then park', () => {
  it('a persistently rejected write stops retrying after MAX_FAILURES', async () => {
    vi.useFakeTimers();
    fsMock.setDoc.mockRejectedValue(new Error('permission-denied'));
    const svc = await loadService();

    svc.publishLiveMatch('uid-1', snapshot('m1'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fsMock.setDoc).toHaveBeenCalledTimes(1);

    // Backoff ladder: 2s, 4s, 8s, 16s, 32s → attempts 2..6.
    for (const step of [2000, 4000, 8000, 16000, 32000]) {
      await vi.advanceTimersByTimeAsync(step);
    }
    expect(fsMock.setDoc).toHaveBeenCalledTimes(6);

    // Parked: ten more minutes produce no further attempts.
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(fsMock.setDoc).toHaveBeenCalledTimes(6);

    // A fresh publish call re-arms the loop.
    svc.publishLiveMatch('uid-1', snapshot('m1'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fsMock.setDoc).toHaveBeenCalledTimes(7);
  });

  it('a successful write is not re-sent by later timer activity', async () => {
    vi.useFakeTimers();
    fsMock.setDoc.mockResolvedValue(undefined);
    const svc = await loadService();
    svc.publishLiveMatch('uid-1', snapshot('m2'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fsMock.setDoc).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(fsMock.setDoc).toHaveBeenCalledTimes(1);
  });
});

describe('D-H3 — unpublish deletes are queued and retried', () => {
  it('a failed delete lands in the persistent queue and drains on the next publish', async () => {
    fsMock.setDoc.mockResolvedValue(undefined);
    fsMock.deleteDoc.mockRejectedValueOnce(new Error('offline'));
    const svc = await loadService();

    await svc.unpublishLiveMatch('m-gone');
    const raw = window.localStorage.getItem('csp:livePendingDeletes');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).map((d: any) => d.matchId)).toEqual(['m-gone']);

    fsMock.deleteDoc.mockResolvedValue(undefined);
    svc.publishLiveMatch('uid-1', snapshot('m-other'));
    // publishLiveMatch drains the delete queue synchronously-ish;
    // let the async delete settle.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(fsMock.deleteDoc).toHaveBeenCalledTimes(2);
    expect(window.localStorage.getItem('csp:livePendingDeletes')).toBeNull();
  });
});

describe('D-M3 — clearLivePublishState drops pending work', () => {
  it('after clearing, scheduled retries never fire', async () => {
    vi.useFakeTimers();
    fsMock.setDoc.mockRejectedValue(new Error('permission-denied'));
    const svc = await loadService();
    svc.publishLiveMatch('uid-1', snapshot('m3'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fsMock.setDoc).toHaveBeenCalledTimes(1);
    svc.clearLivePublishState();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(fsMock.setDoc).toHaveBeenCalledTimes(1);
  });
});
