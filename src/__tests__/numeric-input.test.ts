import { describe, it, expect } from 'vitest';
import { normalizeNumericString } from '../components/common/NumericInput';

describe('NumericInput & Number Normalization Engine', () => {
  it('1. Strips leading zero when user types after 0 (e.g. 020 -> 20)', () => {
    expect(normalizeNumericString('020')).toBe('20');
    expect(normalizeNumericString('010')).toBe('10');
    expect(normalizeNumericString('05')).toBe('5');
    expect(normalizeNumericString('007')).toBe('7');
  });

  it('2. Preserves single zero when allowZero is true', () => {
    expect(normalizeNumericString('0', true)).toBe('0');
  });

  it('3. Clears zero when allowZero is false', () => {
    expect(normalizeNumericString('0', false)).toBe('');
    expect(normalizeNumericString('00', false)).toBe('');
  });

  it('4. Handles empty string without snapping back to 0', () => {
    expect(normalizeNumericString('')).toBe('');
  });

  it('5. Strips non-digit characters safely', () => {
    expect(normalizeNumericString('abc20xyz')).toBe('20');
    expect(normalizeNumericString(' 025 ')).toBe('25');
  });

  it('6. Correctly normalizes cricket overs and target values', () => {
    // Typing 20 into a 0 field produces "020", normalized to "20"
    expect(normalizeNumericString('020', false)).toBe('20');
    // Typing 50 into overs produces "050" or "50", normalized to "50"
    expect(normalizeNumericString('050', false)).toBe('50');
    // Typing 100 for target produces "100"
    expect(normalizeNumericString('0100', false)).toBe('100');
  });
});
