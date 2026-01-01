import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppKit } from '@reown/appkit/react';
import { useAccount } from 'wagmi';
import styles from './Header.module.css';
import logoEthOrange from '../../assets/logo-eth-orange.svg';

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
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = (): void => {
      setIsScrolled(window.scrollY > 20);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const formatAddress = (addr: string): string => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <header className={`${styles.header} ${isScrolled ? styles.scrolled : ''}`}>
      <div className={styles.container}>
        <Link to="/" className={styles.logo}>
          <img src={logoEthOrange} alt="Segment Attestations logo" className={styles.logoIcon} />
          <span className={styles.logoText}>Segment Attestations</span>
        </Link>

        <nav className={styles.nav}>
          {!isStravaConnected && (
            <Link to="/about" className={`${styles.navLink} ${styles.navLinkCta}`}>
              About
            </Link>
          )}

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
