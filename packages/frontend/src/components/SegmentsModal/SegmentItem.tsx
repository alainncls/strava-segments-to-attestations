import React, { memo, useCallback } from 'react';
import type { Segment } from '../../types';
import { formatDate, formatDistance } from '@/utils/format.ts';
import { Button } from '../Button/Button';
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

  const isBusy = isLoading || isAttesting;
  const buttonText = isLoading ? 'Signing…' : isAttesting ? 'Attesting…' : 'Attest';

  return (
    <li className={styles.item}>
      <div className={styles.info}>
        <h3 className={styles.name}>{segment.name}</h3>
        <p className={styles.meta}>
          <span>{formatDistance(segment.distance)}</span>
          {segment.completionDate ? <span>{formatDate(segment.completionDate)}</span> : null}
        </p>
      </div>

      <Button
        variant="primary"
        className={styles.attest}
        onClick={handleAttest}
        disabled={isBusy || isDisabled || !isWalletConnected}
        aria-busy={isBusy}
      >
        {isBusy ? <span className={styles.spinner} aria-hidden="true" /> : null}
        {buttonText}
      </Button>
    </li>
  );
}

export default memo(SegmentItem);
