import { describe, it, expect } from 'vitest';
import { getAppliedDlsTarget } from '../domain/cricket/dls/appliedDls';
import type { AdvancedSettings } from '../domain/cricket/types';

/**
 * Ultimate audit F3 — the applied DLS target has one source of
 * truth: the stored advancedSettings written by applyDlsTarget.
 * UI surfaces must read it from here instead of recomputing.
 */

const base = {} as AdvancedSettings;

describe('getAppliedDlsTarget (F3)', () => {
  it('returns null when DLS is not applied', () => {
    expect(getAppliedDlsTarget(base)).toBeNull();
    expect(getAppliedDlsTarget({ ...base, dlsRevisedTarget: 121, dlsRevisedOvers: 15 })).toBeNull();
    expect(getAppliedDlsTarget(null)).toBeNull();
    expect(getAppliedDlsTarget(undefined)).toBeNull();
  });

  it('returns the stored target and overs when applied', () => {
    expect(
      getAppliedDlsTarget({ ...base, dlsApplied: true, dlsRevisedTarget: 121, dlsRevisedOvers: 15 }),
    ).toEqual({ revisedTarget: 121, revisedOvers: 15 });
  });

  it('returns null for a corrupt applied state (no positive target)', () => {
    expect(getAppliedDlsTarget({ ...base, dlsApplied: true })).toBeNull();
    expect(getAppliedDlsTarget({ ...base, dlsApplied: true, dlsRevisedTarget: 0 })).toBeNull();
  });

  it('tolerates missing overs (target still authoritative)', () => {
    expect(getAppliedDlsTarget({ ...base, dlsApplied: true, dlsRevisedTarget: 98 })).toEqual({
      revisedTarget: 98,
      revisedOvers: 0,
    });
  });
});
