import React from 'react';
import { Link } from 'react-router-dom';
import { useAppKit } from '@reown/appkit/react';
import { useAccount } from 'wagmi';
import styles from './Header.module.css';

interface HeaderProps {
  isStravaConnected: boolean;
  athleteName?: string;
  onStravaLogout?: () => void;
}

export default function Header({
  isStravaConnected,
  athleteName,
  onStravaLogout,
}: HeaderProps): React.JSX.Element {
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();

  const formatAddress = (addr: string): string => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <Link to="/" className={styles.logo}>
          <span className={styles.logoIcon}>🏃</span>
          <span className={styles.logoText}>Segment Attestations</span>
        </Link>

        <nav className={styles.nav}>
          <Link to="/about" className={styles.navLink}>
            About
          </Link>

          {isStravaConnected && athleteName && (
            <div className={styles.stravaStatus}>
              <span className={styles.statusDot} />
              <span className={styles.athleteName}>{athleteName}</span>
              {onStravaLogout && (
                <button onClick={onStravaLogout} className={styles.logoutBtn}>
                  Logout
                </button>
              )}
            </div>
          )}

          <button onClick={() => open()} className={styles.walletBtn}>
            {isConnected && address ? (
              <>
                <span className={styles.walletDot} />
                {formatAddress(address)}
              </>
            ) : (
              'Connect Wallet'
            )}
          </button>
        </nav>
      </div>
    </header>
  );
}
