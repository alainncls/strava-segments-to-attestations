import React from 'react';
import styles from './Footer.module.css';
import poweredByStrava from '@/assets/powered-by-strava.svg';
import githubIcon from '@/assets/github-icon.svg';
import xIcon from '@/assets/x-icon.svg';
import veraxLogo from '@/assets/verax-logo.svg';

const links = [
  {
    href: 'https://github.com/alainncls/strava-segments-to-attestations',
    label: 'GitHub',
    icon: githubIcon,
  },
  { href: 'https://x.com/Alain_Ncls', label: 'X', icon: xIcon },
  { href: 'https://explorer.ver.ax', label: 'Verax Explorer', icon: veraxLogo },
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
          <span
            role="img"
            aria-label="Powered by Strava"
            className={`${String(styles.mask)} ${String(styles.strava)}`}
            style={{ maskImage: `url("${poweredByStrava}")` }}
          />
        </a>

        <ul className={styles.links}>
          {links.map(({ href, label, icon }) => (
            <li key={href}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.iconLink}
                aria-label={label}
                title={label}
              >
                <span
                  className={`${String(styles.mask)} ${String(styles.icon)}`}
                  style={{ maskImage: `url("${icon}")` }}
                />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
