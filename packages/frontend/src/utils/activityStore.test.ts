import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActivityCache } from '@/utils/heatmap';
import {
  clearCache,
  readCache,
  readSettings,
  writeCache,
  writeSettings,
  type HeatmapSettings,
} from './activityStore';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse('2026-11-21T12:00:00Z');
const key = 'effortprint.activities.v1.42';

const cache: ActivityCache = {
  version: 1,
  athleteId: 42,
  syncedAt: now - DAY,
  activities: [
    {
      id: 1,
      name: 'Morning Ride',
      sportType: 'Ride',
      startLocal: '2026-11-20T07:00:00Z',
      distance: 30000,
      movingTime: 3600,
    },
  ],
};

describe('activity cache', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('round-trips a cache', () => {
    expect(writeCache(cache)).toBe(true);
    expect(readCache(42, now)).toEqual(cache);
    expect(readCache(7, now)).toBeNull();
  });

  it('ignores a wrong version and invalid JSON', () => {
    localStorage.setItem(key, JSON.stringify({ ...cache, version: 2 }));
    expect(readCache(42, now)).toBeNull();
    localStorage.setItem(key, '{');
    expect(readCache(42, now)).toBeNull();
  });

  it('deletes a cache older than 7 days', () => {
    writeCache({ ...cache, syncedAt: now - 8 * DAY });
    expect(readCache(42, now)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('returns false on a quota error', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(writeCache(cache)).toBe(false);
  });

  it('clears the cache', () => {
    writeCache(cache);
    clearCache(42);
    expect(localStorage.getItem(key)).toBeNull();
  });
});

describe('heatmap settings', () => {
  afterEach(() => {
    localStorage.clear();
  });

  const defaults: HeatmapSettings = {
    sport: null,
    palette: 'ember',
    size: 'M',
    metric: 'distance',
    thresholds: { distance: [40, 20, 10, 5, 0], duration: [180, 120, 60, 30, 0] },
    converged: true,
    labels: true,
  };

  it('returns defaults when absent, invalid JSON or wrong shape', () => {
    expect(readSettings()).toEqual(defaults);
    localStorage.setItem('effortprint.heatmap.settings.v1', 'nope');
    expect(readSettings()).toEqual(defaults);
    localStorage.setItem(
      'effortprint.heatmap.settings.v1',
      JSON.stringify({ ...defaults, thresholds: { distance: [1, 2], duration: [1, 2, 3, 4, 5] } }),
    );
    expect(readSettings()).toEqual(defaults);
    localStorage.setItem(
      'effortprint.heatmap.settings.v1',
      JSON.stringify({ ...defaults, size: 'XL' }),
    );
    expect(readSettings()).toEqual(defaults);
  });

  it('round-trips settings', () => {
    const settings: HeatmapSettings = {
      sport: 'Run',
      palette: 'blue',
      size: 'L',
      metric: 'duration',
      thresholds: { distance: [50, 25, 12, 6, 1], duration: [200, 100, 50, 25, 5] },
      converged: false,
      labels: false,
    };
    writeSettings(settings);
    expect(readSettings()).toEqual(settings);
  });
});

describe('blocked site data', () => {
  it('reads nothing and does not throw', () => {
    const blocked = (): never => {
      throw new DOMException('blocked', 'SecurityError');
    };
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked);
    expect(readCache(42)).toBeNull();
    expect(readSettings().palette).toBe('ember');
    expect(() => {
      clearCache(42);
    }).not.toThrow();
    get.mockRestore();
    remove.mockRestore();
  });
});
