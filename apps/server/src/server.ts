import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { catalog } from '@homestead/catalog';
import { ENGINE_VERSION } from '@homestead/engine';
import { StorageError, type RoomStorage, type RoomRecord } from './persistence.ts';
import { Simulation, CommandError, AppliedRequest, type Player } from './simulation.ts';

class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
type Seat = Player;
interface Room {
  id: string;
  expiresAt: number;
  players: Seat[];
  simulation: Simulation;
}
interface Options {
  webRoot: string;
  now?: () => number;
  roomTtlMs?: number;
  maxRooms?: number;
  storage?: RoomStorage;
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
      if (size > (req.url?.endsWith('/commands') ? 32_768 : 2048)) throw new RequestError(413, 'Request is too large.');
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
  const storage = options.storage;
  let storageFailure: string | null = null;
  const loaded = storage?.load();
  const unavailable = loaded?.unavailable ?? new Map<string, string>();
  const record = (room: Room): RoomRecord => ({
    id: room.id,
    expiresAt: room.expiresAt,
    revision: room.simulation.revision,
    game: room.simulation.game,
    events: room.simulation.events,
    reports: room.simulation.reports,
    players: room.players.map((p) => ({ name: p.name, token: p.token, outcomes: [...p.outcomes] })),
  });
  const restore = (room: Room, saved: RoomRecord) => {
    const players = saved.players.map((p) => {
      const existing = room.players.find((current) => current.token === p.token);
      return Object.assign(existing ?? {}, {
        name: p.name,
        token: p.token,
        ready: false,
        windowAt: now(),
        requests: 0,
        outcomes: new Map(p.outcomes),
      }) as Player;
    });
    room.players.splice(0, room.players.length, ...players);
    room.simulation.players.splice(0, room.simulation.players.length, ...players);
    Object.assign(room.simulation, {
      game: saved.game,
      revision: saved.revision,
      events: saved.events,
      reports: saved.reports,
    });
    room.simulation.pause('Room restored. Both players must reconnect and choose Ready.');
  };
  const attachStorage = (room: Room) => {
    if (!storage) return;
    room.simulation.durable = true;
    let committed = JSON.stringify(record(room));
    room.simulation.beforePublish = () => {
      if (room.simulation.storageError) throw new StorageError(room.simulation.storageError);
      const next = record(room);
      const checkpoint = JSON.stringify(next);
      try {
        storage.write(next);
      } catch (error) {
        if (!(error instanceof StorageError)) throw error;
        restore(room, JSON.parse(committed) as RoomRecord);
        storageFailure = error.message;
        room.simulation.storageError = error.message;
        room.simulation.pause(
          'Storage failure. Editing and time are stopped. Ask the host owner to repair storage and restart.',
        );
        room.simulation.broadcast();
        throw error;
      }
      committed = checkpoint;
    };
  };
  for (const saved of loaded?.rooms ?? []) {
    const room: Room = {
      id: saved.id,
      expiresAt: saved.expiresAt,
      players: [],
      simulation: new Simulation([]),
    };
    restore(room, saved);
    attachStorage(room);
    rooms.set(room.id, room);
  }
  const roomFor = (id: string) => {
    if (unavailable.has(id)) throw new RequestError(409, unavailable.get(id)!);
    const room = rooms.get(id);
    if (room?.simulation.storageError) throw new StorageError(room.simulation.storageError);
    if (!idPattern.test(id) || !room || room.expiresAt <= now()) {
      if (room) { for (const p of room.players) p.connection?.close(); rooms.delete(id); }
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
        const ready =
          !storageFailure &&
          ![...rooms.values()].some((room) => room.simulation.storageError) &&
          unavailable.size === 0;
        return json(res, ready ? 200 : 503, {
          ready,
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
          for (const [id, room] of rooms)
            if (room.expiresAt <= now()) {
              for (const p of room.players) p.connection?.close();
              rooms.delete(id);
            }
          if (rooms.size + unavailable.size >= (options.maxRooms ?? 100))
            throw new RequestError(503, 'The service is at room capacity. Please try again later.');
          const player: Seat = {
            name,
            token: opaqueId(),
            ready: false,
            windowAt: now(),
            requests: 0,
            outcomes: new Map(),
          };
          const room = {
            id: opaqueId(),
            expiresAt: now() + (options.roomTtlMs ?? 7 * 24 * 60 * 60 * 1000),
            players: [player],
            simulation: new Simulation([player]),
          };
          attachStorage(room);
          room.simulation.beforePublish?.();
          rooms.set(room.id, room);
          return json(res, 201, {
            room: publicRoom(room),
            playerToken: player.token,
            invitePath: `/?room=${room.id}`,
          });
        }
        const gameMatch =
          /^\/api\/rooms\/([^/]+)\/(stream|commands|control|heartbeat|history|requests\/[A-Za-z0-9_-]{16,80})$/.exec(
            path,
          );
        if (gameMatch) {
          const room = roomFor(gameMatch[1]!);
          const token = req.headers.authorization?.replace(/^Bearer /, '');
          const player = room.players.find((p) => p.token === token);
          if (!player) throw new RequestError(401, 'A player credential is required.');
          const simulation = room.simulation;
          if (simulation.storageError) throw new StorageError(simulation.storageError);
          if (req.method === 'GET' && gameMatch[2]!.startsWith('requests/')) {
            const requestId = gameMatch[2]!.slice('requests/'.length);
            const outcome = player.outcomes.get(requestId);
            if (!outcome) throw new RequestError(404, 'This request has not been committed.');
            return json(res, 200, { requestId, revision: outcome.revision });
          }
          if (req.method === 'GET' && gameMatch[2] === 'history')
            return json(res, 200, { ledgers: simulation.game.ledgers });
          if (req.method === 'GET' && gameMatch[2] === 'stream') {
            if (player.connection) throw new RequestError(409, 'This player already has a connected game.');
            res.writeHead(200, {
              'Content-Type': 'application/x-ndjson',
              'Cache-Control': 'no-store',
              'X-Accel-Buffering': 'no',
            });
            const connection = {
              send: (snapshot: ReturnType<Simulation['snapshot']>) => {
                if (res.writableLength > 2_000_000) { res.destroy(); return; }
                res.write(JSON.stringify(snapshot) + '\n');
              },
              close: () => res.end(),
            };
            player.connection = connection;
            player.lastSeen = now();
            simulation.revision++;
            try {
              simulation.beforePublish?.();
            } catch (error) {
              if (!(error instanceof StorageError)) throw error;
              delete player.connection;
              connection.send(simulation.snapshot());
              connection.close();
              return;
            }
            connection.send(simulation.snapshot());
            simulation.broadcast();
            const heartbeat = setInterval(() => {
              if (res.writableLength > 2_000_000) res.destroy();
              else res.write('\n');
            }, 5000);
            res.on('close', () => {
              clearInterval(heartbeat);
              if (player.connection !== connection) return;
              delete player.connection;
              simulation.pause(`${player.name} disconnected. Both players must choose Ready again.`);
              simulation.revision++;
              if (simulation.storageError) simulation.broadcast();
              else {
                try {
                  simulation.publish();
                } catch (error) {
                  if (!(error instanceof StorageError)) throw error;
                }
              }
            });
            return;
          }
          if (req.method !== 'POST' || !['commands', 'control', 'heartbeat'].includes(gameMatch[2]!))
            throw new RequestError(405, 'Method not allowed.');
          const data = await body(req);
          // Body reads may yield; re-check expiry and membership before the synchronous commit.
          roomFor(room.id);
          if (!player.connection) throw new RequestError(409, 'Connect to the shared game before editing.');
          if (now() - player.windowAt >= 1000) { player.windowAt = now(); player.requests = 0; }
          if (++player.requests > 20) throw new RequestError(429, 'Too many edits. Wait a moment and try again.');
          if (gameMatch[2] === 'heartbeat') {
            if (Object.keys(data).length) throw new RequestError(400, 'Invalid heartbeat.');
            player.lastSeen = now();
            res.writeHead(204, { 'Cache-Control': 'no-store' });
            res.end();
            return;
          }
          if (gameMatch[2] === 'control') simulation.control(player, data);
          else simulation.execute(player, data);
          return json(res, 200, {
            ...simulation.snapshot(false),
            ...(gameMatch[2] === 'commands'
              ? { commandOutcome: { requestId: data.requestId, revision: simulation.revision } }
              : {}),
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
            const player: Seat = { name, token: opaqueId(), ready: false, windowAt: now(), requests: 0, outcomes: new Map() };
            current.players.push(player);
            current.simulation.players.push(player);
            current.simulation.revision++;
            current.simulation.publish();
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
      if (error instanceof AppliedRequest) {
        const url = new URL(req.url!, 'http://localhost');
        const room = roomFor(url.pathname.split('/')[3]!);
        return json(res, 200, {
          ...room.simulation.snapshot(false),
          commandOutcome: { requestId: error.requestId, revision: error.revision },
        });
      }
      if (error instanceof StorageError) return json(res, 503, { error: error.message });
      if (error instanceof CommandError) return json(res, 422, { error: error.message });
      if (!(error instanceof RequestError)) throw error;
      json(res, error.status, { error: error.message });
    }
  }
  // Expected request errors are handled above. Unexpected rejections terminate Node,
  // so the host sees a failure rather than a healthy process with corrupt room state.
  const server = createServer((req, res) => {
    void handle(req, res);
  });
  const clock = setInterval(() => {
    for (const [id, room] of rooms) {
      if (room.expiresAt <= now()) {
        for (const p of room.players) p.connection?.close();
        rooms.delete(id);
      } else if (!room.simulation.storageError) {
        try {
          for (const p of room.players) {
            if (p.connection && now() - (p.lastSeen ?? 0) > 7000) {
              const connection = p.connection;
              delete p.connection;
              connection.close();
              room.simulation.pause(`${p.name} lost connection. Both players must choose Ready again.`);
              room.simulation.revision++;
              room.simulation.publish();
            }
          }
          room.simulation.tick();
        } catch (error) {
          if (!(error instanceof StorageError)) throw error;
        }
      }
    }
  }, 1000);
  clock.unref();
  server.on('close', () => clearInterval(clock));
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  return server;
}
