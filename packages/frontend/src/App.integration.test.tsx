import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { STORAGE_KEYS } from './utils/constants';

const openWalletMock = vi.fn();
const writeContractMock = vi.fn();
const resetWriteMock = vi.fn();

vi.mock('./hooks/useInsights', () => ({
  useInsights: vi.fn(),
}));

vi.mock('@reown/appkit/react', () => ({
  useAppKit: () => ({ open: openWalletMock }),
}));

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: undefined, chainId: 59144, isConnected: false }),
  useWaitForTransactionReceipt: () => ({ isLoading: false, isSuccess: false }),
  useWriteContract: () => ({
    data: undefined,
    isPending: false,
    reset: resetWriteMock,
    writeContract: writeContractMock,
  }),
}));

function renderRoute(route: string): void {
  render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App routing integration', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it('renders the unauthenticated home route', async () => {
    renderRoute('/');

    expect(
      await screen.findByRole('heading', { name: /create verifiable attestations/i }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: /connect wallet/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /connect with strava/i })).toBeVisible();
  });

  it('renders the about route', async () => {
    renderRoute('/about');

    expect(
      await screen.findByRole('heading', { name: /about segment attestations/i }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: /get started/i })).toBeVisible();
  });

  it('renders the OAuth error route when no code is present', async () => {
    renderRoute('/oauth');

    expect(await screen.findByRole('heading', { name: /authentication error/i })).toBeVisible();
    expect(screen.getByText(/invalid authorization state/i)).toBeVisible();
  });

  it('rejects an OAuth callback with mismatched state', async () => {
    sessionStorage.setItem(STORAGE_KEYS.OAUTH_STATE, 'expected-state');

    renderRoute('/oauth?code=test-code&state=wrong-state');

    expect(await screen.findByRole('heading', { name: /authentication error/i })).toBeVisible();
    expect(screen.getByText(/invalid authorization state/i)).toBeVisible();
  });
});
