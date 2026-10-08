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
import {
  assertRecord,
  HttpError,
  isUpstreamTimeout,
  readJsonBody,
  readUpstreamJson,
  UpstreamStatusError,
  upstreamSignal,
} from '../lib/http';

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW = 60_000;
const SIGNATURE_TTL_SECONDS = 10 * 60;

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
  athlete?: { id?: unknown };
  segment_efforts?: StravaSegmentEffort[];
}

interface StravaAthleteResponse {
  id?: unknown;
}

async function getAuthenticatedAthleteId(accessToken: string): Promise<number> {
  const response = await fetch(`${STRAVA_API_BASE}/athlete`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: upstreamSignal(),
  });
  const data: unknown = await readUpstreamJson(response);
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new HttpError(502, 'Invalid Strava profile response');
  }

  const athleteId = (data as StravaAthleteResponse).id;
  if (!Number.isSafeInteger(athleteId) || typeof athleteId !== 'number' || athleteId <= 0) {
    throw new HttpError(502, 'Invalid Strava profile response');
  }
  return athleteId;
}

async function getActivitySegments(
  accessToken: string,
  activityId: string,
  authenticatedAthleteId: number,
): Promise<StravaSegmentEffort[]> {
  const response = await fetch(`${STRAVA_API_BASE}/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: upstreamSignal(),
  });

  const rawData: unknown = await readUpstreamJson(response);
  if (typeof rawData !== 'object' || rawData === null || Array.isArray(rawData)) {
    throw new HttpError(502, 'Invalid Strava activity response');
  }
  const data = rawData as StravaActivityResponse;
  const activityAthleteId = data.athlete?.id;
  if (
    typeof activityAthleteId !== 'number' ||
    !Number.isSafeInteger(activityAthleteId) ||
    activityAthleteId <= 0
  ) {
    throw new HttpError(502, 'Invalid Strava activity response');
  }
  if (activityAthleteId !== authenticatedAthleteId) {
    throw new HttpError(403, 'Activity does not belong to authenticated athlete');
  }
  return Array.isArray(data.segment_efforts) ? data.segment_efforts : [];
}

async function signSegment(
  walletClient: WalletClient,
  segmentId: number,
  completionDate: number,
  subject: Address,
  deadline: number,
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
      { name: 'completionDate', type: 'uint64' },
      { name: 'subject', type: 'address' },
      { name: 'deadline', type: 'uint64' },
    ],
  } as const;

  const account = walletClient.account;
  if (!account) {
    throw new Error('Signer account not configured');
  }

  const message = {
    segmentId: BigInt(segmentId),
    completionDate: BigInt(completionDate),
    subject,
    deadline: BigInt(deadline),
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

    const body = assertRecord(await readJsonBody(req)) as SignRequestBody;
    const { accessToken, activityId, segmentId, subject, chainId } = body;

    if (
      typeof accessToken !== 'string' ||
      accessToken.length === 0 ||
      !activityId ||
      segmentId === undefined ||
      !subject ||
      chainId === undefined
    ) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
        status: 400,
        headers,
      });
    }

    // Validate activityId is a numeric string (defensive: avoid URL manipulation)
    if (
      typeof activityId !== 'string' ||
      !/^[1-9]\d*$/.test(activityId) ||
      !Number.isSafeInteger(Number(activityId))
    ) {
      return new Response(JSON.stringify({ error: 'Invalid activityId' }), {
        status: 400,
        headers,
      });
    }

    if (typeof segmentId !== 'number' || !Number.isSafeInteger(segmentId) || segmentId <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid segmentId' }), {
        status: 400,
        headers,
      });
    }

    if (typeof subject !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(subject)) {
      return new Response(JSON.stringify({ error: 'Invalid subject address' }), {
        status: 400,
        headers,
      });
    }

    if (
      typeof chainId !== 'number' ||
      !Number.isSafeInteger(chainId) ||
      (chainId !== linea.id && chainId !== lineaSepolia.id)
    ) {
      return new Response(JSON.stringify({ error: 'Invalid chainId' }), {
        status: 400,
        headers,
      });
    }

    const authenticatedAthleteId = await getAuthenticatedAthleteId(accessToken);
    const segments = await getActivitySegments(accessToken, activityId, authenticatedAthleteId);
    const segmentEffort = segments.find((s) => s.segment.id === segmentId);

    if (!segmentEffort) {
      return new Response(JSON.stringify({ error: 'Segment not found in this activity' }), {
        status: 404,
        headers,
      });
    }

    const isMainnet = chainId === linea.id;
    const chain = isMainnet ? linea : lineaSepolia;
    const completionDate = Math.floor(new Date(segmentEffort.start_date).getTime() / 1000);
    if (!Number.isSafeInteger(completionDate) || completionDate <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid activity date' }), {
        status: 502,
        headers,
      });
    }
    const deadline = Math.floor(Date.now() / 1000) + SIGNATURE_TTL_SECONDS;

    const walletClient = createWalletClient({
      account: privateKeyToAccount(config.SIGNER_PRIVATE_KEY),
      chain,
      transport: http(),
    });

    const signature = await signSegment(
      walletClient,
      segmentId,
      completionDate,
      subject as Address,
      deadline,
      chainId,
    );

    const signedSegment: SignedSegment = {
      segmentId: segmentEffort.segment.id,
      completionDate,
      deadline,
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
      return new Response(JSON.stringify({ error: 'Invalid Strava token', tokenExpired: true }), {
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

    return new Response(JSON.stringify({ error: 'Signing failed' }), {
      status: 500,
      headers,
    });
  }
};
