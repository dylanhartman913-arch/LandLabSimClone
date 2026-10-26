import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { catalog } from '@homestead/catalog';
import { ENGINE_VERSION } from '@homestead/engine';

class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
interface Seat {
  name: string;
  token: string;
}
interface Room {
  id: string;
  expiresAt: number;
  players: Seat[];
}
interface Options {
  webRoot: string;
  now?: () => number;
  roomTtlMs?: number;
  maxRooms?: number;
}
const idPattern = /^[A-Za-z0-9_-]{32}$/;
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};
const opaqueId = () => randomBytes(24).toString('base64url');

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!req.headers['content-type']?.startsWith('application/json')) {
    throw new RequestError(415, 'Send a JSON request.');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 2048) throw new RequestError(413, 'Request is too large.');
      chunks.push(Buffer.from(chunk));
    }
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error.code === 'ECONNRESET' || error.code === 'ABORT_ERR')
    ) {
      throw new RequestError(400, 'The request was interrupted. Please try again.');
    }
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new RequestError(400, 'Request must contain valid JSON.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new RequestError(400, 'Expected an object.');
  return value as Record<string, unknown>;
}
function displayName(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > 40 ||
    Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  ) {
    throw new RequestError(400, 'Enter a guest name between 1 and 40 characters.');
  }
  return value.trim();
}
function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
const publicRoom = (room: Room) => ({
  id: room.id,
  expiresAt: room.expiresAt,
  players: room.players.map(({ name }) => ({ name })),
});

export function createRoomServer(options: Options) {
  const webRoot = resolve(options.webRoot);
  // Fail startup instead of advertising readiness for a missing production build.
  const index = readFileSync(resolve(webRoot, 'index.html'));
  const now = options.now ?? Date.now;
  const rooms = new Map<string, Room>();
  const roomFor = (id: string) => {
    const room = rooms.get(id);
    if (!idPattern.test(id) || !room || room.expiresAt <= now()) {
      if (room) rooms.delete(id);
      throw new RequestError(
        404,
        'This invitation is unknown or has expired. Ask your teammate for a new invite.',
      );
    }
    return room;
  };
  async function handle(req: IncomingMessage, res: ServerResponse) {
    try {
      if (!URL.canParse(req.url ?? '/', 'http://localhost')) throw new RequestError(400, 'Invalid URL.');
      const url = new URL(req.url ?? '/', 'http://localhost');
      const path = url.pathname;
      if (req.method === 'GET' && path === '/healthz') {
        return json(res, 200, {
          ready: true,
          engineVersion: ENGINE_VERSION,
          catalogSha256: catalog.source.sha256,
        });
      }
      if (path.startsWith('/api/')) {
        if (req.method === 'POST') {
          const origin = req.headers.origin;
          if (origin && (!URL.canParse(origin) || new URL(origin).host !== req.headers.host))
            throw new RequestError(403, 'Use this homestead’s own website to join.');
        }
        if (req.method === 'POST' && path === '/api/rooms') {
          const data = await body(req);
          const name = displayName(data.name);
          for (const [id, room] of rooms) if (room.expiresAt <= now()) rooms.delete(id);
          if (rooms.size >= (options.maxRooms ?? 100))
            throw new RequestError(503, 'The service is at room capacity. Please try again later.');
          const player = { name, token: opaqueId() };
          const room = {
            id: opaqueId(),
            expiresAt: now() + (options.roomTtlMs ?? 7 * 24 * 60 * 60 * 1000),
            players: [player],
          };
          rooms.set(room.id, room);
          return json(res, 201, {
            room: publicRoom(room),
            playerToken: player.token,
            invitePath: `/?room=${room.id}`,
          });
        }
        const match = /^\/api\/rooms\/([^/]+)(\/join)?$/.exec(path);
        if (match) {
          const room = roomFor(match[1]!);
          if (req.method === 'GET' && !match[2]) return json(res, 200, { room: publicRoom(room) });
          if (req.method === 'POST' && match[2]) {
            const data = await body(req);
            // All awaits finish before checking and claiming a seat: competing joins cannot create a third seat.
            const current = roomFor(room.id);
            const name = displayName(data.name);
            if (current.players.length >= 2)
              throw new RequestError(409, 'Room full. This homestead already has two players.');
            const player = { name, token: opaqueId() };
            current.players.push(player);
            return json(res, 200, { room: publicRoom(current), playerToken: player.token });
          }
        }
        throw new RequestError(404, 'Room endpoint not found.');
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new RequestError(405, 'Method not allowed.');
      let decoded: string;
      try {
        decoded = decodeURIComponent(path);
      } catch (error) {
        if (!(error instanceof URIError)) throw error;
        throw new RequestError(400, 'Invalid URL.');
      }
      const file = resolve(webRoot, `.${decoded}`);
      if (file !== webRoot && !file.startsWith(webRoot + sep)) throw new RequestError(404, 'File not found.');
      let content: Buffer;
      if (path === '/') content = index;
      else {
        try {
          if (!statSync(file).isFile()) throw new RequestError(404, 'File not found.');
          content = readFileSync(file);
        } catch (error) {
          if (
            error instanceof Error &&
            'code' in error &&
            (error.code === 'ENOENT' || error.code === 'ENOTDIR')
          )
            throw new RequestError(404, 'File not found.');
          throw error;
        }
      }
      res.writeHead(200, {
        'Content-Type': mime[extname(file)] ?? (path === '/' ? mime['.html']! : 'application/octet-stream'),
        'Cache-Control': 'no-cache',
      });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (!(error instanceof RequestError)) throw error;
      json(res, error.status, { error: error.message });
    }
  }
  // Expected request errors are handled above. Unexpected rejections terminate Node,
  // so the host sees a failure rather than a healthy process with corrupt room state.
  const server = createServer((req, res) => {
    void handle(req, res);
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  return server;
}
