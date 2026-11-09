/**
 * @vitest-environment jsdom
 *
 * Full-audit UI fix run — regression coverage for the UI/APP
 * partition:
 *  A-1  (High): the desktop sidebar's ToolsAndAccountsPanel shows
 *       an update affordance (driven by useSyncStatus) when an app
 *       update is waiting, and hides it otherwise.
 *  BV-1 (High): the match summary page must not present an
 *       in-progress match as completed — no 'Match Completed' /
 *       'Congratulations!' block, no Player of the Match line, no
 *       generated narrative; instead an in-progress state with the
 *       current score and links to scoring / live center.
 *  F4-02: the summary page renders a real not-found state when the
 *       match does not exist on this device.
 *  F4-03: the tournament detail page renders the same not-found
 *       treatment when the tournament does not exist.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const hoisted = vi.hoisted(() => ({
  sync: null as Record<string, unknown> | null,
  match: null as Record<string, unknown> | null,
  tournament: null as Record<string, unknown> | null,
  params: { matchId: 'm-test', id: 't-test' } as Record<string, string>,
  applyUpdate: vi.fn(),
}));

vi.mock('@/context/SyncContext', () => ({
  SyncProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSyncStatus: () => hoisted.sync,
  useSyncStatusOptional: () => hoisted.sync ?? undefined,
}));

vi.mock('next/navigation', () => ({
  useParams: () => hoisted.params,
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
}));

vi.mock('next/dynamic', () => ({
  default: () => () => null,
}));

vi.mock('@/components/navigation', () => ({
  BackButton: () => null,
}));

vi.mock('@/infrastructure/storage/MatchRepository', () => ({
  MatchRepository: {
    getMatch: async () => hoisted.match,
    getAllMatches: async () => [],
  },
}));

vi.mock('@/infrastructure/storage/FeatureHubRepository', () => ({
  FeatureHubRepository: {
    getTournament: async () => hoisted.tournament,
  },
}));

vi.mock('@/features/scoring/pdf/usePdfDownload', () => ({
  usePdfDownload: () => ({
    isGenerating: false,
    error: null,
    downloadPdf: async () => undefined,
    close: () => undefined,
  }),
}));

import { ToolsAndAccountsPanel } from '@/components/navigation/ToolsAndAccountsPanel';
import MatchSummaryPage from '@/app/matches/summary/[matchId]/page';
import TournamentDetailPage from '@/app/tournaments/[id]/page';
import { renderToHtml } from './helpers/render-dom';

function makeSyncFake(isUpdateAvailable: boolean) {
  return {
    syncState: 'SYNCED',
    pendingCount: 0,
    lastSyncedAt: null,
    errorMessage: null,
    isOnline: true,
    isServerReachable: true,
    triggerSync: async () => undefined,
    storageEstimate: null,
    refreshStorage: async () => undefined,
    isOfflineReady: true,
    isUpdateAvailable,
    applyUpdate: hoisted.applyUpdate,
    offlineSetup: { status: 'ready', progress: 100, message: null, error: null },
    retryOfflineSetup: async () => undefined,
  };
}

function makePlayer(name: string, runs: number, balls: number) {
  return {
    id: `p-${name}`,
    name,
    battingHand: 'RIGHT',
    runs,
    balls,
    fours: 1,
    sixes: 0,
    dotBalls: 0,
    ballLog: [],
    bowlersFaced: {},
    runsVsBowler: {},
    isDismissed: false,
  };
}

function makeOngoingMatch() {
  return {
    id: 'm-test',
    teamA: 'Audit Tigers',
    teamB: 'Audit Lions',
    tossWinner: 'Audit Tigers',
    tossDecision: 'BAT',
    totalOvers: 20,
    status: 'ONGOING',
    currentInnings: 1,
    targetScore: 0,
    advancedSettings: {},
    firstInnings: {
      team: 'Audit Tigers',
      bowlingTeam: 'Audit Lions',
      totalRuns: 13,
      totalWickets: 1,
      totalBalls: 2,
      oversString: '0.2',
      wideRuns: 0,
      nbRuns: 0,
      byeRuns: 0,
      lbRuns: 0,
      penaltyRuns: 0,
      penaltyRunsAgainst: 0,
      players: [makePlayer('Fahim', 8, 2), makePlayer('Rahim', 4, 1)],
      bowlers: [
        {
          id: 'b-1',
          name: 'Karim',
          ballsBowled: 2,
          maidens: 0,
          runs: 13,
          wickets: 1,
          overHistory: [],
        },
      ],
      fallOfWickets: [],
      pastPartnerships: [],
      currentPartnership: { runs: 13, balls: 2 },
      thisOverLog: [],
      strikerIdx: 0,
      nonStrikerIdx: 1,
      currentBowlerIdx: 0,
      nextPlayerIdx: 2,
      lastCompletedOverBowlerIdx: -1,
      isOverComplete: false,
      isFreeHit: false,
    },
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderAsync(element: React.ReactElement): Promise<string> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(element);
  });
  // Let the pages' async load effects resolve and re-render.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  return container.innerHTML;
}

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
  document.body.innerHTML = '';
  hoisted.sync = null;
  hoisted.match = null;
  hoisted.tournament = null;
  vi.clearAllMocks();
});

describe('A-1 — desktop sidebar update affordance', () => {
  it('shows an Apply affordance when an update is waiting', () => {
    hoisted.sync = makeSyncFake(true);
    const html = renderToHtml(
      <ToolsAndAccountsPanel pathname="/" language="en" t={(key: string) => key} />
    );
    expect(html).toContain('Update Ready');
    expect(html).toContain('desktop-update-apply');
  });

  it('hides the affordance when no update is waiting', () => {
    hoisted.sync = makeSyncFake(false);
    const html = renderToHtml(
      <ToolsAndAccountsPanel pathname="/" language="en" t={(key: string) => key} />
    );
    expect(html).not.toContain('Update Ready');
    expect(html).not.toContain('desktop-update-apply');
  });
});

describe('BV-1 / F4-02 — match summary page states', () => {
  it('renders an in-progress state for an ONGOING match — never a completed one', async () => {
    hoisted.match = makeOngoingMatch();
    const html = await renderAsync(<MatchSummaryPage />);
    expect(html).toContain('Match in Progress');
    expect(html).toContain('Continue Scoring');
    expect(html).toContain('Live Match Center');
    expect(html).not.toContain('Congratulations!');
    expect(html).not.toContain('Match Completed');
    expect(html).not.toContain('Player of the Match');
    expect(html).not.toContain('Man of the Match');
    expect(html).not.toContain('scalping');
  });

  it('renders a not-found state when the match does not exist', async () => {
    hoisted.match = null;
    const html = await renderAsync(<MatchSummaryPage />);
    expect(html).toContain('Match Not Found');
  });
});

describe('F4-03 — tournament detail page state', () => {
  it('renders a not-found state when the tournament does not exist', async () => {
    hoisted.tournament = null;
    const html = await renderAsync(<TournamentDetailPage />);
    expect(html).toContain('Tournament Not Found');
  });
});
