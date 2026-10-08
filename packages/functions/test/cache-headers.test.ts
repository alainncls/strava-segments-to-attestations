import type { Context } from '@netlify/functions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCorsHeaders } from '../lib/env';
import authHandler from '../src/auth';
import signHandler from '../src/sign';

vi.mock('@strava-attestations/shared', async () => import('../../shared/src/index.ts'));

const AUTH_URL = 'https://functions.example.com/auth';
const SIGN_URL = 'https://functions.example.com/sign';
const ALLOWED_ORIGIN = 'https://app.example.com';
const SUBJECT = '0x2222222222222222222222222222222222222222';

function createContext(ip: string): Context {
  return { ip } as Context;
}

function expectNonCacheable(response: Response): void {
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('vary')).toBe('Origin');
}

function expectOrigin(response: Response, origin: string): void {
  expect(response.headers.get('access-control-allow-origin')).toBe(origin);
}

function createAuthRequest(
  body: unknown,
  init?: { origin?: string; cookie?: string; omitOrigin?: boolean },
): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (!init?.omitOrigin) {
    headers.set('origin', init?.origin ?? ALLOWED_ORIGIN);
  }
  if (init?.cookie) {
    headers.set('cookie', init.cookie);
  }
  return new Request(AUTH_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function tokenResponse(): Response {
  return new Response(
    JSON.stringify({
      access_token: 'access-token',
      refresh_token: 'strava-refresh-token',
      expires_at: 1893456000,
      athlete: { id: 123, username: 'athlete' },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('production CORS and auth cache headers', () => {
  beforeEach(() => {
    vi.stubEnv('STRAVA_CLIENT_ID', 'client-id');
    vi.stubEnv('STRAVA_CLIENT_SECRET', 'client-secret');
    vi.stubEnv('FRONTEND_URL', ALLOWED_ORIGIN);
    vi.stubEnv('SIGNER_PRIVATE_KEY', `0x${'11'.repeat(32)}`);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('sets no-store and Vary on the production CORS helper', () => {
    const allowed = getCorsHeaders(ALLOWED_ORIGIN);
    const disallowed = getCorsHeaders('https://app.example.com.evil.com');
    const missing = getCorsHeaders(undefined);
    const localhost = getCorsHeaders('http://localhost:5174');
    const netlifyDev = getCorsHeaders('http://localhost:8888');

    expect(allowed['Access-Control-Allow-Origin']).toBe(ALLOWED_ORIGIN);
    expect(allowed['Cache-Control']).toBe('no-store');
    expect(allowed.Vary).toBe('Origin');
    expect(allowed['Access-Control-Allow-Credentials']).toBe('true');
    expect(disallowed['Access-Control-Allow-Origin']).toBe(ALLOWED_ORIGIN);
    expect(disallowed['Access-Control-Allow-Origin']).not.toBe('https://app.example.com.evil.com');
    expect(missing['Access-Control-Allow-Origin']).toBe(ALLOWED_ORIGIN);
    expect(localhost['Access-Control-Allow-Origin']).toBe('http://localhost:5174');
    expect(netlifyDev['Access-Control-Allow-Origin']).toBe('http://localhost:8888');
    for (const headers of [allowed, disallowed, missing, localhost, netlifyDev]) {
      expect(headers['Cache-Control']).toBe('no-store');
      expect(headers.Vary).toBe('Origin');
    }
  });

  it('allows an exact origin, does not reflect a disallowed origin, and still answers without it', async () => {
    const allowed = await authHandler(
      createAuthRequest({ action: 'start' }, { origin: ALLOWED_ORIGIN }),
      createContext('203.0.114.1'),
    );
    const disallowed = await authHandler(
      createAuthRequest({ action: 'start' }, { origin: 'https://evil.example' }),
      createContext('203.0.114.2'),
    );
    const missing = await authHandler(
      createAuthRequest({ action: 'start' }, { omitOrigin: true }),
      createContext('203.0.114.3'),
    );

    expect(allowed.status).toBe(200);
    expect(disallowed.status).toBe(200);
    expect(missing.status).toBe(200);
    expectOrigin(allowed, ALLOWED_ORIGIN);
    expectOrigin(disallowed, ALLOWED_ORIGIN);
    expect(disallowed.headers.get('access-control-allow-origin')).not.toBe('https://evil.example');
    expectOrigin(missing, ALLOWED_ORIGIN);
    expectNonCacheable(allowed);
    expectNonCacheable(disallowed);
    expectNonCacheable(missing);
    expect(allowed.headers.get('set-cookie')).toContain('HttpOnly');
    expect(allowed.headers.get('set-cookie')).toContain('SameSite=Lax');
  });

  it('marks OPTIONS and method errors non-cacheable', async () => {
    const options = await authHandler(
      new Request(AUTH_URL, { method: 'OPTIONS', headers: { origin: ALLOWED_ORIGIN } }),
      createContext('203.0.114.4'),
    );
    const method = await authHandler(
      new Request(AUTH_URL, { method: 'GET', headers: { origin: 'https://evil.example' } }),
      createContext('203.0.114.5'),
    );

    expect(options.status).toBe(200);
    expect(method.status).toBe(405);
    expectOrigin(options, ALLOWED_ORIGIN);
    expect(method.headers.get('access-control-allow-origin')).not.toBe('https://evil.example');
    expectNonCacheable(options);
    expectNonCacheable(method);
  });

  it('keeps state mismatch from exchanging a token and marks the response non-cacheable', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await authHandler(
      createAuthRequest(
        { code: 'oauth-code', state: 'wrong' },
        { cookie: 'strava_oauth_state=state' },
      ),
      createContext('203.0.114.6'),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid state' });
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('SameSite=Lax');
    expect(fetchMock).not.toHaveBeenCalled();
    expectNonCacheable(response);
  });

  it('returns a token once, clears the state cookie, and does not return the refresh token', async () => {
    const fetchMock = vi.fn().mockImplementation(tokenResponse);
    vi.stubGlobal('fetch', fetchMock);

    const response = await authHandler(
      createAuthRequest(
        { code: 'oauth-code', state: 'state' },
        { cookie: 'strava_oauth_state=state' },
      ),
      createContext('203.0.114.7'),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.refresh_token).toBeUndefined();
    expect(body.access_token).toBe('access-token');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('SameSite=Lax');
    expect(fetchMock).toHaveBeenCalledOnce();
    expectNonCacheable(response);
  });

  it('does not exchange again after the client honors the cleared state cookie', async () => {
    const fetchMock = vi.fn().mockResolvedValue(tokenResponse());
    vi.stubGlobal('fetch', fetchMock);

    const first = await authHandler(
      createAuthRequest({ code: 'code-1', state: 'state' }, { cookie: 'strava_oauth_state=state' }),
      createContext('203.0.114.8'),
    );
    const second = await authHandler(
      createAuthRequest({ code: 'code-2', state: 'state' }),
      createContext('203.0.114.9'),
    );

    expect(first.status).toBe(200);
    expect(first.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(second.status).toBe(400);
    await expect(second.json()).resolves.toEqual({ error: 'Invalid state' });
    expect(fetchMock).toHaveBeenCalledOnce();
    expectNonCacheable(first);
    expectNonCacheable(second);
  });

  it('documents that resending an uncleared state cookie can exchange again', async () => {
    const fetchMock = vi.fn().mockImplementation(tokenResponse);
    vi.stubGlobal('fetch', fetchMock);

    const first = await authHandler(
      createAuthRequest({ code: 'code-1', state: 'state' }, { cookie: 'strava_oauth_state=state' }),
      createContext('203.0.114.10'),
    );
    const second = await authHandler(
      createAuthRequest({ code: 'code-2', state: 'state' }, { cookie: 'strava_oauth_state=state' }),
      createContext('203.0.114.11'),
    );

    expect(first.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(first.headers.get('set-cookie')).toContain('HttpOnly');
    expect(second.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expectNonCacheable(first);
    expectNonCacheable(second);
  });

  it('accepts a valid percent-encoded state cookie', async () => {
    const fetchMock = vi.fn().mockResolvedValue(tokenResponse());
    vi.stubGlobal('fetch', fetchMock);

    const response = await authHandler(
      createAuthRequest(
        { code: 'oauth-code', state: 'abc def' },
        { cookie: 'strava_oauth_state=abc%20def' },
      ),
      createContext('203.0.114.12'),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    expectNonCacheable(response);
  });

  it('rejects a malformed percent-encoded cookie before token exchange', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await authHandler(
      createAuthRequest(
        { code: 'oauth-code', state: 'state' },
        { cookie: 'other=%; strava_oauth_state=%E0%A4%A' },
      ),
      createContext('203.0.114.13'),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Invalid cookie' });
    expect(JSON.stringify(body)).not.toContain('%E0');
    expect(fetchMock).not.toHaveBeenCalled();
    expectNonCacheable(response);
  });

  it('maps the auth upstream timeout to 504 and keeps the response non-cacheable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    vi.stubGlobal('fetch', fetchMock);
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await authHandler(
      createAuthRequest(
        { code: 'oauth-code', state: 'state' },
        { cookie: 'strava_oauth_state=state' },
      ),
      createContext('203.0.114.14'),
    );

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual({ error: 'Upstream request timed out' });
    expect(timeoutSpy).toHaveBeenCalledWith(8_000);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('client-secret');
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('oauth-code');
    expectNonCacheable(response);
  });

  it('marks auth upstream failures and local rate limits non-cacheable', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const upstream = await authHandler(
      createAuthRequest(
        { code: 'oauth-code', state: 'state' },
        { cookie: 'strava_oauth_state=state' },
      ),
      createContext('203.0.114.15'),
    );
    expect(upstream.status).toBe(401);
    expectNonCacheable(upstream);

    const ip = '203.0.114.16';
    let limited: Response | undefined;
    for (let attempt = 0; attempt < 21; attempt += 1) {
      limited = await authHandler(createAuthRequest({ action: 'start' }), createContext(ip));
    }
    expect(limited?.status).toBe(429);
    expect(limited?.headers.get('retry-after')).toBe('60');
    expectNonCacheable(limited as Response);
  });

  it('marks a missing-env auth error non-cacheable', async () => {
    vi.stubEnv('STRAVA_CLIENT_ID', '');

    const response = await authHandler(
      createAuthRequest({ action: 'start' }),
      createContext('203.0.114.17'),
    );

    expect(response.status).toBe(500);
    expectNonCacheable(response);
  });

  it('marks sign preflight, error, and success responses non-cacheable', async () => {
    const activity = new Response(
      JSON.stringify({
        athlete: { id: 123 },
        segment_efforts: [
          {
            id: 1,
            segment: { id: 678, name: 'Col', activity_type: 'Ride', distance: 1 },
            elapsed_time: 10,
            start_date: '2024-06-15T12:34:56Z',
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
    const profile = new Response(JSON.stringify({ id: 123 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    const fetchMock = vi.fn((input: RequestInfo | URL) =>
      Promise.resolve(String(input).endsWith('/athlete') ? profile : activity),
    );
    vi.stubGlobal('fetch', fetchMock);

    const options = await signHandler(
      new Request(SIGN_URL, { method: 'OPTIONS', headers: { origin: ALLOWED_ORIGIN } }),
      createContext('203.0.114.18'),
    );
    const method = await signHandler(
      new Request(SIGN_URL, { method: 'GET', headers: { origin: 'https://evil.example' } }),
      createContext('203.0.114.19'),
    );
    const missing = await signHandler(
      new Request(SIGN_URL, {
        method: 'POST',
        headers: { origin: ALLOWED_ORIGIN, 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
      createContext('203.0.114.20'),
    );
    const success = await signHandler(
      new Request(SIGN_URL, {
        method: 'POST',
        headers: { origin: ALLOWED_ORIGIN, 'content-type': 'application/json' },
        body: JSON.stringify({
          accessToken: 'test-access-token',
          activityId: '12345',
          segmentId: 678,
          subject: SUBJECT,
          chainId: 59144,
        }),
      }),
      createContext('203.0.114.21'),
    );
    const signed = (await success.json()) as Record<string, unknown>;

    expect(options.status).toBe(200);
    expect(method.status).toBe(405);
    expect(missing.status).toBe(400);
    expect(success.status).toBe(200);
    expect(method.headers.get('access-control-allow-origin')).not.toBe('https://evil.example');
    expect(signed.signature).toEqual(expect.stringMatching(/^0x/));
    expect(JSON.stringify(signed)).not.toContain('test-access-token');
    expectNonCacheable(options);
    expectNonCacheable(method);
    expectNonCacheable(missing);
    expectNonCacheable(success);
  });
});
