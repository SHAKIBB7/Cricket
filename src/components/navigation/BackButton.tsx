'use client';

import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { useSmartNavigation } from './useSmartNavigation';
import { useLanguage } from '@/context/LanguageContext';

export interface BackButtonProps {
  /** Optional custom text label. Defaults to localized 'Back' / 'ফিরে যান' */
  label?: string;
  /** Whether to show text label beside chevron (defaults to true unless label is empty string) */
  showLabel?: boolean;
  /** Safe fallback URL if opened via direct link or browser history is empty */
  fallbackUrl?: string;
  /** Optional custom handler override (e.g. for closing modals, subviews, or panels) */
  onClick?: () => void;
  /** Optional confirmation prompt before navigating (useful if unsaved form data exists) */
  confirmMessage?: string;
  /** Visual theme variant */
  variant?: 'tinted' | 'neutral' | 'subtle' | 'pill';
  /** Button sizing token */
  size?: 'sm' | 'md' | 'lg';
  /** Hide text label on mobile viewports for compact header bars */
  compactOnMobile?: boolean;
  /** Extra CSS classes */
  className?: string;
  /** Accessible title / tooltip */
  title?: string;
  /** Test identifier */
  testId?: string;
}

/**
 * Reusable Apple iOS-Inspired Back Navigation Button.
 * Conforms to Apple Human Interface Guidelines:
 * - 44pt touch target minimum
 * - Authentic SF Symbols-style Chevron Left (strokeWidth=2.5)
 * - Subtle opacity press feedback (`active:opacity-50`)
 * - High contrast light & dark mode support
 * - Smart internal history fallback logic
 */
export const BackButton = React.memo(function BackButton({
  label,
  showLabel,
  fallbackUrl = '/',
  onClick,
  confirmMessage,
  variant = 'tinted',
  size = 'md',
  compactOnMobile = false,
  className = '',
  title,
  testId = 'ios-back-button',
}: BackButtonProps) {
  const { goBack } = useSmartNavigation();
  const { t } = useLanguage();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    goBack({
      fallbackUrl,
      onCustomBack: onClick,
      confirmMessage,
    });
  };

  const shouldShowLabel = showLabel ?? (label !== '');
  const displayLabel = label !== undefined ? label : t('back', 'Back');
  const tooltip = title || (typeof displayLabel === 'string' && displayLabel ? displayLabel : 'Go Back');

  // Size styling tokens
  const sizeClasses = {
    sm: 'text-xs py-1 px-1.5 min-h-[36px] min-w-[36px] justify-center',
    md: 'text-sm py-1.5 px-2 min-h-[44px] min-w-[44px] justify-center',
    lg: 'text-base py-2 px-2.5 min-h-[48px] min-w-[48px] justify-center',
  }[size];

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-5.5 h-5.5',
  }[size];

  // Variant styling tokens
  const variantClasses = {
    // iOS Emerald Tint: classic Apple navigation tint matching cricket theme
    tinted:
      'text-emerald-600 hover:text-emerald-500 active:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 font-semibold',
    // Neutral: adapts to foreground text
    neutral:
      'text-[var(--foreground)] hover:text-emerald-600 dark:hover:text-emerald-400 font-medium',
    // Subtle: muted foreground with bright hover
    subtle:
      'text-[var(--muted-foreground)] hover:text-[var(--foreground)] active:text-emerald-600 font-medium',
    // Pill: subtle elevated backdrop for floating views / overlays
    pill:
      'bg-[var(--card)]/90 hover:bg-[var(--muted)] border border-[var(--border)] text-[var(--foreground)] hover:border-emerald-500/40 shadow-xs font-semibold rounded-xl px-3',
  }[variant];

  return (
    <button
      type="button"
      onClick={handleClick}
      data-testid={testId}
      aria-label={tooltip}
      title={tooltip}
      className={`group inline-flex items-center gap-0.5 select-none transition-all duration-150 ease-out active:opacity-50 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--background)] cursor-pointer rounded-lg ${variantClasses} ${sizeClasses} ${className}`}
    >
      <ChevronLeft
        strokeWidth={2.5}
        className={`${iconSizes} shrink-0 stroke-[2.5] ${shouldShowLabel && displayLabel ? '-ml-1' : ''} transition-transform duration-150 ease-out group-hover:-translate-x-0.5`}
        aria-hidden="true"
      />
      {shouldShowLabel && displayLabel ? (
        <span
          className={`leading-none truncate tracking-tight ${
            compactOnMobile ? 'hidden sm:inline' : 'inline'
          }`}
        >
          {displayLabel}
        </span>
      ) : null}
    </button>
  );
});
