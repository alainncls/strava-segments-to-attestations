import React, { useState } from 'react';
import Header from '../../components/Header/Header';
import Footer from '../../components/Footer/Footer';
import Loader from '../../components/Loader/Loader';
import StravaLoginButton from '../../components/StravaLoginButton/StravaLoginButton';
import Activities from '../../components/Activities/Activities';
import SegmentsModal from '../../components/SegmentsModal/SegmentsModal';
import { useStravaAuth } from '@/hooks/useStravaAuth.ts';
import { useActivities } from '@/hooks/useActivities.ts';
import type { Activity } from '../../types';
import styles from './Home.module.css';

export default function Home(): React.JSX.Element {
  const {
    auth,
    isAuthenticated,
    refreshTokenIfNeeded,
    logout,
    isLoading: authLoading,
  } = useStravaAuth();

  const {
    activities,
    isLoading,
    isLoadingMore,
    loadingActivityId,
    hasMore,
    handleLoadMore,
    handleActivityClick,
  } = useActivities(isAuthenticated, refreshTokenIfNeeded);

  const [selectedActivity, setSelectedActivity] = useState<Activity | undefined>();
  const [showModal, setShowModal] = useState(false);

  const onActivityClick = async (activityId: number): Promise<void> => {
    const activity = await handleActivityClick(activityId);
    if (activity) {
      setSelectedActivity(activity);
      setShowModal(true);
    }
  };

  const handleModalHide = (): void => {
    setShowModal(false);
    setSelectedActivity(undefined);
  };

  if (authLoading) {
    return <Loader loading message="Loading..." />;
  }

  return (
    <>
      <Loader loading={isLoading} message="Fetching activities..." />

      <Header
        isStravaConnected={isAuthenticated}
        athleteName={auth.athlete?.firstname}
        onStravaLogout={logout}
      />

      <main className={styles.main}>
        <div className={styles.container}>
          {!isAuthenticated ? (
            <div className={styles.hero}>
              <h1 className={styles.title}>
                Create verifiable attestations for your
                <span className={styles.highlight}> Strava segments</span>
              </h1>
              <p className={styles.subtitle}>
                Connect your Strava account, select a segment you've completed, and create an
                onchain attestation on Linea using the Verax protocol.
              </p>
              <div className={styles.cta}>
                <StravaLoginButton />
              </div>
              <div className={styles.features}>
                <div className={styles.feature}>
                  <span className={styles.featureIcon}>🔐</span>
                  <span>Cryptographically verified</span>
                </div>
                <div className={styles.feature}>
                  <span className={styles.featureIcon}>⛓️</span>
                  <span>Onchain on Linea</span>
                </div>
                <div className={styles.feature}>
                  <span className={styles.featureIcon}>🏆</span>
                  <span>Prove your achievements</span>
                </div>
              </div>
            </div>
          ) : (
            <Activities
              activities={activities}
              onActivityClick={onActivityClick}
              loadingActivityId={loadingActivityId}
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
              onLoadMore={handleLoadMore}
            />
          )}
        </div>
      </main>

      <SegmentsModal
        activity={selectedActivity}
        displayModal={showModal}
        onHide={handleModalHide}
        accessToken={auth.accessToken || ''}
      />

      <Footer isStravaConnected={isAuthenticated} />
    </>
  );
}
