import React, { type ReactNode } from 'react';
import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { http } from 'viem';
import { linea, lineaSepolia } from '@reown/appkit/networks';
import type { AppKitNetwork } from '@reown/appkit/networks';
import {
  BRAND,
  INFURA_API_KEY,
  IS_WALLET_CONFIGURED,
  WALLETCONNECT_PROJECT_ID,
} from '@/utils/constants';
import { onThemeChange, resolvedTheme } from '@/utils/theme';

const queryClient = new QueryClient();
const projectId = WALLETCONNECT_PROJECT_ID;

const metadata = {
  name: BRAND,
  description: 'Activity heatmap and segment attestations for your Strava activities',
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

  const appKit = createAppKit({
    adapters: [wagmiAdapter],
    networks,
    defaultNetwork,
    projectId,
    metadata,
    themeMode: resolvedTheme(),
    themeVariables: {
      '--w3m-accent': getComputedStyle(document.documentElement)
        .getPropertyValue('--accent')
        .trim(),
      '--w3m-border-radius-master': '6px',
    },
    features: {
      analytics: false,
      onramp: false,
      socials: false,
      email: false,
    },
  });

  onThemeChange(() => appKit.setThemeMode(resolvedTheme()));
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
