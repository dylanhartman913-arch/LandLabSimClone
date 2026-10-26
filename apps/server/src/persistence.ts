import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { isAbsolute, join } from 'node:path';
import { catalog } from '@homestead/catalog';
import {
  ENGINE_VERSION,
  SAVE_SCHEMA,
  saveProblems,
  type GameState,
  type GameEvent,
  type Report,
} from '@homestead/engine';
import { z } from 'zod';
import { ROOM_INIT, type CommandOutcome } from './simulation.ts';

export class StorageError extends Error {}
export class SavedRoomError extends Error {
  readonly savedRoom = true;
}
export interface RoomRecord {
  id: string;
  expiresAt: number;
  revision: number;
  game: GameState;
  events: GameEvent[];
  reports: Report[];
  players: { name: string; token: string; outcomes: [string, CommandOutcome][] }[];
}
export interface RoomStorage {
  load(): { rooms: RoomRecord[]; unavailable: Map<string, string> };
  write(room: RoomRecord): void;
}
const id = z.string().regex(/^[A-Za-z0-9_-]{32}$/);
const record = z
  .object({
    id,
    expiresAt: z.number().finite(),
    revision: z.number().int().nonnegative(),
    game: z.object({ schema: z.literal('homestead.game.v1') }).passthrough(),
    events: z.array(z.unknown()).max(100),
    reports: z.array(z.unknown()).max(12),
    players: z
      .array(
        z
          .object({
            name: z.string().min(1).max(40),
            token: id,
            outcomes: z
              .array(
                z.tuple([
                  z.string().regex(/^[A-Za-z0-9_-]{16,80}$/),
                  z
                    .object({
                      revision: z.number().int().positive(),
                      fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
                      commands: z.array(z.unknown()).min(1).max(50),
                    })
                    .strict(),
                ]),
              )
              .max(10_000),
          })
          .strict(),
      )
      .min(1)
      .max(2),
  })
  .strict();
const envelope = z
  .object({
    schema: z.literal('terra.room.v1'),
    engineVersion: z.string(),
    catalogSha256: z.string(),
    init: z.unknown(),
    checksum: z.string(),
    room: z.unknown(),
  })
  .strict();
const checksum = (room: unknown) => createHash('sha256').update(JSON.stringify(room)).digest('hex');
// Catch filesystem failures only. Unexpected programming errors must still terminate the service.
function filesystemFailure(error: unknown): never {
  if (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    [
      'EACCES',
      'EPERM',
      'ENOSPC',
      'EIO',
      'EROFS',
      'EDQUOT',
      'EMFILE',
      'ENFILE',
      'ENOENT',
      'ENOTDIR',
      'EISDIR',
      'EEXIST',
      'EFBIG',
    ].includes(error.code)
  )
    throw new StorageError(
      `Room storage failed (${error.code}). No save was acknowledged. Ask the host owner to repair storage and restart the service.`,
    );
  throw error;
}
export class FileRoomStorage implements RoomStorage {
  constructor(readonly directory: string) {
    if (!isAbsolute(directory)) throw new Error('ROOM_DATA_DIR must be an absolute path.');
    try {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
    } catch (error) {
      filesystemFailure(error);
    }
  }
  load() {
    const rooms: RoomRecord[] = [];
    const unavailable = new Map<string, string>();
    let entries: string[];
    try {
      entries = readdirSync(this.directory);
    } catch (error) {
      return filesystemFailure(error);
    }
    for (const file of entries) {
      if (!/^[A-Za-z0-9_-]{32}\.json$/.test(file)) continue;
      const roomId = file.slice(0, -5);
      try {
        const path = join(this.directory, file);
        if (statSync(path).size > 24 * 1024 * 1024)
          throw new SavedRoomError('Saved room exceeds the storage limit.');
        const parsed = envelope.safeParse(JSON.parse(readFileSync(path, 'utf8')));
        if (!parsed.success) throw new SavedRoomError('The saved room has an unreadable format.');
        const saved = parsed.data;
        if (
          saved.engineVersion !== ENGINE_VERSION ||
          saved.catalogSha256 !== catalog.source.sha256 ||
          JSON.stringify(saved.init) !== JSON.stringify(ROOM_INIT)
        )
          throw new SavedRoomError(
            'This saved room uses an incompatible engine, catalog, or scenario. The host owner must restore its matching release.',
          );
        if (saved.checksum !== checksum(saved.room))
          throw new SavedRoomError('The saved room failed its integrity check.');
        const valid = record.safeParse(saved.room);
        if (!valid.success || valid.data.id !== roomId)
          throw new SavedRoomError('The saved room metadata is invalid.');
        const room = valid.data as unknown as RoomRecord;
        const problems = saveProblems(
          {
            schema: SAVE_SCHEMA,
            init: ROOM_INIT,
            actions: [],
            absDay: room.game.calendar?.absDay,
            digest: '',
            state: room.game,
          },
          catalog,
        );
        if (problems.length) throw new SavedRoomError('The saved game snapshot is invalid.');
        if (
          new Set(room.players.map((p) => p.token)).size !== room.players.length ||
          room.players.some(
            (p) =>
              new Set(p.outcomes.map(([request]) => request)).size !== p.outcomes.length ||
              p.outcomes.some(
                ([, result]) =>
                  result.revision > room.revision || result.fingerprint !== checksum(result.commands),
              ),
          )
        )
          throw new SavedRoomError('The saved player or request history is invalid.');
        rooms.push(room);
      } catch (error) {
        if (error instanceof SavedRoomError || error instanceof SyntaxError)
          unavailable.set(
            roomId,
            `${error instanceof SavedRoomError ? error.message : 'The saved room is corrupt.'} Progress has not been replaced. Contact the host owner.`,
          );
        else filesystemFailure(error);
      }
    }
    return { rooms, unavailable };
  }
  write(room: RoomRecord) {
    if (!id.safeParse(room.id).success) throw new Error('Invalid room storage ID.');
    const data = JSON.stringify({
      schema: 'terra.room.v1',
      engineVersion: ENGINE_VERSION,
      catalogSha256: catalog.source.sha256,
      init: ROOM_INIT,
      checksum: checksum(room),
      room,
    });
    const bytes = Buffer.byteLength(data);
    if (bytes > 24 * 1024 * 1024)
      throw new StorageError(
        'This room exceeds its 24 MiB save limit. No save was acknowledged. Contact the host owner.',
      );
    const destination = join(this.directory, room.id + '.json');
    const temporary = join(this.directory, `${room.id}.${randomBytes(8).toString('hex')}.tmp`);
    try {
      const used = readdirSync(this.directory)
        .filter((file) => file.endsWith('.json') && file !== room.id + '.json')
        .reduce((total, file) => total + statSync(join(this.directory, file)).size, 0);
      if (used + bytes > 512 * 1024 * 1024)
        throw new StorageError(
          'Room storage has reached its 512 MiB limit. No save was acknowledged. Contact the host owner.',
        );
      const fd = openSync(temporary, 'wx', 0o600);
      try {
        writeFileSync(fd, data);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(temporary, destination);
      // Persist the directory entry as well as the contents before acknowledging a commit.
      const directoryFd = openSync(this.directory, 'r');
      try {
        fsyncSync(directoryFd);
      } finally {
        closeSync(directoryFd);
      }
    } catch (error) {
      if (error instanceof StorageError) throw error;
      filesystemFailure(error);
    } finally {
      try {
        if (existsSync(temporary)) unlinkSync(temporary);
      } catch (error) {
        filesystemFailure(error);
      }
    }
  }
}
