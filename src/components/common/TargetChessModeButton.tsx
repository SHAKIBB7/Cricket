'use client';

import React from 'react';

export interface TargetChessModeButtonProps {
  isActive: boolean;
  onToggle: () => void;
  className?: string;
}

export function TargetChessModeButton({
  isActive,
  onToggle,
  className = '',
}: TargetChessModeButtonProps) {
  // Multicolor AI liquid gradient spectrum (Cyan -> Blue -> Purple/Violet -> Magenta/Pink -> Stadium Emerald -> Cyan)
  const aiMulticolorGradient =
    'conic-gradient(from 0deg, #06b6d4 0%, #3b82f6 18%, #8b5cf6 36%, #ec4899 54%, #10b981 74%, #06b6d4 100%)';

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-full overflow-visible transition-all duration-300 group ${className}`}
    >
      {/* ── SOFT DYNAMIC MULTICOLOR LIQUID AURA / SHADOW ── */}
      {/* Follows pill perimeter; inherits and projects moving cyan/blue/purple/pink/green colors */}
      <div
        className={`absolute -inset-[3px] rounded-full filter blur-[8px] pointer-events-none transition-opacity duration-500 ${
          isActive
            ? 'opacity-75 animate-liquid-glow-active'
            : 'opacity-40 group-hover:opacity-65 animate-liquid-glow'
        }`}
        style={{
          background: aiMulticolorGradient,
        }}
      />

      {/* ── PILL CONTAINER WITH LIQUID PERIMETER BORDER ── */}
      <div className="relative inline-flex items-center justify-center p-[1.5px] rounded-full overflow-hidden">
        {/* Continuous rotating multicolor liquid gradient along the pill edge */}
        <div
          className={`absolute -inset-[200%] animate-liquid-flow pointer-events-none transition-opacity duration-500 ${
            isActive ? 'opacity-100' : 'opacity-85 group-hover:opacity-100'
          }`}
          style={{
            background: aiMulticolorGradient,
          }}
        />

        {/* ── INNER BUTTON SURFACE (Soft translucent tint, NEVER black, NEVER flat white) ── */}
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={isActive}
          title="Toggle Target Chess Mode"
          className={`relative z-10 flex items-center justify-center gap-1.5 px-3 py-1 sm:px-3.5 sm:py-1 rounded-full font-bold text-[11px] sm:text-xs select-none transition-all duration-200 active:scale-[0.98] ${
            isActive
              ? 'bg-gradient-to-r from-emerald-100/90 via-teal-100/80 to-emerald-100/90 dark:from-[#0d2a1d]/90 dark:via-[#103425]/85 dark:to-[#0d2a1d]/90 text-emerald-950 dark:text-emerald-100 border border-emerald-400/50 shadow-xs'
              : 'bg-gradient-to-r from-emerald-50/90 via-teal-50/80 to-slate-100/90 dark:from-[#0d1e17]/90 dark:via-[#0e241c]/85 dark:to-[#0f1d24]/90 text-slate-800 dark:text-emerald-100 hover:text-emerald-950 dark:hover:text-emerald-50 border border-emerald-500/20 dark:border-emerald-500/30'
          }`}
        >
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 font-black text-xs leading-none select-none">
            ✦
          </span>
          <span className="tracking-tight whitespace-nowrap">Target Chess Mode</span>
          {isActive && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] uppercase tracking-wider font-black bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-400/40 leading-none">
              Active
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
