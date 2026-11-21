import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StravaAuthProvider, useStravaAuth } from './useStravaAuth';
import { STORAGE_KEYS } from '@/utils/constants';

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

const renderAuth = (): ReturnType<typeof renderHook<ReturnType<typeof useStravaAuth>, unknown>> =>
  renderHook(() => useStravaAuth(), { wrapper: StravaAuthProvider });

describe('useStravaAuth', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hydrates a valid authenticated session from session storage', () => {
    seedAuth(Math.floor(Date.now() / 1000) + 3600);

    const { result } = renderAuth();

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.auth.athlete?.firstname).toBe('Test');
  });

  it('drops corrupted athlete storage without breaking render', () => {
    sessionStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, 'access-token');
    sessionStorage.setItem(
      STORAGE_KEYS.EXPIRES_AT,
      (Math.floor(Date.now() / 1000) + 3600).toString(),
    );
    sessionStorage.setItem(STORAGE_KEYS.ATHLETE, '{broken-json');

    const { result } = renderAuth();

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.auth.athlete).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEYS.ATHLETE)).toBeNull();
  });

  it('clears an expired session instead of refreshing in the browser', async () => {
    seedAuth(Math.floor(Date.now() / 1000) - 3600);

    const { result } = renderAuth();

    let token: string | null = null;
    await act(async () => {
      token = await result.current.getValidToken();
    });

    expect(token).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });
});
