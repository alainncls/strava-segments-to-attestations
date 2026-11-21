import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { AuthState, StravaAthlete } from '@strava-attestations/shared';
import { STORAGE_KEYS } from '@/utils/constants';
import { clearCache } from '@/utils/activityStore';

const TOKEN_EXPIRY_MARGIN_MS = 5 * 60 * 1000;

const signedOut: AuthState = { accessToken: null, expiresAt: null, athlete: null };

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

function readStoredAuth(): AuthState {
  const accessToken = sessionStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  const expiresAt = sessionStorage.getItem(STORAGE_KEYS.EXPIRES_AT);
  if (!accessToken || !expiresAt) {
    return signedOut;
  }

  return {
    accessToken,
    expiresAt: parseInt(expiresAt, 10),
    athlete: parseStoredAthlete(sessionStorage.getItem(STORAGE_KEYS.ATHLETE)),
  };
}

function isTokenValid(expiresAt: number | null): boolean {
  return expiresAt !== null && expiresAt * 1000 > Date.now() + TOKEN_EXPIRY_MARGIN_MS;
}

interface StravaAuth {
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

const StravaAuthContext = createContext<StravaAuth | null>(null);

export function StravaAuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [auth, setAuth] = useState(readStoredAuth);

  // An expired token keeps the activity cache: the next login shows it again.
  const signOut = useCallback((): void => {
    sessionStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    sessionStorage.removeItem(STORAGE_KEYS.EXPIRES_AT);
    sessionStorage.removeItem(STORAGE_KEYS.ATHLETE);
    setAuth(signedOut);
  }, []);

  // Strava API Policy 2.5: a logout deletes the cached Strava data.
  const logout = useCallback((): void => {
    if (auth.athlete) clearCache(auth.athlete.id);
    signOut();
  }, [auth.athlete, signOut]);

  const getValidToken = useCallback(async (): Promise<string | null> => {
    if (isTokenValid(auth.expiresAt)) {
      return auth.accessToken;
    }

    signOut();
    return null;
  }, [auth.accessToken, auth.expiresAt, signOut]);

  const setAuthFromCallback = useCallback<StravaAuth['setAuthFromCallback']>((data) => {
    sessionStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, data.access_token);
    sessionStorage.setItem(STORAGE_KEYS.EXPIRES_AT, data.expires_at.toString());
    sessionStorage.setItem(STORAGE_KEYS.ATHLETE, JSON.stringify(data.athlete));
    setAuth({
      accessToken: data.access_token,
      expiresAt: data.expires_at,
      athlete: data.athlete,
    });
  }, []);

  // Outside the memo: the result changes with time, not only with the state.
  const isAuthenticated = !!auth.accessToken && isTokenValid(auth.expiresAt);
  const value = useMemo(
    () => ({ auth, isAuthenticated, getValidToken, setAuthFromCallback, logout }),
    [auth, isAuthenticated, getValidToken, setAuthFromCallback, logout],
  );

  return <StravaAuthContext value={value}>{children}</StravaAuthContext>;
}

export function useStravaAuth(): StravaAuth {
  const value = useContext(StravaAuthContext);
  if (!value) {
    throw new Error('useStravaAuth needs a StravaAuthProvider');
  }
  return value;
}
