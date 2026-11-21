export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  maxEntries: number;
  sweepEvery?: number;
  now?: () => number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  consume(key: string): RateLimitResult;
  size(): number;
}

/** Process-local defense in depth; serverless instances do not share counters. */
export function createRateLimiter({
  limit,
  windowMs,
  maxEntries,
  sweepEvery = 32,
  now = Date.now,
}: RateLimiterOptions): RateLimiter {
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new Error('limit must be a positive integer');
  if (!Number.isSafeInteger(windowMs) || windowMs < 1)
    throw new Error('windowMs must be a positive integer');
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
    throw new Error('maxEntries must be a positive integer');
  }
  if (!Number.isSafeInteger(sweepEvery) || sweepEvery < 1) {
    throw new Error('sweepEvery must be a positive integer');
  }

  const entries = new Map<string, { count: number; resetAt: number }>();
  let requests = 0;

  function removeExpired(at: number): void {
    for (const [key, entry] of entries) {
      if (entry.resetAt <= at) entries.delete(key);
    }
  }

  function consume(key: string): RateLimitResult {
    const at = now();
    requests += 1;
    if (requests % sweepEvery === 0) removeExpired(at);

    const existing = entries.get(key);
    if (existing && existing.resetAt > at) {
      if (existing.count >= limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - at) / 1000)),
        };
      }

      existing.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (entries.size >= maxEntries) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey !== undefined) entries.delete(oldestKey);
    }

    entries.set(key, { count: 1, resetAt: at + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return { consume, size: () => entries.size };
}
