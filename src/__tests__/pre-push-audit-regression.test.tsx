import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { db } from '../infrastructure/database/dexie-db';
import { SyncEngine } from '../infrastructure/sync/SyncEngine';
import {
  getSupabaseClient,
  setSupabaseAuthToken,
  clearSupabaseClientCache,
} from '../infrastructure/auth/supabase';
import * as supabaseModule from '../infrastructure/auth/supabase';
import { ToolsAndAccountsPanel } from '../components/navigation/ToolsAndAccountsPanel';
import tailwindConfig from '../../tailwind.config.js';

let capturedDocPath = '';
let capturedDocData: any = null;

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    doc: (_fs: any, coll: string, id: string) => `${coll}/${id}`,
    setDoc: (path: string, data: any) => {
      capturedDocPath = path;
      capturedDocData = data;
      return Promise.resolve();
    },
  };
});

describe('Pre-Push Audit & Code Optimization Regression Suite', () => {
  beforeEach(async () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_API_KEY', 'AIzaSyTestKey1234567890');
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'test-project-cricket');
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_APP_ID', '1:1234567890:web:abcdef');
    capturedDocPath = '';
    capturedDocData = null;
    SyncEngine.stop();
    await db.sync_queue.clear();
    await db.matches.clear();
    setSupabaseAuthToken(null);
    clearSupabaseClientCache();
  });

  afterEach(() => {
    SyncEngine.stop();
    clearSupabaseClientCache();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. CLOUD FIRESTORE MATCH PAYLOAD SERIALIZATION & IMMUTABILITY
  // =========================================================================
  describe('1. Firestore Match Schema Conformance & Immutability', () => {
    it('serializes object match result into JSON string conforming to Firestore security rules', async () => {
      vi.spyOn(supabaseModule, 'getSupabaseClient').mockReturnValue({
        from: vi.fn().mockReturnValue({
          upsert: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as any);

      // Mock Firebase session and configuration
      const session = {
        provider: 'firebase' as const,
        uid: 'user_audit_123',
        token: 'mock_token',
      };

      const matchPayload: any = {
        id: 'match_result_serialization_test',
        teamA: 'Sylhet Strikers',
        teamB: 'Rangpur Riders',
        totalOvers: 20,
        status: 'COMPLETED',
        currentInnings: 2,
        result: {
          winner: 'Sylhet Strikers',
          margin: '25 runs',
          type: 'WIN_BY_RUNS',
        },
        scorecard_data: {},
        updatedAt: '2026-10-24T12:00:00.000Z',
      };

      // Call executeRemoteOperation via SyncEngine
      await (SyncEngine as any).executeRemoteOperation(
        {
          clientOpId: 'op_test_1',
          operationType: 'UPSERT_MATCH',
          entityId: matchPayload.id,
          payload: matchPayload,
          status: 'PENDING',
          retryCount: 0,
          createdAt: new Date().toISOString(),
        },
        session
      );

      // Verify that the document path matches
      expect(capturedDocPath).toBe('matches/match_result_serialization_test');

      // Firestore rule line 107 requires: data.result is string
      expect(typeof capturedDocData.result).toBe('string');
      const parsedResult = JSON.parse(capturedDocData.result);
      expect(parsedResult.winner).toBe('Sylhet Strikers');
      expect(parsedResult.type).toBe('WIN_BY_RUNS');

      // Verify createdAt is initialized and normalized
      expect(capturedDocData.createdAt).toBeDefined();
      expect(typeof capturedDocData.createdAt).toBe('string');
      expect(matchPayload.createdAt).toBe(capturedDocData.createdAt);
    });

    it('preserves plain string result and null result directly without double-encoding', async () => {
      capturedDocData = null;
      vi.spyOn(supabaseModule, 'getSupabaseClient').mockReturnValue({
        from: vi.fn().mockReturnValue({
          upsert: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as any);

      const session = {
        provider: 'firebase' as const,
        uid: 'user_audit_123',
        token: 'mock_token',
      };

      // String result test
      const matchWithStringResult: any = {
        id: 'match_string_result',
        teamA: 'Dhaka',
        teamB: 'Khulna',
        totalOvers: 10,
        status: 'COMPLETED',
        currentInnings: 2,
        result: 'Match tied via Super Over',
        createdAt: '2026-10-20T10:00:00.000Z',
        updatedAt: '2026-10-24T12:00:00.000Z',
      };

      await (SyncEngine as any).executeRemoteOperation(
        {
          clientOpId: 'op_test_2',
          operationType: 'UPSERT_MATCH',
          entityId: matchWithStringResult.id,
          payload: matchWithStringResult,
          status: 'PENDING',
          retryCount: 0,
          createdAt: new Date().toISOString(),
        },
        session
      );

      expect(capturedDocData.result).toBe('Match tied via Super Over');
      expect(capturedDocData.createdAt).toBe('2026-10-20T10:00:00.000Z');

      // Null result test (ongoing match)
      const matchWithNullResult: any = {
        id: 'match_null_result',
        teamA: 'Barisal',
        teamB: 'Comilla',
        totalOvers: 20,
        status: 'ONGOING',
        currentInnings: 1,
        result: null,
        createdAt: '2026-10-21T10:00:00.000Z',
        updatedAt: '2026-10-24T12:00:00.000Z',
      };

      await (SyncEngine as any).executeRemoteOperation(
        {
          clientOpId: 'op_test_3',
          operationType: 'UPSERT_MATCH',
          entityId: matchWithNullResult.id,
          payload: matchWithNullResult,
          status: 'PENDING',
          retryCount: 0,
          createdAt: new Date().toISOString(),
        },
        session
      );

      expect(capturedDocData.result).toBeNull();
      expect(capturedDocData.createdAt).toBe('2026-10-21T10:00:00.000Z');
    });
  });

  // =========================================================================
  // 2. SUPABASE CLIENT MEMOIZATION & PERFORMANCE
  // =========================================================================
  describe('2. Supabase Client Instance Memoization', () => {
    it('returns identical cached client instance when called repeatedly with same token', () => {
      const tokenA = 'mock_jwt_token_alpha';
      const client1 = getSupabaseClient(tokenA);
      const client2 = getSupabaseClient(tokenA);

      expect(client1).toBe(client2);
    });

    it('creates fresh client instance when bearer token changes', () => {
      const tokenA = 'mock_jwt_token_alpha';
      const tokenB = 'mock_jwt_token_beta';

      const clientA = getSupabaseClient(tokenA);
      const clientB = getSupabaseClient(tokenB);

      expect(clientA).not.toBe(clientB);
    });

    it('clearSupabaseClientCache cleanly purges cached client instance', () => {
      const token = 'mock_jwt_token_cache_test';
      const clientBefore = getSupabaseClient(token);

      clearSupabaseClientCache();

      const clientAfter = getSupabaseClient(token);
      expect(clientBefore).not.toBe(clientAfter);
    });
  });

  // =========================================================================
  // 3. TOOLS & ACCOUNTS PANEL ACCESSIBILITY & RELIABILITY
  // =========================================================================
  describe('3. Tools & Accounts Panel Keyboard Accessibility & Class Validity', () => {
    const mockT = (k: string) => k;

    it('renders Row 4 (Appearance) with role="menuitem" and tabIndex={0} for WCAG keyboard accessibility', () => {
      const html = renderToStaticMarkup(
        <ToolsAndAccountsPanel pathname="/" language="en" t={mockT} />
      );

      expect(html).toContain('role="menuitem"');
      expect(html).toContain('tabindex="0"');
      expect(html).toContain('aria-label="Appearance"');
    });

    it('renders Row 3 manual sync trigger with role="button", tabIndex={0}, and aria-label', () => {
      const html = renderToStaticMarkup(
        <ToolsAndAccountsPanel pathname="/" language="en" t={mockT} />
      );

      expect(html).toContain('role="button"');
      expect(html).toContain('tabindex="0"');
      expect(html).toContain('aria-label="Trigger manual sync"');
    });

    it('replaces all invalid outline-hidden classes with standard focus-visible:outline-none', () => {
      const html = renderToStaticMarkup(
        <ToolsAndAccountsPanel pathname="/" language="en" t={mockT} />
      );

      expect(html).not.toContain('outline-hidden');
      expect(html).toContain('focus-visible:outline-none');
    });
  });

  // =========================================================================
  // 4. TAILWIND CSS 2XS SHADOW TOKEN EXTENSION
  // =========================================================================
  describe('4. Tailwind CSS Token Verification', () => {
    it('defines 2xs box shadow token in tailwind.config.js for shadow-2xs support', () => {
      const boxShadows: any = tailwindConfig.theme?.extend?.boxShadow;
      expect(boxShadows).toBeDefined();
      expect(boxShadows['2xs']).toBe('0 1px 1.5px 0 rgba(0, 0, 0, 0.04)');
      expect(boxShadows['xs']).toBe('0 1px 2px 0 rgba(0, 0, 0, 0.05)');
    });
  });
});
