export interface StoredActivity {
  id: number;
  name: string;
  sportType: string;
  startLocal: string; // start_date_local, for example 2026-06-14T07:31:02Z
  distance: number; // meters
  movingTime: number; // seconds
}

export interface ActivityCache {
  version: 1;
  athleteId: number;
  syncedAt: number; // epoch milliseconds of the last full sync
  activities: StoredActivity[];
}

export type Metric = 'distance' | 'duration';

export interface DayTotal {
  distance: number; // meters
  duration: number; // seconds
  activities: StoredActivity[];
}

export type DayMap = Map<string, DayTotal>; // key: YYYY-MM-DD

export interface Cell {
  key: string;
  column: number;
  row: number; // 0 = Monday
  future: boolean;
}

export interface Layout {
  cells: Cell[];
  columns: number;
  monthLabels: { column: number; month: number }[]; // month 0..11
}

const DAY_MS = 86_400_000;

// Local date as written by Strava; new Date() would shift it to the browser time zone.
export const dayKey = (startLocal: string): string => startLocal.slice(0, 10);

const toKey = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const weekday = (ms: number): number => (new Date(ms).getUTCDay() + 6) % 7;

export function aggregateByDay(activities: StoredActivity[], sport: string | null): DayMap {
  const days: DayMap = new Map();
  for (const a of activities) {
    if (sport !== null && a.sportType !== sport) continue;
    const key = dayKey(a.startLocal);
    const day = days.get(key) ?? { distance: 0, duration: 0, activities: [] };
    day.distance += a.distance;
    day.duration += a.movingTime;
    day.activities.push(a);
    days.set(key, day);
  }
  return days;
}

export function listSports(activities: StoredActivity[]): string[] {
  const counts = new Map<string, number>();
  for (const a of activities) counts.set(a.sportType, (counts.get(a.sportType) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([sport]) => sport);
}

export const listYears = (days: DayMap): number[] =>
  [...new Set([...days.keys()].map((key) => Number(key.slice(0, 4))))].sort((a, b) => a - b);

const value = (distance: number, duration: number, metric: Metric): number =>
  metric === 'distance' ? distance / 1000 : duration / 60;

export function shadeLevel(
  day: DayTotal | undefined,
  metric: Metric,
  thresholds: number[],
): number {
  if (!day?.activities.length) return 0;
  const v = value(day.distance, day.duration, metric);
  // The lowest threshold is the minimum to color a day: below it, the day stays empty.
  if (v < (thresholds[4] ?? 0)) return 0;
  const i = thresholds.slice(0, 4).findIndex((t) => v > t);
  return i === -1 ? 1 : 5 - i;
}

export function resetThresholds(activities: StoredActivity[], metric: Metric): number[] {
  if (!activities.length) return [0, 0, 0, 0, 0];
  const m =
    activities.reduce((sum, a) => sum + value(a.distance, a.movingTime, metric), 0) /
    activities.length;
  return [Math.floor(2.5 * m), Math.floor(1.5 * m), Math.floor(m) - 1, Math.floor(m / 2), 0].map(
    (t) => Math.max(0, t),
  );
}

// Appends the days startMs..endMs in week columns, the week of startMs at `column`.
function weekGrid(
  layout: Layout,
  startMs: number,
  endMs: number,
  column: number,
  today: string,
): void {
  const offset = weekday(startMs);
  for (let ms = startMs, i = 0; ms <= endMs; ms += DAY_MS, i++) {
    const key = toKey(ms);
    const col = column + Math.floor((i + offset) / 7);
    if (i === 0 || key.endsWith('-01'))
      layout.monthLabels.push({ column: col, month: Number(key.slice(5, 7)) - 1 });
    layout.cells.push({ key, column: col, row: weekday(ms), future: key > today });
    layout.columns = col + 1;
  }
}

export function yearLayout(year: number, today: string, converged: boolean): Layout {
  const layout: Layout = { cells: [], columns: 0, monthLabels: [] };
  if (converged) {
    weekGrid(layout, Date.UTC(year, 0, 1), Date.UTC(year, 11, 31), 0, today);
    return layout;
  }
  for (let month = 0; month < 12; month++) {
    // Each month after the first starts after one gap column.
    const column = month === 0 ? 0 : layout.columns + 1;
    weekGrid(layout, Date.UTC(year, month, 1), Date.UTC(year, month + 1, 0), column, today);
  }
  return layout;
}

export function continuousLayout(dayCount: number, today: string): Layout {
  const layout: Layout = { cells: [], columns: 0, monthLabels: [] };
  const end = Date.parse(`${today}T00:00:00Z`);
  weekGrid(layout, end - (dayCount - 1) * DAY_MS, end, 0, today);
  return layout;
}

export function yearTotals(
  days: DayMap,
  year: number,
): { count: number; distance: number; duration: number } {
  const totals = { count: 0, distance: 0, duration: 0 };
  for (const [key, day] of days) {
    if (!key.startsWith(`${year}-`)) continue;
    totals.count += day.activities.length;
    totals.distance += day.distance;
    totals.duration += day.duration;
  }
  return totals;
}
