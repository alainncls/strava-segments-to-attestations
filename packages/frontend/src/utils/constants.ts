// Re-export shared constants
export {
  PORTAL_ID_SEPOLIA,
  PORTAL_ID_MAINNET,
  SCHEMA_ID,
  ATTESTATION_FEE,
  STRAVA_API_BASE,
  STRAVA_AUTH_URL,
  linea,
  lineaSepolia,
} from '@strava-attestations/shared';

// Frontend-specific environment variables
export const STRAVA_CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID || '';
export const STRAVA_REDIRECT_URL = import.meta.env.VITE_STRAVA_REDIRECT_URL || '';
export const API_URL = import.meta.env.VITE_API_URL || '';
export const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';
export const INFURA_API_KEY = import.meta.env.VITE_INFURA_API_KEY || '';
export const INSIGHTS_ID = import.meta.env.VITE_INSIGHTS_ID || '';

// Storage keys
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'strava_access_token',
  REFRESH_TOKEN: 'strava_refresh_token',
  EXPIRES_AT: 'strava_expires_at',
  ATHLETE: 'strava_athlete',
} as const;
