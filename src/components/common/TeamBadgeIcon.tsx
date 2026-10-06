'use client';

import React from 'react';

export interface TeamBadgeIconProps {
  type: 'home' | 'away' | 'host' | 'visitor';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
  animate?: boolean;
}

export function TeamBadgeIcon({
  type,
  size = 'md',
  showLabel = false,
  className = '',
  animate = true,
}: TeamBadgeIconProps) {
  const isHome = type === 'home' || type === 'host';

  const sizeClasses = {
    xs: 'w-5 h-5 text-xs',
    sm: 'w-7 h-7 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  };

  const iconSizes = {
    xs: 12,
    sm: 15,
    md: 20,
    lg: 24,
  };

  const iconPx = iconSizes[size];

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <div
        className={`${sizeClasses[size]} rounded-xl flex items-center justify-center shrink-0 border transition-transform duration-300 ${
          animate ? 'hover:scale-105 active:scale-95' : ''
        } ${
          isHome
            ? 'bg-gradient-to-tr from-emerald-600/20 via-teal-500/15 to-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-sm shadow-emerald-500/10'
            : 'bg-gradient-to-tr from-blue-600/20 via-indigo-500/15 to-sky-500/10 border-blue-500/30 text-blue-400 shadow-sm shadow-blue-500/10'
        }`}
        title={isHome ? 'Home Team (Host Stadium)' : 'Away Team (Visiting Airplane)'}
      >
        {isHome ? (
          // Stadium / Host Venue Icon (matches Flutter assets/animations/stadium.json & Icons.stadium)
          <svg
            width={iconPx}
            height={iconPx}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="drop-shadow-xs"
          >
            {/* Stadium Colosseum / Arena outline */}
            <path d="M2 10c0-3.3 4.5-6 10-6s10 2.7 10 6v6c0 3.3-4.5 6-10 6s-10-2.7-10-6v-6z" />
            <path d="M2 10v6" />
            <path d="M22 10v6" />
            {/* Inner Pitch Oval */}
            <ellipse cx="12" cy="13" rx="5" ry="2.5" />
            {/* Floodlight beams */}
            <path d="M7 6v2" />
            <path d="M17 6v2" />
            <path d="M12 4v2" />
          </svg>
        ) : (
          // Airplane / Visiting Flight Icon (matches Flutter assets/animations/plane.json & Icons.flight)
          <svg
            width={iconPx}
            height={iconPx}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="drop-shadow-xs transform -rotate-45"
          >
            {/* Jet airliner */}
            <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 20.5 3c-1-1-3-.5-4.5 1L12.5 7.5 4.3 5.7c-.7-.1-1.3.3-1.4 1-.1.7.3 1.3 1 1.4l7 3.5-3.5 3.5-2.5-.5c-.4-.1-.8.1-1 .4-.3.4-.2.9.2 1.2l2.5 1.8 1.8 2.5c.3.4.8.5 1.2.2.3-.2.5-.6.4-1l-.5-2.5 3.5-3.5 3.5 7c.2.6.8 1 1.4 1 .7-.1 1.1-.7 1-1.4z" />
          </svg>
        )}
      </div>

      {showLabel && (
        <span
          className={`text-xs font-black uppercase px-2 py-0.5 rounded-md border tracking-wider ${
            isHome
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-500 dark:text-emerald-400'
              : 'bg-blue-500/15 border-blue-500/30 text-blue-500 dark:text-blue-400'
          }`}
        >
          {isHome ? 'HOST' : 'VISITOR'}
        </span>
      )}
    </div>
  );
}
