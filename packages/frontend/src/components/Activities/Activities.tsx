import React, { memo, useCallback } from 'react';
import type { Activity } from '@strava-attestations/shared';
import { formatActivityType, formatDate, formatDistance } from '@/utils/format';
import { Button } from '@/components/Button/Button';
import styles from './Activities.module.css';

interface ActivitiesProps {
  activities: Activity[];
  onActivityClick: (activityId: number) => Promise<void>;
  loadingActivityId?: number | undefined;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  activitiesError?: string | undefined;
  isRetryBlocked?: boolean;
  isAuthenticationError?: boolean;
  segmentErrors?: Record<number, string>;
  onLoadMore?: () => Promise<void>;
}

interface ActivityRowProps {
  activity: Activity;
  isLoading: boolean;
  onActivityClick: (activityId: number) => Promise<void>;
}

function segmentLabel(activity: Activity): string {
  if (!activity.segmentsLoaded) {
    return 'View segments';
  }

  const count = activity.segments?.length ?? 0;
  if (count === 0) {
    return 'No segments';
  }

  return `${String(count)} segment${count > 1 ? 's' : ''}`;
}

const ActivityRow = memo(function ActivityRow({
  activity,
  isLoading,
  onActivityClick,
}: ActivityRowProps): React.JSX.Element {
  // aria-disabled, not disabled: a disabled button loses focus, and the modal could not give it back.
  const handleClick = useCallback((): void => {
    if (!isLoading) void onActivityClick(activity.id);
  }, [activity.id, isLoading, onActivityClick]);

  const isMuted = !activity.segmentsLoaded || !activity.segments?.length;

  return (
    <li>
      <button
        className={styles.row}
        onClick={handleClick}
        aria-disabled={isLoading}
        aria-busy={isLoading}
      >
        <span className={styles.name}>{activity.name}</span>
        <span className={styles.meta}>
          <span>{formatActivityType(activity.type)}</span>
          <span>{formatDate(activity.startDate)}</span>
          <span className={styles.distance}>{formatDistance(activity.distance)}</span>
        </span>
        <span className={`${String(styles.segments)} ${String(isMuted ? styles.muted : '')}`}>
          {isLoading ? <span className={styles.spinner} aria-hidden="true" /> : null}
          {segmentLabel(activity)}
        </span>
      </button>
    </li>
  );
});

function retryLabel(isRetryBlocked: boolean, isLoadingMore: boolean, fallback: string): string {
  if (isRetryBlocked) {
    return 'Retry soon';
  }

  return isLoadingMore ? 'Loading…' : fallback;
}

export default function Activities({
  activities,
  onActivityClick,
  loadingActivityId,
  hasMore = false,
  isLoadingMore = false,
  activitiesError,
  isRetryBlocked = false,
  isAuthenticationError = false,
  segmentErrors = {},
  onLoadMore,
}: ActivitiesProps): React.JSX.Element {
  if (activities.length === 0) {
    return (
      <div className={styles.empty}>
        {activitiesError ? (
          <p role="alert" className={styles.error}>
            {activitiesError}
          </p>
        ) : (
          <p>No activities yet.</p>
        )}
        {hasMore && activitiesError && !isAuthenticationError && onLoadMore ? (
          <Button onClick={() => void onLoadMore()} disabled={isLoadingMore || isRetryBlocked}>
            {retryLabel(isRetryBlocked, isLoadingMore, 'Retry')}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <section>
      <h1 className={styles.title}>Activities</h1>
      {activitiesError ? (
        <p role="alert" className={styles.error}>
          {activitiesError}
        </p>
      ) : null}

      <ul className={styles.list}>
        {activities.map((activity) => (
          <ActivityRow
            key={activity.id}
            activity={activity}
            isLoading={loadingActivityId === activity.id}
            onActivityClick={onActivityClick}
          />
        ))}
      </ul>

      {Object.entries(segmentErrors).map(([activityId, error]) => (
        <p key={activityId} role="status" className={styles.error}>
          Activity {activityId}: {error}
        </p>
      ))}

      {hasMore && onLoadMore ? (
        <div className={styles.more}>
          <Button
            onClick={() => void onLoadMore()}
            disabled={isLoadingMore || isRetryBlocked || isAuthenticationError}
          >
            {retryLabel(isRetryBlocked, isLoadingMore, activitiesError ? 'Retry' : 'Load more')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
