import React, { Suspense, lazy } from 'react';
import type { Activity } from '../../types';
import { Modal } from '../Modal/Modal';
import styles from './SegmentsModal.module.css';

interface SegmentsModalProps {
  activity?: Activity;
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

  const modalTitle = activity?.name || 'Segments';

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
