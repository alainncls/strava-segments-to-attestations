import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { usePageMetadata } from '@/hooks/usePageMetadata.ts';
import { useStravaAuth } from '@/hooks/useStravaAuth.ts';
import { API_URL, STORAGE_KEYS } from '@/utils/constants.ts';
import Loader from '../../components/Loader/Loader';
import Header from '../../components/Header/Header';
import Footer from '../../components/Footer/Footer';
import { buttonClassName } from '../../components/Button/Button';
import styles from './StravaCallback.module.css';

export default function StravaCallback(): React.JSX.Element {
  usePageMetadata({
    title: 'Strava OAuth Callback | Strava Segment Attestations',
    description: 'Private Strava OAuth callback for Segment Attestations.',
    path: '/oauth',
    robots: 'noindex,nofollow',
  });

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuthFromCallback } = useStravaAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const errorParam = searchParams.get('error');
    const expectedState = sessionStorage.getItem(STORAGE_KEYS.OAUTH_STATE);

    sessionStorage.removeItem(STORAGE_KEYS.OAUTH_STATE);

    if (errorParam) {
      setError('Strava access was denied.');
      return;
    }

    if (!state || !expectedState || state !== expectedState) {
      setError('Invalid authorization state.');
      return;
    }

    if (!code) {
      setError('No authorization code received.');
      return;
    }

    const exchangeCode = async (): Promise<void> => {
      try {
        const response = await fetch(`${API_URL}/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ code, state }),
        });

        if (!response.ok) {
          setError('Could not finish sign-in.');
          return;
        }

        const data = await response.json();
        setAuthFromCallback(data);
        navigate('/');
      } catch (err) {
        console.error('OAuth error:', err);
        setError('Could not finish sign-in.');
      }
    };

    exchangeCode();
  }, [searchParams, setAuthFromCallback, navigate]);

  if (error) {
    return (
      <>
        <Header isStravaConnected={false} />
        <main className={styles.main}>
          <h1 className={styles.title}>Sign-in failed</h1>
          <p className={styles.description}>{error}</p>
          <Link to="/" className={buttonClassName('primary')}>
            Back to home
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  return <Loader loading message="Signing in…" />;
}
