import type { Context } from '@netlify/functions';
import type { StravaTokenResponse } from '../lib/types';
import { STRAVA_TOKEN_URL } from '../lib/constants';
import { getEnvConfig, getCorsHeaders } from '../lib/env';

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 20; // requests per window
const RATE_LIMIT_WINDOW = 60_000; // 1 minute

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
  });

  if (!response.ok) {
    const error: FetchError = new Error(`Strava API error: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.json() as Promise<StravaTokenResponse>;
}

/**
 * Refresh an expired access token
 */
async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<StravaTokenResponse> {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  if (!response.ok) {
    const error: FetchError = new Error(`Strava API error: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.json() as Promise<StravaTokenResponse>;
}

interface AuthRequestBody {
  code?: string;
  refresh_token?: string;
}

/**
 * Netlify Function handler for Strava authentication
 *
 * Endpoints:
 * - POST /auth with { code: "xxx" } - Exchange OAuth code for tokens
 * - POST /auth with { refresh_token: "xxx" } - Refresh expired token
 */
export default async (req: Request, context: Context): Promise<Response> => {
  const origin = req.headers.get('origin') ?? undefined;
  const headers = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers });
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

    // Parse body for code or refresh_token
    let code: string | undefined;
    let refreshToken: string | undefined;

    if (req.method === 'POST') {
      try {
        const body = (await req.json()) as AuthRequestBody;
        code = body.code;
        refreshToken = body.refresh_token;
      } catch {
        // Body parsing failed, check query params as fallback for code (OAuth callback)
      }
    }

    // Fallback to query params for OAuth code (redirect from Strava)
    if (!code && !refreshToken) {
      const { searchParams } = context.url;
      code = searchParams.get('code') ?? undefined;
    }

    if (!code && !refreshToken) {
      return new Response(JSON.stringify({ error: 'Missing code or refresh_token' }), {
        status: 400,
        headers,
      });
    }

    let tokenResponse: StravaTokenResponse;

    if (code) {
      tokenResponse = await exchangeCodeForToken(
        code,
        config.STRAVA_CLIENT_ID,
        config.STRAVA_CLIENT_SECRET,
      );
    } else if (refreshToken) {
      tokenResponse = await refreshAccessToken(
        refreshToken,
        config.STRAVA_CLIENT_ID,
        config.STRAVA_CLIENT_SECRET,
      );
    } else {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers,
      });
    }

    return new Response(
      JSON.stringify({
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token,
        expires_at: tokenResponse.expires_at,
        athlete: tokenResponse.athlete,
      }),
      {
        status: 200,
        headers,
      },
    );
  } catch (error: unknown) {
    // Log only safe error info to avoid token leaks
    const status = (error as FetchError).status;
    console.error('Auth error:', {
      status,
      message: error instanceof Error ? error.message : 'Unknown error',
    });

    if (status === 401) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers,
      });
    }

    return new Response(JSON.stringify({ error: 'Authentication failed' }), {
      status: 500,
      headers,
    });
  }
};
