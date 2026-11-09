/**
 * ManhattanChart — runs per over as bars, with red wicket dots
 * above any over in which wickets fell. Pure SVG, no chart
 * dependency; bar colour via a Tailwind fill class, axis text via
 * theme tokens. Renders an empty state when the series is empty
 * (legacy scorecards without recorded over logs).
 */

import React from 'react';
import type { OverSeriesEntry } from './overSeries';

export interface ManhattanChartProps {
  series: OverSeriesEntry[];
  label?: string;
  emptyLabel?: string;
}

const W = 640;
const H = 240;
const PAD_L = 34;
const PAD_R = 10;
const PAD_T = 30;
const PAD_B = 26;

export function ManhattanChart({ series, label, emptyLabel }: ManhattanChartProps) {
  if (!series || series.length === 0) {
    return (
      <div
        data-testid="manhattan-chart-empty"
        className="border border-dashed border-[var(--border)] rounded-xl text-center text-caption text-[var(--muted-foreground)] py-8 px-4"
      >
        {emptyLabel || 'No over-by-over data recorded for this innings.'}
      </div>
    );
  }

  const maxRuns = Math.max(6, ...series.map((s) => s.runs));
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const slot = plotW / series.length;
  const barW = Math.max(3, Math.min(30, slot * 0.68));
  const y = (runs: number) => PAD_T + plotH - (runs / maxRuns) * plotH;
  const baseline = PAD_T + plotH;
  const labelEvery = series.length <= 20 ? 1 : series.length <= 40 ? 2 : 5;

  const gridSteps = 3;

  return (
    <div data-testid="manhattan-chart" className="w-full">
      {label ? (
        <p className="text-caption font-bold text-[var(--muted-foreground)] uppercase tracking-wider px-1 pb-1">
          {label}
        </p>
      ) : null}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label={
          label
            ? `Runs per over for ${label}`
            : 'Runs per over'
        }
      >
        {/* Gridlines + y labels */}
        {Array.from({ length: gridSteps + 1 }, (_, i) => {
          const value = Math.round((maxRuns / gridSteps) * i);
          return (
            <g key={i}>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={y(value)}
                y2={y(value)}
                className="stroke-[var(--border)]"
                strokeWidth={i === 0 ? 1.5 : 0.75}
                strokeDasharray={i === 0 ? undefined : '3 4'}
              />
              <text
                x={PAD_L - 6}
                y={y(value) + 3}
                textAnchor="end"
                fontSize="10"
                className="fill-[var(--muted-foreground)] num-font"
              >
                {value}
              </text>
            </g>
          );
        })}

        {series.map((entry) => {
          const cx = PAD_L + slot * (entry.over - series[0].over) + slot / 2;
          const bx = cx - barW / 2;
          const top = y(entry.runs);
          const dots = Math.min(entry.wickets, 4);
          return (
            <g key={entry.over}>
              <rect
                x={bx}
                y={top}
                width={barW}
                height={Math.max(0, baseline - top)}
                rx={2}
                className="fill-emerald-500/85"
              >
                <title>{`Over ${entry.over}: ${entry.runs} run${entry.runs === 1 ? '' : 's'}${entry.wickets > 0 ? `, ${entry.wickets} wicket${entry.wickets === 1 ? '' : 's'}` : ''} (total ${entry.cumulative})`}</title>
              </rect>
              {entry.runs > 0 && baseline - top > 16 ? (
                <text
                  x={cx}
                  y={top + 12}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="800"
                  className="fill-white num-font pointer-events-none"
                >
                  {entry.runs}
                </text>
              ) : null}
              {/* Wicket dots above the bar */}
              {Array.from({ length: dots }, (_, d) => (
                <circle
                  key={d}
                  cx={cx + (d - (dots - 1) / 2) * 9}
                  cy={Math.max(7, top - 7)}
                  r={3}
                  className="fill-red-500"
                />
              ))}
              {entry.over % labelEvery === 0 || entry.over === series[series.length - 1].over ? (
                <text
                  x={cx}
                  y={H - 8}
                  textAnchor="middle"
                  fontSize="10"
                  className="fill-[var(--muted-foreground)] num-font"
                >
                  {entry.over}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default ManhattanChart;
