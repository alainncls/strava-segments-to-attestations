import React, { useState } from 'react';
import styles from './StravaLoginButton.module.css';
import connectWithStrava from '../../assets/btn_strava.svg';
import {
  API_URL,
  STORAGE_KEYS,
  STRAVA_AUTH_URL,
  STRAVA_CLIENT_ID,
  STRAVA_REDIRECT_URL,
} from '../../utils/constants';

export default function StravaLoginButton(): React.JSX.Element {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (): Promise<void> => {
    if (isLoading) {
      return;
    }

    setIsLoading(true);
    const scope = 'read,activity:read_all';

    try {
      const response = await fetch(`${API_URL}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'start' }),
      });

      if (!response.ok) {
        throw new Error('Failed to start OAuth flow');
      }

      const { state } = (await response.json()) as { state?: string };
      if (!state) {
        throw new Error('Missing OAuth state');
      }

      sessionStorage.setItem(STORAGE_KEYS.OAUTH_STATE, state);

      const params = new URLSearchParams({
        client_id: STRAVA_CLIENT_ID,
        redirect_uri: STRAVA_REDIRECT_URL,
        response_type: 'code',
        scope,
        state,
      });

      window.location.href = `${STRAVA_AUTH_URL}?${params.toString()}`;
    } catch (error) {
      console.error('Failed to start Strava OAuth:', error);
      setIsLoading(false);
    }
  };

  return (
    <button onClick={handleLogin} className={styles.button} disabled={isLoading}>
      <img
        src={connectWithStrava}
        alt="Connect with Strava"
        width="193"
        height="48"
        className={styles.image}
      />
    </button>
  );
}
