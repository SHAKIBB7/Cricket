'use client';

import React from 'react';
import { BackButton, BackButtonProps } from './BackButton';

export interface BackNavigationBarProps {
  /** Title of current screen displayed inline beside BackButton (or centered) */
  title?: React.ReactNode;
  /** Subtitle (optional) */
  subtitle?: React.ReactNode;
  /** Back button configuration */
  backButtonProps?: BackButtonProps;
  /** Optional right-side actions or elements (e.g. Share, PDF, Done) */
  rightAction?: React.ReactNode;
  /** Layout style: 'inline' puts Chevron and Title right next to each other on the same row (iOS standard); 'centered' centers title */
  layout?: 'inline' | 'centered';
  /** Whether the header should stick to the top */
  sticky?: boolean;
  /** Extra container classes */
  className?: string;
  /** Test identifier */
  testId?: string;
}

/**
 * Apple iOS-Style Global Navigation Bar.
 * Standardizes navigation header layout across detail views, subpages, and overlays:
 * - Inline Mode: Left has ChevronLeft icon with screen title right beside it on the same horizontal row, actions on right.
 * - Centered Mode: Centered title with Back button on left.
 * - Glassmorphism blur backdrop & subtle divider.
 */
export const BackNavigationBar = React.memo(function BackNavigationBar({
  title,
  subtitle,
  backButtonProps = {},
  rightAction,
  layout = 'inline',
  sticky = true,
  className = '',
  testId = 'ios-navigation-bar',
}: BackNavigationBarProps) {
  if (layout === 'centered') {
    return (
      <div
        data-testid={testId}
        className={`${
          sticky ? 'sticky top-0 z-30' : 'relative z-10'
        } w-full bg-[var(--card)]/92 backdrop-blur-md border-b border-[var(--border)]/60 transition-all duration-200 px-3 sm:px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top,0px))] ${className}`}
      >
        <div className="flex items-center justify-between gap-2 max-w-7xl mx-auto min-h-[44px]">
          {/* Left Column: iOS Back Button */}
          <div className="flex items-center justify-start shrink-0 min-w-[70px]">
            <BackButton {...backButtonProps} />
          </div>

          {/* Center Column: Title & Subtitle (Centered like iOS UINavigationBar) */}
          {title && (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-2 min-w-0">
              <h2 className="font-bold text-sm sm:text-base text-[var(--foreground)] truncate tracking-tight leading-tight w-full">
                {title}
              </h2>
              {subtitle && (
                <p className="text-[11px] sm:text-xs text-[var(--muted-foreground)] truncate leading-tight w-full mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          )}

          {/* Right Column: Actions or Balance Spacer */}
          <div className="flex items-center justify-end shrink-0 min-w-[70px] gap-1.5 sm:gap-2">
            {rightAction || <div className="w-[70px] hidden sm:block pointer-events-none" aria-hidden="true" />}
          </div>
        </div>
      </div>
    );
  }

  // Default: Compact Inline iOS Header (Chevron + Title on same row, moderate gap, no wasted space)
  return (
    <div
      data-testid={testId}
      className={`${
        sticky ? 'sticky top-0 z-30' : 'relative z-10'
      } w-full bg-[var(--card)]/92 backdrop-blur-md border-b border-[var(--border)]/60 transition-all duration-200 px-3 sm:px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top,0px))] ${className}`}
    >
      <div className="flex items-center justify-between gap-3 max-w-7xl mx-auto min-h-[40px]">
        {/* Left Column: Inline Chevron + Title */}
        <div className="flex items-center gap-2 min-w-0">
          <BackButton
            size="sm"
            showLabel={backButtonProps.showLabel ?? (backButtonProps.label !== undefined && backButtonProps.label !== '')}
            {...backButtonProps}
          />
          {title && (
            <div className="min-w-0">
              <h1 className="font-extrabold text-base sm:text-lg text-[var(--foreground)] truncate tracking-tight leading-none">
                {title}
              </h1>
              {subtitle && (
                <p className="text-[11px] sm:text-xs text-[var(--muted-foreground)] truncate leading-tight mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Actions */}
        {rightAction && (
          <div className="flex items-center justify-end shrink-0 gap-1.5 sm:gap-2">
            {rightAction}
          </div>
        )}
      </div>
    </div>
  );
});
