import { describe, expect, it } from 'vitest';
import {
  aggregateByDay,
  continuousLayout,
  dayKey,
  listSports,
  listYears,
  resetThresholds,
  shadeLevel,
  yearLayout,
  yearTotals,
  type DayTotal,
  type StoredActivity,
} from './heatmap';

let nextId = 1;
const activity = (
  startLocal: string,
  distance: number,
  movingTime: number,
  sportType = 'Run',
): StoredActivity => ({ id: nextId++, name: 'a', sportType, startLocal, distance, movingTime });

const day = (distance: number, duration: number, count = 1): DayTotal => ({
  distance,
  duration,
  activities: Array.from({ length: count }, () => activity('2026-01-01T00:00:00Z', 0, 0)),
});

describe('dayKey and aggregateByDay', () => {
  it.each([
    ['2026-06-14T07:31:02Z', '2026-06-14'],
    ['2026-06-14T23:59:00Z', '2026-06-14'],
    ['2026-01-01T00:00:00Z', '2026-01-01'],
  ])('keys %s on %s', (start, key) => {
    expect(dayKey(start)).toBe(key);
  });

  const activities = [
    activity('2026-06-14T07:00:00Z', 10000, 3000, 'Run'),
    activity('2026-06-14T23:59:00Z', 20000, 3600, 'Ride'),
    activity('2026-06-15T08:00:00Z', 0, 1200, 'Yoga'),
  ];

  it('sums two activities on one day, a late activity stays on its local day', () => {
    const day14 = aggregateByDay(activities, null).get('2026-06-14');
    expect(day14?.distance).toBe(30000);
    expect(day14?.duration).toBe(6600);
    expect(day14?.activities).toHaveLength(2);
  });

  it('filters by sport', () => {
    const days = aggregateByDay(activities, 'Ride');
    expect([...days.keys()]).toEqual(['2026-06-14']);
    expect(days.get('2026-06-14')?.distance).toBe(20000);
  });

  it('keeps an activity with distance 0 and a duration', () => {
    expect(aggregateByDay(activities, null).get('2026-06-15')).toMatchObject({
      distance: 0,
      duration: 1200,
    });
  });
});

describe('shadeLevel', () => {
  const km = [20, 10, 5, 2, 0];
  it.each([
    [undefined, 0],
    [{ distance: 0, duration: 0, activities: [] }, 0],
    [day(0, 600), 1],
    [day(1, 0), 1],
    [day(2000, 0), 1],
    [day(2001, 0), 2],
    [day(5000, 0), 2],
    [day(5001, 0), 3],
    [day(10000, 0), 3],
    [day(10001, 0), 4],
    [day(20000, 0), 4],
    [day(20001, 0), 5],
    [day(99000, 0), 5],
  ])('distance case %#', (d, level) => {
    expect(shadeLevel(d, 'distance', km)).toBe(level);
  });

  it.each([
    [day(0, 0), 1],
    [day(0, 30), 1],
    [day(0, 60 * 30), 1],
    [day(0, 60 * 31), 2],
    [day(0, 60 * 46), 3],
    [day(0, 60 * 61), 4],
    [day(0, 60 * 91), 5],
  ])('duration case %#', (d, level) => {
    expect(shadeLevel(d, 'duration', [90, 60, 45, 30, 0])).toBe(level);
  });
});

