import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import authHandler from '../src/auth';
import signHandler from '../src/sign';
import { createLocalFunctionServer } from '../lib/localDevServer';

const envKeys = [
  'STRAVA_CLIENT_ID',
  'STRAVA_CLIENT_SECRET',
  'FRONTEND_URL',
  'SIGNER_PRIVATE_KEY',
] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

let server: Server;
let baseUrl: string;

describe('local adapter invokes the real Netlify function handlers', () => {
  beforeAll(async () => {
    process.env.STRAVA_CLIENT_ID = 'local-test-client-id';
    process.env.STRAVA_CLIENT_SECRET = 'local-test-secret';
    process.env.FRONTEND_URL = 'http://localhost:5174';
    process.env.SIGNER_PRIVATE_KEY = `0x${'1'.repeat(64)}`;

    server = createLocalFunctionServer({
      auth: authHandler,
      sign: signHandler,
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing listener');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    for (const key of envKeys) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('serves the /.netlify/functions URL, preserving OAuth cookies and CORS', async () => {
    const response = await fetch(`${baseUrl}/.netlify/functions/auth`, {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5174',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action: 'start' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5174');
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    const cookie = response.headers.get('set-cookie');
    expect(cookie).toContain('strava_oauth_state=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Max-Age=600');
    expect((await response.json()).state).toMatch(/^[a-f0-9]{64}$/);
  });

  it('preserves handler method and invalid-body responses without provider calls', async () => {
    const methodResponse = await fetch(`${baseUrl}/auth`);
    expect(methodResponse.status).toBe(405);
    expect(methodResponse.headers.get('cache-control')).toBe('no-store');

    const invalidBodyResponse = await fetch(`${baseUrl}/auth`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    expect(invalidBodyResponse.status).toBe(400);

    const missingSignInput = await fetch(`${baseUrl}/sign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(missingSignInput.status).toBe(400);
    expect(missingSignInput.headers.get('cache-control')).toBe('no-store');
  });

  it('handles preflight and unknown endpoints explicitly', async () => {
    const preflight = await fetch(`${baseUrl}/auth`, {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:5174' },
    });
    expect(preflight.status).toBe(200);
    expect(preflight.headers.get('access-control-allow-credentials')).toBe('true');
    expect(preflight.headers.get('cache-control')).toBe('no-store');

    const missing = await fetch(`${baseUrl}/missing`);
    expect(missing.status).toBe(404);
    expect(missing.headers.get('cache-control')).toBe('no-store');
    await expect(missing.json()).resolves.toEqual({ error: 'Function not found' });
  });
});
