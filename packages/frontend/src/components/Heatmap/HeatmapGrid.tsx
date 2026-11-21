import React, { useMemo, useRef, useState } from 'react';
import { shadeLevel, type DayMap, type Layout, type Metric } from '@/utils/heatmap';
import { formatDayKey, formatDistance, formatDuration } from '@/utils/format';
import styles from './Heatmap.module.css';

const GAP = 2;
const TOP = 36;
const LABEL_WIDTH = 30;
const BOTTOM = 24;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS: [number, string][] = [
  [0, 'Mon'],
  [2, 'Wed'],
  [4, 'Fri'],
];
const MOVES: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

interface HeatmapGridProps {
  layout: Layout;
  days: DayMap;
  metric: Metric;
  thresholds: number[];
  colors: readonly string[];
  emptyColor: string;
  cellSize: number;
  labels: boolean;
  title: string;
  year?: number;
  totals: string;
  onOpenDay: (key: string, cell: SVGRectElement) => void;
}

export default function HeatmapGrid({
  layout,
  days,
  metric,
  thresholds,
  colors,
  emptyColor,
  cellSize,
  labels,
  title,
  year,
  totals,
  onOpenDay,
}: HeatmapGridProps): React.JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const step = cellSize + GAP;
  const left = labels ? LABEL_WIDTH : 0;
  const width = left + layout.columns * step;
  const height = TOP + 7 * step + BOTTOM;

  const byPosition = useMemo(
    () => new Map(layout.cells.map((cell) => [`${cell.column}:${cell.row}`, cell])),
    [layout],
  );
  const rows = useMemo(
    () => Array.from({ length: 7 }, (_, row) => layout.cells.filter((cell) => cell.row === row)),
    [layout],
  );
  const monthLabels = useMemo(
    () =>
      layout.monthLabels.filter(
        // Skip a label too near the previous one (a range that starts at the end of a month).
        (label, i, all) => i === 0 || label.column - all[i - 1]!.column >= 3,
      ),
    [layout],
  );

  // One tab stop: the selected day, else today or the last past day.
  const focusKey =
    active && layout.cells.some((cell) => cell.key === active)
      ? active
      : (layout.cells.filter((cell) => !cell.future).at(-1) ?? layout.cells[0])?.key;

  const rectOf = (key: string): SVGRectElement | null | undefined =>
    svgRef.current?.querySelector<SVGRectElement>(`rect[data-day="${key}"]`);

  const handleKeyDown = (event: React.KeyboardEvent<SVGSVGElement>): void => {
    const current = layout.cells.find((cell) => cell.key === focusKey);
    if (!current) return;

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const rect = rectOf(current.key);
      if (rect) onOpenDay(current.key, rect);
      return;
    }

    const move = MOVES[event.key];
    if (!move) return;
    event.preventDefault();
    // Up to 3 columns: the separated view has gap columns between months.
    for (let distance = 1; distance <= 3; distance++) {
      const next = byPosition.get(
        `${current.column + move[0] * distance}:${current.row + move[1] * distance}`,
      );
      if (next) {
        setActive(next.key);
        rectOf(next.key)?.focus();
        return;
      }
      if (move[1] !== 0) return;
    }
  };

  return (
    <svg
      ref={svgRef}
      className={styles.grid}
      data-year={year}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      onKeyDown={handleKeyDown}
    >
      <text x={0} y={14} fontSize={13} fontWeight={700} fill="currentColor">
        {title}
      </text>
      {monthLabels.map((label) => (
        <text
          key={`${label.column}-${label.month}`}
          x={left + label.column * step}
          y={TOP - 6}
          fontSize={10}
          fill="currentColor"
          aria-hidden="true"
        >
          {MONTHS[label.month]}
        </text>
      ))}
      {labels
        ? WEEKDAYS.map(([row, name]) => (
            <text
              key={name}
              x={0}
              y={TOP + row * step + cellSize - 1}
              fontSize={10}
              fill="currentColor"
              aria-hidden="true"
            >
              {name}
            </text>
          ))
        : null}
      <g role="grid" aria-label={`${title} activity heatmap`}>
        {rows.map((cells, row) => (
          <g role="row" key={row}>
            {cells.map((cell) => {
              const day = days.get(cell.key);
              const level = cell.future ? 0 : shadeLevel(day, metric, thresholds);
              const name = day
                ? `${formatDayKey(cell.key)}: ${formatDistance(day.distance)}, ${formatDuration(day.duration)}`
                : `${formatDayKey(cell.key)}: no activity`;
              return (
                <rect
                  key={cell.key}
                  role="gridcell"
                  aria-label={name}
                  tabIndex={cell.key === focusKey ? 0 : -1}
                  className={styles.cell}
                  data-day={cell.key}
                  data-level={level}
                  data-future={cell.future ? '' : undefined}
                  x={left + cell.column * step}
                  y={TOP + cell.row * step}
                  width={cellSize}
                  height={cellSize}
                  rx={2}
                  fill={level ? colors[level - 1] : emptyColor}
                  onClick={(event) => {
                    setActive(cell.key);
                    onOpenDay(cell.key, event.currentTarget);
                  }}
                />
              );
            })}
          </g>
        ))}
      </g>
      <text x={0} y={height - 6} fontSize={10} fill="currentColor">
        {totals}
      </text>
    </svg>
  );
}
