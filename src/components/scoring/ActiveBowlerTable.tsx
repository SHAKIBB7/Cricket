import React from 'react';
import { Bowler } from '@/domain/cricket/types';
import { economyRate, cleanPlayerName } from '@/domain/cricket/formatters';
import { motion, AnimatePresence } from 'framer-motion';

interface ActiveBowlerTableProps {
  bowler?: Bowler | null;
  onSelectBowler?: (bowler: Bowler) => void;
}

const DEFAULT_BOWLER: Bowler = {
  id: 'placeholder',
  name: 'Select Player',
  ballsBowled: 0,
  maidens: 0,
  runs: 0,
  wickets: 0,
  overHistory: [],
};

export function ActiveBowlerTable({
  bowler,
  onSelectBowler,
}: ActiveBowlerTableProps) {
  const currentBowler = bowler || DEFAULT_BOWLER;
  const overs = currentBowler
    ? `${Math.floor(currentBowler.ballsBowled / 6)}.${currentBowler.ballsBowled % 6}`
    : '0.0';
  const maidens = currentBowler.maidens ?? 0;
  const runs = currentBowler.runs ?? 0;
  const wickets = currentBowler.wickets ?? 0;
  const econ = currentBowler
    ? economyRate(currentBowler.runs || 0, currentBowler.ballsBowled || 0).toFixed(2)
    : '0.00';

  return (
    <div className="w-full overflow-hidden select-none">
      <table className="w-full border-collapse table-fixed">
        <thead>
          <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)] text-xs sm:text-sm md:text-sm">
            {/* BOWLER: receives highest width */}
            <th className="text-left font-bold tracking-wider uppercase py-2 px-2 w-[43%] sm:w-[48%]">
              BOWLER
            </th>
            {/* O: Overs */}
            <th className="text-right font-semibold uppercase py-2 px-1 sm:px-1.5 w-[11%] sm:w-[10%]">
              O
            </th>
            {/* M: Maidens */}
            <th className="text-right font-semibold uppercase py-2 px-1 sm:px-1.5 w-[11%] sm:w-[10%]">
              M
            </th>
            {/* R: Runs Conceded */}
            <th className="text-right font-semibold uppercase py-2 px-1 sm:px-1.5 w-[10%] sm:w-[9%]">
              R
            </th>
            {/* W: Wickets */}
            <th className="text-right font-semibold uppercase py-2 px-1 sm:px-1.5 w-[10%] sm:w-[9%]">
              W
            </th>
            {/* ECO: Economy Rate */}
            <th className="text-right font-semibold uppercase py-2 px-1.5 sm:px-2 w-[15%] sm:w-[14%]">
              ECO
            </th>
          </tr>
        </thead>
        <motion.tbody layout className="num-font">
          <AnimatePresence mode="popLayout" initial={false}>
            {currentBowler && (
              <motion.tr
                key={currentBowler.name}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                onClick={() => {
                  if (onSelectBowler && bowler) {
                    onSelectBowler(bowler);
                  }
                }}
                whileHover={{ scale: 1.01, backgroundColor: 'rgba(59, 130, 246, 0.15)' }}
                whileTap={{ scale: 0.98 }}
                className="cursor-pointer bg-blue-500/[0.04] dark:bg-blue-500/[0.08] transition-colors group"
                title="Click to view full bowler profile & spell stats"
              >
                <td className="py-2.5 sm:py-3 md:py-4 px-2 text-left min-w-0 align-middle">
                  <span
                    className="font-bold text-base sm:text-lg md:text-xl text-[var(--foreground)] truncate tracking-tight group-hover:text-blue-500 transition-colors leading-tight block"
                    title={cleanPlayerName(currentBowler.name) || 'Select Player'}
                  >
                    {cleanPlayerName(currentBowler.name) || 'Select Player'}
                  </span>
                </td>
                {/* Overs */}
                <td className="py-2.5 sm:py-3 md:py-4 px-1 sm:px-1.5 text-right font-semibold text-sm sm:text-base md:text-lg text-[var(--muted-foreground)] align-middle">
                  {overs}
                </td>
                {/* Maidens */}
                <td className="py-2.5 sm:py-3 md:py-4 px-1 sm:px-1.5 text-right font-medium text-sm sm:text-base md:text-lg text-[var(--muted-foreground)] align-middle">
                  {maidens}
                </td>
                {/* Runs Conceded */}
                <td className="py-2.5 sm:py-3 md:py-4 px-1 sm:px-1.5 text-right font-bold text-sm sm:text-base md:text-lg text-[var(--foreground)] align-middle">
                  {runs}
                </td>
                {/* Wickets: slight visual emphasis */}
                <td className="py-2.5 sm:py-3 md:py-4 px-1 sm:px-1.5 text-right font-black text-base sm:text-lg md:text-xl text-blue-600 dark:text-blue-400 align-middle">
                  {wickets}
                </td>
                {/* Economy Rate: slight visual emphasis */}
                <td className="py-2.5 sm:py-3 md:py-4 px-1.5 sm:px-2 text-right font-bold text-sm sm:text-base md:text-lg text-[var(--foreground)]/90 align-middle">
                  {econ}
                </td>
              </motion.tr>
            )}
          </AnimatePresence>
        </motion.tbody>
      </table>
    </div>
  );
}
