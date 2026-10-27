'use client';

import React from 'react';

interface CricketIconProps {
  isActive?: boolean;
  className?: string;
  size?: number;
}

/**
 * 1. Home Icon: Refined Cricket Pavilion with Wickets (Stumps & Bails) & Roof Insignia
 */
export function CricketHomeIcon({ isActive = false, className = 'w-7 h-7', size = 28 }: CricketIconProps) {
  const pavilionFill = isActive ? '#059669' : '#334155';
  const badgeFill = isActive ? '#047857' : '#1e293b';
  const seamColor = isActive ? '#a7f3d0' : '#94a3b8';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      shapeRendering="geometricPrecision"
      aria-hidden="true"
    >
      {/* Pavilion Roof and Main Walls */}
      <path
        d="M18 4.2L4.2 14.8C3.6 15.3 3.9 16.2 4.7 16.2H6.5V29.5C6.5 30.3 7.2 31 8 31H28C28.8 31 29.5 30.3 29.5 29.5V16.2H31.3C32.1 16.2 32.4 15.3 31.8 14.8L18 4.2Z"
        fill={pavilionFill}
        className="transition-colors duration-200"
      />

      {/* Roof Edge / Eaves line for depth */}
      <path
        d="M3 15.5L18 4L33 15.5"
        stroke={isActive ? '#10b981' : '#475569'}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Doorway / Pavilion Opening with Wickets cutout */}
      {/* Horizontal Bails */}
      <rect x="12" y="19" width="12" height="1.8" rx="0.9" fill="#ffffff" />
      {/* 3 Vertical Stumps */}
      <rect x="13.2" y="21.2" width="2" height="9.8" rx="1" fill="#ffffff" />
      <rect x="17" y="21.2" width="2" height="9.8" rx="1" fill="#ffffff" />
      <rect x="20.8" y="21.2" width="2" height="9.8" rx="1" fill="#ffffff" />

      {/* Roof Circular Cricket Ball Badge */}
      <circle cx="27" cy="11.5" r="3" fill={badgeFill} stroke="#ffffff" strokeWidth="0.8" />
      {/* Seam Stitch on Roof Badge */}
      <path
        d="M25 13.2L29 9.8"
        stroke={seamColor}
        strokeWidth="0.9"
        strokeLinecap="round"
        strokeDasharray="1.2 0.8"
      />
    </svg>
  );
}

/**
 * 2. New Match Icon: Tilted Cricket Bat, Red Cricket Ball & Emerald Plus Badge
 */
