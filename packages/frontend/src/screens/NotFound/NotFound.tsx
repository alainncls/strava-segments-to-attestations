import React from 'react';
import { Link } from 'react-router-dom';
import { buttonClassName } from '@/components/Button/buttonClassName';
import { usePageMetadata } from '@/hooks/usePageMetadata';
import { BRAND } from '@/utils/constants';
import styles from './NotFound.module.css';

export default function NotFound(): React.JSX.Element {
  usePageMetadata({
    title: `Page Not Found | ${BRAND}`,
    description: `The requested ${BRAND} page could not be found.`,
    path: '/404',
    robots: 'noindex,nofollow',
  });

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Page not found</h1>
      <p className={styles.description}>This page does not exist or has moved.</p>
      <Link to="/" className={buttonClassName('primary')}>
        Back to home
      </Link>
    </main>
  );
}
