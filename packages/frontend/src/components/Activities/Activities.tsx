import React, { memo, useCallback } from 'react';
import type { Activity } from '../../types';
import { formatActivityType, formatDate, formatDistance } from '@/utils/format.ts';
import { Button } from '../Button/Button';
import styles from './Activities.module.css';

interface ActivitiesProps {
  activities: Activity[];
  onActivityClick: (activityId: number) => void;
  loadingActivityId?: number;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  activitiesError?: string;
  isRetryBlocked?: boolean;
  isAuthenticationError?: boolean;
  segmentErrors?: Record<number, string>;
  onLoadMore?: () => void;
}

interface ActivityRowProps {
  activity: Activity;
  isLoading: boolean;
  onActivityClick: (activityId: number) => void;
}

function segmentLabel(activity: Activity): string {
  if (!activity.segmentsLoaded) {
    return 'View segments';
  }

  const count = activity.segments?.length ?? 0;
  if (count === 0) {
    return 'No segments';
  }

  return `${count} segment${count > 1 ? 's' : ''}`;
}

const ActivityRow = memo(function ActivityRow({
  activity,
  isLoading,
  onActivityClick,
}: ActivityRowProps): React.JSX.Element {
  const handleClick = useCallback((): void => {
    onActivityClick(activity.id);
  }, [activity.id, onActivityClick]);

  const isMuted = !activity.segmentsLoaded || !activity.segments?.length;

  return (
    <li>
      <button
        className={styles.row}
        onClick={handleClick}
        disabled={isLoading}
        aria-busy={isLoading}
      >
        <span className={styles.name}>{activity.name}</span>
        <span className={styles.meta}>
          <span>{formatActivityType(activity.type)}</span>
          <span>{formatDate(activity.startDate)}</span>
          <span className={styles.distance}>{formatDistance(activity.distance)}</span>
        </span>
        <span className={`${styles.segments} ${isMuted ? styles.muted : ''}`}>
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
          <Button onClick={onLoadMore} disabled={isLoadingMore || isRetryBlocked}>
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
            onClick={onLoadMore}
            disabled={isLoadingMore || isRetryBlocked || isAuthenticationError}
          >
            {retryLabel(isRetryBlocked, isLoadingMore, activitiesError ? 'Retry' : 'Load more')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
