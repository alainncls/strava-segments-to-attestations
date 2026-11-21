import React from 'react';
import { Link } from 'react-router-dom';
import { buttonClassName } from '@/components/Button/Button';
import { SITE_URL, usePageMetadata } from '@/hooks/usePageMetadata';
import { BRAND } from '@/utils/constants';
import styles from './About.module.css';

export default function About(): React.JSX.Element {
  usePageMetadata({
    title: `About | ${BRAND}`,
    description:
      'Learn how Effortprint draws your Strava activity heatmap in your browser, creates Verax attestations for completed segments on Linea, and handles your data.',
    path: '/about',
    schema: {
      '@context': 'https://schema.org',
      '@type': 'AboutPage',
      name: `About ${BRAND}`,
      url: `${SITE_URL}/about`,
      description:
        'Learn how Effortprint draws your Strava activity heatmap in your browser, creates Verax attestations for completed segments on Linea, and handles your data.',
      isPartOf: {
        '@type': 'WebSite',
        name: BRAND,
        url: `${SITE_URL}/`,
      },
    },
  });

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>About {BRAND}</h1>

      <section className={styles.section}>
        <p className={styles.lead}>
          {BRAND} has two tools for your Strava activities. It is not a Strava product.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Activity heatmap</h2>
        <p>
          The heatmap shows one colored cell for each day of each year, from the distance or the
          duration of your activities. You can filter by sport, change the thresholds and the
          colors, and export a PNG or SVG image.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Segment Attestations</h2>
        <p>
          Segment Attestations turns a Strava segment you completed into an onchain attestation. It
          uses the{' '}
          <a href="https://ver.ax" target="_blank" rel="noopener noreferrer">
            Verax
          </a>{' '}
          protocol on Linea, so any app can verify it.
        </p>
      </section>

      <section className={styles.section}>
        <h2>How an attestation works</h2>
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

      <section className={styles.section} id="privacy">
        <h2>Privacy and your data</h2>
        <ul className={styles.list}>
          <li>
            {BRAND} reads your Strava profile and your activities (scope{' '}
            <code>read,activity:read_all</code>). It does not change your Strava data.
          </li>
          <li>
            The heatmap keeps your activities in the local storage of this browser for 7 days at
            most. No server stores them. Your access token stays in this browser tab for about 6
            hours.
          </li>
          <li>
            For an attestation, the signing function reads the activity on Strava with your access
            token and stores no activity data. The attestation (your wallet address, the segment ID
            and the completion date) is public on Linea.
          </li>
          <li>
            To delete the local data, log out. To remove the access, revoke {BRAND} in the{' '}
            <a
              href="https://www.strava.com/settings/apps"
              target="_blank"
              rel="noopener noreferrer"
            >
              Strava settings
            </a>
            .
          </li>
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
  );
}
