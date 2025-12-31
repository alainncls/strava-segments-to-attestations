import type { Context } from '@netlify/functions';
import type { WalletClient } from 'viem';
import { type Address, createWalletClient, type Hex, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { SignedSegment, StravaSegmentEffort } from '../lib/types';
import {
  linea,
  lineaSepolia,
  PORTAL_ID_MAINNET,
  PORTAL_ID_SEPOLIA,
  STRAVA_API_BASE,
} from '../lib/constants';
import { getCorsHeaders, getEnvConfig } from '../lib/env';

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW = 60_000;

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

interface StravaActivityResponse {
  segment_efforts?: StravaSegmentEffort[];
}

async function getActivitySegments(
  accessToken: string,
  activityId: string,
): Promise<StravaSegmentEffort[]> {
  const response = await fetch(`${STRAVA_API_BASE}/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const error: FetchError = new Error(`Strava API error: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const data = (await response.json()) as StravaActivityResponse;
  return data.segment_efforts || [];
}

async function signSegment(
  walletClient: WalletClient,
  segmentId: number,
  subject: Address,
  chainId: number,
): Promise<Hex> {
  const isMainnet = chainId === linea.id;
  const portalAddress = isMainnet ? PORTAL_ID_MAINNET : PORTAL_ID_SEPOLIA;

  const domain = {
    name: 'VerifyStrava',
    version: '1',
    chainId: chainId,
    verifyingContract: portalAddress,
  } as const;

  const types = {
    Segment: [
      { name: 'segmentId', type: 'uint256' },
      { name: 'subject', type: 'address' },
    ],
  } as const;

  const account = walletClient.account;
  if (!account) {
    throw new Error('Signer account not configured');
  }

  const message = {
    segmentId: BigInt(segmentId),
    subject,
  };

  return await walletClient.signTypedData({
    account,
    domain,
    types,
    primaryType: 'Segment',
    message,
  });
}

interface SignRequestBody {
  accessToken?: string;
  activityId?: string;
  segmentId?: number;
  subject?: string;
  chainId?: number;
}

export default async (req: Request, context: Context): Promise<Response> => {
  const origin = req.headers.get('origin') ?? undefined;
  const headers = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers,
    });
  }

  const clientIp = context.ip ?? 'unknown';
  if (isRateLimited(clientIp)) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { ...headers, 'Retry-After': '60' },
    });
  }

  try {
    const config = getEnvConfig();

    const body = (await req.json()) as SignRequestBody;
    const { accessToken, activityId, segmentId, subject, chainId } = body;

    if (!accessToken || !activityId || !segmentId || !subject || !chainId) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
        status: 400,
        headers,
      });
    }

    // Validate activityId is a numeric string (defensive: avoid URL manipulation)
    if (!/^\d+$/.test(activityId)) {
      return new Response(JSON.stringify({ error: 'Invalid activityId format' }), {
        status: 400,
        headers,
      });
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(subject)) {
      return new Response(JSON.stringify({ error: 'Invalid subject address' }), {
        status: 400,
        headers,
      });
    }

    if (chainId !== linea.id && chainId !== lineaSepolia.id) {
      return new Response(JSON.stringify({ error: 'Invalid chainId' }), {
        status: 400,
        headers,
      });
    }

    const segments = await getActivitySegments(accessToken, activityId);
    const segmentEffort = segments.find((s) => s.segment.id === segmentId);

    if (!segmentEffort) {
      return new Response(JSON.stringify({ error: 'Segment not found in this activity' }), {
        status: 404,
        headers,
      });
    }

    const isMainnet = chainId === linea.id;
    const chain = isMainnet ? linea : lineaSepolia;

    const walletClient = createWalletClient({
      account: privateKeyToAccount(config.SIGNER_PRIVATE_KEY),
      chain,
      transport: http(),
    });

    const signature = await signSegment(walletClient, segmentId, subject as Address, chainId);

    const signedSegment: SignedSegment = {
      segmentId: segmentEffort.segment.id,
      completionDate: Math.floor(new Date(segmentEffort.start_date).getTime() / 1000),
      signature,
    };

    return new Response(JSON.stringify(signedSegment), {
      status: 200,
      headers,
    });
  } catch (error: unknown) {
    // Log only safe error info to avoid token leaks
    const status = (error as FetchError).status;
    console.error('Sign error:', {
      status,
      message: error instanceof Error ? error.message : 'Unknown error',
    });

    if (status === 401) {
      return new Response(JSON.stringify({ error: 'Invalid Strava token', tokenExpired: true }), {
        status: 401,
        headers,
      });
    }

    return new Response(JSON.stringify({ error: 'Signing failed' }), {
      status: 500,
      headers,
    });
  }
};
