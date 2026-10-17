import React, { useCallback, useState } from 'react';
import Header from '../../components/Header/Header';
import Footer from '../../components/Footer/Footer';
import Loader from '../../components/Loader/Loader';
import StravaLoginButton from '../../components/StravaLoginButton/StravaLoginButton';
import Activities from '../../components/Activities/Activities';
import SegmentsModal from '../../components/SegmentsModal/SegmentsModal';
import { useStravaAuth } from '@/hooks/useStravaAuth.ts';
import { useActivities } from '@/hooks/useActivities.ts';
import { SITE_URL, usePageMetadata } from '@/hooks/usePageMetadata.ts';
import type { Activity } from '../../types';
import styles from './Home.module.css';

export default function Home(): React.JSX.Element {
  usePageMetadata({
    title: 'Strava Segment Attestations | Onchain Segment Proofs',
    description:
      'Create verifiable onchain attestations for completed Strava segments on Linea with Verax. Connect Strava, choose a segment, and prove your achievement.',
    path: '/',
    schema: {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Strava Segment Attestations',
      url: `${SITE_URL}/`,
      applicationCategory: 'SportsApplication',
      operatingSystem: 'Web',
      description:
        'Create verifiable onchain attestations for completed Strava segments on Linea with Verax.',
      creator: {
        '@type': 'Person',
        name: 'alain.linea.eth',
        url: 'https://alainnicolas.com',
      },
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
    },
  });

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
    activitiesError,
    isRetryBlocked,
    isAuthenticationError,
    segmentErrors,
    loadingActivityId,
    hasMore,
    handleLoadMore,
    handleActivityClick,
  } = useActivities(isAuthenticated, refreshTokenIfNeeded, auth.athlete?.id);

  const [selectedActivity, setSelectedActivity] = useState<Activity | undefined>();
  const [showModal, setShowModal] = useState(false);

  const onActivityClick = useCallback(
    async (activityId: number): Promise<void> => {
      const activity = await handleActivityClick(activityId);
      if (activity) {
        setSelectedActivity(activity);
        setShowModal(true);
      }
    },
    [handleActivityClick],
  );

  const handleModalHide = useCallback((): void => {
    setShowModal(false);
    setSelectedActivity(undefined);
  }, []);

  if (authLoading) {
    return <Loader loading message="Loading…" />;
  }

  return (
    <>
      <Loader loading={isLoading} message="Loading activities…" />

      <Header
        isStravaConnected={isAuthenticated}
        athleteName={auth.athlete?.firstname}
        onStravaLogout={logout}
      />

      <main className={styles.main}>
        {!isAuthenticated ? (
          <section className={styles.hero}>
            <div className={styles.pitch}>
              <h1 className={styles.title}>Prove your Strava segments onchain</h1>
              <p className={styles.lead}>
                Turn a segment you completed into a Verax attestation on Linea. Anyone can verify
                it.
              </p>
              <StravaLoginButton />
            </div>
            <ol className={styles.steps}>
              <li>
                <strong>Connect Strava</strong>
                <span>Read-only access to your activities.</span>
              </li>
              <li>
                <strong>Pick a segment</strong>
                <span>From one of your recent activities.</span>
              </li>
              <li>
                <strong>Attest</strong>
                <span>Signed by the backend, recorded on Linea.</span>
              </li>
            </ol>
          </section>
        ) : (
          <Activities
            activities={activities}
            onActivityClick={onActivityClick}
            loadingActivityId={loadingActivityId}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            activitiesError={activitiesError}
            isRetryBlocked={isRetryBlocked}
            isAuthenticationError={isAuthenticationError}
            segmentErrors={segmentErrors}
            onLoadMore={handleLoadMore}
          />
        )}
      </main>

      <SegmentsModal
        activity={selectedActivity}
        displayModal={showModal}
        onHide={handleModalHide}
        accessToken={auth.accessToken || ''}
      />

      <Footer />
    </>
  );
}
