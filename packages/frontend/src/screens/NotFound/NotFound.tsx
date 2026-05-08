import React from 'react';
import { Link } from 'react-router-dom';
import Header from '../../components/Header/Header';
import Footer from '../../components/Footer/Footer';
import { usePageMetadata } from '@/hooks/usePageMetadata.ts';
import styles from './NotFound.module.css';

export default function NotFound(): React.JSX.Element {
  usePageMetadata({
    title: 'Page Not Found | Strava Segment Attestations',
    description: 'The requested Segment Attestations page could not be found.',
    path: '/404',
    robots: 'noindex,nofollow',
  });

  return (
    <>
      <Header isStravaConnected={false} />
      <main className={styles.main}>
        <div className={styles.content}>
          <h1 className={styles.title}>Page not found</h1>
          <p className={styles.description}>This page does not exist or has moved.</p>
          <Link to="/" className={styles.button}>
            Back to home
          </Link>
        </div>
      </main>
      <Footer isStravaConnected={false} />
    </>
  );
}
