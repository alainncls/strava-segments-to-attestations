import type { Context } from '@netlify/functions';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthHandler } from '../src/auth';
import type { OAuthStateRecord, OAuthStateStore } from '../src/lib/oauth-state';
import type { StravaTokenResponse } from '../src/lib/types';

vi.mock('@strava-attestations/shared', async () => import('../../shared/src/index.ts'));

const tokenResponse = {
  access_token: 'access-token',
  refresh_token: 'strava-refresh-token',
  expires_at: 1_893_456_000,
  athlete: { id: 123, username: 'athlete' },
} as StravaTokenResponse;

function createMemoryStateStore(): {
  store: OAuthStateStore;
  records: Map<string, { record: OAuthStateRecord; etag: string }>;
} {
  const records = new Map<string, { record: OAuthStateRecord; etag: string }>();
  let revision = 0;
  const store: OAuthStateStore = {
    async create(key, record) {
      if (records.has(key)) return false;
      records.set(key, { record, etag: String(++revision) });
      return true;
    },
    async read(key) {
      const entry = records.get(key);
      return entry ? { record: entry.record, etag: entry.etag } : null;
    },
    async compareAndSet(key, etag, record) {
      const current = records.get(key);
      if (!current || current.etag !== etag) return false;
      records.set(key, { record, etag: String(++revision) });
      return true;
    },
  };
  return { store, records };
}

function createContext(ip: string): Context {
  return { ip } as Context;
}

