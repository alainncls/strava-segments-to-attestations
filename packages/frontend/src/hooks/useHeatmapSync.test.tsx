import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readCache, writeCache } from '@/utils/activityStore';
import { useHeatmapSync } from './useHeatmapSync';

const DAY = 24 * 60 * 60 * 1000;
const token = vi.fn((): Promise<string | null> => Promise.resolve('access-token'));

function stravaActivities(
  from: number,
  count: number,
  startLocal = '2026-11-01T08:00:00Z',
): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, index) => ({
    id: from + index,
    name: `Activity ${String(from + index)}`,
    sport_type: 'Run',
    start_date_local: startLocal,
    start_date: startLocal,
    distance: 10000,
    moving_time: 3000,
    extra: 'dropped',
  }));
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

// Serves `total` activities in pages of 200; `override` can replace any response.
function mockStrava(
  total: number,
  override?: (page: number, url: URL) => Response | undefined,
): URL[] {
  const urls: URL[] = [];
  const fetchMock = vi.fn((input: string | URL) => {
    const url = new URL(String(input));
    urls.push(url);
    const page = Number(url.searchParams.get('page'));
    const custom = override?.(page, url);
    if (custom) return Promise.resolve(custom);
    const from = (page - 1) * 200;
    return Promise.resolve(
      json(stravaActivities(from + 1, Math.max(0, Math.min(200, total - from)))),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return urls;
}

describe('useHeatmapSync', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-11-21T12:07:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('runs a full sync over several pages and writes the cache', async () => {
    const urls = mockStrava(450);
    const { result } = renderHook(() => useHeatmapSync(42, token));
    expect(result.current.activities).toEqual([]);

    await act(() => result.current.sync('full'));

    expect(urls.map((url) => url.searchParams.get('page'))).toEqual(['1', '2', '3', '4']);
    expect(urls.every((url) => url.searchParams.get('per_page') === '200')).toBe(true);
    expect(result.current.activities).toHaveLength(450);
    expect(result.current.activities[0]).toEqual({
      id: 1,
      name: 'Activity 1',
      sportType: 'Run',
      startLocal: '2026-11-01T08:00:00Z',
      distance: 10000,
      movingTime: 3000,
    });
    expect(result.current.received).toBe(450);
    expect(result.current.status).toBe('idle');
    expect(result.current.syncedAt).toBe(Date.now());
    expect(readCache(42)?.activities).toHaveLength(450);
  });

  it.each([
    [450, 4],
    [400, 3],
  ])('uses ceil(N / 200) + 1 requests for %i activities', async (total, requests) => {
    const urls = mockStrava(total);
    const { result } = renderHook(() => useHeatmapSync(42, token));
    await act(() => result.current.sync('full'));
    expect(urls).toHaveLength(requests);
  });

  it('merges an incremental sync by id and keeps syncedAt', async () => {
    const syncedAt = Date.now() - 2 * DAY;
    writeCache({
      version: 1,
      athleteId: 42,
      syncedAt,
      activities: [
        {
          id: 1,
          name: 'Old',
          sportType: 'Ride',
          startLocal: '2026-11-10T08:00:00Z',
          distance: 1,
          movingTime: 1,
        },
        {
          id: 2,
          name: 'Keep',
          sportType: 'Ride',
          startLocal: '2026-11-15T09:30:00Z',
          distance: 2,
          movingTime: 2,
        },
      ],
    });
    const urls = mockStrava(0, (page) =>
      page === 1
        ? json(stravaActivities(1, 1))
        : page === 2
          ? json(stravaActivities(3, 1))
          : undefined,
    );
    const { result } = renderHook(() => useHeatmapSync(42, token));
    expect(result.current.activities).toHaveLength(2);

    await act(() => result.current.sync('incremental'));

    const after = Date.parse('2026-11-15T09:30:00Z') / 1000 - 7 * 24 * 60 * 60;
    expect(urls[0]?.searchParams.get('after')).toBe(String(after));
    expect(urls).toHaveLength(3);
    expect(result.current.activities.map((a) => [a.id, a.name])).toEqual([
      [1, 'Activity 1'],
      [2, 'Keep'],
      [3, 'Activity 3'],
    ]);
    expect(result.current.received).toBe(2);
    expect(result.current.syncedAt).toBe(syncedAt);
    expect(readCache(42)?.syncedAt).toBe(syncedAt);
    expect(readCache(42)?.activities).toHaveLength(3);
  });

  it('allows one full sync each day and runs an incremental sync instead', async () => {
    const one = {
      id: 1,
      name: 'Old',
      sportType: 'Ride',
      startLocal: '2026-11-15T09:30:00Z',
      distance: 1,
      movingTime: 1,
    };
    writeCache({
      version: 1,
      athleteId: 42,
      syncedAt: Date.now() - DAY + 60_000,
      activities: [one],
    });
    const urls = mockStrava(0);
    const { result } = renderHook(() => useHeatmapSync(42, token));

    await act(() => result.current.sync('full'));
    expect(urls[0]?.searchParams.has('after')).toBe(true);

    vi.setSystemTime(Date.now() + 60_000);
    urls.length = 0;
    await act(() => result.current.sync('full'));
    expect(urls[0]?.searchParams.has('after')).toBe(false);
  });

  it('does a full sync when an incremental sync has no cache', async () => {
    const urls = mockStrava(10);
    const { result } = renderHook(() => useHeatmapSync(42, token));
    await act(() => result.current.sync('incremental'));
    expect(urls[0]?.searchParams.has('after')).toBe(false);
    expect(result.current.activities).toHaveLength(10);
  });

  it('stops on 429 with Retry-After and resumes from the next page', async () => {
    let limited = true;
    const urls = mockStrava(450, (page) =>
      page === 2 && limited ? json({}, 429, { 'Retry-After': '120' }) : undefined,
    );
    const { result } = renderHook(() => useHeatmapSync(42, token));

    await act(() => result.current.sync('full'));
    expect(result.current.status).toBe('rate-limited');
    expect(result.current.retryAt).toBe(Date.now() + 120_000);
    expect(result.current.activities).toHaveLength(200);
    expect(readCache(42)).toBeNull();

    limited = false;
    await act(() => result.current.sync('full'));
    expect(urls.map((url) => url.searchParams.get('page'))).toEqual(['1', '2', '2', '3', '4']);
    expect(result.current.status).toBe('idle');
    expect(result.current.retryAt).toBeNull();
    expect(result.current.activities).toHaveLength(450);
    expect(readCache(42)?.activities).toHaveLength(450);
  });

  it('sets retryAt to the next quarter hour without Retry-After', async () => {
    mockStrava(0, () => json({}, 429));
    const { result } = renderHook(() => useHeatmapSync(42, token));
    await act(() => result.current.sync('full'));
    expect(result.current.retryAt).toBe(Date.parse('2026-11-21T12:15:00Z'));
  });

  it('keeps the cache and the data on 401', async () => {
    const cached = {
      id: 9,
      name: 'Cached',
      sportType: 'Run',
      startLocal: '2026-11-15T09:30:00Z',
      distance: 1,
      movingTime: 1,
    };
    writeCache({ version: 1, athleteId: 42, syncedAt: Date.now(), activities: [cached] });
    mockStrava(0, () => json({}, 401));
    const { result } = renderHook(() => useHeatmapSync(42, token));
    await act(() => result.current.sync('full'));
    expect(result.current.status).toBe('auth-error');
    expect(result.current.activities).toEqual([cached]);
    expect(readCache(42)?.activities).toEqual([cached]);
  });

  it('reports auth-error without a request when no token is available', async () => {
    const urls = mockStrava(10);
    const { result } = renderHook(() => useHeatmapSync(42, () => Promise.resolve(null)));
    await act(() => result.current.sync('full'));
    expect(result.current.status).toBe('auth-error');
    expect(urls).toHaveLength(0);
  });

  it('aborts on unmount without a state update', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: string | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            signal = init?.signal ?? undefined;
            signal?.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'));
            });
          }),
      ),
    );
    const { result, unmount } = renderHook(() => useHeatmapSync(42, token));
    let pending: Promise<void> = Promise.resolve();
    await act(async () => {
      pending = result.current.sync('full');
      await vi.waitFor(() => {
        expect(signal).toBeDefined();
      });
    });
    expect(result.current.status).toBe('syncing');
    unmount();
    await pending;
    expect(signal?.aborted).toBe(true);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
