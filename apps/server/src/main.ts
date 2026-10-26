import { fileURLToPath } from 'node:url';
import { createRoomServer } from './server.ts';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
const server = createRoomServer({ webRoot: fileURLToPath(new URL('../../web/dist/', import.meta.url)) });
server.listen(port, '0.0.0.0', () => console.log(`TERRA room service listening on ${port}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close();
    server.closeAllConnections();
  });
}
