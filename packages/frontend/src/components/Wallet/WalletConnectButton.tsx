import React, { useEffect, useRef } from 'react';
import { useAppKit } from '@reown/appkit/react';
import { useAccount } from 'wagmi';
import { Web3Provider } from './Web3Provider';
import styles from '../Header/Header.module.css';

interface WalletConnectButtonProps {
  autoOpen?: boolean;
  onAutoOpenHandled?: () => void;
}

function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function WalletConnectButtonInner({
  autoOpen = false,
  onAutoOpenHandled,
}: WalletConnectButtonProps): React.JSX.Element {
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();
  const didAutoOpen = useRef(false);

  useEffect(() => {
    if (!autoOpen || didAutoOpen.current) {
      return;
    }

    didAutoOpen.current = true;
    void open();
    onAutoOpenHandled?.();
  }, [autoOpen, onAutoOpenHandled, open]);

  return (
    <button onClick={() => void open()} className={styles.walletBtn}>
      {isConnected && address ? (
        <>
          <span className={styles.walletDot} />
          {formatAddress(address)}
        </>
      ) : (
        'Connect Wallet'
      )}
    </button>
  );
}

export default function WalletConnectButton(props: WalletConnectButtonProps): React.JSX.Element {
  return (
    <Web3Provider>
      <WalletConnectButtonInner {...props} />
    </Web3Provider>
  );
}
