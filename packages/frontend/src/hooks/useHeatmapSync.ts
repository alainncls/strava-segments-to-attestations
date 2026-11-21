import { useCallback, useEffect, useRef, useState } from 'react';
import { readCache, writeCache } from '@/utils/activityStore';
import type { StoredActivity } from '@/utils/heatmap';
import { StravaHttpError, stravaGet } from '@/utils/strava';

const PAGE_SIZE = 200;
const OVERLAP_SECONDS = 7 * 24 * 60 * 60;
const QUARTER_HOUR_MS = 15 * 60_000;

interface StravaActivity {
  id: number;
  name: string;
  sport_type: string;
  start_date_local: string;
  distance: number;
  moving_time: number;
}

export interface HeatmapSync {
  activities: StoredActivity[];
  syncedAt: number | null;
  status: 'idle' | 'syncing' | 'rate-limited' | 'auth-error' | 'error';
  received: number;
  retryAt: number | null;
  sync: (mode: 'full' | 'incremental') => Promise<void>;
}

const toStored = (a: StravaActivity): StoredActivity => ({
  id: a.id,
  name: a.name,
  sportType: a.sport_type,
  startLocal: a.start_date_local,
  distance: a.distance,
  movingTime: a.moving_time,
});

function mergeById(base: StoredActivity[], updates: StoredActivity[]): StoredActivity[] {
  const byId = new Map(base.map((a) => [a.id, a]));
  for (const a of updates) byId.set(a.id, a);
  return Array.from(byId.values());
}

export function useHeatmapSync(
  athleteId: number | undefined,
  getValidToken: () => Promise<string | null>,
): HeatmapSync {
  const [activities, setActivities] = useState<StoredActivity[]>([]);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [status, setStatus] = useState<HeatmapSync['status']>('idle');
  const [received, setReceived] = useState(0);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const controller = useRef(new AbortController());
  const running = useRef(false);
  // Pages of an interrupted full sync, kept to resume it.
  const partial = useRef<{ nextPage: number; activities: StoredActivity[] } | null>(null);

  useEffect(() => {
    const active = new AbortController();
    controller.current = active;
    running.current = false;
    partial.current = null;
    const cache = athleteId === undefined ? null : readCache(athleteId);
    setActivities(cache?.activities ?? []);
    setSyncedAt(cache?.syncedAt ?? null);
    setStatus('idle');
    setReceived(0);
    setRetryAt(null);
    return () => active.abort();
  }, [athleteId]);

  const sync = useCallback(
    async (mode: 'full' | 'incremental'): Promise<void> => {
      if (athleteId === undefined || running.current) return;
      const { signal } = controller.current;
      running.current = true;
      try {
        let token: string | null;
        try {
          token = await getValidToken();
        } catch {
          token = null;
        }
        if (signal.aborted) return;
        if (!token) {
          setStatus('auth-error');
          return;
        }

        const cache = readCache(athleteId);
        const base = cache?.activities ?? [];
        const full = mode === 'full' || base.length === 0;
        const newest = Math.max(...base.map((a) => Date.parse(a.startLocal)));
        const after = full ? '' : `&after=${Math.floor(newest / 1000) - OVERLAP_SECONDS}`;
        // Only a direct retry of the full sync resumes it.
        if (!full) partial.current = null;
        const resumed = full ? partial.current : null;
        let page = resumed?.nextPage ?? 1;
        let fetched = resumed?.activities ?? [];

        setStatus('syncing');
        setRetryAt(null);
        setReceived(fetched.length);
        try {
          for (;;) {
            const data = await stravaGet<StravaActivity[]>(
              `/athlete/activities?per_page=${PAGE_SIZE}&page=${page}${after}`,
              token,
              signal,
            );
            if (data.length === 0) break;
            fetched = [...fetched, ...data.map(toStored)];
            page += 1;
            if (full) partial.current = { nextPage: page, activities: fetched };
            setActivities(mergeById(base, fetched));
            setReceived(fetched.length);
          }
        } catch (error) {
          if (signal.aborted) return;
          if (error instanceof StravaHttpError && error.isRateLimit) {
            const now = Date.now();
            setRetryAt(
              error.hasRetryAfter
                ? now + error.retryAfterMs
                : (Math.floor(now / QUARTER_HOUR_MS) + 1) * QUARTER_HOUR_MS,
            );
            setStatus('rate-limited');
          } else {
            setStatus(
              error instanceof StravaHttpError && error.isAuthError ? 'auth-error' : 'error',
            );
          }
          return;
        }

        const next = full
          ? { activities: fetched, syncedAt: Date.now() }
          : { activities: mergeById(base, fetched), syncedAt: cache!.syncedAt };
        partial.current = null;
        writeCache({ version: 1, athleteId, ...next });
        setActivities(next.activities);
        setSyncedAt(next.syncedAt);
        setStatus('idle');
      } finally {
        if (!signal.aborted) running.current = false;
      }
    },
    [athleteId, getValidToken],
  );

  return { activities, syncedAt, status, received, retryAt, sync };
}
