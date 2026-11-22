import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import type { Activity, ActivityDetails, Segment } from '@strava-attestations/shared';
import { StravaHttpError, isAborted, stravaGet } from '@/utils/strava';

const ACTIVITIES_PER_PAGE = 30;
const PREFETCH_COUNT = 3;

function errorMessageForStatus(status: number, page: number): string {
  if (status === 401 || status === 403) {
    return 'Your Strava session expired. Reconnect Strava before loading more activities.';
  }
  return `Could not load activities page ${String(page)} (HTTP ${String(status)}). Retry this page.`;
}

interface StravaActivitySummary {
  id: number;
  name: string;
  type: string;
  start_date: string;
  distance: number;
}

interface UseActivitiesReturn {
  activities: Activity[];
  isLoading: boolean;
  isLoadingMore: boolean;
  activitiesError: string | undefined;
  isRetryBlocked: boolean;
  isAuthenticationError: boolean;
  segmentErrors: Record<number, string>;
  loadingActivityId: number | undefined;
  hasMore: boolean;
  handleLoadMore: () => Promise<void>;
  handleActivityClick: (activityId: number) => Promise<Activity | undefined>;
}

export function useActivities(
  isAuthenticated: boolean,
  getValidToken: () => Promise<string | null>,
  accountId?: number,
): UseActivitiesReturn {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadingActivityId, setLoadingActivityId] = useState<number | undefined>();
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [activitiesError, setActivitiesError] = useState<string>();
  const [isRetryBlocked, setIsRetryBlocked] = useState(false);
  const [isAuthenticationError, setIsAuthenticationError] = useState(false);
  const [segmentErrors, setSegmentErrors] = useState<Record<number, string>>({});
  const requestEpoch = useRef(0);
  const session = useRef({ isAuthenticated, accountId });
  const loadingMore = useRef(false);
  const controller = useRef(new AbortController());
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fetchActivitiesRef = useRef<(pageNum: number, append?: boolean) => Promise<boolean>>(() =>
    Promise.resolve(false),
  );

  useEffect(() => {
    const activeController = new AbortController();
    controller.current = activeController;
    return () => {
      controller.current.abort();
    };
  }, []);

  useEffect(
    () => () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    },
    [],
  );

  // Fetch segments for a single activity
  const fetchSegmentsForActivity = useCallback(
    async (activityId: number, token: string, signal: AbortSignal): Promise<Segment[]> => {
      const data = await stravaGet<ActivityDetails>(
        `/activities/${String(activityId)}`,
        token,
        signal,
      );

      const segmentsById = new Map<number, Segment>();

      for (const effort of data.segment_efforts ?? []) {
        if (segmentsById.has(effort.segment.id)) {
          continue;
        }

        segmentsById.set(effort.segment.id, {
          id: effort.segment.id,
          name: effort.segment.name,
          distance: effort.segment.distance,
          activityType: effort.segment.activity_type,
          completionDate: effort.start_date,
        });
      }

      return Array.from(segmentsById.values());
    },
    [],
  );

  // Pre-fetch segments for the first N activities
  const prefetchSegments = useCallback(
    async (activitiesToEnrich: Activity[], token: string, signal: AbortSignal): Promise<void> => {
      const epoch = requestEpoch.current;
      const enriched = await Promise.all(
        activitiesToEnrich.slice(0, PREFETCH_COUNT).map(async (activity) => {
          try {
            const segments = await fetchSegmentsForActivity(activity.id, token, signal);
            return { ...activity, segments, segmentsLoaded: true };
          } catch {
            if (!signal.aborted && epoch === requestEpoch.current) {
              setSegmentErrors((previous) => ({
                ...previous,
                [activity.id]: 'Could not load segments. Select this activity to retry.',
              }));
            }
            return { ...activity, segments: [], segmentsLoaded: false };
          }
        }),
      );

      if (epoch !== requestEpoch.current) return;

      const enrichedById = new Map(enriched.map((activity) => [activity.id, activity]));

      setActivities((prev) =>
        prev.map((activity) => {
          const enrichedActivity = enrichedById.get(activity.id);
          return enrichedActivity ?? activity;
        }),
      );
    },
    [fetchSegmentsForActivity],
  );

  // Fetch activities when authenticated
  const fetchActivities = useCallback(
    async (pageNum: number, append = false): Promise<boolean> => {
      const epoch = requestEpoch.current;
      const signal = controller.current.signal;
      if (append && (isRetryBlocked || isAuthenticationError)) return false;

      try {
        let token: string | null;
        try {
          token = await getValidToken();
        } catch {
          if (!signal.aborted && epoch === requestEpoch.current && isAuthenticated) {
            setActivitiesError('Could not refresh Strava authentication. Reconnect and retry.');
            setIsAuthenticationError(true);
          }
          return false;
        }
        if (!token || signal.aborted || epoch !== requestEpoch.current || !isAuthenticated) {
          if (!signal.aborted && epoch === requestEpoch.current && isAuthenticated) {
            setActivitiesError('Your Strava session expired. Reconnect Strava to continue.');
            setIsAuthenticationError(true);
          }
          return false;
        }

        if (append) setIsLoadingMore(true);
        else setIsLoading(true);

        const data = await stravaGet<StravaActivitySummary[]>(
          `/athlete/activities?per_page=${String(ACTIVITIES_PER_PAGE)}&page=${String(pageNum)}`,
          token,
          signal,
        );
        if (isAborted(signal) || epoch !== requestEpoch.current) return false;

        const newActivities: Activity[] = data.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          startDate: a.start_date,
          distance: a.distance,
        }));

        // Check if there are more activities
        setHasMore(newActivities.length === ACTIVITIES_PER_PAGE);
        setPage(pageNum);

        if (append) {
          setActivities((prev) => {
            const merged = new Map(prev.map((activity) => [activity.id, activity]));
            for (const activity of newActivities) {
              if (!merged.has(activity.id)) merged.set(activity.id, activity);
            }
            return Array.from(merged.values());
          });
        } else {
          setActivities(newActivities);
          setSegmentErrors({});
        }

        setActivitiesError(undefined);
        setIsAuthenticationError(false);
        setIsRetryBlocked(false);

        // Pre-fetch segments for the first N activities (only on initial load)
        if (!append && newActivities.length > 0) {
          void prefetchSegments(newActivities, token, signal);
        }
        return true;
      } catch (error) {
        if (signal.aborted || epoch !== requestEpoch.current) return false;
        if (!(error instanceof StravaHttpError)) {
          setActivitiesError(
            `Could not load activities page ${String(pageNum)}. Check your connection and retry.`,
          );
          return false;
        }

        setActivitiesError(errorMessageForStatus(error.status, pageNum));
        setIsAuthenticationError(error.isAuthError);
        if (error.isRateLimit) {
          setIsRetryBlocked(true);
          if (retryTimer.current) clearTimeout(retryTimer.current);
          retryTimer.current = setTimeout(() => {
            if (epoch !== requestEpoch.current) return;
            setIsRetryBlocked(false);
            setActivitiesError(
              `Rate limit window ended. Retry activities page ${String(pageNum)}.`,
            );
          }, error.retryAfterMs);
        }
        return false;
      } finally {
        if (!signal.aborted && epoch === requestEpoch.current) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [isAuthenticated, isRetryBlocked, isAuthenticationError, getValidToken, prefetchSegments],
  );

  const handleLoadMore = useCallback(async (): Promise<void> => {
    if (loadingMore.current || !hasMore || isRetryBlocked || isAuthenticationError) return;
    loadingMore.current = true;
    const epoch = requestEpoch.current;
    const nextPage = page + 1;
    try {
      await fetchActivities(nextPage, true);
    } finally {
      if (epoch === requestEpoch.current) loadingMore.current = false;
    }
  }, [page, fetchActivities, hasMore, isRetryBlocked, isAuthenticationError]);

  useLayoutEffect(() => {
    fetchActivitiesRef.current = fetchActivities;
  }, [fetchActivities]);

  useEffect(() => {
    const previous = session.current;
    if (previous.isAuthenticated !== isAuthenticated || previous.accountId !== accountId) {
      controller.current.abort();
      controller.current = new AbortController();
      requestEpoch.current += 1;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = undefined;
      loadingMore.current = false;
      setActivities([]);
      setPage(0);
      setHasMore(true);
      setIsLoading(false);
      setIsLoadingMore(false);
      setLoadingActivityId(undefined);
      setActivitiesError(undefined);
      setIsRetryBlocked(false);
      setIsAuthenticationError(false);
      setSegmentErrors({});
      session.current = { isAuthenticated, accountId };
    }

    if (isAuthenticated) void fetchActivitiesRef.current(1, false);
  }, [isAuthenticated, accountId]);

  const handleActivityClick = useCallback(
    async (activityId: number): Promise<Activity | undefined> => {
      const activity = activities.find((a) => a.id === activityId);
      if (!activity) return undefined;

      // If segments already loaded, return activity
      if (activity.segmentsLoaded) {
        return activity;
      }

      // Fetch segments for this activity
      const epoch = requestEpoch.current;
      const signal = controller.current.signal;
      let token: string | null;
      try {
        token = await getValidToken();
      } catch {
        if (!signal.aborted && epoch === requestEpoch.current) {
          setSegmentErrors((previous) => ({
            ...previous,
            [activityId]: 'Could not refresh Strava authentication. Reconnect and retry.',
          }));
        }
        return undefined;
      }
      if (!token || signal.aborted || epoch !== requestEpoch.current || !isAuthenticated)
        return undefined;

      setLoadingActivityId(activityId);

      try {
        const segments = await fetchSegmentsForActivity(activityId, token, signal);
        if (isAborted(signal) || epoch !== requestEpoch.current) return undefined;

        // Update activity with segments
        const updatedActivity = { ...activity, segments, segmentsLoaded: true };
        setActivities((prev) => prev.map((a) => (a.id === activityId ? updatedActivity : a)));
        setSegmentErrors((previous) => {
          const { [activityId]: _removed, ...next } = previous;
          return next;
        });
        return updatedActivity;
      } catch {
        if (!isAborted(signal) && epoch === requestEpoch.current) {
          setSegmentErrors((previous) => ({
            ...previous,
            [activityId]: 'Could not load segments. Select this activity to retry.',
          }));
        }
        return undefined;
      } finally {
        if (epoch === requestEpoch.current) setLoadingActivityId(undefined);
      }
    },
    [activities, isAuthenticated, getValidToken, fetchSegmentsForActivity],
  );

  return {
    activities,
    isLoading,
    isLoadingMore,
    activitiesError,
    isRetryBlocked,
    isAuthenticationError,
    segmentErrors,
    loadingActivityId,
    hasMore,
    handleLoadMore,
    handleActivityClick,
  };
}
