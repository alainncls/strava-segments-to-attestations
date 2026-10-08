import type { Context } from '@netlify/functions';
import { randomBytes } from 'node:crypto';
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
  upstreamSignal,
} from '../lib/http';

const OAUTH_STATE_COOKIE = 'strava_oauth_state';
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 20; // requests per window
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

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
    signal: upstreamSignal(),
  });

  return (await readUpstreamJson(response)) as StravaTokenResponse;
}

interface AuthRequestBody {
  action?: 'start';
  code?: string;
  state?: string;
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
    cookies.set(name, decodeURIComponent(valueParts.join('=')));
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

/**
 * Netlify Function handler for Strava authentication
 *
 * Endpoints:
 * - POST /auth with { action: "start" } - Issue OAuth state
 * - POST /auth with { code: "xxx", state: "xxx" } - Exchange OAuth code for access token
 */
export default async (req: Request, context: Context): Promise<Response> => {
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
  if (isRateLimited(clientIp)) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { ...headers, 'Retry-After': '60' },
    });
  }

  try {
    // Validate environment
    const config = getEnvConfig();

    // Parse body for OAuth state or code exchange
    let body: AuthRequestBody;

    try {
      body = assertRecord(await readJsonBody(req)) as AuthRequestBody;
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
    if (!state || !expectedState || state !== expectedState) {
      return new Response(JSON.stringify({ error: 'Invalid state' }), {
        status: 400,
        headers: { ...headers, 'Set-Cookie': buildClearStateCookie(req) },
      });
    }

    const tokenResponse = await exchangeCodeForToken(
      code,
      config.STRAVA_CLIENT_ID,
      config.STRAVA_CLIENT_SECRET,
    );

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
