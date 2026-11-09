import { describe, expect, it } from 'vitest';
import {
  countOverLogBalls,
  isPenaltyLogEntry,
  resolveEditTargetIndex,
} from '@/lib/overLogEdit';

/**
 * F8-A regression (Ultimate Stage C): penalty entries (+5P / -5P) live in
 * thisOverLog but are not BALL_SCORED events. The pre-fix score-page
 * mapping (totalEvents − log.length + idx) used the RAW log length, so a
 * penalty anywhere in the over shifted the target for every ball bowled
 * BEFORE the penalty — clicking the first ball after a mid-over penalty
 * opened the last ball of the PREVIOUS over — and clicking the penalty
 * chip itself opened a real ball. These tests pin the corrected mapping.
 *
 * Scenario convention: 10 balls were bowled in earlier overs, so the
 * current over's deliveries are BALL_SCORED events 10, 11, …
 */
describe('isPenaltyLogEntry', () => {
  it('recognises penalty markers only', () => {
    expect(isPenaltyLogEntry('+5P')).toBe(true);
    expect(isPenaltyLogEntry('-5P')).toBe(true);
    expect(isPenaltyLogEntry('+12P')).toBe(true);
    expect(isPenaltyLogEntry('4')).toBe(false);
    expect(isPenaltyLogEntry('Wd')).toBe(false);
    expect(isPenaltyLogEntry('1+W')).toBe(false);
    expect(isPenaltyLogEntry('P')).toBe(false);
  });
});

describe('resolveEditTargetIndex', () => {
  it('is the identity mapping when no penalty exists', () => {
    const log = ['1', '4', '0', 'W'];
    expect(resolveEditTargetIndex(log, 0, 14)).toBe(10);
    expect(resolveEditTargetIndex(log, 3, 14)).toBe(13);
  });

  it('a ball bowled BEFORE a mid-over penalty maps to its own event (the F8 bug)', () => {
    const log = ['1', '+5P', '4'];
    // 2 real balls this over → events 10 ('1') and 11 ('4').
    // Pre-fix mapping for idx 0: 12 − 3 + 0 = 9 — the previous over's
    // last ball. Fixed: 10.
    expect(resolveEditTargetIndex(log, 0, 12)).toBe(10);
    expect(resolveEditTargetIndex(log, 2, 12)).toBe(11);
  });

  it('penalty entries themselves are not editable', () => {
    const log = ['1', '-5P', '2'];
    // Pre-fix, clicking the chip opened event 10 (the '1') for editing.
    expect(resolveEditTargetIndex(log, 1, 12)).toBeNull();
  });

  it('penalty as the first entry does not disturb the over’s balls', () => {
    const log = ['+5P', '1', '1'];
    expect(resolveEditTargetIndex(log, 1, 12)).toBe(10);
    expect(resolveEditTargetIndex(log, 2, 12)).toBe(11);
  });

  it('multiple penalties in one over accumulate correctly', () => {
    const log = ['+5P', '1', '+5P', '6'];
    expect(countOverLogBalls(log)).toBe(2);
    expect(resolveEditTargetIndex(log, 1, 12)).toBe(10);
    expect(resolveEditTargetIndex(log, 3, 12)).toBe(11);
    expect(resolveEditTargetIndex(log, 0, 12)).toBeNull();
    expect(resolveEditTargetIndex(log, 2, 12)).toBeNull();
  });

  it('out-of-range positions resolve to null', () => {
    expect(resolveEditTargetIndex(['1'], -1, 1)).toBeNull();
    expect(resolveEditTargetIndex(['1'], 5, 1)).toBeNull();
    expect(resolveEditTargetIndex([], 0, 0)).toBeNull();
  });
});
