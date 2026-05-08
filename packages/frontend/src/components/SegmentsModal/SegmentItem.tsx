import React, { memo, useCallback } from 'react';
import type { Segment } from '../../types';
import { formatDistance, formatSegmentDate, getActivityIcon } from '@/utils/format.ts';
import styles from './SegmentItem.module.css';

interface SegmentItemProps {
  segment: Segment;
  onAttest: (segment: Segment) => void;
  isLoading: boolean;
  isAttesting: boolean;
  isDisabled: boolean;
  isWalletConnected: boolean;
}

function SegmentItem({
  segment,
  onAttest,
  isLoading,
  isAttesting,
  isDisabled,
  isWalletConnected,
}: SegmentItemProps): React.JSX.Element {
  const handleAttest = useCallback((): void => {
    onAttest(segment);
  }, [onAttest, segment]);

  const buttonText = isLoading
    ? 'Signing...'
    : isAttesting
      ? 'Creating attestation...'
      : isWalletConnected
        ? 'Create Attestation'
        : 'Connect wallet';

  return (
    <div className={styles.item}>
      <div className={styles.info}>
        <div className={styles.header}>
          <span className={styles.icon}>{getActivityIcon(segment.activityType)}</span>
          <h4 className={styles.name}>{segment.name}</h4>
        </div>
        <div className={styles.meta}>
          <span>{formatDistance(segment.distance)}</span>
          {segment.completionDate ? (
            <>
              <span className={styles.separator}>•</span>
              <span>{formatSegmentDate(segment.completionDate)}</span>
            </>
          ) : null}
        </div>
      </div>

      <button
        className={styles.attestBtn}
        onClick={handleAttest}
        disabled={isLoading || isAttesting || isDisabled || !isWalletConnected}
      >
        {isLoading || isAttesting ? <span className={styles.spinner} /> : null}
        {buttonText}
      </button>
    </div>
  );
}

export default memo(SegmentItem);
