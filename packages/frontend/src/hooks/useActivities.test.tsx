import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useActivities } from './useActivities';

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
});
