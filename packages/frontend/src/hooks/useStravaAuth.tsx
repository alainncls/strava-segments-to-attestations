import { useState, useEffect, useCallback } from 'react';
import type { AuthState, StravaAthlete } from '../types';
import { STORAGE_KEYS } from '../utils/constants';

const initialState: AuthState = {
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
  athlete: null,
};

function parseStoredAthlete(value: string | null): StravaAthlete | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as StravaAthlete;
  } catch {
    sessionStorage.removeItem(STORAGE_KEYS.ATHLETE);
    return null;
  }
}

interface UseStravaAuthReturn {
  auth: AuthState;
  isLoading: boolean;
  isAuthenticated: boolean;
  refreshTokenIfNeeded: () => Promise<string | null>;
  setAuthFromCallback: (data: {
    access_token: string;
    expires_at: number;
    athlete: StravaAthlete;
  }) => void;
  logout: () => void;
}

export function useStravaAuth(): UseStravaAuthReturn {
  const [auth, setAuth] = useState<AuthState>(initialState);
  const [isLoading, setIsLoading] = useState(true);

  // Load auth from session storage on mount
  useEffect(() => {
    const accessToken = sessionStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    const expiresAt = sessionStorage.getItem(STORAGE_KEYS.EXPIRES_AT);
    const athleteStr = sessionStorage.getItem(STORAGE_KEYS.ATHLETE);

    sessionStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);

    if (accessToken && expiresAt) {
      const athlete = parseStoredAthlete(athleteStr);
      setAuth({
        accessToken,
        refreshToken: null,
        expiresAt: parseInt(expiresAt, 10),
        athlete,
      });
    }

    setIsLoading(false);
  }, []);

  // Check if token is valid
  const isTokenValid = useCallback(() => {
    if (!auth.expiresAt) return false;
    // Token is valid if it expires more than 5 minutes from now
    return auth.expiresAt * 1000 > Date.now() + 5 * 60 * 1000;
  }, [auth.expiresAt]);

  // Logout
  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    sessionStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    sessionStorage.removeItem(STORAGE_KEYS.EXPIRES_AT);
    sessionStorage.removeItem(STORAGE_KEYS.ATHLETE);
    setAuth(initialState);
  }, []);

  // Refresh token if needed
  const refreshTokenIfNeeded = useCallback(async (): Promise<string | null> => {
    if (isTokenValid()) {
      return auth.accessToken;
    }

    logout();
    return null;
  }, [auth.accessToken, isTokenValid, logout]);

  // Set auth after OAuth callback
  const setAuthFromCallback = useCallback(
    (data: { access_token: string; expires_at: number; athlete: StravaAthlete }): void => {
      sessionStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, data.access_token);
      sessionStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
      sessionStorage.setItem(STORAGE_KEYS.EXPIRES_AT, data.expires_at.toString());
      sessionStorage.setItem(STORAGE_KEYS.ATHLETE, JSON.stringify(data.athlete));

      setAuth({
        accessToken: data.access_token,
        refreshToken: null,
        expiresAt: data.expires_at,
        athlete: data.athlete,
      });
    },
    [],
  );

  return {
    auth,
    isLoading,
    isAuthenticated: !!auth.accessToken && isTokenValid(),
    refreshTokenIfNeeded,
    setAuthFromCallback,
    logout,
  };
}
