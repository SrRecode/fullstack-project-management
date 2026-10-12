import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from './app.js';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');
const port = Number(process.env.PORT ?? 3000);

const server = createServer(undefined, { publicDir });

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Project management app on http://localhost:${port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
