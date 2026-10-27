import { describe, expect, it } from 'vitest';
import { catalog, getQuestLine } from '@homestead/catalog';
import cabin from '../../../designs/offgrid-cabin-family.json';
import { gameDigest, questView, costFor, gameFromDesign, stepDays, type DesignFile } from '@homestead/engine';
import { Simulation, CommandError, type Player } from '../src/simulation.ts';

const player = (name: string): Player => ({
  name,
  token: name,
  ready: false,
  windowAt: 0,
  requests: 0,
  outcomes: new Map(),
});
function setup() {
  const a = player('River');
  const b = player('Sky');
  const simulation = new Simulation([a, b]);
  const received: number[][] = [[], []];
  a.connection = { send: (s) => received[0]!.push(s.revision), close() {} };
  b.connection = { send: (s) => received[1]!.push(s.revision), close() {} };
  let request = 0;
  const execute = (p: Player, commands: unknown[]) =>
    simulation.execute(p, { requestId: `test-request-${String(++request).padStart(8, '0')}`, commands });
  return { a, b, simulation, execute, received };
}
const system = catalog.systems.find((s) => s.name === 'Rain Barrel (55 gal)')!;
const place = (x = 25, y = 25) => ({ kind: 'place', systemId: system.id, x, y, mode: 'buy' });

