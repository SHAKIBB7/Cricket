import React from 'react';
import { Player } from '@/domain/cricket/types';
import { strikeRate, cleanPlayerName } from '@/domain/cricket/formatters';
import { motion, AnimatePresence } from 'framer-motion';
import { StrikerLottieAnimation } from './StrikerLottieAnimation';

interface ActiveBatsmenTableProps {
  striker?: Player;
  nonStriker?: Player;
  strikerIdx: number;
  nonStrikerIdx: number;
  accentColor?: string;
  onSelectBatsman: (params: {
    player: Player;
    isStriker?: boolean;
    isNonStriker?: boolean;
    battingPosition?: number;
  }) => void;
}

const DEFAULT_PLAYER: Player = {
  id: 'placeholder',
  name: 'Select Player',
  runs: 0,
  balls: 0,
  fours: 0,
  sixes: 0,
  dotBalls: 0,
  isDismissed: false,
  battingHand: 'Right-hand Batsman',
  battingPosition: '1',
  ballLog: [],
  bowlersFaced: {},
  runsVsBowler: {},
};

export const ActiveBatsmenTable = React.memo(function ActiveBatsmenTable({
  striker,
  nonStriker,
  strikerIdx,
  nonStrikerIdx,
  accentColor = '#34C759',
  onSelectBatsman,
}: ActiveBatsmenTableProps) {
  
  const getSr = (p?: Player) => p ? strikeRate(p.runs || 0, p.balls || 0).toFixed(1) : '0.0';

  const players = [
    { player: striker || DEFAULT_PLAYER, isStriker: true, idx: strikerIdx },
    { player: nonStriker || DEFAULT_PLAYER, isStriker: false, idx: nonStrikerIdx }
  ];

  return (
    <div className="w-full overflow-hidden select-none">
      <table className="w-full border-collapse table-fixed">
        <thead>
          <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)] text-xs sm:text-sm md:text-sm">
            <th className="text-left font-bold tracking-wider uppercase py-2 px-2 w-[43%] sm:w-[48%]">
              BATSMAN
            </th>
            <th className="text-right font-semibold uppercase py-2 px-1 sm:px-1.5 w-[11%] sm:w-[10%]">
              R
            </th>
            <th className="text-right font-semibold uppercase py-2 px-1 sm:px-1.5 w-[11%] sm:w-[10%]">
              B
            </th>
            <th className="text-right font-semibold uppercase py-2 px-1 sm:px-1.5 w-[10%] sm:w-[9%]">
              4s
            </th>
            <th className="text-right font-semibold uppercase py-2 px-1 sm:px-1.5 w-[10%] sm:w-[9%]">
              6s
            </th>
            <th className="text-right font-semibold uppercase py-2 px-1.5 sm:px-2 w-[15%] sm:w-[14%]">
              SR
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]/40 num-font">
          <AnimatePresence initial={false}>
            {players.map(({ player, isStriker, idx }) => (
              <motion.tr
                key={player!.name}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                onClick={() => {
                  onSelectBatsman({
                    player: player!,
                    isStriker,
                    isNonStriker: !isStriker,
                    battingPosition: idx + 1,
                  });
                }}
                whileHover={{ scale: 1.01, backgroundColor: isStriker ? 'rgba(16, 185, 129, 0.15)' : 'rgba(156, 163, 175, 0.15)' }}
                whileTap={{ scale: 0.98 }}
                className={`cursor-pointer transition-colors group will-change-[transform,opacity] ${
                  isStriker 
                    ? 'bg-emerald-500/[0.04] dark:bg-emerald-500/[0.08]' 
                    : 'hover:bg-[var(--muted)]/50'
                }`}
                title={`Click to view ${isStriker ? 'striker' : 'non-striker'} profile`}
              >
                <td className="py-2.5 sm:py-3 md:py-4 px-2 text-left min-w-0 align-middle">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`font-bold text-base sm:text-lg md:text-xl text-[var(--foreground)] truncate tracking-tight transition-colors leading-tight ${
                        isStriker ? 'group-hover:text-emerald-500' : 'group-hover:text-blue-500'
                      }`}
                      title={cleanPlayerName(player!.name) || 'Select Player'}
                    >
                      {cleanPlayerName(player!.name) || 'Select Player'}
                    </span>
                    {isStriker && (
                      <span className="inline-flex items-center gap-1 shrink-0">
                        <span className="flex relative shrink-0 h-2 w-2 ml-1" aria-label="Active Striker" title="Active Striker">
                          <span className="animate-ping absolute inline-flex bg-[#34C759] opacity-75 rounded-full h-full w-full" />
                          <span className="relative inline-flex bg-[#34C759] rounded-full h-2 w-2" />
                        </span>
                        <StrikerLottieAnimation accentColor={accentColor} />
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-2.5 sm:py-3 md:py-4 px-1 sm:px-1.5 text-right font-black text-base sm:text-lg md:text-xl text-[var(--foreground)] align-middle">
                  {player!.runs ?? 0}
                </td>
                <td className="py-2.5 sm:py-3 md:py-4 px-1 sm:px-1.5 text-right font-semibold text-sm sm:text-base md:text-lg text-[var(--muted-foreground)] align-middle">
                  {player!.balls ?? 0}
                </td>
                <td className="py-2.5 sm:py-3 md:py-4 px-1 sm:px-1.5 text-right font-medium text-sm sm:text-base md:text-lg text-[var(--muted-foreground)] align-middle">
                  {player!.fours ?? 0}
                </td>
                <td className="py-2.5 sm:py-3 md:py-4 px-1 sm:px-1.5 text-right font-medium text-sm sm:text-base md:text-lg text-[var(--muted-foreground)] align-middle">
                  {player!.sixes ?? 0}
                </td>
                <td className="py-2.5 sm:py-3 md:py-4 px-1.5 sm:px-2 text-right font-bold text-sm sm:text-base md:text-lg text-[var(--foreground)]/90 align-middle">
                  {getSr(player!)}
                </td>
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
});
