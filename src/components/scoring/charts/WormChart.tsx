/**
 * WormChart — cumulative runs by over ("worm"), up to two innings
 * overlaid. Pure SVG, no chart dependency; colours come from
 * Tailwind text classes via currentColor so the chart follows the
 * app theme. Renders an empty state when every series is empty
 * (legacy scorecards without recorded over logs).
 */

import React from 'react';
import type { OverSeriesEntry } from './overSeries';

export interface WormSeriesInput {
  label: string;
  points: OverSeriesEntry[];
}

export interface WormChartProps {
  series: WormSeriesInput[];
  /** Optional dashed target line (second-innings chase target). */
  target?: number;
  emptyLabel?: string;
}

const SERIES_CLASSES = [
  'text-emerald-500',
  'text-blue-500',
  'text-amber-500',
  'text-rose-500',
];

const W = 640;
const H = 280;
const PAD_L = 38;
const PAD_R = 30;
const PAD_T = 16;
const PAD_B = 28;

function niceCeil(value: number): number {
  if (value <= 10) return 10;
  const step = value <= 50 ? 10 : value <= 150 ? 25 : 50;
  return Math.ceil(value / step) * step;
}

export function WormChart({ series, target, emptyLabel }: WormChartProps) {
  const nonEmpty = (series || []).filter((s) => s.points.length > 0);
  if (nonEmpty.length === 0) {
    return (
      <div
        data-testid="worm-chart-empty"
        className="border border-dashed border-[var(--border)] rounded-xl text-center text-caption text-[var(--muted-foreground)] py-8 px-4"
      >
        {emptyLabel || 'No over-by-over data recorded for this match.'}
      </div>
    );
  }

  const maxOver = Math.max(...nonEmpty.map((s) => s.points[s.points.length - 1].over));
  const maxRuns = niceCeil(
    Math.max(
      ...nonEmpty.map((s) => s.points[s.points.length - 1].cumulative),
      target || 0
    )
  );
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const x = (over: number) => PAD_L + (over / Math.max(1, maxOver)) * plotW;
  const y = (runs: number) => PAD_T + plotH - (runs / maxRuns) * plotH;

  const gridSteps = 4;
  const tickEvery = maxOver <= 10 ? 1 : maxOver <= 20 ? 2 : 5;

  return (
    <div data-testid="worm-chart" className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label={`Runs progression: ${nonEmpty
          .map((s) => `${s.label} ${s.points[s.points.length - 1].cumulative}`)
          .join(', ')}`}
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

        {/* X over ticks */}
        {Array.from({ length: maxOver }, (_, i) => i + 1)
          .filter((over) => over % tickEvery === 0 || over === maxOver)
          .map((over) => (
            <text
              key={over}
              x={x(over)}
              y={H - 8}
              textAnchor="middle"
              fontSize="10"
              className="fill-[var(--muted-foreground)] num-font"
            >
              {over}
            </text>
          ))}

        {/* Target line */}
        {target && target <= maxRuns ? (
          <g>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={y(target)}
              y2={y(target)}
              className="stroke-rose-400"
              strokeWidth={1}
              strokeDasharray="6 4"
            />
            <text
              x={W - PAD_R}
              y={y(target) - 4}
              textAnchor="end"
              fontSize="10"
              className="fill-rose-400 font-bold"
            >
              {`Target ${target}`}
            </text>
          </g>
        ) : null}

        {/* Series lines, wicket markers, end labels */}
        {nonEmpty.map((s, si) => {
          const pts = [{ over: 0, cumulative: 0 }, ...s.points];
          const path = pts
            .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.over).toFixed(1)},${y(p.cumulative).toFixed(1)}`)
            .join(' ');
          const last = s.points[s.points.length - 1];
          return (
            <g key={si} className={SERIES_CLASSES[si % SERIES_CLASSES.length]}>
              <path
                d={path}
                fill="none"
                stroke="currentColor"
                strokeWidth={2.25}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {s.points
                .filter((p) => p.wickets > 0)
                .map((p) => (
                  <circle
                    key={p.over}
                    cx={x(p.over)}
                    cy={y(p.cumulative)}
                    r={3.4}
                    className="fill-red-500 stroke-[var(--card)]"
                    strokeWidth={1.25}
                  >
                    <title>{`${s.label}: ${p.wickets} wicket${p.wickets === 1 ? '' : 's'} in over ${p.over}`}</title>
                  </circle>
                ))}
              <text
                x={x(last.over) + 5}
                y={y(last.cumulative) + 3}
                fontSize="11"
                fontWeight="800"
                fill="currentColor"
                className="num-font"
              >
                {last.cumulative}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 px-1">
        {nonEmpty.map((s, si) => (
          <span
            key={si}
            className={`inline-flex items-center gap-1.5 text-caption font-semibold ${SERIES_CLASSES[si % SERIES_CLASSES.length]}`}
          >
            <span className="inline-block w-4 h-[3px] rounded-full bg-current" />
            <span className="text-[var(--foreground)]">
              {s.label} — {s.points[s.points.length - 1].cumulative}/
              {s.points.reduce((sum, p) => sum + p.wickets, 0)}
            </span>
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-caption text-[var(--muted-foreground)]">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
          wicket over
        </span>
      </div>
    </div>
  );
}

export default WormChart;
