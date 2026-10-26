import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { FileRoomStorage } from './persistence.ts';
import { createRoomServer } from './server.ts';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
if (process.env.RENDER && !process.env.ROOM_DATA_DIR)
  throw new Error('Hosted multiplayer requires ROOM_DATA_DIR on a persistent disk.');
const storage = new FileRoomStorage(process.env.ROOM_DATA_DIR ?? resolve('tmp/multiplayer-rooms'));
const server = createRoomServer({
  webRoot: fileURLToPath(new URL('../../web/dist/', import.meta.url)),
  storage,
});
server.listen(port, '0.0.0.0', () => console.log(`TERRA room service listening on ${port}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close();
    server.closeAllConnections();
  });
}
