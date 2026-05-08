import type { Context } from '@netlify/functions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import authHandler from '../src/auth';

vi.mock('../lib/constants', () => ({
  STRAVA_TOKEN_URL: 'https://www.strava.com/oauth/token',
}));

function createContext(ip = '203.0.113.10'): Context {
  return { ip } as Context;
}

function createAuthRequest(body: unknown, cookie?: string): Request {
  return new Request('https://functions.example.com/auth', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin: 'https://app.example.com',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('auth handler', () => {
  beforeEach(() => {
    vi.stubEnv('STRAVA_CLIENT_ID', 'client-id');
    vi.stubEnv('STRAVA_CLIENT_SECRET', 'client-secret');
    vi.stubEnv('FRONTEND_URL', 'https://app.example.com');
    vi.stubEnv('SIGNER_PRIVATE_KEY', `0x${'1'.repeat(64)}`);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('rejects legacy refresh token requests without calling Strava', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await authHandler(
      createAuthRequest({ refresh_token: 'stolen-token' }),
      createContext('203.0.113.11'),
    );

    await expect(response.json()).resolves.toEqual({ error: 'Missing code' });
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('issues an HttpOnly OAuth state cookie', async () => {
    const response = await authHandler(
      createAuthRequest({ action: 'start' }),
      createContext('203.0.113.14'),
    );
    const body = (await response.json()) as { state?: string };
    const cookie = response.headers.get('set-cookie');

    expect(response.status).toBe(200);
    expect(body.state).toMatch(/^[a-f0-9]{64}$/);
    expect(cookie).toContain(`strava_oauth_state=${body.state}`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('rejects code exchange when OAuth state does not match the cookie', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await authHandler(
      createAuthRequest({ code: 'oauth-code', state: 'wrong-state' }, 'strava_oauth_state=state'),
      createContext('203.0.113.15'),
    );

    await expect(response.json()).resolves.toEqual({ error: 'Invalid state' });
    expect(response.status).toBe(400);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not expose Strava refresh tokens to the browser', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'access-token',
          refresh_token: 'strava-refresh-token',
          expires_at: 1893456000,
          athlete: { id: 123, username: 'athlete' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await authHandler(
      createAuthRequest({ code: 'oauth-code', state: 'state' }, 'strava_oauth_state=state'),
      createContext('203.0.113.12'),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      access_token: 'access-token',
      expires_at: 1893456000,
      athlete: { id: 123, username: 'athlete' },
    });
    expect(body.refresh_token).toBeUndefined();
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('rejects non-POST requests', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await authHandler(
      new Request('https://functions.example.com/auth?code=oauth-code', { method: 'GET' }),
      createContext('203.0.113.13'),
    );

    await expect(response.json()).resolves.toEqual({ error: 'Method not allowed' });
    expect(response.status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
