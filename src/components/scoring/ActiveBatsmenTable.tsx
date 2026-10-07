import React from 'react';
import { Player } from '@/domain/cricket/types';
import { strikeRate, cleanPlayerName } from '@/domain/cricket/formatters';

interface ActiveBatsmenTableProps {
  striker?: Player;
  nonStriker?: Player;
  strikerIdx: number;
  nonStrikerIdx: number;
  onSelectBatsman: (params: {
    player: Player;
    isStriker?: boolean;
    isNonStriker?: boolean;
    battingPosition?: number;
  }) => void;
}

export function ActiveBatsmenTable({
  striker,
  nonStriker,
  strikerIdx,
  nonStrikerIdx,
  onSelectBatsman,
}: ActiveBatsmenTableProps) {
  const strikerSr = striker
    ? strikeRate(striker.runs || 0, striker.balls || 0).toFixed(1)
    : '0.0';
  const nonStrikerSr = nonStriker
    ? strikeRate(nonStriker.runs || 0, nonStriker.balls || 0).toFixed(1)
    : '0.0';

  return (
    <div className="w-full overflow-hidden select-none">
      <table className="w-full border-collapse table-fixed">
        <thead>
          <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)] text-caption sm:text-xs">
            {/* BATSMAN: receives highest width */}
            <th className="text-left font-bold tracking-wider uppercase py-1 px-2 w-[43%] sm:w-[48%]">
              BATSMAN
            </th>
            {/* R: Runs */}
            <th className="text-right font-semibold uppercase py-1 px-1 sm:px-1.5 w-[11%] sm:w-[10%]">
              R
            </th>
            {/* B: Balls Faced */}
            <th className="text-right font-semibold uppercase py-1 px-1 sm:px-1.5 w-[11%] sm:w-[10%]">
              B
            </th>
            {/* 4s: Fours */}
            <th className="text-right font-semibold uppercase py-1 px-1 sm:px-1.5 w-[10%] sm:w-[9%]">
              4s
            </th>
            {/* 6s: Sixes */}
            <th className="text-right font-semibold uppercase py-1 px-1 sm:px-1.5 w-[10%] sm:w-[9%]">
              6s
            </th>
            {/* SR: Strike Rate */}
            <th className="text-right font-semibold uppercase py-1 px-1.5 sm:px-2 w-[15%] sm:w-[14%]">
              SR
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]/40 num-font text-xs sm:text-sm">
          {/* 1. STRIKER ROW */}
          <tr
            onClick={() => {
              if (striker) {
                onSelectBatsman({
                  player: striker,
                  isStriker: true,
                  battingPosition: strikerIdx + 1,
                });
              }
            }}
            className="cursor-pointer bg-emerald-500/[0.04] dark:bg-emerald-500/[0.08] hover:bg-emerald-500/10 active:scale-[0.99] transition-all group"
            title="Click to view striker profile & analytics"
          >
            <td className="py-1.25 sm:py-1.5 px-2 text-left min-w-0">
              <div className="flex items-center gap-1 min-w-0">
                <span
                  className="text-amber-500 dark:text-amber-400 text-[10px] sm:text-xs shrink-0 select-none leading-none"
                  aria-label="Striker"
                >
                  ★
                </span>
                <span className="font-bold text-[var(--foreground)] truncate tracking-tight group-hover:text-emerald-500 transition-colors leading-tight">
                  {cleanPlayerName(striker?.name) || 'Striker'}
                </span>
              </div>
            </td>
            {/* Runs: slightly higher visual priority */}
            <td className="py-1.25 sm:py-1.5 px-1 sm:px-1.5 text-right font-black text-[var(--foreground)]">
              {striker?.runs ?? 0}
            </td>
            {/* Balls */}
            <td className="py-1.25 sm:py-1.5 px-1 sm:px-1.5 text-right font-medium text-[var(--muted-foreground)]">
              {striker?.balls ?? 0}
            </td>
            {/* 4s */}
            <td className="py-1.25 sm:py-1.5 px-1 sm:px-1.5 text-right font-medium text-[var(--muted-foreground)]">
              {striker?.fours ?? 0}
            </td>
            {/* 6s */}
            <td className="py-1.25 sm:py-1.5 px-1 sm:px-1.5 text-right font-medium text-[var(--muted-foreground)]">
              {striker?.sixes ?? 0}
            </td>
            {/* Strike Rate */}
            <td className="py-1.25 sm:py-1.5 px-1.5 sm:px-2 text-right font-bold text-[var(--foreground)]/90">
              {strikerSr}
            </td>
          </tr>

          {/* 2. NON-STRIKER ROW */}
          <tr
            onClick={() => {
              if (nonStriker) {
                onSelectBatsman({
                  player: nonStriker,
                  isNonStriker: true,
                  battingPosition: nonStrikerIdx + 1,
                });
              }
            }}
            className="cursor-pointer hover:bg-[var(--muted)]/50 active:scale-[0.99] transition-all group"
            title="Click to view non-striker profile & analytics"
          >
            <td className="py-1.25 sm:py-1.5 px-2 text-left min-w-0">
              <div className="flex items-center gap-1 min-w-0">
                {/* Spacer to match striker ★ width for perfect vertical alignment */}
                <span
                  className="text-[10px] sm:text-xs shrink-0 select-none opacity-0 pointer-events-none leading-none"
                  aria-hidden="true"
                >
                  ★
                </span>
                <span className="font-semibold text-[var(--foreground)]/90 truncate tracking-tight group-hover:text-blue-500 transition-colors leading-tight">
                  {cleanPlayerName(nonStriker?.name) || 'Non-Striker'}
                </span>
              </div>
            </td>
            {/* Runs: slightly higher visual priority */}
            <td className="py-1.25 sm:py-1.5 px-1 sm:px-1.5 text-right font-black text-[var(--foreground)]">
              {nonStriker?.runs ?? 0}
            </td>
            {/* Balls */}
            <td className="py-1.25 sm:py-1.5 px-1 sm:px-1.5 text-right font-medium text-[var(--muted-foreground)]">
              {nonStriker?.balls ?? 0}
            </td>
            {/* 4s */}
            <td className="py-1.25 sm:py-1.5 px-1 sm:px-1.5 text-right font-medium text-[var(--muted-foreground)]">
              {nonStriker?.fours ?? 0}
            </td>
            {/* 6s */}
            <td className="py-1.25 sm:py-1.5 px-1 sm:px-1.5 text-right font-medium text-[var(--muted-foreground)]">
              {nonStriker?.sixes ?? 0}
            </td>
            {/* Strike Rate */}
            <td className="py-1.25 sm:py-1.5 px-1.5 sm:px-2 text-right font-bold text-[var(--foreground)]/90">
              {nonStrikerSr}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
