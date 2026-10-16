import type { Context } from '@netlify/functions';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { StravaTokenResponse } from '../lib/types';
import { STRAVA_TOKEN_URL } from '../lib/constants';
import { getEnvConfig, getCorsHeaders } from '../lib/env';
import {
  assertRecord,
  HttpError,
  isUpstreamTimeout,
  readJsonBody,
  readUpstreamJson,
  UpstreamStatusError,
} from '../lib/http';
import { createRateLimiter } from './rateLimiter';
import { createNetlifyOAuthStateStore } from './lib/oauth-state';
import type { OAuthStateRecord, OAuthStateStore } from './lib/oauth-state';

const OAUTH_STATE_COOKIE = 'strava_oauth_state';
const RATE_LIMIT_MAX = 20; // requests per window
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;
const OAUTH_BUDGET_MS = 8_000;
const authRateLimiter = createRateLimiter({
  limit: RATE_LIMIT_MAX,
  windowMs: RATE_LIMIT_WINDOW,
  maxEntries: 10_000,
});

interface FetchError extends Error {
  status?: number;
}

/**
 * Exchange OAuth code for access token
 */
async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  signal: AbortSignal,
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
    signal,
  });

  return (await readUpstreamJson(response)) as StravaTokenResponse;
}

interface AuthRequestBody {
  action?: 'start';
  code?: string;
  state?: string;
}

interface AuthDependencies {
  stateStore?: OAuthStateStore;
  exchange?: (
    code: string,
    clientId: string,
    clientSecret: string,
    signal: AbortSignal,
  ) => Promise<StravaTokenResponse>;
  now?: () => number;
  monotonicNow?: () => number;
  budgetMs?: number;
}

function logStateStorageError(error: unknown): void {
  console.error('OAuth state storage error:', error instanceof Error ? error.message : error);
}

class AuthTimeoutError extends Error {
  constructor(readonly stage: string) {
    super(`OAuth ${stage} exceeded its request deadline`);
  }
}

function withDeadline<T>(
  work: Promise<T> | (() => Promise<T>),
  deadlineAt: number,
  now: () => number,
  stage: string,
  onTimeout?: () => void,
): Promise<T> {
  const remaining = Math.floor(deadlineAt - now());
  if (remaining <= 0) {
    onTimeout?.();
    return Promise.reject(new AuthTimeoutError(stage));
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      reject(new AuthTimeoutError(stage));
    }, remaining);
    timer.unref?.();
  });
  // Start each operation only after checking the remaining budget. In
  // particular, never invoke the provider transport with an already-expired
  // request signal just to have Promise.race reject immediately afterwards.
  const operation = typeof work === 'function' ? work() : work;
  return Promise.race([operation, timeout])
    .then((result) => {
      // A provider/store promise can settle in the same event-loop turn as the
      // timer. The promise reaction may win the race even though the monotonic
      // deadline has already elapsed, so validate the result before advancing
      // to the next stage (notably OAuth token exchange).
      if (now() >= deadlineAt) {
        onTimeout?.();
        throw new AuthTimeoutError(stage);
      }
      return result;
    })
    .finally(() => {
      if (timer) clearTimeout(timer);
    });
}

function parseCookies(cookieHeader: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!cookieHeader) {
    return cookies;
  }

  for (const cookie of cookieHeader.split(';')) {
    const [name, ...valueParts] = cookie.trim().split('=');
    if (!name || valueParts.length === 0) {
      continue;
    }
    try {
      cookies.set(name, decodeURIComponent(valueParts.join('=')));
    } catch {
      throw new HttpError(400, 'Invalid cookie');
    }
  }

  return cookies;
}

function buildStateCookie(state: string, req: Request): string {
  const isSecure = new URL(req.url).protocol === 'https:';
  const secureAttribute = isSecure ? '; Secure' : '';
  return `${OAUTH_STATE_COOKIE}=${encodeURIComponent(
    state,
  )}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${OAUTH_STATE_MAX_AGE_SECONDS}${secureAttribute}`;
}

function buildClearStateCookie(req: Request): string {
  const isSecure = new URL(req.url).protocol === 'https:';
  const secureAttribute = isSecure ? '; Secure' : '';
  return `${OAUTH_STATE_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secureAttribute}`;
}

