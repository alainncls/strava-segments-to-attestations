import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { usePageMetadata } from '@/hooks/usePageMetadata';
import { useStravaAuth } from '@/hooks/useStravaAuth';
import { FULL_SYNC_INTERVAL_MS, useHeatmapSync } from '@/hooks/useHeatmapSync';
import { BRAND } from '@/utils/constants';
import { readSettings, writeSettings, type HeatmapSettings } from '@/utils/activityStore';
import {
  aggregateByDay,
  continuousLayout,
  listSports,
  resetThresholds,
  yearLayout,
  yearTotals,
  type DayMap,
} from '@/utils/heatmap';
import { EMPTY_CELL, shadesFor } from '@/utils/heatmapPalettes';
import { buildExportSvg, downloadPng, downloadSvg } from '@/utils/heatmapExport';
import { localDayKey } from '@/utils/format';
import { onThemeChange, resolvedTheme } from '@/utils/theme';
import { Button } from '@/components/Button/Button';
import Loader from '@/components/Loader/Loader';
import StravaLoginButton from '@/components/StravaLoginButton/StravaLoginButton';
import HeatmapGrid from '@/components/Heatmap/HeatmapGrid';
import HeatmapControls, { type ViewState } from '@/components/Heatmap/HeatmapControls';
import DayTooltip from '@/components/Heatmap/DayTooltip';
import styles from './Heatmap.module.css';

const CELL_SIZES = { S: 8, M: 12, L: 16 } as const;
const timeFormatter = new Intl.DateTimeFormat('en-US', { timeStyle: 'short' });
const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

const numberFormatter = new Intl.NumberFormat('en-US');
// One decimal for small totals, none for large ones: 8.5 km, 6,993 km.
const amount = (value: number): string =>
  value.toLocaleString('en-US', { maximumFractionDigits: value < 100 ? 1 : 0 });

function totalsText(totals: { count: number; distance: number; duration: number }): string {
  const noun = totals.count === 1 ? 'activity' : 'activities';
  return `${numberFormatter.format(totals.count)} ${noun}, ${amount(totals.distance / 1000)} km, ${amount(totals.duration / 3600)} h`;
}

function rangeTotals(
  days: DayMap,
  keys: string[],
): { count: number; distance: number; duration: number } {
  const totals = { count: 0, distance: 0, duration: 0 };
  for (const key of keys) {
    const day = days.get(key);
    if (!day) continue;
    totals.count += day.activities.length;
    totals.distance += day.distance;
    totals.duration += day.duration;
  }
  return totals;
}

