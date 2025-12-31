import { useState, useEffect, useCallback } from 'react';
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
): UseActivitiesReturn {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadingActivityId, setLoadingActivityId] = useState<number | undefined>();
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Fetch segments for a single activity
  const fetchSegmentsForActivity = useCallback(
    async (activityId: number, token: string): Promise<Segment[]> => {
      const response = await fetch(`${STRAVA_API_BASE}/activities/${activityId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch activity details');

      const data: ActivityDetails = await response.json();

      const segments: Segment[] =
        data.segment_efforts?.map((effort) => ({
          id: effort.segment.id,
          name: effort.segment.name,
          distance: effort.segment.distance,
          activityType: effort.segment.activity_type,
          completionDate: effort.start_date,
        })) || [];

      // Deduplicate segments by ID
      return segments.filter(
        (segment, index, self) => self.findIndex((s) => s.id === segment.id) === index,
      );
    },
    [],
  );

  // Pre-fetch segments for the first N activities
  const prefetchSegments = useCallback(
    async (activitiesToEnrich: Activity[], token: string): Promise<void> => {
      const enriched = await Promise.all(
        activitiesToEnrich.slice(0, PREFETCH_COUNT).map(async (activity) => {
          try {
            const segments = await fetchSegmentsForActivity(activity.id, token);
            return { ...activity, segments, segmentsLoaded: true };
          } catch {
            // Mark as loaded even on error to avoid retry loops
            return { ...activity, segments: [], segmentsLoaded: true };
          }
        }),
      );

      setActivities((prev) =>
        prev.map((a) => {
          const enrichedActivity = enriched.find((e) => e.id === a.id);
          return enrichedActivity ?? a;
        }),
      );
    },
    [fetchSegmentsForActivity],
  );

  // Fetch activities when authenticated
  const fetchActivities = useCallback(
    async (pageNum: number, append: boolean = false): Promise<void> => {
      const token = await refreshTokenIfNeeded();
      if (!token) return;

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

        if (!response.ok) throw new Error('Failed to fetch activities');

        const data = await response.json();

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
          setActivities((prev) => [...prev, ...newActivities]);
        } else {
          setActivities(newActivities);
        }

        // Pre-fetch segments for the first N activities (only on initial load)
        if (!append && newActivities.length > 0) {
          prefetchSegments(newActivities, token);
        }
      } catch (error) {
        console.error('Failed to fetch activities:', error);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [refreshTokenIfNeeded, prefetchSegments],
  );

  useEffect(() => {
    if (isAuthenticated) {
      fetchActivities(1, false);
    }
  }, [isAuthenticated, fetchActivities]);

  const handleLoadMore = useCallback(async (): Promise<void> => {
    const nextPage = page + 1;
    setPage(nextPage);
    await fetchActivities(nextPage, true);
  }, [page, fetchActivities]);

  const handleActivityClick = useCallback(
    async (activityId: number): Promise<Activity | undefined> => {
      const activity = activities.find((a) => a.id === activityId);
      if (!activity) return undefined;

      // If segments already loaded, return activity
      if (activity.segmentsLoaded) {
        return activity;
      }

      // Fetch segments for this activity
      const token = await refreshTokenIfNeeded();
      if (!token) return undefined;

      setLoadingActivityId(activityId);

      try {
        const segments = await fetchSegmentsForActivity(activityId, token);

        // Update activity with segments
        const updatedActivity = { ...activity, segments, segmentsLoaded: true };
        setActivities((prev) => prev.map((a) => (a.id === activityId ? updatedActivity : a)));
        return updatedActivity;
      } catch (error) {
        console.error('Failed to fetch segments:', error);
        return undefined;
      } finally {
        setLoadingActivityId(undefined);
      }
    },
    [activities, refreshTokenIfNeeded, fetchSegmentsForActivity],
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