describe('resetThresholds', () => {
  it('applies the formula on the mean per activity', () => {
    // mean 10 km, 40 minutes
    const activities = [
      activity('2026-01-01T00:00:00Z', 8000, 1800),
      activity('2026-01-02T00:00:00Z', 12000, 3000),
    ];
    expect(resetThresholds(activities, 'distance')).toEqual([25, 15, 9, 5, 0]);
    expect(resetThresholds(activities, 'duration')).toEqual([100, 60, 39, 20, 0]);
  });

  it('clamps negative values to 0', () => {
    expect(resetThresholds([activity('2026-01-01T00:00:00Z', 500, 0)], 'distance')).toEqual([
      1, 0, 0, 0, 0,
    ]);
  });

  it('returns zeros without activity', () => {
    expect(resetThresholds([], 'distance')).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('yearLayout', () => {
  it.each([
    [2024, true, 366, 53],
    [2023, true, 365, 53],
    [2026, true, 365, 53],
  ])('year %i converged has %i cells and %i columns', (year, converged, cells, columns) => {
    const layout = yearLayout(year, '2030-01-01', converged);
    expect(layout.cells).toHaveLength(cells);
    expect(layout.columns).toBe(columns);
  });

  it('puts Jan 1 2024 (Monday) on row 0 and Jan 1 2023 (Sunday) on row 6, column 0', () => {
    expect(yearLayout(2024, '2030-01-01', true).cells[0]).toMatchObject({
      key: '2024-01-01',
      column: 0,
      row: 0,
    });
    const cells2023 = yearLayout(2023, '2030-01-01', true).cells;
    expect(cells2023[0]).toMatchObject({ key: '2023-01-01', column: 0, row: 6 });
    expect(cells2023[1]).toMatchObject({ key: '2023-01-02', column: 1, row: 0 });
  });

  it('converged months share columns, separated months start in their own column', () => {
    const converged = yearLayout(2024, '2030-01-01', true);
    const separated = yearLayout(2024, '2030-01-01', false);
    expect(separated.cells).toHaveLength(366);
    expect(separated.columns).toBeGreaterThan(converged.columns);
    expect(converged.monthLabels.map((m) => m.month)).toEqual([...Array(12).keys()]);
    expect(separated.monthLabels.map((m) => m.month)).toEqual([...Array(12).keys()]);

    // Jan 31 2024 is a Wednesday, Feb 1 a Thursday: same week column when converged.
    const col = (cells: typeof converged.cells, key: string): number | undefined =>
      cells.find((c) => c.key === key)?.column;
    expect(col(converged.cells, '2024-02-01')).toBe(col(converged.cells, '2024-01-31'));

    for (let m = 1; m < 12; m++) {
      const lastColumnBefore = Math.max(
        ...separated.cells.filter((c) => Number(c.key.slice(5, 7)) === m).map((c) => c.column),
      );
      expect(separated.monthLabels[m]?.column).toBe(lastColumnBefore + 2);
    }
    expect(separated.monthLabels[0]?.column).toBe(0);
    expect(Math.max(...separated.cells.map((c) => c.column))).toBe(separated.columns - 1);
  });

  it('marks days after today as future', () => {
    const cells = yearLayout(2026, '2026-06-14', true).cells;
    expect(cells.find((c) => c.key === '2026-06-14')?.future).toBe(false);
    expect(cells.find((c) => c.key === '2026-06-15')?.future).toBe(true);
    expect(cells.filter((c) => c.future)).toHaveLength(365 - 165);
  });
});

describe('continuousLayout', () => {
  it('N = 1 is only today', () => {
    const layout = continuousLayout(1, '2026-06-14');
    expect(layout.cells).toEqual([{ key: '2026-06-14', column: 0, row: 6, future: false }]);
    expect(layout.columns).toBe(1);
  });

  it('N = 365 ends at today with no future day', () => {
    const layout = continuousLayout(365, '2026-06-14');
    expect(layout.cells).toHaveLength(365);
    expect(layout.cells[0]?.key).toBe('2025-06-15');
    expect(layout.cells.at(-1)?.key).toBe('2026-06-14');
    expect(layout.cells.some((c) => c.future)).toBe(false);
  });

  it('crosses two years with one week column rule', () => {
    // 2025-12-29 is a Monday.
    const layout = continuousLayout(10, '2026-01-04');
    expect(layout.cells.map((c) => c.key)).toEqual([
      '2025-12-26',
      '2025-12-27',
      '2025-12-28',
      '2025-12-29',
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
    ]);
    expect(layout.cells[0]).toMatchObject({ column: 0, row: 4 });
    expect(layout.cells[3]).toMatchObject({ column: 1, row: 0 });
    expect(layout.cells[9]).toMatchObject({ column: 1, row: 6 });
    expect(layout.columns).toBe(2);
    expect(layout.monthLabels).toEqual([
      { column: 0, month: 11 },
      { column: 1, month: 0 },
    ]);
  });
});

describe('lists and totals', () => {
  const activities = [
    activity('2024-03-01T10:00:00Z', 1000, 60, 'Ride'),
    activity('2026-03-01T10:00:00Z', 2000, 120, 'Run'),
    activity('2026-03-01T18:00:00Z', 3000, 180, 'Run'),
    activity('2025-03-02T10:00:00Z', 4000, 240, 'Swim'),
    activity('2026-04-02T10:00:00Z', 5000, 300, 'Run'),
    activity('2026-05-02T10:00:00Z', 6000, 360, 'Swim'),
  ];

  it('lists sports, most frequent first', () => {
    expect(listSports(activities)).toEqual(['Run', 'Swim', 'Ride']);
  });

  it('lists years in ascending order', () => {
    expect(listYears(aggregateByDay(activities, null))).toEqual([2024, 2025, 2026]);
  });

  it('sums one year', () => {
    const days = aggregateByDay(activities, null);
    expect(yearTotals(days, 2026)).toEqual({ count: 4, distance: 16000, duration: 960 });
    expect(yearTotals(days, 2023)).toEqual({ count: 0, distance: 0, duration: 0 });
  });
});
