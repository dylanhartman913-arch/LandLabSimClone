import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { catalog } from '@homestead/catalog';
import { createRoomServer } from '../src/server.ts';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function service(options: { now?: () => number; roomTtlMs?: number; maxRooms?: number } = {}) {
  const webRoot = mkdtempSync(join(tmpdir(), 'terra-room-'));
  writeFileSync(join(webRoot, 'index.html'), '<html>TERRA game</html>');
  writeFileSync(join(webRoot, 'app.js'), 'console.log("game")');
  const server = createRoomServer({ webRoot, ...options });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  cleanups.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    rmSync(webRoot, { recursive: true });
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, data: unknown) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  return { base, post };
}
describe('hosted room skeleton', () => {
  it('serves the game, assets, and dependency-backed readiness', async () => {
    const { base } = await service();
    expect(await (await fetch(base)).text()).toContain('TERRA game');
    const asset = await fetch(base + '/app.js');
    expect(asset.headers.get('content-type')).toContain('javascript');
    expect(await asset.text()).toContain('console.log');
    const health = await fetch(base + '/healthz');
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({
      ready: true,
      engineVersion: expect.any(String),
      catalogSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect((await fetch(base + '/missing.js')).status).toBe(404);
    expect((await fetch(base + '/%E0%A4%A')).status).toBe(400);
  });
  it('creates an invite and atomically claims exactly one remaining seat', async () => {
    const { base, post } = await service();
    const created = await post('/api/rooms', { name: 'River' });
    expect(created.status).toBe(201);
    const creator = await created.json();
    expect(creator.invitePath).toBe(`/?room=${creator.room.id}`);
    expect(creator.playerToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(creator.room.players).toEqual([{ name: 'River' }]);
    const path = `/api/rooms/${creator.room.id}`;
    const joins = await Promise.all([
      post(path + '/join', { name: 'Sky' }),
      post(path + '/join', { name: 'Third' }),
    ]);
    expect(joins.map((r) => r.status).sort()).toEqual([200, 409]);
    const rejected = joins.find((r) => r.status === 409)!;
    expect((await rejected.json()).error).toContain('Room full');
    const room = await (await fetch(base + path)).json();
    expect(room.room.players).toHaveLength(2);
    expect(JSON.stringify(room)).not.toContain(creator.playerToken);
    expect(JSON.stringify(room)).not.toContain('token');
    expect((await post(path + '/join', { name: 'Fourth' })).status).toBe(409);
  });
  it('explains unknown and expired invites, including a join after expiry', async () => {
    let time = 100;
    const { base, post } = await service({ now: () => time, roomTtlMs: 10 });
    const created = await (await post('/api/rooms', { name: 'River' })).json();
    const unknown = await fetch(base + '/api/rooms/unknown');
    expect(unknown.status).toBe(404);
    expect((await unknown.json()).error).toContain('unknown or has expired');
    time = 110;
    const expired = await post(`/api/rooms/${created.room.id}/join`, { name: 'Sky' });
    expect(expired.status).toBe(404);
    expect((await expired.json()).error).toContain('expired');
  });
  it('rejects invalid input, oversized payloads, cross-origin claims, and capacity overflow', async () => {
    const { base, post } = await service({ maxRooms: 1 });
    expect((await post('/api/rooms', { name: ' ' })).status).toBe(400);
    expect((await post('/api/rooms', { name: 'a'.repeat(41) })).status).toBe(400);
    expect((await post('/api/rooms', { name: 'a'.repeat(3000) })).status).toBe(413);
    expect(
      (
        await fetch(base + '/api/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(base + '/api/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'https://other.example' },
          body: '{"name":"River"}',
        })
      ).status,
    ).toBe(403);
    expect((await post('/api/rooms', { name: 'River' })).status).toBe(201);
    const full = await post('/api/rooms', { name: 'Sky' });
    expect(full.status).toBe(503);
    expect((await full.json()).error).toContain('capacity');
  });
});

describe('shared simulation transport', () => {
  it('authenticates streams and edits, broadcasts ordered state, and pauses when heartbeats stop', async () => {
    let time = 100;
    const { base, post } = await service({ now: () => time });
    const a = await (await post('/api/rooms', { name: 'River' })).json();
    const path = `/api/rooms/${a.room.id}`;
    const b = await (await post(path + '/join', { name: 'Sky' })).json();
    expect((await fetch(base + path + '/stream')).status).toBe(401);
    expect((await post(path + '/commands', { requestId: 'no-token-request', commands: [] })).status).toBe(401);
    const send = (token: string, suffix: string, data: unknown) => fetch(base + path + suffix, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
    expect((await send(a.playerToken, '/control', { ready: true })).status).toBe(409);
    const connect = async (token: string) => {
      const response = await fetch(base + path + '/stream', { headers: { Authorization: `Bearer ${token}` } });
      expect(response.status).toBe(200);
      const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      const next = async () => {
        for (;;) {
          const newline = buffer.indexOf('\n');
          if (newline >= 0) {
            const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
            if (line) return JSON.parse(line);
          } else {
            const result = await reader.read();
            if (result.done) throw new Error('Stream closed before state arrived.');
            buffer += result.value;
          }
        }
      };
      return { next, close: () => reader.cancel() };
    };
    const first = await connect(a.playerToken);
    const second = await connect(b.playerToken);
    try {
      expect((await fetch(base + path + '/stream', { headers: { Authorization: `Bearer ${a.playerToken}` } })).status).toBe(409);
      expect((await send(a.playerToken, '/commands', { requestId: 'forged-request-0001', commands: [{ kind: 'settings', settings: { cash: 1e9 } }] })).status).toBe(422);
      const system = catalog.systems.find((s) => s.name === 'Rain Barrel (55 gal)')!;
      const competing = await Promise.all([a, b].map((p, i) => send(p.playerToken, '/commands', {
        requestId: `competing-request-000${i}`, commands: [{ kind: 'place', systemId: system.id, x: 25, y: 25, mode: 'buy' }],
      })));
      expect(competing.map((r) => r.status).sort()).toEqual([200, 422]);
      expect((await competing.find((r) => r.status === 422)!.json()).error).toContain('overlaps');
      const readyA = await (await send(a.playerToken, '/control', { ready: true })).json();
      expect(readyA.running).toBe(false);
      const readyB = await (await send(b.playerToken, '/control', { ready: true })).json();
      expect(readyB.running).toBe(true);
      const stateA = async (revision: number) => { let s; do { s = await first.next(); } while (s.revision < revision); return s; };
      const stateB = async (revision: number) => { let s; do { s = await second.next(); } while (s.revision < revision); return s; };
      expect(await stateA(readyB.revision)).toEqual(await stateB(readyB.revision));
      time += 8000;
      expect((await send(a.playerToken, '/heartbeat', {})).status).toBe(204);
      let disconnected;
      do { disconnected = await first.next(); } while (disconnected.players[1].connected);
      expect(disconnected.running).toBe(false);
      expect(disconnected.players.map((p: { ready: boolean }) => p.ready)).toEqual([false, false]);
      expect(disconnected.pauseReason).toContain('lost connection');
      expect((await send(a.playerToken, '/control', { ready: true })).status).toBe(422);
    } finally {
      await first.close();
      await second.close();
    }
  });
});
