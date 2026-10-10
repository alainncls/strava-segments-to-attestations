import { createLocalFunctionServer } from '../packages/functions/lib/localDevServer.ts';
import authHandler from '../packages/functions/src/auth.ts';
import signHandler from '../packages/functions/src/sign.ts';

const port = Number(process.env.PORT ?? 8888);
const server = createLocalFunctionServer({
  auth: authHandler,
  sign: signHandler,
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Local Netlify function adapter listening on http://127.0.0.1:${port}\n`);
});

const shutdown = (): void => {
  server.close(() => process.exit(0));
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
