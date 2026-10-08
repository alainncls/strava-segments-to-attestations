import { useState, useEffect, useCallback, useRef } from 'react';
import { STRAVA_API_BASE } from '../utils/constants';
import type { Activity, ActivityDetails, Segment } from '../types';

const ACTIVITIES_PER_PAGE = 30;
const PREFETCH_COUNT = 3;

interface UseActivitiesReturn {
  activities: Activity[];
  isLoading: boolean;
  isLoadingMore: boolean;
  loadingActivityId: number | undefined;
  hasMore: boolean;
  handleLoadMore: () => Promise<void>;
  handleActivityClick: (activityId: number) => Promise<Activity | undefined>;
}

export function useActivities(
  isAuthenticated: boolean,
  refreshTokenIfNeeded: () => Promise<string | null>,
  accountId?: number,
): UseActivitiesReturn {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadingActivityId, setLoadingActivityId] = useState<number | undefined>();
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const requestEpoch = useRef(0);
  const session = useRef({ isAuthenticated, accountId });
  const loadingMore = useRef(false);

  // Fetch segments for a single activity
  const fetchSegmentsForActivity = useCallback(
    async (activityId: number, token: string): Promise<Segment[]> => {
      const response = await fetch(`${STRAVA_API_BASE}/activities/${activityId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch activity details (${response.status})`);
      }

      const data: ActivityDetails = await response.json();

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
    async (activitiesToEnrich: Activity[], token: string): Promise<void> => {
      const epoch = requestEpoch.current;
      const enriched = await Promise.all(
        activitiesToEnrich.slice(0, PREFETCH_COUNT).map(async (activity) => {
          try {
            const segments = await fetchSegmentsForActivity(activity.id, token);
            return { ...activity, segments, segmentsLoaded: true };
          } catch {
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
    async (pageNum: number, append: boolean = false): Promise<boolean> => {
      const epoch = requestEpoch.current;
      const token = await refreshTokenIfNeeded();
      if (!token || epoch !== requestEpoch.current || !isAuthenticated) return false;

      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      try {
        const response = await fetch(
          `${STRAVA_API_BASE}/athlete/activities?per_page=${ACTIVITIES_PER_PAGE}&page=${pageNum}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (!response.ok) {
          console.error('Failed to fetch activities');
          return false;
        }

        const data = await response.json();
        if (epoch !== requestEpoch.current) return false;

        const newActivities: Activity[] = data.map(
          (a: {
            id: number;
            name: string;
            type: string;
            start_date: string;
            distance: number;
          }) => ({
            id: a.id,
            name: a.name,
            type: a.type,
            startDate: a.start_date,
            distance: a.distance,
          }),
        );

        // Check if there are more activities
        setHasMore(newActivities.length === ACTIVITIES_PER_PAGE);

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
        }

        // Pre-fetch segments for the first N activities (only on initial load)
        if (!append && newActivities.length > 0) {
          prefetchSegments(newActivities, token);
        }
        return true;
      } catch (error) {
        console.error('Failed to fetch activities:', error);
        return false;
      } finally {
        if (epoch === requestEpoch.current) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [isAuthenticated, refreshTokenIfNeeded, prefetchSegments],
  );

  useEffect(() => {
    const previous = session.current;
    if (previous.isAuthenticated !== isAuthenticated || previous.accountId !== accountId) {
      requestEpoch.current += 1;
      loadingMore.current = false;
      setActivities([]);
      setPage(1);
      setHasMore(true);
      setIsLoading(false);
      setIsLoadingMore(false);
      setLoadingActivityId(undefined);
      session.current = { isAuthenticated, accountId };
    }

    if (isAuthenticated) void fetchActivities(1, false);
  }, [isAuthenticated, accountId, fetchActivities]);

  const handleLoadMore = useCallback(async (): Promise<void> => {
    if (loadingMore.current || !hasMore) return;
    loadingMore.current = true;
    const nextPage = page + 1;
    try {
      if (await fetchActivities(nextPage, true)) setPage(nextPage);
    } finally {
      loadingMore.current = false;
    }
  }, [page, fetchActivities, hasMore]);

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
      const token = await refreshTokenIfNeeded();
      if (!token || epoch !== requestEpoch.current || !isAuthenticated) return undefined;

      setLoadingActivityId(activityId);

      try {
        const segments = await fetchSegmentsForActivity(activityId, token);
        if (epoch !== requestEpoch.current) return undefined;

        // Update activity with segments
        const updatedActivity = { ...activity, segments, segmentsLoaded: true };
        setActivities((prev) => prev.map((a) => (a.id === activityId ? updatedActivity : a)));
        return updatedActivity;
      } catch (error) {
        console.error('Failed to fetch segments:', error);
        return undefined;
      } finally {
        if (epoch === requestEpoch.current) setLoadingActivityId(undefined);
      }
    },
    [activities, isAuthenticated, refreshTokenIfNeeded, fetchSegmentsForActivity],
  );

  return {
    activities,
    isLoading,
    isLoadingMore,
    loadingActivityId,
    hasMore,
    handleLoadMore,
    handleActivityClick,
  };
}
