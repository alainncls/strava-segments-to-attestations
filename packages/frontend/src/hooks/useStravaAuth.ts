import { useState, useEffect, useCallback } from 'react';
import type { AuthState, StravaAthlete } from '../types';
import { STORAGE_KEYS, API_URL } from '../utils/constants';

const initialState: AuthState = {
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
  athlete: null,
};

interface UseStravaAuthReturn {
  auth: AuthState;
  isLoading: boolean;
  isAuthenticated: boolean;
  refreshTokenIfNeeded: () => Promise<string | null>;
  setAuthFromCallback: (data: {
    access_token: string;
    refresh_token: string;
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
    const refreshToken = sessionStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
    const expiresAt = sessionStorage.getItem(STORAGE_KEYS.EXPIRES_AT);
    const athleteStr = sessionStorage.getItem(STORAGE_KEYS.ATHLETE);

    if (accessToken && refreshToken && expiresAt) {
      const athlete = athleteStr ? (JSON.parse(athleteStr) as StravaAthlete) : null;
      setAuth({
        accessToken,
        refreshToken,
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

    if (!auth.refreshToken) {
      return null;
    }

    try {
      const response = await fetch(`${API_URL}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: auth.refreshToken }),
      });

      if (!response.ok) {
        console.error('Failed to refresh token');
        logout();
        return null;
      }

      const data = (await response.json()) as {
        access_token: string;
        refresh_token: string;
        expires_at: number;
        athlete: StravaAthlete;
      };

      // Update storage
      sessionStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, data.access_token);
      sessionStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.refresh_token);
      sessionStorage.setItem(STORAGE_KEYS.EXPIRES_AT, data.expires_at.toString());
      sessionStorage.setItem(STORAGE_KEYS.ATHLETE, JSON.stringify(data.athlete));

      setAuth({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_at,
        athlete: data.athlete,
      });

      return data.access_token;
    } catch (error) {
      console.error('Failed to refresh token:', error);
      logout();
      return null;
    }
  }, [auth.accessToken, auth.refreshToken, isTokenValid, logout]);

  // Set auth after OAuth callback
  const setAuthFromCallback = useCallback(
    (data: {
      access_token: string;
      refresh_token: string;
      expires_at: number;
      athlete: StravaAthlete;
    }): void => {
      sessionStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, data.access_token);
      sessionStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.refresh_token);
      sessionStorage.setItem(STORAGE_KEYS.EXPIRES_AT, data.expires_at.toString());
      sessionStorage.setItem(STORAGE_KEYS.ATHLETE, JSON.stringify(data.athlete));

      setAuth({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
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
