import React from 'react';
import type { Segment } from '../../types';
import { formatDistance, getActivityIcon } from '@/utils/format.ts';
import styles from './SegmentItem.module.css';

interface SegmentItemProps {
  segment: Segment;
  onAttest: () => void;
  isLoading: boolean;
  isAttesting: boolean;
  isDisabled: boolean;
  isWalletConnected: boolean;
}

export default function SegmentItem({
  segment,
  onAttest,
  isLoading,
  isAttesting,
  isDisabled,
  isWalletConnected,
}: SegmentItemProps): React.JSX.Element {
  const getButtonText = (): string => {
    if (isLoading) return 'Signing...';
    if (isAttesting) return 'Creating attestation...';
    if (!isWalletConnected) return 'Connect wallet';
    return 'Create Attestation';
  };

  return (
    <div className={styles.item}>
      <div className={styles.info}>
        <div className={styles.header}>
          <span className={styles.icon}>{getActivityIcon(segment.activityType)}</span>
          <h4 className={styles.name}>{segment.name}</h4>
        </div>
        <div className={styles.meta}>
          <span>{formatDistance(segment.distance)}</span>
          {segment.completionDate && (
            <>
              <span className={styles.separator}>•</span>
              <span>{new Date(segment.completionDate).toLocaleDateString()}</span>
            </>
          )}
        </div>
      </div>

      <button
        className={styles.attestBtn}
        onClick={onAttest}
        disabled={isLoading || isAttesting || isDisabled || !isWalletConnected}
      >
        {(isLoading || isAttesting) && <span className={styles.spinner} />}
        {getButtonText()}
      </button>
    </div>
  );
}
