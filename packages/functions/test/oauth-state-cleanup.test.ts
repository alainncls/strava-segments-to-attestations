import { type Mock, describe, expect, it, vi } from 'vitest';
import {
  cleanupNetlifyOAuthStates,
  pruneExpiredOAuthStates,
  RETENTION_MARGIN_MS,
} from '../src/lib/oauth-state-cleanup';

const now = 1_800_000_000_000;
const record = (
  expiresAt: number,
  status = 'pending',
): { version: number; issuedAt: number; expiresAt: number; status: string } => ({
  version: 1,
  issuedAt: expiresAt - 600_000,
  expiresAt,
  status,
});
type Fixture = {
  list: Mock<() => AsyncGenerator<{ blobs: { key: string }[] }>>;
  getWithMetadata: Mock<(key: string) => Promise<{ data: unknown; etag: string }>>;
  delete: Mock<(key: string) => Promise<void>>;
};
const fixture = (entries: Record<string, unknown>): Fixture => {
  const deleteRecord = vi.fn(async (key: string) => {
    delete entries[key];
  });
  const store = {
    list: vi.fn(async function* () {
      const keys = Object.keys(entries);
      yield { blobs: keys.slice(0, 2).map((key) => ({ key })) };
      yield { blobs: keys.slice(2).map((key) => ({ key })) };
    }),
    getWithMetadata: vi.fn(async (key: string) => ({ data: entries[key], etag: key })),
    delete: deleteRecord,
  };
  return store;
};

describe('OAuth state retention', () => {
  it('paginates and removes only expired pending/consumed records after the grace period', async () => {
    const store = fixture({
      pending: record(now - RETENTION_MARGIN_MS - 1),
      consumed: record(now - RETENTION_MARGIN_MS - 1, 'consumed'),
      active: record(now + 1),
      boundary: record(now - RETENTION_MARGIN_MS),
      recent: record(now - 1),
    });
    await expect(pruneExpiredOAuthStates(store as never, now)).resolves.toEqual({
      scanned: 5,
      removed: 2,
    });
    expect(store.delete.mock.calls.map(([key]) => key)).toEqual(['pending', 'consumed']);
    expect(store.getWithMetadata).toHaveBeenCalledWith('active', {
      type: 'json',
      consistency: 'strong',
    });
    await expect(pruneExpiredOAuthStates(store as never, now)).resolves.toEqual({
      scanned: 3,
      removed: 0,
    });
  });

  it('preserves absent, malformed, future-version and nonfinite records', async () => {
    const store = fixture({
      missing: null,
      corrupt: {},
      unknown: { ...record(1), version: 2 },
      nan: record(NaN),
      invalid: { ...record(1), issuedAt: 2 },
    });
    await expect(pruneExpiredOAuthStates(store as never, now)).resolves.toEqual({
      scanned: 5,
      removed: 0,
    });
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('fails instead of claiming successful deletion on a storage error', async () => {
    const store = fixture({ old: record(1) });
    store.delete.mockRejectedValueOnce(new Error('unavailable'));
    await expect(pruneExpiredOAuthStates(store as never, now)).rejects.toThrow('unavailable');
  });

  it('stops before deleting when the budget expires during a read', async () => {
    const controller = new AbortController();
    const store = fixture({ old: record(1) });
    store.getWithMetadata.mockImplementationOnce(async () => {
      controller.abort();
      return { data: record(1), etag: 'old' };
    });
    await expect(pruneExpiredOAuthStates(store as never, now, controller.signal)).rejects.toThrow();
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('never defaults an unspecified deployment context to production', async () => {
    await expect(cleanupNetlifyOAuthStates(undefined)).rejects.toThrow('context is required');
  });
});
