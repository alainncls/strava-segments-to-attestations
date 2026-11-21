import type { ActivityCache, Metric } from '@/utils/heatmap';
import { DEFAULT_PALETTE, PALETTES } from '@/utils/heatmapPalettes';

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SETTINGS_KEY = 'effortprint.heatmap.settings.v1';

const cacheKey = (athleteId: number): string => `effortprint.activities.v1.${athleteId}`;

// Invalid JSON, or site data blocked by the browser: no value.
function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

export function readCache(athleteId: number, now = Date.now()): ActivityCache | null {
  const cache = read(cacheKey(athleteId)) as ActivityCache | null;
  if (
    cache?.version !== 1 ||
    cache.athleteId !== athleteId ||
    typeof cache.syncedAt !== 'number' ||
    !Array.isArray(cache.activities)
  ) {
    return null;
  }
  if (now - cache.syncedAt > MAX_AGE_MS) {
    clearCache(athleteId);
    return null;
  }
  return cache;
}

export function writeCache(cache: ActivityCache): boolean {
  // shortcut: localStorage holds about 5 MB (about 40,000 activities), move to IndexedDB if an athlete exceeds it
  try {
    localStorage.setItem(cacheKey(cache.athleteId), JSON.stringify(cache));
    return true;
  } catch {
    return false;
  }
}

export function clearCache(athleteId: number): void {
  try {
    localStorage.removeItem(cacheKey(athleteId));
  } catch {
    // Site data blocked: there is no cache to delete.
  }
}

export interface HeatmapSettings {
  sport: string | null;
  palette: string;
  size: 'S' | 'M' | 'L';
  metric: Metric;
  thresholds: { distance: number[]; duration: number[] };
  converged: boolean;
  labels: boolean;
}

const DEFAULT_SETTINGS: HeatmapSettings = {
  sport: null,
  palette: DEFAULT_PALETTE,
  size: 'M',
  metric: 'distance',
  thresholds: { distance: [40, 20, 10, 5, 0], duration: [180, 120, 60, 30, 0] },
  converged: true,
  labels: true,
};

const isThresholds = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.length === 5 &&
  value.every((n) => typeof n === 'number' && Number.isFinite(n));

function isSettings(value: unknown): value is HeatmapSettings {
  const s = value as HeatmapSettings | null;
  return (
    (s?.sport === null || typeof s?.sport === 'string') &&
    typeof s.palette === 'string' &&
    Object.hasOwn(PALETTES, s.palette) &&
    ['S', 'M', 'L'].includes(s.size) &&
    ['distance', 'duration'].includes(s.metric) &&
    isThresholds(s.thresholds?.distance) &&
    isThresholds(s.thresholds?.duration) &&
    typeof s.converged === 'boolean' &&
    typeof s.labels === 'boolean'
  );
}

export function readSettings(): HeatmapSettings {
  const settings = read(SETTINGS_KEY);
  return isSettings(settings) ? settings : structuredClone(DEFAULT_SETTINGS);
}

export function writeSettings(settings: HeatmapSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Settings are a convenience; losing them on a full storage is acceptable.
  }
}
