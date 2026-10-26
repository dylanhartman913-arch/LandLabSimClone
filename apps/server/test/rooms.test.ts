import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
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
