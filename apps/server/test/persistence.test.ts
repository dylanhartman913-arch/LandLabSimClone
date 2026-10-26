import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { catalog } from '@homestead/catalog';
import type { SharedSnapshot } from '../src/protocol.ts';
import { createRoomServer } from '../src/server.ts';
import { FileRoomStorage, StorageError, type RoomStorage } from '../src/persistence.ts';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'terra-persist-'));
  writeFileSync(join(directory, 'index.html'), '<html>TERRA</html>');
  cleanups.push(async () => rmSync(directory, { recursive: true, force: true }));
  const storage = new FileRoomStorage(join(directory, 'rooms'));
  const start = async (store: RoomStorage = storage) => {
    const server = createRoomServer({ webRoot: directory, storage: store });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    let stopped = false;
    const stop = async () => {
      if (stopped) return;
      stopped = true;
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    };
    cleanups.push(stop);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const send = (path: string, data: unknown, token?: string) =>
      fetch(base + path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(data),
      });
    const connect = async (path: string, token: string) => {
      const response = await fetch(base + path + '/stream', {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(response.status).toBe(200);
      const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      const next = async (): Promise<SharedSnapshot> => {
        for (;;) {
          const newline = buffer.indexOf('\n');
          if (newline >= 0) {
            const line = buffer.slice(0, newline);
            buffer = buffer.slice(newline + 1);
            if (line) return JSON.parse(line) as SharedSnapshot;
          } else {
            const { done, value } = await reader.read();
            if (done) throw new Error('Stream ended before a snapshot.');
            buffer += value;
          }
        }
      };
      return { next, close: () => reader.cancel() };
    };
    return { base, send, connect, stop };
  };
  return { directory, storage, start };
}
const purchase = {
  requestId: 'retained-purchase-0001',
  commands: [{ kind: 'buy', resource: 'Food', amount: 1000 }],
};

