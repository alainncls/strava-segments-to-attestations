import React from 'react';
import styles from './StravaLoginButton.module.css';
import connectWithStrava from '../../assets/btn_strava.svg';
import { STRAVA_AUTH_URL, STRAVA_CLIENT_ID, STRAVA_REDIRECT_URL } from '../../utils/constants';

export default function StravaLoginButton(): React.JSX.Element {
  const handleLogin = (): void => {
    const scope = 'read,activity:read_all';

    window.location.href = `${STRAVA_AUTH_URL}?client_id=${STRAVA_CLIENT_ID}&redirect_uri=${STRAVA_REDIRECT_URL}&response_type=code&scope=${scope}`;
  };

  return (
    <button onClick={handleLogin} className={styles.button}>
      <img src={connectWithStrava} alt="Connect with Strava" className={styles.image} />
    </button>
  );
}
