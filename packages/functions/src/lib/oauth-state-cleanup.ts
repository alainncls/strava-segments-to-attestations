import { getStore } from '@netlify/blobs';
import type { Store } from '@netlify/blobs';
import { oauthStateNamespace } from './oauth-state';

export const RETENTION_MARGIN_MS = 60 * 60_000;
export const CLEANUP_BUDGET_MS = 20_000;

type CleanupStore = Pick<Store, 'list' | 'getWithMetadata' | 'delete'>;

// State keys are random nonces and are never reused; consumption preserves expiry.
// Strong reads plus a grace period ensure an active callback cannot be deleted.
export async function pruneExpiredOAuthStates(
  store: CleanupStore,
  now = Date.now(),
  signal?: AbortSignal,
): Promise<{ scanned: number; removed: number }> {
  if (!Number.isFinite(now)) throw new Error('Invalid cleanup clock');
  let scanned = 0;
  let removed = 0;
  for await (const page of store.list({ paginate: true })) {
    for (const { key } of page.blobs) {
      signal?.throwIfAborted();
      const entry = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
      scanned += 1;
      const record = entry?.data;
      if (
        record &&
        typeof record === 'object' &&
        'version' in record &&
        record.version === 1 &&
        'status' in record &&
        (record.status === 'pending' || record.status === 'consumed') &&
        'issuedAt' in record &&
        typeof record.issuedAt === 'number' &&
        Number.isFinite(record.issuedAt) &&
        'expiresAt' in record &&
        typeof record.expiresAt === 'number' &&
        Number.isFinite(record.expiresAt) &&
        record.expiresAt > record.issuedAt &&
        record.expiresAt + RETENTION_MARGIN_MS < now
      ) {
        signal?.throwIfAborted();
        await store.delete(key);
        removed += 1;
      }
    }
  }
  return { scanned, removed };
}

export async function cleanupNetlifyOAuthStates(
  context: string | undefined,
): Promise<{ scanned: number; removed: number }> {
  if (!context) throw new Error('Netlify context is required for OAuth state cleanup');
  const signal = AbortSignal.timeout(CLEANUP_BUDGET_MS);
  const store = getStore({
    name: oauthStateNamespace(context),
    consistency: 'strong',
    fetch: (input, init) =>
      fetch(input, {
        ...init,
        signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal,
      }),
  });
  return pruneExpiredOAuthStates(store, Date.now(), signal);
}
