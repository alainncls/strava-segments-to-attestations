import { describe, expect, it, vi } from 'vitest';
import { createOAuthStateStore, pruneExpiredRecords } from '../src/lib/oauth-state';
import type { OAuthStateRecord } from '../src/lib/oauth-state';

const record: OAuthStateRecord = {
  version: 1,
  issuedAt: 1_800_000_000_000,
  expiresAt: 1_800_000_600_000,
  status: 'pending',
};

describe('Strava OAuth state store', () => {
  it('creates only if absent and returns the storage result', async () => {
    const setJSON = vi.fn().mockResolvedValue({ modified: true });
    const store = createOAuthStateStore({ setJSON, getWithMetadata: vi.fn() } as never);

    await expect(store.create('hash', record)).resolves.toBe(true);
    expect(setJSON).toHaveBeenCalledWith('hash', record, { onlyIfNew: true });
  });

  it('reads strongly and consumes with the observed ETag only', async () => {
    const getWithMetadata = vi.fn().mockResolvedValue({ data: record, etag: 'etag-1' });
    const setJSON = vi.fn().mockResolvedValue({ modified: false });
    const store = createOAuthStateStore({ getWithMetadata, setJSON } as never);

    await expect(store.read('hash')).resolves.toEqual({ record, etag: 'etag-1' });
    expect(getWithMetadata).toHaveBeenCalledWith('hash', {
      type: 'json',
      consistency: 'strong',
    });
    await expect(
      store.compareAndSet('hash', 'etag-1', { ...record, status: 'consumed' }),
    ).resolves.toBe(false);
    expect(setJSON).toHaveBeenCalledWith(
      'hash',
      { ...record, status: 'consumed' },
      { onlyIfMatch: 'etag-1' },
    );
  });

  it('deletes only records past expiry plus the retention margin', async () => {
    const now = 1_800_000_000_000;
    const list = vi.fn(async function* () {
      yield { blobs: [{ key: 'expired' }, { key: 'recent' }] };
    });
    const getWithMetadata = vi
      .fn()
      .mockResolvedValueOnce({ data: { expiresAt: now - 1_001 }, etag: '1' })
      .mockResolvedValueOnce({ data: { expiresAt: now - 999 }, etag: '2' });
    const remove = vi.fn().mockResolvedValue(undefined);

    await expect(
      pruneExpiredRecords({ list, getWithMetadata, delete: remove } as never, now, 1_000),
    ).resolves.toBe(1);
    expect(remove).toHaveBeenCalledExactlyOnceWith('expired');
  });
});
