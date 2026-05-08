import React, { memo, useCallback } from 'react';
import type { Activity } from '../../types';
import { formatDistance, formatDate, getActivityIcon } from '@/utils/format.ts';
import { Button } from '../Button/Button';
import styles from './Activities.module.css';

interface ActivitiesProps {
  activities: Activity[];
  onActivityClick: (activityId: number) => void;
  loadingActivityId?: number;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

interface ActivityCardProps {
  activity: Activity;
  index: number;
  isLoading: boolean;
  onActivityClick: (activityId: number) => void;
}

const ActivityCard = memo(function ActivityCard({
  activity,
  index,
  isLoading,
  onActivityClick,
}: ActivityCardProps): React.JSX.Element {
  const handleClick = useCallback((): void => {
    onActivityClick(activity.id);
  }, [activity.id, onActivityClick]);

  const segmentCount = activity.segments?.length ?? 0;

  return (
    <button
      className={`${styles.card} fade-in stagger-${Math.min(index + 1, 5)}`}
      onClick={handleClick}
      disabled={isLoading}
    >
      <div className={styles.cardHeader}>
        <span className={styles.icon}>{getActivityIcon(activity.type)}</span>
        <span className={styles.type}>{activity.type}</span>
      </div>
      <h3 className={styles.name}>{activity.name}</h3>
      <div className={styles.meta}>
        <span>{formatDate(activity.startDate)}</span>
        <span className={styles.separator}>•</span>
        <span>{formatDistance(activity.distance)}</span>
      </div>
      {activity.segmentsLoaded ? (
        <div
          className={`${styles.segmentBadge} ${segmentCount > 0 ? styles.hasSegments : styles.noSegments}`}
        >
          {segmentCount > 0 ? `${segmentCount} segment${segmentCount > 1 ? 's' : ''}` : '0 segment'}
        </div>
      ) : (
        <div className={styles.loadSegments}>
          <span className={styles.loadIcon}>📂</span>
          <span>Load segments</span>
        </div>
      )}
      {isLoading ? (
        <div className={styles.loading}>
          <div className={styles.spinner} />
        </div>
      ) : null}
    </button>
  );
});

export default function Activities({
  activities,
  onActivityClick,
  loadingActivityId,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
}: ActivitiesProps): React.JSX.Element {
  if (activities.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No activities found. Go complete some segments!</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Your Recent Activities</h2>
      <div className={styles.grid}>
        {activities.map((activity, index) => (
          <ActivityCard
            key={activity.id}
            activity={activity}
            index={index}
            isLoading={loadingActivityId === activity.id}
            onActivityClick={onActivityClick}
          />
        ))}
      </div>

      {hasMore && onLoadMore ? (
        <div className={styles.loadMore}>
          <Button variant="outline" onClick={onLoadMore} disabled={isLoadingMore}>
            {isLoadingMore ? 'Loading...' : 'Load more activities'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
