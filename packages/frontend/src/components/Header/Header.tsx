import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { IS_WALLET_CONFIGURED } from '@/utils/constants.ts';
import styles from './Header.module.css';
import logoEthOrange from '../../assets/logo-eth-orange.svg';

const WalletConnectButton = lazy(() => import('../Wallet/WalletConnectButton'));

interface HeaderProps {
  isStravaConnected: boolean;
  athleteName?: string;
  onStravaLogout?: () => void;
}

function WalletUnavailableButton(): React.JSX.Element {
  return (
    <button className={styles.walletBtn} disabled title="Wallet configuration is missing">
      Connect Wallet
    </button>
  );
}

function WalletButtonGate(): React.JSX.Element {
  const [isWalletEnabled, setIsWalletEnabled] = useState(false);
  const [shouldAutoOpen, setShouldAutoOpen] = useState(false);

  const handleEnableWallet = useCallback((): void => {
    setShouldAutoOpen(true);
    setIsWalletEnabled(true);
  }, []);

  const handleAutoOpenHandled = useCallback((): void => {
    setShouldAutoOpen(false);
  }, []);

  if (!IS_WALLET_CONFIGURED) {
    return <WalletUnavailableButton />;
  }

  if (!isWalletEnabled) {
    return (
      <button onClick={handleEnableWallet} className={styles.walletBtn}>
        Connect Wallet
      </button>
    );
  }

  return (
    <Suspense
      fallback={
        <button className={styles.walletBtn} disabled>
          Loading wallet...
        </button>
      }
    >
      <WalletConnectButton autoOpen={shouldAutoOpen} onAutoOpenHandled={handleAutoOpenHandled} />
    </Suspense>
  );
}

export default function Header({
  isStravaConnected,
  athleteName,
  onStravaLogout,
}: HeaderProps): React.JSX.Element {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    let frameId: number | null = null;

    const handleScroll = (): void => {
      if (frameId !== null) {
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        const nextIsScrolled = window.scrollY > 20;
        setIsScrolled((currentIsScrolled) =>
          currentIsScrolled === nextIsScrolled ? currentIsScrolled : nextIsScrolled,
        );
      });
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <header className={`${styles.header} ${isScrolled ? styles.scrolled : ''}`}>
      <div className={styles.container}>
        <Link to="/" className={styles.logo}>
          <img
            src={logoEthOrange}
            alt="Segment Attestations logo"
            width="32"
            height="32"
            className={styles.logoIcon}
          />
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

          <WalletButtonGate />
        </nav>
      </div>
    </header>
  );
}
