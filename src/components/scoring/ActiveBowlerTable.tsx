import React from 'react';
import { Bowler } from '@/domain/cricket/types';
import { economyRate, cleanPlayerName } from '@/domain/cricket/formatters';

interface ActiveBowlerTableProps {
  bowler?: Bowler | null;
  onSelectBowler?: (bowler: Bowler) => void;
}

export function ActiveBowlerTable({
  bowler,
  onSelectBowler,
}: ActiveBowlerTableProps) {
  const overs = bowler
    ? `${Math.floor(bowler.ballsBowled / 6)}.${bowler.ballsBowled % 6}`
    : '0.0';
  const maidens = bowler?.maidens ?? 0;
  const runs = bowler?.runs ?? 0;
  const wickets = bowler?.wickets ?? 0;
  const econ = bowler
    ? economyRate(bowler.runs || 0, bowler.ballsBowled || 0).toFixed(2)
    : '0.00';

  return (
    <div className="w-full overflow-hidden select-none">
      <table className="w-full border-collapse table-fixed">
        <thead>
          <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)] text-caption sm:text-xs">
            {/* BOWLER: receives highest width */}
            <th className="text-left font-bold tracking-wider uppercase py-1 px-2 w-[43%] sm:w-[48%]">
              BOWLER
            </th>
            {/* O: Overs */}
            <th className="text-right font-semibold uppercase py-1 px-1 sm:px-1.5 w-[11%] sm:w-[10%]">
              O
            </th>
            {/* M: Maidens */}
            <th className="text-right font-semibold uppercase py-1 px-1 sm:px-1.5 w-[11%] sm:w-[10%]">
              M
            </th>
            {/* R: Runs Conceded */}
            <th className="text-right font-semibold uppercase py-1 px-1 sm:px-1.5 w-[10%] sm:w-[9%]">
              R
            </th>
            {/* W: Wickets */}
            <th className="text-right font-semibold uppercase py-1 px-1 sm:px-1.5 w-[10%] sm:w-[9%]">
              W
            </th>
            {/* ECO: Economy Rate */}
            <th className="text-right font-semibold uppercase py-1 px-1.5 sm:px-2 w-[15%] sm:w-[14%]">
              ECO
            </th>
          </tr>
        </thead>
        <tbody className="num-font text-xs sm:text-sm">
          <tr
            onClick={() => {
              if (bowler && onSelectBowler) {
                onSelectBowler(bowler);
              }
            }}
            className="cursor-pointer bg-blue-500/[0.04] dark:bg-blue-500/[0.08] hover:bg-blue-500/10 active:scale-[0.99] transition-all group"
            title="Click to view full bowler profile & spell stats"
          >
            <td className="py-1.25 sm:py-1.5 px-2 text-left min-w-0">
              <span className="font-bold text-[var(--foreground)] truncate tracking-tight group-hover:text-blue-500 transition-colors leading-tight block">
                {cleanPlayerName(bowler?.name) || 'Bowler'}
              </span>
            </td>
            {/* Overs */}
            <td className="py-1.25 sm:py-1.5 px-1 sm:px-1.5 text-right font-medium text-[var(--muted-foreground)]">
              {overs}
            </td>
            {/* Maidens */}
            <td className="py-1.25 sm:py-1.5 px-1 sm:px-1.5 text-right font-medium text-[var(--muted-foreground)]">
              {maidens}
            </td>
            {/* Runs Conceded */}
            <td className="py-1.25 sm:py-1.5 px-1 sm:px-1.5 text-right font-semibold text-[var(--foreground)]">
              {runs}
            </td>
            {/* Wickets: slight visual emphasis */}
            <td className="py-1.25 sm:py-1.5 px-1 sm:px-1.5 text-right font-black text-blue-600 dark:text-blue-400">
              {wickets}
            </td>
            {/* Economy Rate: slight visual emphasis */}
            <td className="py-1.25 sm:py-1.5 px-1.5 sm:px-2 text-right font-bold text-[var(--foreground)]/90">
              {econ}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
