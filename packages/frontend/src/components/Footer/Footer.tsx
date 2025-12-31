import React from 'react';
import styles from './Footer.module.css';
import poweredByStrava from '../../assets/powered-by-strava.svg';

export default function Footer(): React.JSX.Element {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.left}>
          <p className={styles.copyright}>
            Built with ❤️ by{' '}
            <a
              href="https://alainnicolas.com"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.link}
            >
              alain.linea.eth
            </a>
          </p>
        </div>

        <div className={styles.center}>
          <a
            href="https://www.strava.com"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.stravaLink}
          >
            <img src={poweredByStrava} alt="Powered by Strava" className={styles.stravaLogo} />
          </a>
        </div>

        <div className={styles.right}>
          <a
            href="https://github.com/alainncls/strava-segments-to-attestations"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            GitHub
          </a>
          <span className={styles.separator}>•</span>
          <a
            href="https://explorer.ver.ax"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            Verax Explorer
          </a>
        </div>
      </div>
    </footer>
  );
}
