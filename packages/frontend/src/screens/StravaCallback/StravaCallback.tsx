import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { usePageMetadata } from '@/hooks/usePageMetadata';
import { useStravaAuth } from '@/hooks/useStravaAuth';
import { API_URL, BRAND, RETURN_PATHS, STORAGE_KEYS } from '@/utils/constants';
import Loader from '@/components/Loader/Loader';
import { buttonClassName } from '@/components/Button/Button';
import styles from './StravaCallback.module.css';

export default function StravaCallback(): React.JSX.Element {
  usePageMetadata({
    title: `Strava OAuth Callback | ${BRAND}`,
    description: `Private Strava OAuth callback for ${BRAND}.`,
    path: '/oauth',
    robots: 'noindex,nofollow',
  });

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuthFromCallback } = useStravaAuth();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // The state and the code are single use: do not run twice under StrictMode.
    if (started.current) return;
    started.current = true;

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const errorParam = searchParams.get('error');
    const expectedState = sessionStorage.getItem(STORAGE_KEYS.OAUTH_STATE);
    const savedPath = sessionStorage.getItem(STORAGE_KEYS.RETURN_PATH) ?? '/';
    const returnPath = RETURN_PATHS.includes(savedPath) ? savedPath : '/';

    sessionStorage.removeItem(STORAGE_KEYS.OAUTH_STATE);
    sessionStorage.removeItem(STORAGE_KEYS.RETURN_PATH);

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
        navigate(returnPath, { replace: true });
      } catch (err) {
        console.error('OAuth error:', err);
        setError('Could not finish sign-in.');
      }
    };

    exchangeCode();
  }, [searchParams, setAuthFromCallback, navigate]);

  if (error) {
    return (
      <main className={styles.main}>
        <h1 className={styles.title}>Sign-in failed</h1>
        <p className={styles.description}>{error}</p>
        <Link to="/" className={buttonClassName('primary')}>
          Back to home
        </Link>
      </main>
    );
  }

  return <Loader loading message="Signing in…" />;
}
