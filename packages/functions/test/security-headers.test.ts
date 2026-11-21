import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const config = readFileSync(resolve(import.meta.dirname, '../../../netlify.toml'), 'utf8');

describe('security headers in netlify.toml', () => {
  it.each([
    ['X-Frame-Options', 'DENY'],
    ['X-Content-Type-Options', 'nosniff'],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains'],
    ['Permissions-Policy', 'camera=()'],
    ['Content-Security-Policy', "default-src 'self'"],
  ])('sends %s', (name, value) => {
    const line = config.split('\n').find((l) => l.trim().startsWith(`${name} = "`));
    expect(line).toContain(value);
  });

  it('keeps the policy strict for scripts and frames', () => {
    const policy = /Content-Security-Policy = "([^"]+)"/.exec(config)?.[1] ?? '';
    const scriptSrc = policy.split(';').find((d) => d.trim().startsWith('script-src')) ?? '';
    expect(scriptSrc).not.toMatch(/'unsafe-inline'|'unsafe-eval'|\*/);
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
  });
});
