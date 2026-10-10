import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Context } from '@netlify/functions';
import { getCorsHeaders } from '../lib/env';
import signHandler from '../src/sign';

vi.mock('@strava-attestations/shared', async () => import('../../shared/src/index.ts'));

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
