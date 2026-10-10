import { getStore } from '@netlify/blobs';
import type { Store } from '@netlify/blobs';

export interface OAuthStateRecord {
  version: 1;
  origin: string;
  issuedAt: number;
  expiresAt: number;
  status: 'pending' | 'consumed';
}

export interface OAuthStateEntry {
  record: OAuthStateRecord;
  etag: string;
}

export interface OAuthStateStore {
  create(key: string, record: OAuthStateRecord): Promise<boolean>;
  read(key: string): Promise<OAuthStateEntry | null>;
  compareAndSet(key: string, etag: string, record: OAuthStateRecord): Promise<boolean>;
}

export const createMemoryOAuthStateStore = (): OAuthStateStore => {
  const records = new Map<string, { record: OAuthStateRecord; version: number }>();
  return {
    async create(key, record) {
      if (records.has(key)) return false;
      records.set(key, { record: structuredClone(record), version: 1 });
      return true;
    },
    async read(key) {
      const value = records.get(key);
      return value ? { record: structuredClone(value.record), etag: String(value.version) } : null;
    },
    async compareAndSet(key, etag, record) {
      const value = records.get(key);
      if (!value || String(value.version) !== etag) return false;
      records.set(key, { record: structuredClone(record), version: value.version + 1 });
      return true;
    },
  };
};

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

export const oauthStateNamespace = (context: string): string => {
  const namespace = context
    .replace(/[^a-z0-9-]/gi, '-')
    .toLowerCase()
    .slice(0, 32);
  if (!namespace) throw new Error('Netlify context is required for OAuth state storage');
  return `strava-oauth-v1-${namespace}`;
};

export const createNetlifyOAuthStateStore = (context = process.env.CONTEXT): OAuthStateStore => {
  if (!context) throw new Error('Netlify context is required for OAuth state storage');
  return createOAuthStateStore(getStore(oauthStateNamespace(context), { consistency: 'strong' }));
};
