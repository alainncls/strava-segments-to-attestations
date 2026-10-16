import type { Context } from '@netlify/functions';
import { cleanupNetlifyOAuthStates } from './lib/oauth-state-cleanup';

export const config = { schedule: '15 3 * * *' };

export default async (_req: Request, context: Context): Promise<Response> => {
  const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };
  try {
    const result = await cleanupNetlifyOAuthStates(context.deploy?.context);
    return new Response(JSON.stringify(result), { status: 200, headers });
  } catch {
    return new Response(JSON.stringify({ error: 'OAuth state cleanup failed' }), {
      status: 503,
      headers,
    });
  }
};
