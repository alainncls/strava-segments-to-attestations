import { pruneExpiredOAuthStates } from './lib/oauth-state';

export const config = { schedule: '0 3 * * *' };

export default async (): Promise<Response> => {
  try {
    const removed = await pruneExpiredOAuthStates();
    return new Response(JSON.stringify({ removed }), {
      status: 200,
      headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'OAuth state cleanup failed' }), {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
    });
  }
};
