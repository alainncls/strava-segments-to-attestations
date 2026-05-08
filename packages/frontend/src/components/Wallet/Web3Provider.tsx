import React, { type ReactNode } from 'react';
import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { http } from 'viem';
import { linea, lineaSepolia } from '@reown/appkit/networks';
import type { AppKitNetwork } from '@reown/appkit/networks';
import { WALLETCONNECT_PROJECT_ID, INFURA_API_KEY, IS_WALLET_CONFIGURED } from '@/utils/constants';

const queryClient = new QueryClient();
const projectId = WALLETCONNECT_PROJECT_ID;

const metadata = {
  name: 'Strava Segment Attestations',
  description: 'Create verifiable attestations for your Strava segments',
  url: 'https://strava.alainnicolas.fr',
  icons: ['https://strava.alainnicolas.fr/favicon-dark.png'],
};

const isDev = import.meta.env.DEV;
const defaultNetwork = isDev ? lineaSepolia : linea;
const networks: [AppKitNetwork, ...AppKitNetwork[]] = isDev
  ? [lineaSepolia, linea]
  : [linea, lineaSepolia];

const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks,
  transports: {
    [linea.id]: http(
      INFURA_API_KEY ? `https://linea-mainnet.infura.io/v3/${INFURA_API_KEY}` : undefined,
    ),
    [lineaSepolia.id]: http(
      INFURA_API_KEY ? `https://linea-sepolia.infura.io/v3/${INFURA_API_KEY}` : undefined,
    ),
  },
});

let appKitInitialized = false;

function initializeAppKit(): void {
  if (!IS_WALLET_CONFIGURED || appKitInitialized) {
    return;
  }

  createAppKit({
    adapters: [wagmiAdapter],
    networks,
    defaultNetwork,
    projectId,
    metadata,
    themeMode: 'dark',
    themeVariables: {
      '--w3m-accent': '#ff6b1a',
      '--w3m-color-mix': '#111216',
      '--w3m-color-mix-strength': 0,
      '--w3m-border-radius-master': '14px',
    },
    features: {
      analytics: false,
      onramp: false,
      socials: false,
      email: false,
    },
  });

  appKitInitialized = true;
}

interface Web3ProviderProps {
  children: ReactNode;
}

export function Web3Provider({ children }: Web3ProviderProps): React.JSX.Element {
  initializeAppKit();

  if (!IS_WALLET_CONFIGURED) {
    return <>{children}</>;
  }

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
