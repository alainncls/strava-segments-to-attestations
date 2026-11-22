import React, { useMemo, useRef, useState } from 'react';
import { shadeLevel, type DayMap, type Layout, type Metric } from '@/utils/heatmap';
import { formatDayKey, formatDistance, formatDuration } from '@/utils/format';
import styles from './Heatmap.module.css';

const GAP = 2;
const TOP = 36;
const LABEL_WIDTH = 30;
const MONTH_LABEL_WIDTH = 24;
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
  // Width available on the page: the cells shrink to fit it (4 px at least). 0 means no limit.
  maxWidth?: number;
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
  cellSize: preferredSize,
  maxWidth = 0,
  labels,
  title,
  year,
  totals,
  onOpenDay,
}: HeatmapGridProps): React.JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const fit = (offset: number): number =>
    maxWidth ? Math.floor((maxWidth - offset) / layout.columns) : Infinity;
  // Day names need rows of 8 px: below that they hide and the cells take their width.
  const showDays = labels && Math.min(preferredSize + GAP, fit(LABEL_WIDTH)) >= 8;
  const left = showDays ? LABEL_WIDTH : 0;
  const step = Math.max(4, Math.min(preferredSize + GAP, fit(left)));
  const cellSize = step - (step < 8 ? 1 : GAP);
  const width = left + layout.columns * step;
  const height = TOP + 7 * step + BOTTOM;

  const byPosition = useMemo(
    () => new Map(layout.cells.map((cell) => [`${String(cell.column)}:${String(cell.row)}`, cell])),
    [layout],
  );
  const rows = useMemo(
    () => Array.from({ length: 7 }, (_, row) => layout.cells.filter((cell) => cell.row === row)),
    [layout],
  );
  // Skip a month label that would touch the previous one (small cells, or a range that starts at the end of a month).
  const monthLabels = useMemo(() => {
    const kept: Layout['monthLabels'] = [];
    for (const label of layout.monthLabels) {
      const previous = kept.at(-1);
      if (!previous || (label.column - previous.column) * step >= MONTH_LABEL_WIDTH)
        kept.push(label);
    }
    return kept;
  }, [layout, step]);

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
        `${String(current.column + move[0] * distance)}:${String(current.row + move[1] * distance)}`,
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
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      onKeyDown={handleKeyDown}
    >
      <text x={0} y={14} fontSize={13} fontWeight={600} fill="currentColor">
        {title}
      </text>
      {monthLabels.map((label) => (
        <text
          key={`${String(label.column)}-${String(label.month)}`}
          x={left + label.column * step}
          y={TOP - 6}
          fontSize={10}
          fill="currentColor"
          aria-hidden="true"
        >
          {MONTHS[label.month]}
        </text>
      ))}
      {showDays
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