function createAuthRequest(
  body: unknown,
  cookie?: string,
  origin = 'https://app.example.com',
): Request {
  return new Request('https://functions.example.com/auth', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function startFlow(
  handler: ReturnType<typeof createAuthHandler>,
  ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`,
): Promise<{ response: Response; state: string; cookie: string }> {
  const response = await handler(createAuthRequest({ action: 'start' }), createContext(ip));
  const body = (await response.json()) as { state: string };
  return { response, state: body.state, cookie: response.headers.get('set-cookie')!.split(';')[0] };
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
    vi.clearAllMocks();
  });

  it('issues a server-reserved state and an HttpOnly OAuth cookie', async () => {
    const { store, records } = createMemoryStateStore();
    const handler = createAuthHandler({ stateStore: store, now: () => 1_800_000_000_000 });
    const { response, state, cookie } = await startFlow(handler);

    expect(response.status).toBe(200);
    expect(state).toMatch(/^[a-f0-9]{64}$/);
    expect(cookie).toBe(`strava_oauth_state=${state}`);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('SameSite=Lax');
    expect(records.has(state)).toBe(false);
    expect(records.has(createHash('sha256').update(state).digest('hex'))).toBe(true);
  });

  it('rejects mismatched cookie state without contacting Strava and clears the cookie', async () => {
    const { store } = createMemoryStateStore();
    const exchange = vi.fn().mockResolvedValue(tokenResponse);
    const handler = createAuthHandler({ stateStore: store, exchange });
    const { state } = await startFlow(handler);
    const response = await handler(
      createAuthRequest({ code: 'oauth-code', state }, 'strava_oauth_state=wrong-state'),
      createContext('203.0.113.20'),
    );

    await expect(response.json()).resolves.toEqual({ error: 'Invalid state' });
    expect(response.status).toBe(400);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(exchange).not.toHaveBeenCalled();
  });

  it('consumes state before provider exchange and refuses replay after provider failure', async () => {
    const { store } = createMemoryStateStore();
    const exchange = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('upstream unavailable'), { status: 503 }));
    const handler = createAuthHandler({ stateStore: store, exchange });
    const { state, cookie } = await startFlow(handler);
    const first = await handler(
      createAuthRequest({ code: 'oauth-code', state }, cookie),
      createContext('203.0.113.21'),
    );
    const replay = await handler(
      createAuthRequest({ code: 'oauth-code', state }, cookie),
      createContext('203.0.113.22'),
    );

    expect(first.status).toBe(500);
    expect(first.headers.get('set-cookie')).toContain('Max-Age=0');
    await expect(replay.json()).resolves.toEqual({ error: 'OAuth state already used' });
    expect(replay.status).toBe(400);
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it('maps provider timeout to 504 while consuming state and clearing its cookie', async () => {
    const { store } = createMemoryStateStore();
    const exchange = vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    const handler = createAuthHandler({ stateStore: store, exchange });
    const { state, cookie } = await startFlow(handler);
    const response = await handler(
      createAuthRequest({ code: 'oauth-code', state }, cookie),
      createContext('203.0.113.24'),
    );

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual({ error: 'Upstream request timed out' });
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('allows exactly one provider exchange for twenty concurrent callbacks across two handlers', async () => {
    const { store } = createMemoryStateStore();
    const exchange = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return tokenResponse;
    });
    const first = createAuthHandler({ stateStore: store, exchange });
    const second = createAuthHandler({ stateStore: store, exchange });
    const { state, cookie } = await startFlow(first);
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        (index % 2 ? first : second)(
          createAuthRequest({ code: 'oauth-code', state }, cookie),
          createContext(`198.51.100.${index + 1}`),
        ),
      ),
    );

    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 400)).toHaveLength(19);
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it('fails closed if state storage is unavailable', async () => {
    const unavailable: OAuthStateStore = {
      create: async () => {
        throw new Error('storage offline');
      },
      read: async () => {
        throw new Error('storage offline');
      },
      compareAndSet: async () => {
        throw new Error('storage offline');
      },
    };
    const exchange = vi.fn();
    const handler = createAuthHandler({ stateStore: unavailable, exchange });
    const response = await handler(
      createAuthRequest({ action: 'start' }),
      createContext('203.0.113.30'),
    );

    expect(response.status).toBe(503);
    expect(exchange).not.toHaveBeenCalled();
  });

  it('rejects expired state and disallowed origins without calling Strava', async () => {
    const { store } = createMemoryStateStore();
    const startNow = 1_800_000_000_000;
    const exchange = vi.fn().mockResolvedValue(tokenResponse);
    const handler = createAuthHandler({
      stateStore: store,
      exchange,
      now: () => startNow,
    });
    const { state, cookie } = await startFlow(handler);
    const expiredHandler = createAuthHandler({
      stateStore: store,
      exchange,
      now: () => startNow + 10 * 60_000,
    });
    const expired = await expiredHandler(
      createAuthRequest({ code: 'oauth-code', state }, cookie),
      createContext('203.0.113.31'),
    );
    const wrongOrigin = await handler(
      createAuthRequest({ action: 'start' }, undefined, 'https://evil.example'),
      createContext('203.0.113.32'),
    );

    expect(expired.status).toBe(400);
    await expect(expired.json()).resolves.toEqual({ error: 'Invalid or expired state' });
    expect(wrongOrigin.status).toBe(403);
    expect(exchange).not.toHaveBeenCalled();
  });

  it('does not expose Strava refresh tokens and sends no-store/Vary on auth responses', async () => {
    const { store } = createMemoryStateStore();
    const exchange = vi.fn().mockResolvedValue(tokenResponse);
    const handler = createAuthHandler({ stateStore: store, exchange });
    const { state, cookie } = await startFlow(handler);
    const response = await handler(
      createAuthRequest({ code: 'oauth-code', state }, cookie),
      createContext('203.0.113.40'),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(body).toEqual({
      access_token: 'access-token',
      expires_at: tokenResponse.expires_at,
      athlete: tokenResponse.athlete,
    });
    expect(body.refresh_token).toBeUndefined();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Vary')).toContain('Origin');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('rejects malformed cookies as a 400 rather than a server error', async () => {
    const { store } = createMemoryStateStore();
    const handler = createAuthHandler({ stateStore: store });
    const response = await handler(
      createAuthRequest(
        { code: 'oauth-code', state: 'a'.repeat(64) },
        'strava_oauth_state=%E0%A4%A',
      ),
      createContext('203.0.113.41'),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('rejects non-POST requests', async () => {
    const handler = createAuthHandler();
    const options = await handler(
      new Request('https://functions.example.com/auth', {
        method: 'OPTIONS',
        headers: { origin: 'https://app.example.com' },
      }),
      createContext('203.0.113.49'),
    );
    const response = await handler(
      new Request('https://functions.example.com/auth?code=oauth-code', { method: 'GET' }),
      createContext('203.0.113.50'),
    );

    expect(options.status).toBe(200);
    expect(options.headers.get('Cache-Control')).toBe('no-store');
    expect(options.headers.get('Vary')).toContain('Origin');
    await expect(response.json()).resolves.toEqual({ error: 'Method not allowed' });
    expect(response.status).toBe(405);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('keeps local rate limits non-cacheable and reports their retry window', async () => {
    const { store } = createMemoryStateStore();
    const handler = createAuthHandler({ stateStore: store });
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    let response: Response | undefined;
    for (let attempt = 0; attempt < 21; attempt += 1) {
      response = await handler(createAuthRequest({ action: 'start' }), createContext(ip));
    }

    expect(response?.status).toBe(429);
    expect(response?.headers.get('Retry-After')).toBe('60');
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
  });
});
