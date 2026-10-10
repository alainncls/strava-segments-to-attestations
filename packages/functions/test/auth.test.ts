import type { Context } from '@netlify/functions';
import { createHash, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthHandler } from '../src/auth';
import { createMemoryOAuthStateStore } from '../src/lib/oauth-state';
import type { OAuthStateStore } from '../src/lib/oauth-state';

vi.mock('../lib/constants', () => ({
  STRAVA_TOKEN_URL: 'https://www.strava.com/oauth/token',
}));

const randomState = (): string => randomBytes(32).toString('hex');

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
  let stateStore: OAuthStateStore;
  let authHandler: ReturnType<typeof createAuthHandler>;
  const seedState = async (): Promise<string> => {
    const state = randomState();
    const now = Date.now();
    await stateStore.create(createHash('sha256').update(state).digest('hex'), {
      version: 1,
      origin: 'https://app.example.com',
      issuedAt: now,
      expiresAt: now + 10 * 60_000,
      status: 'pending',
    });
    return state;
  };

  beforeEach(() => {
    vi.stubEnv('STRAVA_CLIENT_ID', 'client-id');
    vi.stubEnv('STRAVA_CLIENT_SECRET', 'client-secret');
    vi.stubEnv('FRONTEND_URL', 'https://app.example.com');
    vi.stubEnv('SIGNER_PRIVATE_KEY', `0x${'1'.repeat(64)}`);
    stateStore = createMemoryOAuthStateStore();
    authHandler = createAuthHandler({ stateStore });
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

  it('times out a hung state write without issuing a usable callback cookie', async () => {
    let releaseWrite: ((value: boolean) => void) | undefined;
    authHandler = createAuthHandler({
      budgetMs: 20,
      stateStore: {
        create: () =>
          new Promise((resolve) => {
            releaseWrite = resolve;
          }),
        async read() {
          return null;
        },
        async compareAndSet() {
          return false;
        },
      },
    });
    const response = await authHandler(
      createAuthRequest({ action: 'start' }),
      createContext('203.0.113.16'),
    );

    expect(response.status).toBe(504);
    expect(response.headers.get('set-cookie')).toBeNull();
    releaseWrite?.(true);
    expect(JSON.parse(await response.text())).toEqual({
      error: 'Authentication request timed out',
    });
  });

  it('cancels a request body stream that never finishes before the deadline', async () => {
    let cancelled = false;
    authHandler = createAuthHandler({ budgetMs: 20, stateStore });
    const request = new Request('https://functions.example.com/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://app.example.com' },
      body: new ReadableStream<Uint8Array>({
        cancel() {
          cancelled = true;
        },
      }),
      duplex: 'half',
    } as RequestInit);
    const response = await authHandler(request, createContext('203.0.113.19'));

    expect(response.status).toBe(504);
    expect(cancelled).toBe(true);
  });

  it('does not exchange a token after a timed-out state consumption resolves late', async () => {
    const state = await seedState();
    let releaseConsume: ((value: boolean) => void) | undefined;
    const exchange = vi.fn();
    authHandler = createAuthHandler({
      budgetMs: 20,
      stateStore: {
        async create() {
          return true;
        },
        async read() {
          const now = Date.now();
          return {
            record: {
              version: 1,
              origin: 'https://app.example.com',
              issuedAt: now,
              expiresAt: now + 600_000,
              status: 'pending',
            },
            etag: 'etag',
          };
        },
        compareAndSet: () =>
          new Promise((resolve) => {
            releaseConsume = resolve;
          }),
      },
      exchange,
    });
    const response = await authHandler(
      createAuthRequest({ code: 'oauth-code', state }, `strava_oauth_state=${state}`),
      createContext('203.0.113.17'),
    );

    expect(response.status).toBe(504);
    releaseConsume?.(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(exchange).not.toHaveBeenCalled();
  });

  it('aborts the provider transport at the total deadline and discards a late result', async () => {
    const state = await seedState();
    let releaseExchange:
      | ((value: { access_token: string; expires_at: number; athlete: { id: number } }) => void)
      | undefined;
    let exchangeSignal: AbortSignal | undefined;
    const exchange = vi.fn((_code, _id, _secret, signal: AbortSignal) => {
      exchangeSignal = signal;
      return new Promise((resolve) => {
        releaseExchange = resolve;
      });
    });
    authHandler = createAuthHandler({ budgetMs: 20, stateStore, exchange });
    const response = await authHandler(
      createAuthRequest({ code: 'oauth-code', state }, `strava_oauth_state=${state}`),
      createContext('203.0.113.20'),
    );

    expect(response.status).toBe(504);
    expect(exchangeSignal?.aborted).toBe(true);
    releaseExchange?.({ access_token: 'late-token', expires_at: 1, athlete: { id: 1 } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(JSON.parse(await response.text())).toEqual({
      error: 'Authentication request timed out',
    });
  });

  it('allows exactly one concurrent exchange for a state token', async () => {
    const state = await seedState();
    const exchange = vi
      .fn()
      .mockResolvedValue({ access_token: 'access-token', expires_at: 1, athlete: { id: 1 } });
    authHandler = createAuthHandler({ stateStore, exchange });
    const request = (): Promise<Response> =>
      authHandler(
        createAuthRequest({ code: 'oauth-code', state }, `strava_oauth_state=${state}`),
        createContext('203.0.113.18'),
      );

    const responses = await Promise.all([request(), request()]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
    expect(exchange).toHaveBeenCalledOnce();
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

  it('rejects a valid state when the callback origin differs from the initiating origin', async () => {
    const state = randomState();
    const now = Date.now();
    await stateStore.create(createHash('sha256').update(state).digest('hex'), {
      version: 1,
      origin: 'https://other.example.com',
      issuedAt: now,
      expiresAt: now + 10 * 60_000,
      status: 'pending',
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await authHandler(
      createAuthRequest({ code: 'oauth-code', state }, `strava_oauth_state=${state}`),
      createContext('203.0.113.21'),
    );

    await expect(response.json()).resolves.toEqual({ error: 'Invalid or expired state' });
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not expose Strava refresh tokens to the browser', async () => {
    const state = await seedState();
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
      createAuthRequest({ code: 'oauth-code', state }, `strava_oauth_state=${state}`),
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

  it.each([
    ['null', 'null'],
    ['array', '[]'],
    ['string', '"token"'],
  ])('rejects a %s body before token exchange', async (_label, rawBody) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await authHandler(
      new Request('https://functions.example.com/auth', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://app.example.com',
        },
        body: rawBody,
      }),
      createContext(`198.51.100.${rawBody.length}`),
    );

    await expect(response.json()).resolves.toEqual({ error: 'Invalid request body' });
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an oversized auth payload before token exchange', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const rawBody = JSON.stringify({ code: 'c'.repeat(9_000), state: 'state' });

    const response = await authHandler(
      new Request('https://functions.example.com/auth', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://app.example.com',
          cookie: 'strava_oauth_state=state',
        },
        body: rawBody,
      }),
      createContext('198.51.100.20'),
    );

    await expect(response.json()).resolves.toEqual({ error: 'Payload too large' });
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps token-exchange timeout and cancellation to 504', async () => {
    const state = await seedState();
    const nextState = await seedState();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'))
      .mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));
    vi.stubGlobal('fetch', fetchMock);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const timeoutResponse = await authHandler(
      createAuthRequest({ code: 'oauth-code', state }, `strava_oauth_state=${state}`),
      createContext('198.51.100.21'),
    );
    const cancelResponse = await authHandler(
      createAuthRequest(
        { code: 'oauth-code', state: nextState },
        `strava_oauth_state=${nextState}`,
      ),
      createContext('198.51.100.22'),
    );

    expect(timeoutResponse.status).toBe(504);
    expect(cancelResponse.status).toBe(504);
    await expect(timeoutResponse.json()).resolves.toEqual({ error: 'Upstream request timed out' });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('client-secret');
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('oauth-code');
  });

  it.each([
    [401, 401, { error: 'Invalid or expired token' }],
    [403, 502, { error: 'Upstream request failed' }],
    [429, 429, { error: 'Upstream rate limited' }],
  ])(
    'maps token-exchange status %s without leaking secrets',
    async (upstreamStatus, status, expected) => {
      const state = await seedState();
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: 'nope', client_secret: 'client-secret', code: 'oauth-code' }),
          {
            status: upstreamStatus,
          },
        ),
      );
      vi.stubGlobal('fetch', fetchMock);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const response = await authHandler(
        createAuthRequest({ code: 'oauth-code', state }, `strava_oauth_state=${state}`),
        createContext(`198.51.100.${upstreamStatus}`),
      );

      const body = (await response.json()) as Record<string, unknown>;

      expect(response.status).toBe(status);
      expect(body).toEqual(expected);
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('client-secret');
      expect(JSON.stringify(body)).not.toContain('oauth-code');
    },
  );
});
