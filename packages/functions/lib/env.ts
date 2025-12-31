import type { Hex } from 'viem';

interface EnvConfig {
  STRAVA_CLIENT_ID: string;
  STRAVA_CLIENT_SECRET: string;
  FRONTEND_URL: string;
  SIGNER_PRIVATE_KEY: Hex;
}

interface EnvErrors {
  missing: string[];
  invalid: string[];
}

export function getEnvConfig(): EnvConfig {
  const errors: EnvErrors = { missing: [], invalid: [] };

  const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID;
  const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
  const FRONTEND_URL = process.env.FRONTEND_URL;
  const SIGNER_PRIVATE_KEY = process.env.SIGNER_PRIVATE_KEY;

  if (!STRAVA_CLIENT_ID) errors.missing.push('STRAVA_CLIENT_ID');
  if (!STRAVA_CLIENT_SECRET) errors.missing.push('STRAVA_CLIENT_SECRET');
  if (!FRONTEND_URL) errors.missing.push('FRONTEND_URL');
  if (!SIGNER_PRIVATE_KEY) errors.missing.push('SIGNER_PRIVATE_KEY');

  if (SIGNER_PRIVATE_KEY && !SIGNER_PRIVATE_KEY.startsWith('0x')) {
    errors.invalid.push('SIGNER_PRIVATE_KEY must start with 0x');
  }

  if (SIGNER_PRIVATE_KEY && SIGNER_PRIVATE_KEY.length !== 66) {
    errors.invalid.push('SIGNER_PRIVATE_KEY must be 66 characters (0x + 64 hex chars)');
  }

  if (FRONTEND_URL && !FRONTEND_URL.startsWith('http')) {
    errors.invalid.push('FRONTEND_URL must be a valid URL');
  }

  if (errors.missing.length > 0 || errors.invalid.length > 0) {
    const messages: string[] = [];
    if (errors.missing.length > 0) {
      messages.push(`Missing env vars: ${errors.missing.join(', ')}`);
    }
    if (errors.invalid.length > 0) {
      messages.push(`Invalid env vars: ${errors.invalid.join('; ')}`);
    }
    throw new Error(messages.join('. '));
  }

  return {
    STRAVA_CLIENT_ID: STRAVA_CLIENT_ID!,
    STRAVA_CLIENT_SECRET: STRAVA_CLIENT_SECRET!,
    FRONTEND_URL: FRONTEND_URL!,
    SIGNER_PRIVATE_KEY: SIGNER_PRIVATE_KEY as Hex,
  };
}

export function getCorsHeaders(origin?: string): Record<string, string> {
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:5174',
    'http://localhost:8888',
  ].filter(Boolean) as string[];

  const isAllowed = origin && allowedOrigins.includes(origin);

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : allowedOrigins[0] || '',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };
}
