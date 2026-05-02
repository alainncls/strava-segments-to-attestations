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
  sessionStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, 'refresh-token');
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
    sessionStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, 'refresh-token');
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

  it('refreshes an expired token and persists the new session', async () => {
    seedAuth(Math.floor(Date.now() / 1000) - 3600);

    const fetchMock = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_at: Math.floor(Date.now() / 1000) + 7200,
          athlete,
        }),
      ok: true,
    });

    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useStravaAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let token: string | null = null;
    await act(async () => {
      token = await result.current.refreshTokenIfNeeded();
    });

    expect(token).toBe('new-access-token');
    expect(sessionStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)).toBe('new-access-token');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
