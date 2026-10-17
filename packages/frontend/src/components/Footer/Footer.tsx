import React from 'react';
import styles from './Footer.module.css';
import poweredByStrava from '../../assets/powered-by-strava.svg';
import githubIcon from '../../assets/github-icon.svg';
import xIcon from '../../assets/x-icon.svg';
import veraxLogo from '../../assets/verax-logo.svg';

const links = [
  {
    href: 'https://github.com/alainncls/strava-segments-to-attestations',
    label: 'GitHub',
    icon: githubIcon,
    invert: true,
  },
  { href: 'https://x.com/Alain_Ncls', label: 'X', icon: xIcon, invert: true },
  { href: 'https://explorer.ver.ax', label: 'Verax Explorer', icon: veraxLogo, invert: false },
];

export default function Footer(): React.JSX.Element {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <p className={styles.credit}>
          By{' '}
          <a href="https://alainnicolas.com" target="_blank" rel="noopener noreferrer">
            alain.linea.eth
          </a>
        </p>

        <a href="https://www.strava.com" target="_blank" rel="noopener noreferrer">
          <img
            src={poweredByStrava}
            alt="Powered by Strava"
            width="300"
            height="56"
            className={styles.strava}
          />
        </a>

        <ul className={styles.links}>
          {links.map(({ href, label, icon, invert }) => (
            <li key={href}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.iconLink}
                aria-label={label}
                title={label}
              >
                <img
                  src={icon}
                  alt=""
                  width="18"
                  height="18"
                  className={invert ? styles.invert : undefined}
                />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