describe('durable rooms and retained request outcomes', () => {
  it('restores real committed state, credentials and purchase outcomes paused after a server restart', async () => {
    const f = await fixture();
    const first = await f.start();
    const a = await (await first.send('/api/rooms', { name: 'River' })).json();
    const path = `/api/rooms/${a.room.id}`;
    const b = await (await first.send(path + '/join', { name: 'Sky' })).json();
    const one = await first.connect(path, a.playerToken);
    const two = await first.connect(path, b.playerToken);
    await one.next();
    await two.next();
    const response = await first.send(path + '/commands', purchase, a.playerToken);
    expect(response.status).toBe(200);
    const committed = await response.json();
    const file = join(f.storage.directory, a.room.id + '.json');
    const onDisk = JSON.parse(readFileSync(file, 'utf8'));
    expect(onDisk.room.game).toEqual(committed.game);
    expect(onDisk.room.players[0].outcomes[0]).toEqual([
      purchase.requestId,
      expect.objectContaining({ revision: committed.revision, commands: purchase.commands }),
    ]);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    await first.send(path + '/control', { ready: true }, a.playerToken);
    await first.send(path + '/control', { ready: true }, b.playerToken);
    // A genuinely committed server day (and its ledger/tutorial) is part of the reload.
    await expect
      .poll(() => JSON.parse(readFileSync(file, 'utf8')).room.game.calendar.absDay)
      .toBeGreaterThan(0);
    await first.stop();
    const last = JSON.parse(readFileSync(file, 'utf8')).room;
    const second = await f.start();
    expect((await second.send(path + '/join', { name: 'Third' })).status).toBe(409);
    const rejoined = await second.connect(path, a.playerToken);
    const restored = await rejoined.next();
    expect(restored.game).toEqual(last.game);
    expect(restored.running).toBe(false);
    expect(restored.players.map((p) => p.ready)).toEqual([false, false]);
    expect(restored.storageError).toBeNull();
    expect(restored.durable).toBe(true);
    const duplicate = await second.send(path + '/commands', purchase, a.playerToken);
    expect(duplicate.status).toBe(200);
    const retried = await duplicate.json();
    expect(retried.commandOutcome.revision).toBe(committed.revision);
    expect(retried.revision).toBe(restored.revision);
    expect(retried.game).toEqual(restored.game);
    const mismatch = await second.send(
      path + '/commands',
      { ...purchase, commands: [{ kind: 'buy', resource: 'Food', amount: 2000 }] },
      a.playerToken,
    );
    expect(mismatch.status).toBe(422);
    const outcome = await fetch(second.base + path + '/requests/' + purchase.requestId, {
      headers: { Authorization: `Bearer ${a.playerToken}` },
    });
    expect(await outcome.json()).toEqual({ requestId: purchase.requestId, revision: committed.revision });
    expect((await fetch(second.base + path + '/requests/' + purchase.requestId)).status).toBe(401);
    expect((await second.send(path + '/commands', purchase, 'forged-token')).status).toBe(401);
    expect(
      (
        await fetch(second.base + path + '/requests/' + purchase.requestId, {
          headers: { Authorization: `Bearer ${b.playerToken}` },
        })
      ).status,
    ).toBe(404);
    await rejoined.close();
  });
  it('serializes competing edits to disk and never commits unauthorized or rejected requests', async () => {
    const f = await fixture();
    const service = await f.start();
    const a = await (await service.send('/api/rooms', { name: 'River' })).json();
    const path = `/api/rooms/${a.room.id}`;
    const b = await (await service.send(path + '/join', { name: 'Sky' })).json();
    const one = await service.connect(path, a.playerToken);
    const two = await service.connect(path, b.playerToken);
    const systemId = catalog.systems.find((s) => s.name === 'Rain Barrel (55 gal)')!.id;
    const initialCount = JSON.parse(readFileSync(join(f.storage.directory, a.room.id + '.json'), 'utf8')).room
      .game.instances.length;
    const edits = await Promise.all(
      [a, b].map((p, index) =>
        service.send(
          path + '/commands',
          {
            requestId: `competing-durable-${index}`,
            commands: [{ kind: 'place', systemId, x: 25, y: 25, mode: 'buy' }],
          },
          p.playerToken,
        ),
      ),
    );
    expect(edits.map((r) => r.status).sort()).toEqual([200, 422]);
    const file = join(f.storage.directory, a.room.id + '.json');
    const committed = readFileSync(file, 'utf8');
    expect(JSON.parse(committed).room.game.instances).toHaveLength(initialCount + 1);
    expect(
      JSON.parse(committed).room.game.instances.filter(
        (i: { x: number; y: number }) => i.x === 25 && i.y === 25,
      ),
    ).toHaveLength(1);
    expect(
      JSON.parse(committed).room.players.flatMap((p: { outcomes: unknown[] }) => p.outcomes),
    ).toHaveLength(1);
    expect((await service.send(path + '/commands', purchase, 'invalid')).status).toBe(401);
    expect(readFileSync(file, 'utf8')).toBe(committed);
    expect(readdirSync(f.storage.directory).filter((p) => p.endsWith('.tmp'))).toEqual([]);
    await one.close();
    await two.close();
  });
  it('pauses and reports a real write failure without acknowledging or broadcasting the candidate purchase', async () => {
    const f = await fixture();
    const service = await f.start();
    const a = await (await service.send('/api/rooms', { name: 'River' })).json();
    const path = `/api/rooms/${a.room.id}`;
    const stream = await service.connect(path, a.playerToken);
    const before = await stream.next();
    const backup = readFileSync(join(f.storage.directory, a.room.id + '.json'), 'utf8');
    // Replace the storage directory with a file: the actual atomic filesystem write must fail.
    rmSync(f.storage.directory, { recursive: true });
    writeFileSync(f.storage.directory, 'storage unavailable');
    const failed = await service.send(path + '/commands', purchase, a.playerToken);
    expect(failed.status).toBe(503);
    expect((await failed.json()).error).toMatch(/No save was acknowledged/);
    let failure = await stream.next();
    while (!failure.storageError) failure = await stream.next();
    expect(failure.game).toEqual(before.game);
    expect(failure.revision).toBe(before.revision);
    expect(failure.running).toBe(false);
    expect(failure.storageError).toMatch(/storage failed/);
    expect((await fetch(service.base + '/healthz')).status).toBe(503);
    expect((await service.send(path + '/commands', purchase, a.playerToken)).status).toBe(503);
    await stream.close();
    await service.stop();
    rmSync(f.storage.directory);
    const recoveredStorage = new FileRoomStorage(f.storage.directory);
    writeFileSync(join(f.storage.directory, a.room.id + '.json'), backup);
    const recovered = await f.start(recoveredStorage);
    const joined = await recovered.connect(path, a.playerToken);
    expect((await joined.next()).game).toEqual(before.game);
    expect((await recovered.send(path + '/commands', purchase, a.playerToken)).status).toBe(200);
    await joined.close();
  });
  it('resolves an uncertain post-rename failure from the committed outcome after reload', async () => {
    const f = await fixture();
    let fail = false;
    const service = await f.start({
      load: () => f.storage.load(),
      write: (room) => {
        f.storage.write(room);
        if (fail) throw new StorageError('Injected directory sync failure. No save was acknowledged.');
      },
    });
    const a = await (await service.send('/api/rooms', { name: 'River' })).json();
    const path = `/api/rooms/${a.room.id}`;
    const stream = await service.connect(path, a.playerToken);
    await stream.next();
    fail = true;
    expect((await service.send(path + '/commands', purchase, a.playerToken)).status).toBe(503);
    await service.stop();
    const second = await f.start();
    const recovered = await second.connect(path, a.playerToken);
    const state = await recovered.next();
    const retried = await (await second.send(path + '/commands', purchase, a.playerToken)).json();
    expect(retried.game).toEqual(state.game);
    expect(retried.revision).toBe(state.revision);
    expect(retried.game.market.orders).toHaveLength(1);
    await recovered.close();
  });
  it('refuses incompatible and corrupt saved rooms visibly without replacing their data', async () => {
    const f = await fixture();
    const first = await f.start();
    const a = await (await first.send('/api/rooms', { name: 'River' })).json();
    await first.stop();
    const file = join(f.storage.directory, a.room.id + '.json');
    const original = JSON.parse(readFileSync(file, 'utf8'));
    const incompatible = JSON.stringify({ ...original, engineVersion: 'other-release' });
    writeFileSync(file, incompatible);
    const second = await f.start();
    const refused = await fetch(second.base + `/api/rooms/${a.room.id}`);
    expect(refused.status).toBe(409);
    expect((await refused.json()).error).toMatch(/incompatible/);
    expect(readFileSync(file, 'utf8')).toBe(incompatible);
    await second.stop();
    writeFileSync(file, '{corrupt');
    const third = await f.start();
    const corrupt = await fetch(third.base + `/api/rooms/${a.room.id}`);
    expect(corrupt.status).toBe(409);
    expect((await corrupt.json()).error).toMatch(/corrupt/);
    expect(readFileSync(file, 'utf8')).toBe('{corrupt');
  });
});
