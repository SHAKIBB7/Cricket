'use client';

import React, { useState, useEffect, useRef } from 'react';

export interface NumericInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number | string;
  onChange: (value: number | string) => void;
  min?: number;
  max?: number;
  allowZero?: boolean;
  fallback?: number;
  selectOnFocus?: boolean;
}

/**
 * Normalizes leading zeros:
 * - "020" -> "20"
 * - "02" -> "2"
 * - "00" -> "0"
 * - "0" -> "0"
 * - "" -> ""
 */
export function normalizeNumericString(raw: string, allowZero = true): string {
  if (raw === '') return '';
  // Keep only digits
  const cleaned = raw.replace(/[^\d]/g, '');
  if (cleaned === '') return '';

  // If allowZero is false and the entire input is "0", or multiple zeros:
  if (!allowZero && /^0+$/.test(cleaned)) {
    return '';
  }

  // Remove leading zeros if followed by other digits (e.g., "020" -> "20", "01" -> "1")
  const stripped = cleaned.replace(/^0+(?=\d)/, '');
  return stripped;
}

export function NumericInput({
  value,
  onChange,
  min,
  max,
  allowZero = false,
  fallback,
  selectOnFocus = true,
  className = '',
  onFocus,
  onBlur,
  ...restProps
}: NumericInputProps) {
  // Local string state to allow natural typing, clearing, and backspacing
  const [displayValue, setDisplayValue] = useState<string>(() => {
    if (value === undefined || value === null || value === '') return '';
    return String(value);
  });

  const isFocusedRef = useRef(false);

  // Sync internal display value when external value changes while NOT focused
  useEffect(() => {
    if (!isFocusedRef.current) {
      if (value === undefined || value === null || value === '') {
        setDisplayValue('');
      } else {
        setDisplayValue(String(value));
      }
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;

    // Allow user to completely clear the field while typing
    if (rawVal === '') {
      setDisplayValue('');
      onChange('');
      return;
    }

    // Strip unintended leading zeros (e.g. "020" -> "20", "01" -> "1")
    const normalized = normalizeNumericString(rawVal, allowZero);

    // If max is specified and value exceeds max, optionally clamp or allow typing up to max digits
    setDisplayValue(normalized);

    if (normalized === '') {
      onChange('');
    } else {
      const num = Number(normalized);
      if (!isNaN(num)) {
        onChange(num);
      }
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocusedRef.current = true;
    if (selectOnFocus) {
      // Auto-select text on focus so typing immediately replaces initial/placeholder value
      e.currentTarget.select();
    }
    if (onFocus) {
      onFocus(e);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocusedRef.current = false;

    let finalVal = displayValue.trim();

    if (finalVal === '') {
      if (fallback !== undefined) {
        finalVal = String(fallback);
      } else if (min !== undefined) {
        finalVal = String(min);
      } else if (allowZero) {
        finalVal = '0';
      }
    } else {
      let num = Number(finalVal);
      if (isNaN(num)) {
        num = fallback !== undefined ? fallback : (min ?? 0);
      }
      if (min !== undefined && num < min) {
        num = min;
      }
      if (max !== undefined && num > max) {
        num = max;
      }
      finalVal = String(num);
    }

    setDisplayValue(finalVal);
    const parsedNum = finalVal === '' ? '' : Number(finalVal);
    onChange(parsedNum);

    if (onBlur) {
      onBlur(e);
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={className}
      {...restProps}
    />
  );
}
