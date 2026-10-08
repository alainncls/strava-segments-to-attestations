import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '../src/rateLimiter';

describe('createRateLimiter', () => {
  it('resets an IP window and calculates Retry-After from a fake clock', () => {
    let at = 10_000;
    const limiter = createRateLimiter({
      limit: 2,
      windowMs: 60_000,
      maxEntries: 10,
      now: () => at,
    });

    expect(limiter.consume('203.0.113.1')).toEqual({ allowed: true, retryAfterSeconds: 0 });
    limiter.consume('203.0.113.1');
    expect(limiter.consume('203.0.113.1')).toEqual({ allowed: false, retryAfterSeconds: 60 });
    at += 60_000;
    expect(limiter.consume('203.0.113.1')).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it('sweeps expired inactive entries and stays within the configured cardinality bound', () => {
    let at = 0;
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 1_000,
      maxEntries: 2,
      sweepEvery: 1,
      now: () => at,
    });

    limiter.consume('ip-1');
    limiter.consume('ip-2');
    expect(limiter.size()).toBe(2);
    at = 1_000;
    limiter.consume('ip-3');
    expect(limiter.size()).toBe(1);
    limiter.consume('ip-4');
    limiter.consume('ip-5');
    expect(limiter.size()).toBeLessThanOrEqual(2);
  });

  it('evicts the oldest active IP when unique clients reach capacity', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, maxEntries: 2 });

    limiter.consume('ip-1');
    limiter.consume('ip-2');
    limiter.consume('ip-3');

    expect(limiter.size()).toBe(2);
    expect(limiter.consume('ip-1').allowed).toBe(true);
  });

  it('uses one shared bucket for unknown IPs and isolates separate instances', () => {
    const firstInstance = createRateLimiter({ limit: 1, windowMs: 1_000, maxEntries: 2 });
    const secondInstance = createRateLimiter({ limit: 1, windowMs: 1_000, maxEntries: 2 });

    expect(firstInstance.consume('unknown').allowed).toBe(true);
    expect(firstInstance.consume('unknown').allowed).toBe(false);
    expect(secondInstance.consume('unknown').allowed).toBe(true);
  });

  it('rejects invalid limits instead of creating an unbounded or inert limiter', () => {
    expect(() => createRateLimiter({ limit: 0, windowMs: 1_000, maxEntries: 2 })).toThrow();
    expect(() => createRateLimiter({ limit: 1, windowMs: 0, maxEntries: 2 })).toThrow();
    expect(() => createRateLimiter({ limit: 1, windowMs: 1_000, maxEntries: 0 })).toThrow();
  });
});
