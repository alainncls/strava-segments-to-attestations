import React, { type ReactNode } from 'react';
import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { http } from 'viem';
import { linea, lineaSepolia } from '@reown/appkit/networks';
import type { AppKitNetwork } from '@reown/appkit/networks';
import { WALLETCONNECT_PROJECT_ID, INFURA_API_KEY } from './utils/constants';

const queryClient = new QueryClient();

const projectId = WALLETCONNECT_PROJECT_ID;

const metadata = {
  name: 'Strava Segment Attestations',
  description: 'Create verifiable attestations for your Strava segments',
  url: 'https://strava.alainnicolas.fr',
  icons: ['https://strava.alainnicolas.fr/favicon-dark.png'],
};

// Default network based on environment:
// - Development: Linea Sepolia (testnet)
// - Production: Linea Mainnet
const isDev = import.meta.env.DEV;
const defaultNetwork = isDev ? lineaSepolia : linea;
const networks: [AppKitNetwork, ...AppKitNetwork[]] = isDev
  ? [lineaSepolia, linea]
  : [linea, lineaSepolia];

const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks,
  transports: {
    [linea.id]: http(`https://linea-mainnet.infura.io/v3/${INFURA_API_KEY}`),
    [lineaSepolia.id]: http(`https://linea-sepolia.infura.io/v3/${INFURA_API_KEY}`),
  },
});

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  defaultNetwork,
  projectId,
  metadata,
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#fc5200',
    '--w3m-color-mix': '#fc5200',
    '--w3m-color-mix-strength': 20,
  },
  features: {
    analytics: false,
    onramp: false,
  },
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;

interface Web3ModalProviderProps {
  children: ReactNode;
}

export function Web3ModalProvider({ children }: Web3ModalProviderProps): React.JSX.Element {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