function generateOAuthState(): string {
  return randomBytes(32).toString('hex');
}

const hashState = (state: string): string => createHash('sha256').update(state).digest('hex');

function matchesState(state: string, expected: string): boolean {
  const actual = Buffer.from(state);
  const required = Buffer.from(expected);
  return actual.length === required.length && timingSafeEqual(actual, required);
}

/**
 * Netlify Function handler for Strava authentication
 *
 * Endpoints:
 * - POST /auth with { action: "start" } - Issue OAuth state
 * - POST /auth with { code: "xxx", state: "xxx" } - Exchange OAuth code for access token
 */
export const createAuthHandler =
  (dependencies: AuthDependencies = {}) =>
  async (req: Request, context: Context): Promise<Response> => {
    const monotonicNow = dependencies.monotonicNow ?? (() => performance.now());
    const deadlineAt = monotonicNow() + (dependencies.budgetMs ?? OAUTH_BUDGET_MS);
    const origin = req.headers.get('origin') ?? undefined;
    const headers = getCorsHeaders(origin);

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers });
    }

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers,
      });
    }

    // Rate limiting
    const clientIp = context.ip ?? 'unknown';
    const rateLimit = authRateLimiter.consume(clientIp);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { ...headers, 'Retry-After': String(rateLimit.retryAfterSeconds) },
      });
    }

    try {
      // Validate environment
      const config = getEnvConfig();
      const allowedOrigins = [
        config.FRONTEND_URL,
        'http://localhost:5174',
        'http://localhost:8888',
      ];
      if (!origin || !allowedOrigins.includes(origin)) {
        return new Response(JSON.stringify({ error: 'Invalid origin' }), { status: 403, headers });
      }

      // Parse body for OAuth state or code exchange
      let body: AuthRequestBody;

      try {
        const requestBodyController = new AbortController();
        body = assertRecord(
          await withDeadline(
            () => readJsonBody(req, requestBodyController.signal),
            deadlineAt,
            monotonicNow,
            'request body',
            () => requestBodyController.abort(new AuthTimeoutError('request body')),
          ),
        ) as AuthRequestBody;
      } catch (error) {
        if (error instanceof HttpError) {
          return new Response(JSON.stringify(error.payload), {
            status: error.status,
            headers,
          });
        }
        throw error;
      }

      if (body.action === 'start') {
        const state = generateOAuthState();
        const issuedAt = dependencies.now?.() ?? Date.now();
        const record: OAuthStateRecord = {
          version: 1,
          origin,
          issuedAt,
          expiresAt: issuedAt + OAUTH_STATE_MAX_AGE_SECONDS * 1_000,
          status: 'pending',
        };
        try {
          const store =
            dependencies.stateStore ?? createNetlifyOAuthStateStore(context.deploy?.context);
          const created = await withDeadline(
            () => store.create(hashState(state), record),
            deadlineAt,
            monotonicNow,
            'state creation',
          );
          if (!created) {
            return new Response(JSON.stringify({ error: 'Could not reserve OAuth state' }), {
              status: 503,
              headers,
            });
          }
        } catch (error) {
          if (error instanceof AuthTimeoutError) throw error;
          logStateStorageError(error);
          return new Response(JSON.stringify({ error: 'OAuth state storage unavailable' }), {
            status: 503,
            headers,
          });
        }
        return new Response(JSON.stringify({ state }), {
          status: 200,
          headers: { ...headers, 'Set-Cookie': buildStateCookie(state, req) },
        });
      }

      const { code, state } = body;

      if (!code) {
        return new Response(JSON.stringify({ error: 'Missing code' }), {
          status: 400,
          headers,
        });
      }

      const expectedState = parseCookies(req.headers.get('cookie')).get(OAUTH_STATE_COOKIE);
      if (
        !state ||
        !/^[a-f0-9]{64}$/.test(state) ||
        !expectedState ||
        !matchesState(state, expectedState)
      ) {
        return new Response(JSON.stringify({ error: 'Invalid state' }), {
          status: 400,
          headers: { ...headers, 'Set-Cookie': buildClearStateCookie(req) },
        });
      }

      const store =
        dependencies.stateStore ?? createNetlifyOAuthStateStore(context.deploy?.context);
      let entry;
      try {
        entry = await withDeadline(
          () => store.read(hashState(state)),
          deadlineAt,
          monotonicNow,
          'state read',
        );
      } catch (error) {
        if (error instanceof AuthTimeoutError) throw error;
        logStateStorageError(error);
        return new Response(JSON.stringify({ error: 'OAuth state storage unavailable' }), {
          status: 503,
          headers,
        });
      }
      const now = dependencies.now?.() ?? Date.now();
      if (
        !entry ||
        entry.record.status !== 'pending' ||
        entry.record.version !== 1 ||
        entry.record.origin !== origin ||
        !Number.isFinite(entry.record.issuedAt) ||
        !Number.isFinite(entry.record.expiresAt) ||
        entry.record.issuedAt > now ||
        entry.record.expiresAt <= now ||
        entry.record.expiresAt - entry.record.issuedAt > OAUTH_STATE_MAX_AGE_SECONDS * 1_000
      ) {
        return new Response(JSON.stringify({ error: 'Invalid or expired state' }), {
          status: 400,
          headers: { ...headers, 'Set-Cookie': buildClearStateCookie(req) },
        });
      }
      let consumed: boolean;
      try {
        consumed = await withDeadline(
          () =>
            store.compareAndSet(hashState(state), entry.etag, {
              ...entry.record,
              status: 'consumed',
            }),
          deadlineAt,
          monotonicNow,
          'state consumption',
        );
      } catch (error) {
        if (error instanceof AuthTimeoutError) throw error;
        logStateStorageError(error);
        return new Response(JSON.stringify({ error: 'OAuth state storage unavailable' }), {
          status: 503,
          headers,
        });
      }
      if (!consumed) {
        return new Response(JSON.stringify({ error: 'OAuth state already used' }), {
          status: 400,
          headers: { ...headers, 'Set-Cookie': buildClearStateCookie(req) },
        });
      }

      const controller = new AbortController();
      let tokenResponse: StravaTokenResponse;
      try {
        tokenResponse = await withDeadline(
          () =>
            (dependencies.exchange ?? exchangeCodeForToken)(
              code,
              config.STRAVA_CLIENT_ID,
              config.STRAVA_CLIENT_SECRET,
              controller.signal,
            ),
          deadlineAt,
          monotonicNow,
          'token exchange',
          () => controller.abort(new AuthTimeoutError('token exchange')),
        );
      } finally {
        if (!controller.signal.aborted) controller.abort();
      }

      return new Response(
        JSON.stringify({
          access_token: tokenResponse.access_token,
          expires_at: tokenResponse.expires_at,
          athlete: tokenResponse.athlete,
        }),
        {
          status: 200,
          headers: { ...headers, 'Set-Cookie': buildClearStateCookie(req) },
        },
      );
    } catch (error: unknown) {
      // Log only safe error info to avoid token leaks
      const status = (error as FetchError).status;
      console.error('Auth error:', {
        status,
        message: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof HttpError) {
        return new Response(JSON.stringify(error.payload), {
          status: error.status,
          headers,
        });
      }

      if (error instanceof AuthTimeoutError) {
        return new Response(JSON.stringify({ error: 'Authentication request timed out' }), {
          status: 504,
          headers,
        });
      }

      if (isUpstreamTimeout(error)) {
        return new Response(JSON.stringify({ error: 'Upstream request timed out' }), {
          status: 504,
          headers,
        });
      }

      const upstreamStatus = error instanceof UpstreamStatusError ? error.status : status;
      if (upstreamStatus === 401) {
        return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
          status: 401,
          headers,
        });
      }

      if (upstreamStatus === 429) {
        return new Response(JSON.stringify({ error: 'Upstream rate limited' }), {
          status: 429,
          headers,
        });
      }

      if (upstreamStatus) {
        return new Response(JSON.stringify({ error: 'Upstream request failed' }), {
          status: 502,
          headers,
        });
      }

      return new Response(JSON.stringify({ error: 'Authentication failed' }), {
        status: 500,
        headers,
      });
    }
  };

export default createAuthHandler();
