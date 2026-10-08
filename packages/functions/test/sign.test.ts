import type { Context } from '@netlify/functions';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { verifyTypedData, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import signHandler from '../src/sign';
import { linea, lineaSepolia, PORTAL_ID_MAINNET, PORTAL_ID_SEPOLIA } from '../lib/constants';

const counters = vi.hoisted(() => ({
  walletClientCount: 0,
  signatureCount: 0,
}));

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem');

  const createWalletClient: typeof actual.createWalletClient = (args) => {
    counters.walletClientCount += 1;
    const client = actual.createWalletClient(args);
    return new Proxy(client, {
      get(target, prop, receiver): unknown {
        if (prop === 'signTypedData') {
          return (parameters: unknown): unknown => {
            counters.signatureCount += 1;
            return target.signTypedData(parameters as Parameters<typeof target.signTypedData>[0]);
          };
        }
        const value: unknown = Reflect.get(target, prop, receiver);
        if (typeof value === 'function') {
          return (value as (...fnArgs: unknown[]) => unknown).bind(target);
        }
        return value;
      },
    });
  };

  return { ...actual, createWalletClient };
});

vi.mock('@strava-attestations/shared', async () => import('../../shared/src/index.ts'));

const TEST_PRIVATE_KEY = `0x${'11'.repeat(32)}` as Hex;
const SIGNER = privateKeyToAccount(TEST_PRIVATE_KEY);
const SUBJECT = '0x2222222222222222222222222222222222222222' as Address;
const SIGN_URL = 'https://functions.example.com/sign';
const ACCESS_TOKEN = 'test-access-token';
const MAX_SIGN_BODY_BYTES = 8 * 1024;

const SEGMENT_TYPES = {
  Segment: [
    { name: 'segmentId', type: 'uint256' },
    { name: 'completionDate', type: 'uint64' },
    { name: 'subject', type: 'address' },
    { name: 'deadline', type: 'uint64' },
  ],
} as const;

let nextIp = 20;

function createContext(): Context {
  nextIp += 1;
  return { ip: `203.0.113.${nextIp}` } as Context;
}

function createSignRequest(
  body: unknown,
  options?: { method?: string; rawBody?: string; origin?: string },
): Request {
  const method = options?.method ?? 'POST';
  const headers = new Headers({
    origin: options?.origin ?? 'https://app.example.com',
  });
  if (method !== 'GET' && method !== 'OPTIONS') {
    headers.set('content-type', 'application/json');
  }
  return new Request(SIGN_URL, {
    method,
    headers,
    body:
      method === 'GET' || method === 'OPTIONS'
        ? undefined
        : (options?.rawBody ?? JSON.stringify(body)),
  });
}

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    accessToken: ACCESS_TOKEN,
    activityId: '12345',
    segmentId: 678,
    subject: SUBJECT,
    chainId: linea.id,
    ...overrides,
  };
}

