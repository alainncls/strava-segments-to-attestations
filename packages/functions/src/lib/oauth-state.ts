import { getStore } from '@netlify/blobs';
import type { Store } from '@netlify/blobs';

export interface OAuthStateRecord {
  version: 1;
  issuedAt: number;
  expiresAt: number;
  status: 'pending' | 'consumed';
}

interface OAuthStateEntry {
  record: OAuthStateRecord;
  etag: string;
}

export interface OAuthStateStore {
  create(key: string, record: OAuthStateRecord): Promise<boolean>;
  read(key: string): Promise<OAuthStateEntry | null>;
  compareAndSet(key: string, etag: string, record: OAuthStateRecord): Promise<boolean>;
}

export const createOAuthStateStore = (
  store: Pick<Store, 'getWithMetadata' | 'setJSON'>,
): OAuthStateStore => ({
  async create(key, record) {
    const result = await store.setJSON(key, record, { onlyIfNew: true });
    return result.modified;
  },
  async read(key) {
    const result = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
    if (!result || !result.etag || typeof result.data !== 'object' || result.data === null) {
      return null;
    }
    return { record: result.data as OAuthStateRecord, etag: result.etag };
  },
  async compareAndSet(key, etag, record) {
    const result = await store.setJSON(key, record, { onlyIfMatch: etag });
    return result.modified;
  },
});

const getStoreForContext = (context: string): Store => {
  const namespace = context
    .replace(/[^a-z0-9-]/gi, '-')
    .toLowerCase()
    .slice(0, 32);
  if (!namespace) throw new Error('Netlify context is required for OAuth state storage');
  return getStore(`strava-oauth-v1-${namespace}`, { consistency: 'strong' });
};

export const createNetlifyOAuthStateStore = (context = process.env.CONTEXT): OAuthStateStore => {
  if (!context) throw new Error('Netlify context is required for OAuth state storage');
  return createOAuthStateStore(getStoreForContext(context));
};

export const pruneExpiredRecords = async (
  store: Pick<Store, 'list' | 'getWithMetadata' | 'delete'>,
  now = Date.now(),
  retentionMarginMs = 60 * 60_000,
): Promise<number> => {
  let removed = 0;
  for await (const page of store.list({ paginate: true, prefix: '' })) {
    for (const { key } of page.blobs) {
      const result = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
      if (
        result &&
        typeof result.data === 'object' &&
        result.data !== null &&
        'expiresAt' in result.data &&
        typeof result.data.expiresAt === 'number' &&
        result.data.expiresAt + retentionMarginMs < now
      ) {
        await store.delete(key);
        removed += 1;
      }
    }
  }
  return removed;
};

export const pruneExpiredOAuthStates = async (
  context = process.env.CONTEXT,
  now = Date.now(),
  retentionMarginMs = 60 * 60_000,
): Promise<number> => {
  if (!context) throw new Error('Netlify context is required for OAuth state storage');
  return pruneExpiredRecords(getStoreForContext(context), now, retentionMarginMs);
};
