import React, { Suspense, lazy } from 'react';
import type { Activity } from '@strava-attestations/shared';
import { Modal } from '@/components/Modal/Modal';
import { IS_WALLET_CONFIGURED } from '@/utils/constants';
import styles from './SegmentsModal.module.css';

interface SegmentsModalProps {
  activity?: Activity | undefined;
  displayModal: boolean;
  onHide: () => void;
  accessToken: string;
}

const SegmentsModalImpl = lazy(() => import('./SegmentsModalImpl'));

export default function SegmentsModal({
  activity,
  displayModal,
  onHide,
  accessToken,
}: SegmentsModalProps): React.JSX.Element {
  if (!displayModal) {
    return <></>;
  }

  const modalTitle = activity === undefined || activity.name === '' ? 'Segments' : activity.name;

  // Without the wallet configuration there is no wagmi provider: do not load the wallet code.
  if (!IS_WALLET_CONFIGURED) {
    return (
      <Modal show={displayModal} onHide={onHide} title={modalTitle} size="lg">
        <p className={styles.empty}>
          Attestations are not available: wallet configuration is missing.
        </p>
      </Modal>
    );
  }

  return (
    <Suspense
      fallback={
        <Modal show={displayModal} onHide={onHide} title={modalTitle} size="lg">
          <p className={styles.empty}>Loading segments…</p>
        </Modal>
      }
    >
      <SegmentsModalImpl
        activity={activity}
        displayModal={displayModal}
        onHide={onHide}
        accessToken={accessToken}
      />
    </Suspense>
  );
}