function activityResponse(startDate: unknown = '2024-06-15T12:34:56Z', segmentId = 678): Response {
  return new Response(
    JSON.stringify({
      athlete: { id: 123 },
      segment_efforts: [
        {
          id: 1,
          segment: { id: segmentId, name: 'Col', activity_type: 'Ride', distance: 1000 },
          elapsed_time: 300,
          start_date: startDate,
        },
      ],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function athleteResponse(id: unknown = 123): Response {
  return new Response(JSON.stringify({ id }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

type StravaFetchMock = Mock<(input: RequestInfo | URL) => Promise<Response>>;

function createStravaFetch(
  activity: Response,
  athlete: Response = athleteResponse(),
): StravaFetchMock {
  return vi.fn((input: RequestInfo | URL) =>
    Promise.resolve(String(input).endsWith('/athlete') ? athlete : activity),
  );
}

function expectNoSignature(body: Record<string, unknown>): void {
  expect(body.signature).toBeUndefined();
  expect(counters.signatureCount).toBe(0);
  expect(counters.walletClientCount).toBe(0);
  expect(JSON.stringify(body)).not.toContain(ACCESS_TOKEN);
}

describe('sign handler', () => {
  beforeEach(() => {
    counters.signatureCount = 0;
    counters.walletClientCount = 0;
    vi.stubEnv('STRAVA_CLIENT_ID', 'client-id');
    vi.stubEnv('STRAVA_CLIENT_SECRET', 'client-secret');
    vi.stubEnv('FRONTEND_URL', 'https://app.example.com');
    vi.stubEnv('SIGNER_PRIVATE_KEY', TEST_PRIVATE_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('signs a valid mainnet request with the VerifyStrava EIP-712 domain', async () => {
    const fetchMock = createStravaFetch(activityResponse());
    vi.stubGlobal('fetch', fetchMock);
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');

    const response = await signHandler(createSignRequest(validBody()), createContext());
    const body = (await response.json()) as {
      segmentId: number;
      completionDate: number;
      deadline: number;
      signature: Hex;
    };

    expect(response.status).toBe(200);
    expect(body.segmentId).toBe(678);
    expect(body.completionDate).toBe(Math.floor(Date.parse('2024-06-15T12:34:56Z') / 1000));
    expect(body.deadline).toBeGreaterThan(body.completionDate);
    expect(counters.signatureCount).toBe(1);
    expect(timeoutSpy).toHaveBeenCalledWith(8_000);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.strava.com/api/v3/activities/12345',
      expect.objectContaining({
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.strava.com/api/v3/athlete',
      expect.objectContaining({
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes(ACCESS_TOKEN))).toBe(true);

    await expect(
      verifyTypedData({
        address: SIGNER.address,
        domain: {
          name: 'VerifyStrava',
          version: '1',
          chainId: linea.id,
          verifyingContract: PORTAL_ID_MAINNET,
        },
        types: SEGMENT_TYPES,
        primaryType: 'Segment',
        message: {
          segmentId: BigInt(body.segmentId),
          completionDate: BigInt(body.completionDate),
          subject: SUBJECT,
          deadline: BigInt(body.deadline),
        },
        signature: body.signature,
      }),
    ).resolves.toBe(true);

    await expect(
      verifyTypedData({
        address: SIGNER.address,
        domain: {
          name: 'Other',
          version: '1',
          chainId: linea.id,
          verifyingContract: PORTAL_ID_MAINNET,
        },
        types: SEGMENT_TYPES,
        primaryType: 'Segment',
        message: {
          segmentId: BigInt(body.segmentId),
          completionDate: BigInt(body.completionDate),
          subject: SUBJECT,
          deadline: BigInt(body.deadline),
        },
        signature: body.signature,
      }),
    ).resolves.toBe(false);
    expect(linea.id).toBe(59144);
    expect(PORTAL_ID_MAINNET).toBe('0xe1301b12c2dbe0be67187432fb2519801439f552');
  });

  it('signs a valid Sepolia request against the Sepolia portal', async () => {
    const subject = '0xabcdef1234567890abcdef1234567890abcdef12' as Address;
    const fetchMock = createStravaFetch(activityResponse());
    vi.stubGlobal('fetch', fetchMock);

    const response = await signHandler(
      createSignRequest(validBody({ chainId: lineaSepolia.id, subject })),
      createContext(),
    );
    const body = (await response.json()) as {
      segmentId: number;
      completionDate: number;
      deadline: number;
      signature: Hex;
    };

    expect(response.status).toBe(200);
    await expect(
      verifyTypedData({
        address: SIGNER.address,
        domain: {
          name: 'VerifyStrava',
          version: '1',
          chainId: lineaSepolia.id,
          verifyingContract: PORTAL_ID_SEPOLIA,
        },
        types: SEGMENT_TYPES,
        primaryType: 'Segment',
        message: {
          segmentId: BigInt(body.segmentId),
          completionDate: BigInt(body.completionDate),
          subject,
          deadline: BigInt(body.deadline),
        },
        signature: body.signature,
      }),
    ).resolves.toBe(true);
    expect(lineaSepolia.id).toBe(59141);
    expect(PORTAL_ID_SEPOLIA).toBe('0xc04228f66b1aa75a2a8f6887730f55b54281e9d9');
  });

  it('rejects a public activity that belongs to a different Strava athlete', async () => {
    const fetchMock = createStravaFetch(
      new Response(
        JSON.stringify({
          athlete: { id: 456 },
          segment_efforts: [
            {
              segment: { id: 678 },
              start_date: '2024-06-15T12:34:56Z',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await signHandler(createSignRequest(validBody()), createContext());
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: 'Activity does not belong to authenticated athlete' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expectNoSignature(body);
  });

  it.each(['missing', null, '123', 0, Number.MAX_SAFE_INTEGER + 1])(
    'fails closed when the authenticated Strava profile ID is invalid: %s',
    async (athleteId) => {
      const profile =
        athleteId === 'missing' ? new Response('{}', { status: 200 }) : athleteResponse(athleteId);
      const fetchMock = createStravaFetch(activityResponse(), profile);
      vi.stubGlobal('fetch', fetchMock);

      const response = await signHandler(createSignRequest(validBody()), createContext());
      const body = (await response.json()) as Record<string, unknown>;

      expect(response.status).toBe(502);
      expect(body).toEqual({ error: 'Invalid Strava profile response' });
      expect(fetchMock).toHaveBeenCalledOnce();
      expectNoSignature(body);
    },
  );

  it.each([
    ['null', 'null'],
    ['array', '[]'],
    ['string', '"hello"'],
  ])('rejects a %s JSON body before upstream work', async (_label, rawBody) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await signHandler(createSignRequest(undefined, { rawBody }), createContext());
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Invalid request body' });
    expect(fetchMock).not.toHaveBeenCalled();
    expectNoSignature(body);
  });

  it('rejects malformed JSON before upstream work', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await signHandler(
      createSignRequest(undefined, { rawBody: '{not-json' }),
      createContext(),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Invalid JSON body' });
    expect(fetchMock).not.toHaveBeenCalled();
    expectNoSignature(body);
  });

  it('rejects an oversized payload before upstream work', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const rawBody = JSON.stringify(validBody({ accessToken: 'a'.repeat(MAX_SIGN_BODY_BYTES) }));
    expect(Buffer.byteLength(rawBody)).toBeGreaterThan(MAX_SIGN_BODY_BYTES);

    const response = await signHandler(createSignRequest(undefined, { rawBody }), createContext());
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Payload too large' });
    expect(fetchMock).not.toHaveBeenCalled();
    expectNoSignature(body);
    expect(JSON.stringify(body)).not.toContain('a'.repeat(32));
  });

  it('rejects a declared content-length above 8 KiB before reading a short body', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const request = new Request(SIGN_URL, {
      method: 'POST',
      headers: {
        origin: 'https://app.example.com',
        'content-type': 'application/json',
        'content-length': String(MAX_SIGN_BODY_BYTES + 1),
      },
      body: JSON.stringify(validBody()),
    });

    const response = await signHandler(request, createContext());
    const body = (await response.json()) as Record<string, unknown>;

    expect(request.headers.get('content-length')).toBe(String(MAX_SIGN_BODY_BYTES + 1));
    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Payload too large' });
    expect(fetchMock).not.toHaveBeenCalled();
    expectNoSignature(body);
  });

  it('rejects missing fields before upstream work', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await signHandler(createSignRequest({}), createContext());
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Missing required parameters' });
    expect(fetchMock).not.toHaveBeenCalled();
    expectNoSignature(body);
  });

  it.each([
    ['float segmentId', { segmentId: 1.5 }, 'Invalid segmentId'],
    ['negative segmentId', { segmentId: -1 }, 'Invalid segmentId'],
    ['zero segmentId', { segmentId: 0 }, 'Invalid segmentId'],
    ['unsafe segmentId', { segmentId: Number.MAX_SAFE_INTEGER + 2 }, 'Invalid segmentId'],
    ['string segmentId', { segmentId: '678' }, 'Invalid segmentId'],
    ['huge activityId', { activityId: '9'.repeat(40) }, 'Invalid activityId'],
    ['unsafe activityId string', { activityId: '9007199254740993' }, 'Invalid activityId'],
    ['leading-zero activityId', { activityId: '0123' }, 'Invalid activityId'],
    ['path-like activityId', { activityId: '123/../1' }, 'Invalid activityId'],
    ['negative activityId', { activityId: '-1' }, 'Invalid activityId'],
    ['short address', { subject: '0x123' }, 'Invalid subject address'],
    ['non-hex address', { subject: `0x${'g'.repeat(40)}` }, 'Invalid subject address'],
    ['wrong chain', { chainId: 1 }, 'Invalid chainId'],
    ['string chainId', { chainId: String(linea.id) }, 'Invalid chainId'],
    ['float chainId', { chainId: linea.id + 0.5 }, 'Invalid chainId'],
  ])('rejects %s before upstream work', async (_label, overrides, error) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await signHandler(createSignRequest(validBody(overrides)), createContext());
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body).toEqual({ error });
    expect(fetchMock).not.toHaveBeenCalled();
    expectNoSignature(body);
  });

  it('rejects an invalid upstream date with 502 and does not sign', async () => {
    const fetchMock = createStravaFetch(activityResponse('not-a-date'));
    vi.stubGlobal('fetch', fetchMock);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await signHandler(createSignRequest(validBody()), createContext());
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(502);
    expect(body).toEqual({ error: 'Invalid activity date' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expectNoSignature(body);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(ACCESS_TOKEN);
  });

  it('maps an upstream timeout to 504 and does not sign', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(
        new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
      );
    vi.stubGlobal('fetch', fetchMock);
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');

    const response = await signHandler(createSignRequest(validBody()), createContext());
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(504);
    expect(body).toEqual({ error: 'Upstream request timed out' });
    expect(timeoutSpy).toHaveBeenCalledWith(8_000);
    expectNoSignature(body);
  });

  it('maps upstream cancellation to 504 and does not sign', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError'));
    vi.stubGlobal('fetch', fetchMock);

    const response = await signHandler(createSignRequest(validBody()), createContext());
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(504);
    expect(body).toEqual({ error: 'Upstream request timed out' });
    expectNoSignature(body);
  });

  it('keeps the tokenExpired 401 path without leaking the token or upstream body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'bad', access_token: ACCESS_TOKEN }), {
        status: 401,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await signHandler(createSignRequest(validBody()), createContext());
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'Invalid Strava token', tokenExpired: true });
    expectNoSignature(body);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(ACCESS_TOKEN);
  });

  it.each([
    [403, 502, 'Upstream request failed'],
    [429, 429, 'Upstream rate limited'],
    [500, 502, 'Upstream request failed'],
  ])('maps upstream %s to %s without leaking the token', async (upstreamStatus, status, error) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: ACCESS_TOKEN, detail: 'secret-body' }), {
        status: upstreamStatus,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await signHandler(createSignRequest(validBody()), createContext());
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(status);
    expect(body).toEqual({ error });
    expectNoSignature(body);
  });

  it('returns 404 and does not sign when the segment is absent', async () => {
    const fetchMock = createStravaFetch(activityResponse('2024-06-15T12:34:56Z', 999));
    vi.stubGlobal('fetch', fetchMock);

    const response = await signHandler(createSignRequest(validBody()), createContext());
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: 'Segment not found in this activity' });
    expectNoSignature(body);
  });
});
