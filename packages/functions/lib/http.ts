/**
 * Request and upstream bounds for the signer and token exchange.
 *
 * Sign/auth JSON bodies above 8 KiB are rejected with 400 before any Strava
 * call or signature. Strava fetches abort after 8 seconds (504). Upstream
 * JSON above 2 MiB is a 502 and is never signed or returned as a token.
 */
export const MAX_REQUEST_BODY_BYTES = 8 * 1024;
export const STRAVA_UPSTREAM_TIMEOUT_MS = 8_000;
export const MAX_UPSTREAM_BODY_BYTES = 2 * 1024 * 1024;

export class HttpError extends Error {
  readonly status: number;
  readonly payload: Record<string, unknown>;

  constructor(status: number, error: string, extra?: Record<string, unknown>) {
    super(error);
    this.name = 'HttpError';
    this.status = status;
    this.payload = extra ? { error, ...extra } : { error };
  }
}

export class UpstreamStatusError extends Error {
  readonly status: number;

  constructor(status: number) {
    super('Strava API error');
    this.name = 'UpstreamStatusError';
    this.status = status;
  }
}

export function upstreamSignal(): AbortSignal {
  return AbortSignal.timeout(STRAVA_UPSTREAM_TIMEOUT_MS);
}

export function isUpstreamTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

function parseDeclaredLength(value: string | null): number | null | 'invalid' {
  if (value === null) {
    return null;
  }
  if (!/^\d+$/.test(value)) {
    return 'invalid';
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    return 'invalid';
  }
  return parsed;
}

async function readLimitedBytes(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  tooLarge: HttpError,
): Promise<Uint8Array> {
  if (!stream) {
    return new Uint8Array();
  }

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value || value.byteLength === 0) {
        continue;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw tooLarge;
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // cancel() may already have released the reader.
    }
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function cancelBody(stream: ReadableStream<Uint8Array> | null): Promise<void> {
  await stream?.cancel().catch(() => undefined);
}

export async function readJsonBody(req: Request): Promise<unknown> {
  const declared = parseDeclaredLength(req.headers.get('content-length'));
  if (declared === 'invalid') {
    throw new HttpError(400, 'Invalid content length');
  }
  if (declared !== null && declared > MAX_REQUEST_BODY_BYTES) {
    await cancelBody(req.body);
    throw new HttpError(400, 'Payload too large');
  }

  const bytes = await readLimitedBytes(
    req.body,
    MAX_REQUEST_BODY_BYTES,
    new HttpError(400, 'Payload too large'),
  );
  return parseJsonBytes(bytes, 400, 'Invalid JSON body');
}

export function assertRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'Invalid request body');
  }
  return value as Record<string, unknown>;
}

export async function readUpstreamJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    await cancelBody(response.body);
    throw new UpstreamStatusError(response.status);
  }

  const declared = parseDeclaredLength(response.headers.get('content-length'));
  if (declared === 'invalid' || (declared !== null && declared > MAX_UPSTREAM_BODY_BYTES)) {
    await cancelBody(response.body);
    throw new HttpError(502, 'Upstream response invalid');
  }

  const bytes = await readLimitedBytes(
    response.body,
    MAX_UPSTREAM_BODY_BYTES,
    new HttpError(502, 'Upstream response invalid'),
  );
  return parseJsonBytes(bytes, 502, 'Upstream response invalid');
}

function parseJsonBytes(bytes: Uint8Array, status: number, error: string): unknown {
  if (bytes.byteLength === 0) {
    throw new HttpError(status, error);
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new HttpError(status, error);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(status, error);
  }
}
