import React, { useEffect, useRef } from 'react';
import { useAppKit } from '@reown/appkit/react';
import { useConnection } from 'wagmi';
import { Web3Provider } from './Web3Provider';
import { buttonClassName } from '@/components/Button/buttonClassName';
import styles from '@/components/Header/Header.module.css';

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
  const { address, isConnected } = useConnection();
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
    <button onClick={() => void open()} className={buttonClassName('secondary')}>
      {isConnected && address ? (
        <>
          <span className={styles.walletDot} />
          {formatAddress(address)}
        </>
      ) : (
        'Connect wallet'
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
