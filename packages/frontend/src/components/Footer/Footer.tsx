import React from 'react';
import styles from './Footer.module.css';
import poweredByStrava from '../../assets/powered-by-strava.svg';
import githubIcon from '../../assets/github-icon.svg';
import xIcon from '../../assets/x-icon.svg';
import veraxLogo from '../../assets/verax-logo.svg';

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
            className={styles.iconLink}
            aria-label="GitHub repository"
          >
            <img src={githubIcon} alt="" className={`${styles.icon} ${styles.darkIcon}`} />
            <span className={styles.srOnly}>GitHub</span>
          </a>
          <a
            href="https://x.com/Alain_Ncls"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.iconLink}
            aria-label="X profile"
          >
            <img src={xIcon} alt="" className={`${styles.icon} ${styles.darkIcon}`} />
            <span className={styles.srOnly}>X</span>
          </a>
          <a
            href="https://explorer.ver.ax"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.iconLink}
            aria-label="Verax Explorer"
          >
            <img src={veraxLogo} alt="" className={styles.icon} />
            <span className={styles.srOnly}>Verax Explorer</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