export function CricketNewMatchIcon({ isActive = false, className = 'w-7 h-7', size = 28 }: CricketIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      shapeRendering="geometricPrecision"
      aria-hidden="true"
    >
      <defs>
        {/* Refined Ball Radial Gradient */}
        <radialGradient id="cricketBallRed" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#f87171" />
          <stop offset="65%" stopColor="#dc2626" />
          <stop offset="100%" stopColor="#b91c1c" />
        </radialGradient>
        {/* Bat Grip Gradient */}
        <linearGradient id="batGripGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>

      {/* Tilted Cricket Bat */}
      <g transform="rotate(-38 17 19)">
        {/* Bat Handle with Grip */}
        <rect x="15.2" y="3" width="3.6" height="10" rx="1.8" fill="url(#batGripGrad)" stroke="#1e293b" strokeWidth="1.2" />
        {/* Handle Grip Rings */}
        <line x1="15.5" y1="5.5" x2="18.5" y2="5.5" stroke="#ffffff" strokeWidth="0.75" strokeOpacity="0.85" />
        <line x1="15.5" y1="8" x2="18.5" y2="8" stroke="#ffffff" strokeWidth="0.75" strokeOpacity="0.85" />
        <line x1="15.5" y1="10.5" x2="18.5" y2="10.5" stroke="#ffffff" strokeWidth="0.75" strokeOpacity="0.85" />

        {/* Bat Shoulder & Blade */}
        <path
          d="M14.5 12.5C14.5 11.5 15.2 11 16 11H18C18.8 11 19.5 11.5 19.5 12.5L20.2 26C20.4 28 19 29.5 17 29.5C15 29.5 13.6 28 13.8 26L14.5 12.5Z"
          fill="#f8fafc"
          stroke="#1e293b"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        {/* Bat Blade Center Spine (Wood Contour) */}
        <line x1="17" y1="13" x2="17" y2="27" stroke="#cbd5e1" strokeWidth="1" strokeLinecap="round" />
      </g>

      {/* Red Cricket Ball */}
      <g>
        <circle cx="24" cy="20.5" r="5.2" fill="url(#cricketBallRed)" stroke="#ffffff" strokeWidth="0.75" />
        {/* White Curved Seam */}
        <path
          d="M20.2 18.5C22 19.5 24 22 25.5 24.5"
          stroke="#ffffff"
          strokeWidth="1.1"
          strokeLinecap="round"
          strokeDasharray="1.2 0.8"
        />
      </g>

      {/* Emerald Circular Badge with Crisp White Plus Sign */}
      <g>
        <circle cx="27" cy="26.5" r="4.5" fill="#10b981" stroke="#ffffff" strokeWidth="1.2" />
        {/* Crisp White Plus */}
        <path
          d="M27 24.2V28.8M24.7 26.5H29.3"
          stroke="#ffffff"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

/**
 * 3. Matches Icon: Calendar Book & Emerald Cricket Ball Badge
 */
export function CricketMatchesIcon({ isActive = false, className = 'w-7 h-7', size = 28 }: CricketIconProps) {
  const headerFill = isActive ? '#059669' : '#1e293b';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      shapeRendering="geometricPrecision"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="cricketBallGreen" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="60%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#047857" />
        </radialGradient>
      </defs>

      {/* Calendar Card Frame */}
      <rect
        x="6"
        y="8.5"
        width="22"
        height="21"
        rx="4.5"
        fill="#ffffff"
        stroke="#1e293b"
        strokeWidth="1.6"
        className="dark:fill-slate-900"
      />

      {/* Calendar Top Banner */}
      <path
        d="M6 13C6 10.5 7.8 8.5 10.5 8.5H23.5C26.2 8.5 28 10.5 28 13V15.5H6V13Z"
        fill={headerFill}
        className="transition-colors duration-200"
      />

      {/* 2 Top Binder Rings */}
      <rect x="11" y="5.5" width="2.4" height="5.5" rx="1.2" fill="#1e293b" stroke="#ffffff" strokeWidth="0.6" />
      <rect x="20.6" y="5.5" width="2.4" height="5.5" rx="1.2" fill="#1e293b" stroke="#ffffff" strokeWidth="0.6" />

      {/* Calendar Dates Grid (6 squares) */}
      <rect x="9.5" y="18.5" width="2.5" height="2.5" rx="0.6" fill={isActive ? '#10b981' : '#64748b'} />
      <rect x="14.5" y="18.5" width="2.5" height="2.5" rx="0.6" fill={isActive ? '#10b981' : '#64748b'} />
      <rect x="19.5" y="18.5" width="2.5" height="2.5" rx="0.6" fill={isActive ? '#10b981' : '#64748b'} />

      <rect x="9.5" y="23" width="2.5" height="2.5" rx="0.6" fill={isActive ? '#10b981' : '#64748b'} />
      <rect x="14.5" y="23" width="2.5" height="2.5" rx="0.6" fill={isActive ? '#10b981' : '#64748b'} />

      {/* Emerald Cricket Ball with White Curved Seam */}
      <g>
        <circle cx="26" cy="25.5" r="5.5" fill="url(#cricketBallGreen)" stroke="#ffffff" strokeWidth="1" />
        {/* Curved White Seam */}
        <path
          d="M22.5 24C24 24.5 26.5 26.5 28 28.5"
          stroke="#ffffff"
          strokeWidth="1.1"
          strokeLinecap="round"
          strokeDasharray="1.2 0.8"
        />
        {/* Motion Line */}
        <path
          d="M23 22C24.5 20.8 28 21.5 29.5 23"
          stroke="#fef08a"
          strokeWidth="0.8"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

/**
 * 4. Tournament Icon: Golden Trophy with Star & Twin Emerald Ribbons
 */
export function CricketTournamentIcon({ isActive = false, className = 'w-7 h-7', size = 28 }: CricketIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      shapeRendering="geometricPrecision"
      aria-hidden="true"
    >
      <defs>
        {/* Refined Gold Gradient */}
        <linearGradient id="trophyGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="50%" stopColor="#eab308" />
          <stop offset="100%" stopColor="#ca8a04" />
        </linearGradient>
        {/* Trophy Base Gradient */}
        <linearGradient id="trophyBase" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ca8a04" />
          <stop offset="100%" stopColor="#a16207" />
        </linearGradient>
      </defs>

      {/* Twin Emerald Ribbon Streamers */}
      {/* Left Ribbon */}
      <path
        d="M10 15L7 17.5V26L9 24.5L11 26V18"
        fill="#10b981"
        stroke="#047857"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />
      {/* Right Ribbon */}
      <path
        d="M26 15L29 17.5V26L27 24.5L25 26V18"
        fill="#10b981"
        stroke="#047857"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />

      {/* Left Handle */}
      <path
        d="M12 11.5C8 11.5 7.5 18 12 19.5"
        stroke="url(#trophyGold)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {/* Right Handle */}
      <path
        d="M24 11.5C28 11.5 28.5 18 24 19.5"
        stroke="url(#trophyGold)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />

      {/* Main Trophy Cup Bowl */}
      <path
        d="M11 7.5H25C25 7.5 25.5 16 18 19C10.5 16 11 7.5 11 7.5Z"
        fill="url(#trophyGold)"
        stroke="#ca8a04"
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {/* Cup Rim Top */}
      <ellipse cx="18" cy="7.5" rx="7" ry="1.4" fill="#fef08a" stroke="#ca8a04" strokeWidth="0.8" />

      {/* Engraved Five-Point Star in Center */}
      <path
        d="M18 10.8L19.1 13H21.5L19.6 14.4L20.3 16.6L18 15.2L15.7 16.6L16.4 14.4L14.5 13H16.9L18 10.8Z"
        fill="#ffffff"
        opacity="0.95"
      />

      {/* Trophy Stem */}
      <path d="M16.5 19H19.5V23.5H16.5V19Z" fill="url(#trophyGold)" stroke="#ca8a04" strokeWidth="0.8" />

      {/* Tiered Base / Pedestal */}
      <rect x="14" y="23.5" width="8" height="2.2" rx="0.8" fill="url(#trophyBase)" />
      <rect x="12" y="25.7" width="12" height="3.2" rx="1" fill="url(#trophyBase)" stroke="#854d0e" strokeWidth="0.6" />
    </svg>
  );
}

/**
 * 5. Teams Icon: 3 Player Silhouettes & Foreground Emerald Cricket Batting Helmet
 */
export function CricketTeamsIcon({ isActive = false, className = 'w-7 h-7', size = 28 }: CricketIconProps) {
  const playerFill = isActive ? '#1e293b' : '#334155';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      shapeRendering="geometricPrecision"
      aria-hidden="true"
    >
      <defs>
        {/* Helmet Dome Gradient */}
        <linearGradient id="helmetGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>

      {/* 3 Player Silhouettes */}
      {/* Back Left Player */}
      <circle cx="9.5" cy="11" r="2.8" fill={playerFill} />
      <path d="M5 20C5 17 7 15.5 9.5 15.5C12 15.5 14 17 14 20" fill={playerFill} />

      {/* Back Right Player */}
      <circle cx="26.5" cy="11" r="2.8" fill={playerFill} />
      <path d="M22 20C22 17 24 15.5 26.5 15.5C29 15.5 31 17 31 20" fill={playerFill} />

      {/* Center Player (Behind Helmet) */}
      <circle cx="18" cy="8.5" r="3.2" fill={playerFill} />
      <path d="M12.5 17.5C12.5 14.5 15 13 18 13C21 13 23.5 14.5 23.5 17.5" fill={playerFill} />

      {/* Foreground: Cricket Batting Helmet */}
      <g>
        {/* Helmet Rounded Shell Dome */}
        <path
          d="M12 21.5C12 16.8 15.2 14 19 14C23.2 14 25.5 17.5 25.5 21.5H12Z"
          fill="url(#helmetGrad)"
          stroke="#047857"
          strokeWidth="0.8"
        />

        {/* Visor / Peak */}
        <path
          d="M19 21.5H27C27.5 21.5 28 21.8 27.8 22.3L26.5 24H18.5L19 21.5Z"
          fill="#047857"
        />

        {/* Ear Guard Loop */}
        <circle cx="14.5" cy="22" r="1.6" fill="#1e293b" />

        {/* Protective Metal Grill & Chin Strap */}
        {/* Chin Bar */}
        <path
          d="M14.5 22.5L16 28.5C16.2 29.2 17 29.5 17.8 29.5H21C21.8 29.5 22.5 29 22.8 28.2L24.5 22.5"
          stroke="#1e293b"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Horizontal Grill Bar */}
        <path
          d="M15.5 25.5H23.5"
          stroke="#1e293b"
          strokeWidth="1.1"
          strokeLinecap="round"
        />

        {/* Vertical Grill Struts */}
        <line x1="18.5" y1="22.5" x2="18.5" y2="28.5" stroke="#1e293b" strokeWidth="0.9" />
        <line x1="21" y1="22.5" x2="21" y2="28.5" stroke="#1e293b" strokeWidth="0.9" />
      </g>
    </svg>
  );
}
