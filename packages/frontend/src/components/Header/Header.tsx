import React, { Suspense, lazy, useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { IS_WALLET_CONFIGURED } from '@/utils/constants.ts';
import { buttonClassName } from '../Button/Button';
import styles from './Header.module.css';
import logoEthOrange from '../../assets/logo-eth-orange.svg';

const WalletConnectButton = lazy(() => import('../Wallet/WalletConnectButton'));

interface HeaderProps {
  isStravaConnected: boolean;
  athleteName?: string;
  onStravaLogout?: () => void;
}

const walletButtonClass = buttonClassName('secondary');

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
    return (
      <button className={walletButtonClass} disabled title="Wallet configuration is missing">
        Connect wallet
      </button>
    );
  }

  if (!isWalletEnabled) {
    return (
      <button onClick={handleEnableWallet} className={walletButtonClass}>
        Connect wallet
      </button>
    );
  }

  return (
    <Suspense
      fallback={
        <button className={walletButtonClass} disabled>
          Loading…
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
  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <Link to="/" className={styles.logo}>
          <img src={logoEthOrange} alt="" width="24" height="24" />
          <span>Segment Attestations</span>
        </Link>

        <nav className={styles.nav}>
          <Link to="/about" className={styles.navLink}>
            About
          </Link>

          {isStravaConnected && athleteName ? (
            <span className={styles.athlete}>
              {athleteName}
              {onStravaLogout ? (
                <button onClick={onStravaLogout} className={styles.logout}>
                  Log out
                </button>
              ) : null}
            </span>
          ) : null}

          <WalletButtonGate />
        </nav>
      </div>
    </header>
  );
}
