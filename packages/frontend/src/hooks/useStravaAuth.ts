import { createContext, useContext } from 'react';
import type { AuthState, StravaAthlete } from '@strava-attestations/shared';

export interface StravaAuth {
  auth: AuthState;
  isAuthenticated: boolean;
  getValidToken: () => Promise<string | null>;
  setAuthFromCallback: (data: {
    access_token: string;
    expires_at: number;
    athlete: StravaAthlete;
  }) => void;
  logout: () => void;
}

export const StravaAuthContext = createContext<StravaAuth | null>(null);

export function useStravaAuth(): StravaAuth {
  const value = useContext(StravaAuthContext);
  if (!value) {
    throw new Error('useStravaAuth needs a StravaAuthProvider');
  }
  return value;
}
