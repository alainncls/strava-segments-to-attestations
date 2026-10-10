import type { Context } from '@netlify/functions';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { StravaTokenResponse } from '../lib/types';
import { STRAVA_TOKEN_URL } from '../lib/constants';
import { getEnvConfig, getCorsHeaders } from '../lib/env';
import { createNetlifyOAuthStateStore } from './lib/oauth-state';
import type { OAuthStateRecord, OAuthStateStore } from './lib/oauth-state';

const OAUTH_STATE_COOKIE = 'strava_oauth_state';
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW = 60_000;
const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

interface FetchError extends Error {
  status?: number;
}

interface AuthRequestBody {
  action?: 'start';
  code?: string;
  state?: string;
}

interface AuthDependencies {
  stateStore?: OAuthStateStore;
  now?: () => number;
  exchange?: (code: string, clientId: string, clientSecret: string) => Promise<StravaTokenResponse>;
}

class AuthError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<StravaTokenResponse> {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
  });
  const response = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    const error: FetchError = new Error(`Strava API error: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json() as Promise<StravaTokenResponse>;
}

function parseCookies(cookieHeader: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!cookieHeader) return cookies;
  for (const cookie of cookieHeader.split(';')) {
    const [name, ...valueParts] = cookie.trim().split('=');
    if (!name || valueParts.length === 0) continue;
    try {
      cookies.set(name, decodeURIComponent(valueParts.join('=')));
    } catch {
      throw new AuthError(400, 'Invalid cookie');
    }
  }
  return cookies;
}

function buildStateCookie(state: string, req: Request): string {
  const secureAttribute = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return `${OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${OAUTH_STATE_MAX_AGE_SECONDS}${secureAttribute}`;
}

function buildClearStateCookie(req: Request): string {
  const secureAttribute = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return `${OAUTH_STATE_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secureAttribute}`;
}

const generateOAuthState = (): string => randomBytes(32).toString('hex');
const hashState = (state: string): string => createHash('sha256').update(state).digest('hex');

const isAllowedOrigin = (origin: string | null, frontendUrl: string): origin is string =>
  origin !== null &&
  [frontendUrl, 'http://localhost:5174', 'http://localhost:8888'].includes(origin);

const isMatchingState = (state: string, expected: string): boolean => {
  const actualBytes = Buffer.from(state);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
};

const json = (
  body: unknown,
  status: number,
  headers: Record<string, string>,
  clearCookie?: string,
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: clearCookie ? { ...headers, 'Set-Cookie': clearCookie } : headers,
  });

export const createAuthHandler =
  (dependencies: AuthDependencies = {}) =>
  async (req: Request, context: Context): Promise<Response> => {
    const origin = req.headers.get('origin');
    const headers = getCorsHeaders(origin ?? undefined);
    const clearCookie = buildClearStateCookie(req);

    if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, headers);

    const clientIp = context.ip ?? 'unknown';
    if (isRateLimited(clientIp)) {
      return json({ error: 'Too many requests' }, 429, { ...headers, 'Retry-After': '60' });
    }

    let stateCookieToClear: string | undefined;
    try {
      const config = getEnvConfig();
      if (!isAllowedOrigin(origin, config.FRONTEND_URL)) {
        throw new AuthError(403, 'Invalid origin');
      }

      let body: AuthRequestBody;
      try {
        body = (await req.json()) as AuthRequestBody;
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          throw new Error('Expected an object');
        }
      } catch {
        throw new AuthError(400, 'Invalid JSON body');
      }

      if (body.action === 'start') {
        const state = generateOAuthState();
        const now = dependencies.now?.() ?? Date.now();
        const record: OAuthStateRecord = {
          version: 1,
          issuedAt: now,
          expiresAt: now + OAUTH_STATE_MAX_AGE_SECONDS * 1000,
          status: 'pending',
        };
        try {
          const store = dependencies.stateStore ?? createNetlifyOAuthStateStore();
          if (!(await store.create(hashState(state), record))) {
            throw new AuthError(503, 'Could not reserve OAuth state');
          }
        } catch {
          throw new AuthError(503, 'OAuth state storage unavailable');
        }
        return json({ state }, 200, { ...headers, 'Set-Cookie': buildStateCookie(state, req) });
      }

      const { code, state } = body;
      stateCookieToClear = clearCookie;
      if (!code || typeof code !== 'string') throw new AuthError(400, 'Missing code');
      if (!state || typeof state !== 'string' || !/^[a-f0-9]{64}$/.test(state)) {
        throw new AuthError(400, 'Invalid state');
      }

      const expectedState = parseCookies(req.headers.get('cookie')).get(OAUTH_STATE_COOKIE);
      if (!expectedState || !isMatchingState(state, expectedState)) {
        throw new AuthError(400, 'Invalid state');
      }

      let store: OAuthStateStore;
      let entry;
      try {
        store = dependencies.stateStore ?? createNetlifyOAuthStateStore();
        entry = await store.read(hashState(state));
      } catch {
        throw new AuthError(503, 'OAuth state storage unavailable');
      }
      const now = dependencies.now?.() ?? Date.now();
      if (!entry) throw new AuthError(400, 'Invalid or expired state');
      if (entry.record.status !== 'pending') throw new AuthError(400, 'OAuth state already used');
      if (
        entry.record.version !== 1 ||
        !Number.isFinite(entry.record.issuedAt) ||
        !Number.isFinite(entry.record.expiresAt) ||
        entry.record.issuedAt > now ||
        entry.record.expiresAt <= now ||
        entry.record.expiresAt - entry.record.issuedAt > OAUTH_STATE_MAX_AGE_SECONDS * 1000
      ) {
        throw new AuthError(400, 'Invalid or expired state');
      }

      try {
        if (
          !(await store.compareAndSet(hashState(state), entry.etag, {
            ...entry.record,
            status: 'consumed',
          }))
        ) {
          throw new AuthError(400, 'OAuth state already used');
        }
      } catch (error) {
        if (error instanceof AuthError) throw error;
        throw new AuthError(503, 'OAuth state storage unavailable');
      }

      try {
        const tokenResponse = await (dependencies.exchange ?? exchangeCodeForToken)(
          code,
          config.STRAVA_CLIENT_ID,
          config.STRAVA_CLIENT_SECRET,
        );
        return json(
          {
            access_token: tokenResponse.access_token,
            expires_at: tokenResponse.expires_at,
            athlete: tokenResponse.athlete,
          },
          200,
          headers,
          clearCookie,
        );
      } catch (error: unknown) {
        const status = (error as FetchError).status;
        if (status === 401) throw new AuthError(401, 'Invalid or expired token');
        if (error instanceof DOMException && error.name === 'TimeoutError') {
          throw new AuthError(504, 'Upstream request timed out');
        }
        console.error('Auth error:', {
          status,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        throw new AuthError(500, 'Authentication failed');
      }
    } catch (error: unknown) {
      if (error instanceof AuthError) {
        return json({ error: error.message }, error.status, headers, stateCookieToClear);
      }
      console.error('Auth error:', {
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      return json({ error: 'Authentication failed' }, 500, headers, stateCookieToClear);
    }
  };

export default createAuthHandler();
