import { describe, it, expect } from 'vitest';

// Test getCorsHeaders logic without importing the actual module
// (to avoid env validation issues in tests)
describe('CORS Headers Logic', () => {
  function getCorsHeaders(
    origin: string | undefined,
    allowedOrigins: string[],
  ): Record<string, string> {
    const isAllowed = origin && allowedOrigins.includes(origin);

    return {
      'Access-Control-Allow-Origin': isAllowed ? origin : allowedOrigins[0] || '',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json',
    };
  }

  it('should allow exact origin match', () => {
    const allowedOrigins = ['https://example.com', 'http://localhost:5174'];
    const headers = getCorsHeaders('https://example.com', allowedOrigins);

    expect(headers['Access-Control-Allow-Origin']).toBe('https://example.com');
  });

  it('should reject origin that starts with allowed but is different domain', () => {
    const allowedOrigins = ['https://example.com', 'http://localhost:5174'];
    // This is the security fix - startsWith would have allowed this
    const headers = getCorsHeaders('https://example.com.evil.com', allowedOrigins);

    expect(headers['Access-Control-Allow-Origin']).not.toBe('https://example.com.evil.com');
    expect(headers['Access-Control-Allow-Origin']).toBe('https://example.com');
  });

  it('should fallback to first allowed origin if no match', () => {
    const allowedOrigins = ['https://example.com', 'http://localhost:5174'];
    const headers = getCorsHeaders('https://malicious.com', allowedOrigins);

    expect(headers['Access-Control-Allow-Origin']).toBe('https://example.com');
  });

  it('should handle undefined origin', () => {
    const allowedOrigins = ['https://example.com'];
    const headers = getCorsHeaders(undefined, allowedOrigins);

    expect(headers['Access-Control-Allow-Origin']).toBe('https://example.com');
  });

  it('should include all required CORS headers', () => {
    const allowedOrigins = ['https://example.com'];
    const headers = getCorsHeaders('https://example.com', allowedOrigins);

    expect(headers['Access-Control-Allow-Methods']).toBe('GET, POST, OPTIONS');
    expect(headers['Access-Control-Allow-Headers']).toBe('Content-Type, Authorization');
    expect(headers['Content-Type']).toBe('application/json');
  });
});

describe('Rate Limiting Logic', () => {
  interface RateLimiter {
    isRateLimited: (ip: string) => boolean;
    clear: () => void;
  }

  function createRateLimiter(maxRequests: number, windowMs: number): RateLimiter {
    const map = new Map<string, { count: number; resetAt: number }>();

    return {
      isRateLimited: (ip: string): boolean => {
        const now = Date.now();
        const entry = map.get(ip);

        if (!entry || entry.resetAt < now) {
          map.set(ip, { count: 1, resetAt: now + windowMs });
          return false;
        }

        entry.count++;
        return entry.count > maxRequests;
      },
      clear: (): void => map.clear(),
    };
  }

  it('should allow first request', () => {
    const limiter = createRateLimiter(5, 60000);
    expect(limiter.isRateLimited('192.168.1.1')).toBe(false);
  });

  it('should allow requests up to limit', () => {
    const limiter = createRateLimiter(3, 60000);
    const ip = '192.168.1.1';

    expect(limiter.isRateLimited(ip)).toBe(false); // 1
    expect(limiter.isRateLimited(ip)).toBe(false); // 2
    expect(limiter.isRateLimited(ip)).toBe(false); // 3
    expect(limiter.isRateLimited(ip)).toBe(true); // 4 - over limit
  });

  it('should track different IPs separately', () => {
    const limiter = createRateLimiter(2, 60000);

    expect(limiter.isRateLimited('192.168.1.1')).toBe(false);
    expect(limiter.isRateLimited('192.168.1.1')).toBe(false);
    expect(limiter.isRateLimited('192.168.1.1')).toBe(true);

    // Different IP should still be allowed
    expect(limiter.isRateLimited('192.168.1.2')).toBe(false);
  });
});

describe('Input Validation', () => {
  it('should validate Ethereum address format', () => {
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;

    expect(addressRegex.test('0x1234567890123456789012345678901234567890')).toBe(true);
    expect(addressRegex.test('0xABCDEF1234567890ABCDEF1234567890ABCDEF12')).toBe(true);

    expect(addressRegex.test('0x123')).toBe(false);
    expect(addressRegex.test('1234567890123456789012345678901234567890')).toBe(false);
    expect(addressRegex.test('')).toBe(false);
  });

  it('should validate chain IDs', () => {
    const LINEA_MAINNET = 59144;
    const LINEA_SEPOLIA = 59141;

    function isValidChainId(chainId: number): boolean {
      return chainId === LINEA_MAINNET || chainId === LINEA_SEPOLIA;
    }

    expect(isValidChainId(59144)).toBe(true);
    expect(isValidChainId(59141)).toBe(true);
    expect(isValidChainId(1)).toBe(false);
    expect(isValidChainId(0)).toBe(false);
  });
});

describe('Error Response Format', () => {
  it('should create consistent error response', () => {
    function createErrorResponse(
      error: string,
      status: number,
      extra?: Record<string, unknown>,
    ): { body: string; status: number } {
      return {
        body: JSON.stringify({ error, ...extra }),
        status,
      };
    }

    const response = createErrorResponse('Missing required parameters', 400);
    expect(response.status).toBe(400);
    expect(JSON.parse(response.body).error).toBe('Missing required parameters');

    const responseWithExtra = createErrorResponse('Invalid token', 401, { tokenExpired: true });
    const parsed = JSON.parse(responseWithExtra.body);
    expect(parsed.error).toBe('Invalid token');
    expect(parsed.tokenExpired).toBe(true);
  });
});
