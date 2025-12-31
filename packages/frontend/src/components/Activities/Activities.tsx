import React from 'react';
import type { Activity } from '../../types';
import { formatDistance, formatDate, getActivityIcon } from '../../utils/format';
import { Button } from '../Button';
import styles from './Activities.module.css';

interface ActivitiesProps {
  activities: Activity[];
  onActivityClick: (activityId: number) => void;
  loadingActivityId?: number;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

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
          <button
            key={activity.id}
            className={`${styles.card} fade-in stagger-${Math.min(index + 1, 5)}`}
            onClick={() => onActivityClick(activity.id)}
            disabled={loadingActivityId === activity.id}
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
                className={`${styles.segmentBadge} ${activity.segments && activity.segments.length > 0 ? styles.hasSegments : styles.noSegments}`}
              >
                {activity.segments && activity.segments.length > 0
                  ? `${activity.segments.length} segment${activity.segments.length > 1 ? 's' : ''}`
                  : '0 segment'}
              </div>
            ) : (
              <div className={styles.loadSegments}>
                <span className={styles.loadIcon}>📂</span>
                <span>Load segments</span>
              </div>
            )}
            {loadingActivityId === activity.id && (
              <div className={styles.loading}>
                <div className={styles.spinner} />
              </div>
            )}
          </button>
        ))}
      </div>

      {hasMore && onLoadMore && (
        <div className={styles.loadMore}>
          <Button variant="outline" onClick={onLoadMore} disabled={isLoadingMore}>
            {isLoadingMore ? 'Loading...' : 'Load more activities'}
          </Button>
        </div>
      )}
    </div>
  );
}
