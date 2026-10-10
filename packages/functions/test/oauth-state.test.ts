import { describe, expect, it, vi } from 'vitest';
import { createOAuthStateStore, oauthStateNamespace } from '../src/lib/oauth-state';
import type { OAuthStateRecord } from '../src/lib/oauth-state';

const record: OAuthStateRecord = {
  version: 1,
  origin: 'https://app.example.com',
  issuedAt: 1_800_000_000_000,
  expiresAt: 1_800_000_600_000,
  status: 'pending',
};

describe('Strava OAuth state persistence', () => {
  it('uses separate namespaces for production and preview contexts', () => {
    expect(oauthStateNamespace('production')).not.toBe(oauthStateNamespace('deploy-preview'));
    expect(oauthStateNamespace('deploy-preview')).toBe('strava-oauth-v1-deploy-preview');
  });

  it('creates only when absent and uses ETag compare-and-set for one-time consumption', async () => {
    const getWithMetadata = vi.fn().mockResolvedValue({ data: record, etag: 'etag-1' });
    const setJSON = vi
      .fn()
      .mockResolvedValueOnce({ modified: true })
      .mockResolvedValueOnce({ modified: false });
    const store = createOAuthStateStore({ getWithMetadata, setJSON } as never);

    await expect(store.create('hash', record)).resolves.toBe(true);
    await expect(store.read('hash')).resolves.toEqual({ record, etag: 'etag-1' });
    await expect(
      store.compareAndSet('hash', 'etag-1', { ...record, status: 'consumed' }),
    ).resolves.toBe(false);
    expect(setJSON).toHaveBeenNthCalledWith(1, 'hash', record, { onlyIfNew: true });
    expect(getWithMetadata).toHaveBeenCalledWith('hash', { type: 'json', consistency: 'strong' });
    expect(setJSON).toHaveBeenNthCalledWith(
      2,
      'hash',
      { ...record, status: 'consumed' },
      { onlyIfMatch: 'etag-1' },
    );
  });

  it('fails closed when an ETag or stored record is absent', async () => {
    const getWithMetadata = vi
      .fn()
      .mockResolvedValueOnce({ data: record })
      .mockResolvedValueOnce({ data: null, etag: 'etag-2' });
    const store = createOAuthStateStore({ getWithMetadata, setJSON: vi.fn() } as never);

    await expect(store.read('missing-etag')).resolves.toBeNull();
    await expect(store.read('empty')).resolves.toBeNull();
  });
});