function HeatmapTool({ athleteId }: { athleteId: number }): React.JSX.Element {
  const { getValidToken } = useStravaAuth();
  const { activities, syncedAt, status, received, retryAt, sync } = useHeatmapSync(
    athleteId,
    getValidToken,
  );
  const theme = useSyncExternalStore(onThemeChange, resolvedTheme);
  const [settings, setSettings] = useState<HeatmapSettings>(readSettings);
  const now = new Date();
  const today = localDayKey(now);
  const currentYear = Number(today.slice(0, 4));
  const [view, setView] = useState<ViewState>({
    mode: 'year',
    dayCount: 365,
    fromYear: currentYear,
    toYear: currentYear,
  });
  const [exportOptions, setExportOptions] = useState(() => ({
    dark: resolvedTheme() === 'dark',
    hideFuture: true,
    newestFirst: true,
  }));
  const [exportError, setExportError] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<{ key: string; anchor: SVGRectElement } | null>(null);
  const gridsRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(0);

  // The grids shrink their cells to fit a narrow screen instead of scrolling sideways.
  // Layout effect: the first paint already has the right width.
  useLayoutEffect(() => {
    const element = gridsRef.current;
    if (!element) return;
    setGridWidth(element.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      setGridWidth(entry?.contentRect.width ?? 0);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  // A cache gives an incremental sync, no cache a full sync (useHeatmapSync decides).
  useEffect(() => {
    void sync('incremental');
  }, [sync]);

  useEffect(() => {
    writeSettings(settings);
  }, [settings]);

  const sports = useMemo(() => listSports(activities), [activities]);
  const days = useMemo(
    () => aggregateByDay(activities, settings.sport),
    [activities, settings.sport],
  );
  const firstYear = useMemo(
    () => Math.min(currentYear, ...activities.map((a) => Number(a.startLocal.slice(0, 4)))),
    [activities, currentYear],
  );
  const years = Array.from({ length: currentYear - firstYear + 1 }, (_, i) => firstYear + i);

  // Show all the years once the first activities arrive.
  const shownFirstYear = useRef(currentYear);
  useEffect(() => {
    if (firstYear < shownFirstYear.current) {
      shownFirstYear.current = firstYear;
      setView((v) => ({ ...v, fromYear: firstYear }));
    }
  }, [firstYear]);

  const updateSettings = (change: Partial<HeatmapSettings>): void => {
    setSettings((s) => ({ ...s, ...change }));
  };
  const updateView = (change: Partial<ViewState>): void => {
    setView((v) => ({ ...v, ...change }));
  };
  const closeDay = useCallback(() => {
    setOpenDay(null);
  }, []);

  const handleResetThresholds = (): void => {
    const filtered = activities.filter((a) => !settings.sport || a.sportType === settings.sport);
    updateSettings({
      thresholds: {
        ...settings.thresholds,
        [settings.metric]: resetThresholds(filtered, settings.metric),
      },
    });
  };

  const handleExport = async (format: 'png' | 'svg'): Promise<void> => {
    setExportError(null);
    const svgs = Array.from(
      gridsRef.current?.querySelectorAll<SVGSVGElement>('svg[data-year]') ?? [],
    );
    const svg = buildExportSvg(svgs, {
      fromYear: view.fromYear,
      toYear: view.toYear,
      colors: shadesFor(settings.palette, exportOptions.dark),
      ...exportOptions,
    });
    try {
      if (format === 'png') await downloadPng(svg, 'effortprint-heatmap.png');
      else downloadSvg(svg, 'effortprint-heatmap.svg');
    } catch {
      setExportError('The export failed. Try the SVG format.');
    }
  };

  const colors = shadesFor(settings.palette, theme === 'dark');
  const gridProps = {
    days,
    metric: settings.metric,
    thresholds: settings.thresholds[settings.metric],
    colors,
    emptyColor: EMPTY_CELL[theme],
    cellSize: CELL_SIZES[settings.size],
    labels: settings.labels,
    maxWidth: gridWidth,
    onOpenDay: (key: string, anchor: SVGRectElement) => {
      setOpenDay({ key, anchor });
    },
  };
  const shownYears = years.filter((y) => y >= view.fromYear && y <= view.toYear).reverse();
  const continuous = view.mode === 'continuous' ? continuousLayout(view.dayCount, today) : null;

  const nextFullSync = syncedAt === null ? null : syncedAt + FULL_SYNC_INTERVAL_MS;
  const fullSyncLocked = nextFullSync !== null && nextFullSync > now.getTime();

  const exportPanel =
    view.mode === 'year' ? (
      <div className={styles.exportPanel}>
        <p className={styles.hint}>
          The image shows{' '}
          {view.fromYear === view.toYear
            ? view.fromYear
            : `${String(view.fromYear)} to ${String(view.toYear)}`}{' '}
          with the current filters. It shows no activity name.
        </p>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={exportOptions.dark}
            onChange={(e) => {
              setExportOptions((o) => ({ ...o, dark: e.target.checked }));
            }}
          />
          Dark background
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={exportOptions.hideFuture}
            onChange={(e) => {
              setExportOptions((o) => ({ ...o, hideFuture: e.target.checked }));
            }}
          />
          Hide future days
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={exportOptions.newestFirst}
            onChange={(e) => {
              setExportOptions((o) => ({ ...o, newestFirst: e.target.checked }));
            }}
          />
          Newest year first
        </label>
        <div className={styles.actions}>
          <Button type="button" variant="primary" onClick={() => void handleExport('png')}>
            Download PNG
          </Button>
          <Button type="button" onClick={() => void handleExport('svg')}>
            Download SVG
          </Button>
        </div>
        {exportError ? (
          <p role="alert" className={styles.alert}>
            {exportError}
          </p>
        ) : null}
      </div>
    ) : (
      <p className={styles.hint}>Choose the layout by year to export an image.</p>
    );

  return (
    <main className={styles.main}>
      <Loader
        loading={status === 'syncing'}
        message={`Syncing with Strava: ${numberFormatter.format(received)} activities received`}
      />

      <div className={styles.heading}>
        <div>
          <h1 className={styles.title}>Activity heatmap</h1>
          <p className={styles.status}>
            {numberFormatter.format(activities.length)} activities
            {syncedAt ? `, full sync ${dateFormatter.format(syncedAt)}` : ''}
          </p>
        </div>
        <div className={styles.syncActions}>
          <Button type="button" onClick={() => void sync('incremental')}>
            Sync
          </Button>
          <button
            type="button"
            className={styles.textButton}
            disabled={fullSyncLocked}
            onClick={() => void sync('full')}
          >
            {fullSyncLocked && nextFullSync
              ? `Full sync after ${dateFormatter.format(nextFullSync)}`
              : 'Full sync'}
          </button>
        </div>
      </div>

      {status === 'rate-limited' ? (
        <p role="alert" className={styles.alert}>
          The Strava rate limit is reached. The activities received are shown. Sync again after{' '}
          {retryAt ? timeFormatter.format(retryAt) : 'a few minutes'}.
        </p>
      ) : null}
      {status === 'auth-error' ? (
        <div role="alert" className={styles.alert}>
          <p>Strava refused the request. Log in again to sync.</p>
          <StravaLoginButton />
        </div>
      ) : null}
      {status === 'error' ? (
        <p role="alert" className={styles.alert}>
          The sync failed. Try again.
        </p>
      ) : null}

      <HeatmapControls
        settings={settings}
        onSettings={updateSettings}
        view={view}
        onView={updateView}
        sports={sports}
        years={years}
        colors={colors}
        emptyColor={EMPTY_CELL[theme]}
        dark={theme === 'dark'}
        onResetThresholds={handleResetThresholds}
        exportPanel={exportPanel}
      />

      <div ref={gridsRef} className={styles.grids}>
        {continuous ? (
          <div className={styles.scroll}>
            <HeatmapGrid
              {...gridProps}
              layout={continuous}
              title={`Last ${String(view.dayCount)} days`}
              totals={totalsText(
                rangeTotals(
                  days,
                  continuous.cells.map((c) => c.key),
                ),
              )}
            />
          </div>
        ) : (
          shownYears.map((year) => (
            <div key={year} className={styles.scroll}>
              <HeatmapGrid
                {...gridProps}
                layout={yearLayout(year, today, settings.converged)}
                title={String(year)}
                year={year}
                totals={totalsText(yearTotals(days, year))}
              />
            </div>
          ))
        )}
      </div>

      {openDay ? (
        <DayTooltip
          dayKey={openDay.key}
          day={days.get(openDay.key)}
          anchor={openDay.anchor}
          onClose={closeDay}
        />
      ) : null}
    </main>
  );
}

export default function Heatmap(): React.JSX.Element {
  usePageMetadata({
    title: `Activity heatmap | ${BRAND}`,
    description:
      'See each day of your Strava activities as a colored cell, by year or over the last days. Filter by sport, set the thresholds and the colors, and export an image.',
    path: '/heatmap',
  });
  const { auth, isAuthenticated } = useStravaAuth();

  if (!isAuthenticated || !auth.athlete) {
    return (
      <main className={styles.main}>
        <h1 className={styles.title}>Activity heatmap</h1>
        <p className={styles.lead}>
          One colored cell for each day of each year. Connect Strava to see your activities. They
          stay in this browser.
        </p>
        <StravaLoginButton />
      </main>
    );
  }

  return <HeatmapTool athleteId={auth.athlete.id} />;
}
