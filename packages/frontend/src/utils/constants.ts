export const BRAND = 'Effortprint';

export const STRAVA_CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID || '';
export const STRAVA_REDIRECT_URL = import.meta.env.VITE_STRAVA_REDIRECT_URL || '';
export const API_URL = window.location.pathname.startsWith('/strava/')
  ? '/strava/.netlify/functions'
  : import.meta.env.VITE_API_URL || '';
export const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';
export const INFURA_API_KEY = import.meta.env.VITE_INFURA_API_KEY || '';
export const INSIGHTS_ID = import.meta.env.VITE_INSIGHTS_ID || '';
export const IS_WALLET_CONFIGURED = Boolean(WALLETCONNECT_PROJECT_ID && INFURA_API_KEY);

export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'strava_access_token',
  EXPIRES_AT: 'strava_expires_at',
  ATHLETE: 'strava_athlete',
  OAUTH_STATE: 'strava_oauth_state',
  RETURN_PATH: 'strava_return_path',
} as const;

// Pages that the login can return to (finding 10). Anything else returns to `/`.
export const RETURN_PATHS = ['/', '/heatmap', '/attestations', '/about'];
