import React from 'react';
import { Link } from 'react-router-dom';
import StravaLoginButton from '@/components/StravaLoginButton/StravaLoginButton';
import { useStravaAuth } from '@/hooks/useStravaAuth';
import { SITE_URL, usePageMetadata } from '@/hooks/usePageMetadata';
import { BRAND } from '@/utils/constants';
import styles from './Hub.module.css';

const DESCRIPTION =
  'Effortprint turns your Strava activities into a yearly activity heatmap, and your completed Strava segments into onchain attestations on Linea.';

const TOOLS = [
  {
    to: '/heatmap',
    name: 'Activity heatmap',
    text: 'One colored cell for each day of each year. Filter by sport, set the colors, export an image.',
  },
  {
    to: '/attestations',
    name: 'Segment Attestations',
    text: 'Turn a segment you completed into a Verax attestation on Linea that anyone can verify.',
  },
];

export default function Hub(): React.JSX.Element {
  usePageMetadata({
    title: `${BRAND} | Strava activity heatmap and segment attestations`,
    description: DESCRIPTION,
    path: '/',
    schema: {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: BRAND,
      url: `${SITE_URL}/`,
      applicationCategory: 'SportsApplication',
      operatingSystem: 'Web',
      description: DESCRIPTION,
      creator: { '@type': 'Person', name: 'alain.linea.eth', url: 'https://alainnicolas.com' },
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
  });
  const { isAuthenticated } = useStravaAuth();

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Your efforts, in print</h1>
      <p className={styles.lead}>
        Two tools for your Strava activities. Your activity data stays in your browser.
      </p>
      {isAuthenticated ? null : <StravaLoginButton />}

      <ul className={styles.tools}>
        {TOOLS.map((tool) => (
          <li key={tool.to}>
            <Link to={tool.to} className={styles.card}>
              <h2>{tool.name}</h2>
              <p>{tool.text}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
