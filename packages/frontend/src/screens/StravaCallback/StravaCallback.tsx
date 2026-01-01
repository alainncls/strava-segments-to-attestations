import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStravaAuth } from '@/hooks/useStravaAuth.ts';
import { API_URL } from '@/utils/constants.ts';
import Loader from '../../components/Loader/Loader';
import Footer from '../../components/Footer/Footer';
import styles from './StravaCallback.module.css';

export default function StravaCallback(): React.JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuthFromCallback } = useStravaAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setError('Authorization was denied. Please try again.');
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
          body: JSON.stringify({ code }),
        });

        if (!response.ok) {
          setError('Failed to exchange authorization code');
          return;
        }

        const data = await response.json();
        setAuthFromCallback(data);
        navigate('/');
      } catch (err) {
        console.error('OAuth error:', err);
        setError('Failed to complete authentication. Please try again.');
      }
    };

    exchangeCode();
  }, [searchParams, setAuthFromCallback, navigate]);

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <span className={styles.errorIcon}>❌</span>
          <h2>Authentication Error</h2>
          <p>{error}</p>
          <button onClick={() => navigate('/')} className={styles.button}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Loader loading message="Completing authentication..." />
      <Footer isStravaConnected={false} />
    </div>
  );
}