describe('shared room authority', () => {
  it('broadcasts shared quest measurements from full history and preserves completed milestones', () => {
    const { simulation: s } = setup();
    const line = getQuestLine(s.game.tutorial!.line);
    s.game = stepDays(s.game, catalog, 120).state;
    s.game.tutorial = { ...s.game.tutorial!, current: 1, since: 0 };
    s.game.ledgers[0] = { ...s.game.ledgers[0]!, gathered: [{ resource: 'Woody biomass', amount: 90, hours: 1, nodeId: 'deadfall', job: 'gather-wood', nodeType: 'deadfall', walkHours: 0 }] };
    const expected = questView(s.game, catalog)!;
    expect(expected.status.done).toBe(true);
    const update = s.snapshot(false);
    expect(update.game.ledgers).toHaveLength(1);
    expect(update.tutorial.quest).toEqual(expected);
    expect(questView(update.game, catalog)!.status.done).toBe(false);
    expect(update.tutorial).toMatchObject({ completed: 1, total: line.quests.length });
    s.game.tutorial.current = line.quests.length;
    expect(s.snapshot().tutorial).toEqual({ completed: line.quests.length, total: line.quests.length, quest: null });
    // Continued room commands do not reset the shared completion state.
    s.control(s.players[0]!, { ready: true });
    expect(s.snapshot().tutorial.completed).toBe(line.quests.length);
  });
  it('orders competing purchases using current cash and broadcasts identical revisions', () => {
    const { a, b, simulation: s, execute, received } = setup();
    const cost = costFor(catalog, system.id, 'buy');
    s.game = { ...s.game, cash: cost };
    execute(a, [place()]);
    const digest = gameDigest(s.game);
    expect(() => execute(b, [place(40)])).toThrow(/cash|budget/i);
    expect(s.game.cash).toBe(0);
    expect(s.game.instances.at(-1)?.id).toBe(`i${s.game.nextInstanceId - 1}`);
    expect(gameDigest(s.game)).toBe(digest);
    expect(s.revision).toBe(1);
    expect(received).toEqual([[1], [1]]);
  });
  it('rejects forged refund, cash, settings, time, identifiers and malformed commands without mutation', () => {
    const { a, simulation: s, execute } = setup();
    const before = gameDigest(s.game);
    const forgeries = [
      { kind: 'delete', id: s.game.instances[0]!.id, cashDelta: 1e9 },
      { kind: 'settings', settings: { startingCash: 1e9, unlimitedSupply: true } },
      { ...place(), cashDelta: -100 },
      { ...place(), id: 'my-instance' },
      { ...place(), mode: 'prebuilt' },
      { ...place(), at: 50 },
      { ...place(), x: NaN },
      { kind: 'buy', resource: 'Food', amount: -10 },
      { kind: 'priority', id: s.game.instances[0]!.id, priority: -1 },
      { kind: 'workPriority', job: 'construction', value: 0 },
      { kind: 'link', id: s.game.instances[0]!.id, resource: 'made-up', providerId: null },
      { kind: 'remove', id: s.game.instances.find((i) => i.person)!.id },
    ];
    for (const forgery of forgeries) {
      expect(() => execute(a, [forgery])).toThrow(CommandError);
      expect(gameDigest(s.game)).toBe(before);
      expect(s.revision).toBe(0);
    }
  });
  it('validates collisions against the current layout and rejects an entire invalid batch', () => {
    const { a, b, simulation: s, execute } = setup();
    execute(a, [place()]);
    const before = gameDigest(s.game);
    expect(() => execute(b, [place()])).toThrow(/overlap/);
    expect(() => execute(b, [place(50), { kind: 'buy', resource: 'not a resource', amount: 1 }])).toThrow(
      CommandError,
    );
    expect(gameDigest(s.game)).toBe(before);
    expect(() =>
      execute(a, [{ kind: 'moveMany', moves: [{ id: s.game.instances.at(-1)!.id, x: 10000, y: 10000 }] }]),
    ).toThrow(/parcel/);
    expect(gameDigest(s.game)).toBe(before);
  });
  it('supports both players building, moving, linking, buying, ordering and changing work without replacing other work changes', () => {
    const { a, b, simulation: s, execute } = setup();
    execute(a, [place()]);
    const id = s.game.instances.at(-1)!.id;
    execute(b, [place(50), { kind: 'buy', resource: 'Food', amount: 1000 }]);
    execute(a, [{ kind: 'workPriority', job: 'construction', value: 5 }]);
    execute(b, [
      { kind: 'workCap', job: 'construction', value: 10 },
      { kind: 'autoGather', resource: 'waterDays', value: 7 },
    ]);
    execute(a, [
      { kind: 'moveMany', moves: [{ id, x: 35, y: 35 }] },
      { kind: 'priority', id, priority: 3 },
      { kind: 'link', id, resource: 'Water', providerId: s.game.instances[0]!.id },
      { kind: 'standing', resource: 'Food', keepAbove: 2000 },
    ]);
    expect(s.game.instances.find((i) => i.id === id)).toMatchObject({ x: 35, y: 35, priority: 3 });
    expect(s.game.settings.work).toMatchObject({
      priorities: { construction: 5 },
      caps: { construction: 10 },
    });
    expect(s.game.settings.autoGather?.waterDays).toBe(7);
    expect(s.game.market?.standing).toContainEqual(
      expect.objectContaining({ resource: 'Food', keepAbove: 2000 }),
    );
    const cash = s.game.cash;
    execute(b, [{ kind: 'remove', id }]);
    expect(s.game.cash).toBe(cash + costFor(catalog, system.id, 'buy'));
    expect(s.game.instances.filter((i) => i.person)).toHaveLength(2);
  });
  it('requires two ready players, advances only on server ticks, and resets readiness on manual or alert pauses', () => {
    const { a, b, simulation: s } = setup();
    s.tick();
    expect(s.game.calendar.absDay).toBe(0);
    s.control(a, { ready: true });
    s.tick();
    expect(s.game.calendar.absDay).toBe(0);
    s.control(b, { ready: true });
    s.tick();
    expect(s.game.calendar.absDay).toBe(1);
    s.control(b, { ready: false });
    expect(s.running).toBe(false);
    expect(s.players.map((p) => p.ready)).toEqual([false, false]);
    s.control(a, { ready: true });
    delete b.connection;
    s.pause('Sky disconnected.');
    expect(() => s.control(a, { ready: true })).toThrow(/connected/);
    expect(s.players.map((p) => p.ready)).toEqual([false, false]);
    b.connection = { send() {}, close() {} };
    s.game = { ...s.game, stocks: { ...s.game.stocks, Food: 0, 'Drinking water': 0, 'Woody biomass': 0 } };
    s.control(a, { ready: true });
    s.control(b, { ready: true });
    s.tick();
    expect(s.running).toBe(false);
    expect(s.pauseReason).toMatch(/alert/i);
    expect(s.players.map((p) => p.ready)).toEqual([false, false]);
  });
  it('rejects duplicate edits and bounds state broadcasts independently of accumulated history', () => {
    const { a, simulation: s } = setup();
    const command = { requestId: 'unique-request-0001', commands: [place()] };
    s.execute(a, command);
    const cash = s.game.cash;
    expect(() => s.execute(a, command)).toThrow(/already applied/);
    expect(s.game.cash).toBe(cash);
    s.game = stepDays(
      gameFromDesign(catalog, cabin as DesignFile, { seed: 2026, weatherMode: 'average' }),
      catalog,
      730,
    ).state;
    expect(s.snapshot().game.ledgers).toHaveLength(90);
    expect(JSON.stringify(s.snapshot())).not.toContain('outcomes');
    const bytes = Buffer.byteLength(JSON.stringify(s.snapshot()));
    const fullBytes = Buffer.byteLength(JSON.stringify(s.game));
    expect(bytes).toBeLessThan(fullBytes / 2);
    expect(s.snapshot(false).game.ledgers).toHaveLength(1);
    const updateBytes = Buffer.byteLength(JSON.stringify(s.snapshot(false)));
    expect(updateBytes).toBeLessThan(bytes / 10);
    console.info(
      `Developed cabin after 730 days: snapshot ${bytes} bytes; tick ${updateBytes} bytes; full state ${fullBytes} bytes.`,
    );
  });
});
