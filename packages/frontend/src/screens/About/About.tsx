import React from 'react';
import { Link } from 'react-router-dom';
import Header from '../../components/Header/Header';
import Footer from '../../components/Footer/Footer';
import { buttonClassName } from '../../components/Button/Button';
import { SITE_URL, usePageMetadata } from '@/hooks/usePageMetadata.ts';
import styles from './About.module.css';

export default function About(): React.JSX.Element {
  usePageMetadata({
    title: 'About Segment Attestations | Strava Segment Attestations',
    description:
      'Learn how Segment Attestations verifies completed Strava segments with OAuth, Verax attestations, and Linea onchain proofs.',
    path: '/about',
    schema: {
      '@context': 'https://schema.org',
      '@type': 'AboutPage',
      name: 'About Segment Attestations',
      url: `${SITE_URL}/about`,
      description:
        'Learn how Segment Attestations verifies completed Strava segments with OAuth, Verax attestations, and Linea onchain proofs.',
      isPartOf: {
        '@type': 'WebSite',
        name: 'Strava Segment Attestations',
        url: `${SITE_URL}/`,
      },
    },
  });

  return (
    <>
      <Header isStravaConnected={false} />

      <main className={styles.main}>
        <h1 className={styles.title}>About Segment Attestations</h1>

        <section className={styles.section}>
          <p className={styles.lead}>
            Segment Attestations turns a Strava segment you completed into an onchain attestation.
            It uses the{' '}
            <a href="https://ver.ax" target="_blank" rel="noopener noreferrer">
              Verax
            </a>{' '}
            protocol on Linea, so any app can verify it.
          </p>
        </section>

        <section className={styles.section}>
          <h2>How it works</h2>
          <ol className={styles.steps}>
            <li>
              <strong>Connect Strava.</strong> OAuth gives read access to your activities.
            </li>
            <li>
              <strong>Pick a segment.</strong> Choose one from a recent activity.
            </li>
            <li>
              <strong>Get it signed.</strong> The backend checks your effort and signs the data.
            </li>
            <li>
              <strong>Attest.</strong> Your wallet records the attestation on Linea.
            </li>
          </ol>
        </section>

        <section className={styles.section}>
          <h2>Why attestations</h2>
          <p>Attestations are small, standard proofs that other apps can read. Use them to:</p>
          <ul className={styles.list}>
            <li>Prove an achievement</li>
            <li>Keep a verifiable training record</li>
            <li>Qualify for events or challenges</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Stack</h2>
          <dl className={styles.stack}>
            <dt>Verax</dt>
            <dd>Attestation registry</dd>
            <dt>Linea</dt>
            <dd>Ethereum L2 with low fees</dd>
            <dt>Strava API</dt>
            <dd>Activities and segments</dd>
            <dt>EIP-712</dt>
            <dd>Typed data signatures</dd>
          </dl>
        </section>

        <Link to="/" className={buttonClassName('primary')}>
          Get started
        </Link>
      </main>

      <Footer />
    </>
  );
}
