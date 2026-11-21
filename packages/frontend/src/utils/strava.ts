import { STRAVA_API_BASE } from '@strava-attestations/shared';

const DEFAULT_RETRY_AFTER_MS = 30_000;
const MAX_RETRY_AFTER_MS = 15 * 60_000;

export function parseRetryAfter(value: string | null, now = Date.now()): number {
  if (!value) return DEFAULT_RETRY_AFTER_MS;

  const seconds = Number(value.trim());
  const delay =
    Number.isFinite(seconds) && value.trim() !== '' ? seconds * 1000 : Date.parse(value) - now;
  if (!Number.isFinite(delay)) return DEFAULT_RETRY_AFTER_MS;
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(1000, delay));
}

export class StravaHttpError extends Error {
  readonly status: number;
  readonly retryAfterMs: number;

  constructor(response: Response) {
    super(`Strava request failed (HTTP ${response.status})`);
    this.status = response.status;
    this.retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'));
  }

  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }

  get isRateLimit(): boolean {
    return this.status === 429;
  }
}

export async function stravaGet<T>(path: string, token: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${STRAVA_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });

  if (!response.ok) {
    throw new StravaHttpError(response);
  }

  return (await response.json()) as T;
}
