import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseRetryAfter, useActivities } from './useActivities';

const token = vi.fn(async () => 'access-token');

function activities(
  from: number,
  count: number,
): Array<{ id: number; name: string; type: string; start_date: string; distance: number }> {
  return Array.from({ length: count }, (_, index) => ({
    id: from + index,
    name: `Activity ${from + index}`,
    type: 'Ride',
    start_date: '2026-01-01T10:00:00Z',
    distance: 1000,
  }));
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('useActivities pagination and session boundaries', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('parses Retry-After seconds and HTTP dates with a bounded fallback', () => {
    const now = Date.parse('2026-10-10T00:00:00Z');
    expect(parseRetryAfter('12', now)).toBe(12_000);
    expect(parseRetryAfter('Sat, 10 Oct 2026 00:00:08 GMT', now)).toBe(8_000);
    expect(parseRetryAfter('0', now)).toBe(1000);
    expect(parseRetryAfter('999999', now)).toBe(15 * 60_000);
    expect(parseRetryAfter(null, now)).toBe(30_000);
  });

  it('retries the initial page after rate limiting and blocks requests until Retry-After expires', async () => {
    const requestedPages: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/athlete/activities')) {
        const page = url.searchParams.get('page') ?? '';
        requestedPages.push(page);
        if (requestedPages.length === 1) {
          return new Response(JSON.stringify({ message: 'rate limited' }), {
            status: 429,
            headers: { 'Retry-After': '1' },
          });
        }
        return response(activities(1, 30));
      }
      return response({ segment_efforts: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useActivities(true, token, 123));
    await waitFor(() => expect(result.current.isRetryBlocked).toBe(true));
    expect(result.current.activitiesError).toContain('page 1');

    await act(async () => result.current.handleLoadMore());
    expect(requestedPages).toEqual(['1']);

    await act(async () => new Promise((resolve) => setTimeout(resolve, 1100)));
    await waitFor(() => expect(result.current.isRetryBlocked).toBe(false));
    await act(async () => result.current.handleLoadMore());

    expect(requestedPages).toEqual(['1', '1']);
    expect(result.current.activities).toHaveLength(30);
    expect(result.current.activitiesError).toBeUndefined();
  });

  it('shows authentication expiry and never retries 401 or 403 automatically', async () => {
    let pageTwoAttempts = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/athlete/activities')) {
        if (url.searchParams.get('page') === '1') return response(activities(1, 30));
        pageTwoAttempts += 1;
        return response({ message: 'expired' }, 401);
      }
      return response({ segment_efforts: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useActivities(true, token, 123));
    await waitFor(() => expect(result.current.activities).toHaveLength(30));
    await act(async () => result.current.handleLoadMore());

    expect(result.current.isAuthenticationError).toBe(true);
    expect(result.current.activitiesError).toContain('Reconnect Strava');
    await act(async () => result.current.handleLoadMore());
    expect(pageTwoAttempts).toBe(1);
  });

  it('surfaces token refresh failure as an authentication error', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const refreshFailure = vi.fn(async () => {
      throw new Error('refresh token revoked');
    });

    const { result } = renderHook(() => useActivities(true, refreshFailure, 123));
    await waitFor(() => expect(result.current.isAuthenticationError).toBe(true));

    expect(result.current.activitiesError).toContain('Could not refresh Strava authentication');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries the same page after failure and deduplicates overlapping activity IDs', async () => {
    let pageTwoAttempts = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/athlete/activities')) {
        const page = url.searchParams.get('page');
        if (page === '1') return response(activities(1, 30));
        pageTwoAttempts += 1;
        if (pageTwoAttempts === 1) return response({ message: 'temporary failure' }, 503);
        expect(page).toBe('2');
        return response([activities(30, 2)[0], activities(31, 1)[0]]);
      }
      return response({ segment_efforts: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useActivities(true, token, 123));
    await waitFor(() => expect(result.current.activities).toHaveLength(30));

    await act(async () => result.current.handleLoadMore());
    expect(result.current.hasMore).toBe(true);
    expect(result.current.activities).toHaveLength(30);

    await act(async () => result.current.handleLoadMore());
    expect(pageTwoAttempts).toBe(2);
    expect(result.current.activities).toHaveLength(31);
    expect(result.current.activities.map((activity) => activity.id)).toEqual(
      Array.from({ length: 30 }, (_, index) => index + 1).concat(31),
    );
  });

  it('does not mark a failed segment lookup as empty and permits a user retry', async () => {
    let segmentAttempts = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/athlete/activities')) return response(activities(7, 1));
      segmentAttempts += 1;
      if (segmentAttempts === 1) return response({ message: 'temporary failure' }, 503);
      return response({
        segment_efforts: [
          {
            id: 1,
            segment: { id: 70, name: 'Hill', activity_type: 'Ride', distance: 500 },
            start_date: '2026-01-01T10:00:00Z',
          },
        ],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useActivities(true, token, 123));
    await waitFor(() => expect(result.current.activities[0]?.segmentsLoaded).toBe(false));

    await act(async () => {
      await result.current.handleActivityClick(7);
    });

    expect(segmentAttempts).toBe(2);
    expect(result.current.activities[0]?.segmentsLoaded).toBe(true);
    expect(result.current.activities[0]?.segments).toEqual([
      {
        id: 70,
        name: 'Hill',
        activityType: 'Ride',
        distance: 500,
        completionDate: '2026-01-01T10:00:00Z',
      },
    ]);
  });

  it('marks a successful empty segment response as loaded and does not fetch it again', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      return url.pathname.endsWith('/athlete/activities')
        ? response(activities(9, 1))
        : response({ segment_efforts: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useActivities(true, token, 123));
    await waitFor(() => expect(result.current.activities[0]?.segmentsLoaded).toBe(true));
    const detailsRequestCount = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes('/activities/9'),
    ).length;

    await act(async () => {
      await result.current.handleActivityClick(9);
    });

    expect(result.current.activities[0]?.segments).toEqual([]);
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).includes('/activities/9')),
    ).toHaveLength(detailsRequestCount);
  });

  it('ignores an in-flight old account page when the account changes', async () => {
    let finishPageTwo: ((value: Response) => void) | undefined;
    let pageOneRequests = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/athlete/activities')) {
        const page = url.searchParams.get('page');
        if (page === '1') {
          pageOneRequests += 1;
          const accountId = pageOneRequests === 1 ? 123 : 456;
          return Promise.resolve(response(activities(accountId * 100, 30)));
        }
        return new Promise<Response>((resolve) => {
          finishPageTwo = resolve;
        });
      }
      return Promise.resolve(response({ segment_efforts: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(
      ({ accountId }: { accountId: number }) => useActivities(true, token, accountId),
      { initialProps: { accountId: 123 } },
    );
    await waitFor(() => expect(result.current.activities[0]?.id).toBe(12_300));

    let loadMore: Promise<void> | undefined;
    let duplicateLoad: Promise<void> | undefined;
    act(() => {
      loadMore = result.current.handleLoadMore();
      duplicateLoad = result.current.handleLoadMore();
    });
    await waitFor(() => expect(finishPageTwo).toBeDefined());

    rerender({ accountId: 456 });
    await waitFor(() => expect(result.current.activities[0]?.id).toBe(45_600));
    await act(async () => {
      finishPageTwo?.(response(activities(12_330, 1)));
      await loadMore;
      await duplicateLoad;
    });

    expect(result.current.activities[0]?.id).toBe(45_600);
    expect(result.current.activities.some((activity) => activity.id === 12_330)).toBe(false);
  });

  it('clears activities on logout and ignores a delayed page response', async () => {
    let finishPageTwo: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/athlete/activities')) {
        if (url.searchParams.get('page') === '1')
          return Promise.resolve(response(activities(1, 30)));
        return new Promise<Response>((resolve) => {
          finishPageTwo = resolve;
        });
      }
      return Promise.resolve(response({ segment_efforts: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(
      ({ authenticated }: { authenticated: boolean }) => useActivities(authenticated, token, 123),
      { initialProps: { authenticated: true } },
    );
    await waitFor(() => expect(result.current.activities).toHaveLength(30));

    let loadMore: Promise<void> | undefined;
    act(() => {
      loadMore = result.current.handleLoadMore();
    });
    await waitFor(() => expect(finishPageTwo).toBeDefined());
    rerender({ authenticated: false });
    await waitFor(() => expect(result.current.activities).toEqual([]));

    await act(async () => {
      finishPageTwo?.(response(activities(31, 1)));
      await loadMore;
    });
    expect(result.current.activities).toEqual([]);
    expect(result.current.isLoadingMore).toBe(false);
  });

  it('aborts segment prefetch when the hook unmounts', async () => {
    let detailSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/athlete/activities')) {
        return Promise.resolve(response(activities(77, 1)));
      }
      detailSignal = init?.signal as AbortSignal | undefined;
      return new Promise<Response>(() => {});
    });
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = renderHook(() => useActivities(true, token, 123));
    await waitFor(() => expect(detailSignal).toBeDefined());
    expect(detailSignal?.aborted).toBe(false);
    unmount();
    expect(detailSignal?.aborted).toBe(true);
  });

  it('does not let an old account finally unlock a newer page request', async () => {
    const pendingPages: Array<(value: Response) => void> = [];
    let pageOneRequests = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/athlete/activities')) {
        if (url.searchParams.get('page') === '1') {
          pageOneRequests += 1;
          const accountId = pageOneRequests === 1 ? 123 : 456;
          return Promise.resolve(response(activities(accountId * 100, 30)));
        }
        return new Promise<Response>((resolve) => pendingPages.push(resolve));
      }
      return Promise.resolve(response({ segment_efforts: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(
      ({ accountId }: { accountId: number }) => useActivities(true, token, accountId),
      { initialProps: { accountId: 123 } },
    );
    await waitFor(() => expect(result.current.activities[0]?.id).toBe(12_300));

    let oldLoad: Promise<void> | undefined;
    act(() => {
      oldLoad = result.current.handleLoadMore();
    });
    await waitFor(() => expect(pendingPages).toHaveLength(1));

    rerender({ accountId: 456 });
    await waitFor(() => expect(result.current.activities[0]?.id).toBe(45_600));

    let newLoad: Promise<void> | undefined;
    act(() => {
      newLoad = result.current.handleLoadMore();
    });
    await waitFor(() => expect(pendingPages).toHaveLength(2));

    await act(async () => {
      pendingPages[0]?.(response(activities(12_330, 1)));
      await oldLoad;
    });
    await act(async () => result.current.handleLoadMore());
    expect(pendingPages).toHaveLength(2);

    await act(async () => {
      pendingPages[1]?.(response(activities(45_630, 1)));
      await newLoad;
    });
    expect(result.current.activities[0]?.id).toBe(45_600);
    expect(result.current.activities.some((activity) => activity.id === 12_330)).toBe(false);
  });
});
