import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStravaAuth } from './useStravaAuth';
import { STORAGE_KEYS } from '../utils/constants';

const athlete = {
  id: 123,
  username: 'runner',
  firstname: 'Test',
  lastname: 'Runner',
  profile: 'https://example.com/profile.jpg',
};

function seedAuth(expiresAt: number): void {
  sessionStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, 'access-token');
  sessionStorage.setItem(STORAGE_KEYS.EXPIRES_AT, expiresAt.toString());
  sessionStorage.setItem(STORAGE_KEYS.ATHLETE, JSON.stringify(athlete));
}

describe('useStravaAuth', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hydrates a valid authenticated session from session storage', async () => {
    seedAuth(Math.floor(Date.now() / 1000) + 3600);

    const { result } = renderHook(() => useStravaAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.auth.athlete?.firstname).toBe('Test');
  });

  it('drops corrupted athlete storage without breaking render', async () => {
    sessionStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, 'access-token');
    sessionStorage.setItem(
      STORAGE_KEYS.EXPIRES_AT,
      (Math.floor(Date.now() / 1000) + 3600).toString(),
    );
    sessionStorage.setItem(STORAGE_KEYS.ATHLETE, '{broken-json');

    const { result } = renderHook(() => useStravaAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.auth.athlete).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEYS.ATHLETE)).toBeNull();
  });

  it('clears an expired session instead of refreshing in the browser', async () => {
    seedAuth(Math.floor(Date.now() / 1000) - 3600);

    const { result } = renderHook(() => useStravaAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let token: string | null = null;
    await act(async () => {
      token = await result.current.refreshTokenIfNeeded();
    });

    expect(token).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)).toBeNull();
  });
});
