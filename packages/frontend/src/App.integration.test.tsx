import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { STORAGE_KEYS } from '@/utils/constants';

const openWalletMock = vi.fn();
const writeContractMock = vi.fn();
const resetWriteMock = vi.fn();

vi.mock('@/hooks/useInsights', () => ({
  useInsights: vi.fn(),
}));

vi.mock('@reown/appkit/react', () => ({
  useAppKit: () => ({ open: openWalletMock }),
}));

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: undefined, chainId: 59144, isConnected: false }),
  useReadContract: () => ({ data: 100000000000000n }),
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

  it('renders the hub with the two tools and no wallet button', async () => {
    renderRoute('/');

    expect(await screen.findByRole('heading', { name: /your efforts, in print/i })).toBeVisible();
    expect(screen.getByRole('link', { name: /activity heatmap/i })).toHaveAttribute(
      'href',
      '/heatmap',
    );
    expect(screen.getByRole('link', { name: /^segment attestations turn/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /connect with strava/i })).toBeVisible();
    expect(screen.queryByRole('button', { name: /connect wallet/i })).not.toBeInTheDocument();
  });

  it('renders the attestation flow with the wallet button', async () => {
    renderRoute('/attestations');

    expect(
      await screen.findByRole('heading', { name: /prove your strava segments onchain/i }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: /connect wallet/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /connect with strava/i })).toBeVisible();
  });

  it('renders the about route', async () => {
    renderRoute('/about');

    expect(await screen.findByRole('heading', { name: /about effortprint/i })).toBeVisible();
    expect(screen.getByRole('link', { name: /get started/i })).toBeVisible();
    expect(screen.getByRole('heading', { name: /privacy and your data/i })).toBeVisible();
  });

  it('shows the connected athlete in the header of each route', async () => {
    sessionStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, 'access-token');
    sessionStorage.setItem(STORAGE_KEYS.EXPIRES_AT, String(Math.floor(Date.now() / 1000) + 3600));
    sessionStorage.setItem(STORAGE_KEYS.ATHLETE, JSON.stringify({ id: 1, firstname: 'Test' }));

    renderRoute('/about');

    expect(await screen.findByRole('button', { name: /log out/i })).toBeVisible();
    expect(screen.getByText('Test')).toBeVisible();
  });

  it('renders the OAuth error route when no code is present', async () => {
    renderRoute('/oauth');

    expect(await screen.findByRole('heading', { name: /sign-in failed/i })).toBeVisible();
    expect(screen.getByText(/invalid authorization state/i)).toBeVisible();
    await waitFor(() => {
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
        'https://strava.alainnicolas.fr/oauth',
      );
    });
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex,nofollow',
    );
  });

  it('rejects an OAuth callback with mismatched state', async () => {
    sessionStorage.setItem(STORAGE_KEYS.OAUTH_STATE, 'expected-state');

    renderRoute('/oauth?code=test-code&state=wrong-state');

    expect(await screen.findByRole('heading', { name: /sign-in failed/i })).toBeVisible();
    expect(screen.getByText(/invalid authorization state/i)).toBeVisible();
  });

  it('asks for a Strava login on the heatmap route when signed out', async () => {
    renderRoute('/heatmap');

    expect(await screen.findByRole('heading', { name: /activity heatmap/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /connect with strava/i })).toBeVisible();
  });

  it.each([
    ['/heatmap', /^activity heatmap$/i],
    ['//evil.example/heatmap', /your efforts, in print/i],
  ])('returns to the saved path %s after login when it is a known route', async (path, text) => {
    sessionStorage.setItem(STORAGE_KEYS.OAUTH_STATE, 'state-1');
    sessionStorage.setItem(STORAGE_KEYS.RETURN_PATH, path);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL) =>
        String(url).endsWith('/auth')
          ? Response.json({
              access_token: 'token',
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              athlete: { id: 5, firstname: 'Test' },
            })
          : Response.json([]),
      ),
    );

    renderRoute('/oauth?code=code-1&state=state-1');

    expect(await screen.findByText(text)).toBeVisible();
    expect(sessionStorage.getItem(STORAGE_KEYS.RETURN_PATH)).toBeNull();
    vi.unstubAllGlobals();
  });
});
