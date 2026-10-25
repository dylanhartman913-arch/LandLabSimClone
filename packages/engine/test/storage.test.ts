import { describe, expect, it } from 'vitest';
import {
  applyAction,
  gameDigest,
  replay,
  resourcePage,
  setWinterProtection,
  statePools,
  stepDays,
  winterView,
  type Action,
  type DayLedger,
  type GameSettings,
  type GameState,
} from '../src/index.ts';
import { catalog, eventsOf, newGame, run, sysId } from './time-helpers.ts';

const ON: Partial<GameSettings> = { storagePools: true, safeWaterFirst: true };
const supplies = { Food: 1e7, 'Woody biomass': 1e5 };

const barrel = (s: GameState) => s.instances.find((i) => i.systemId === sysId('Rain Barrel (55 gal)'))!;

/** A one-person Laramie camp with a rain barrel, starting on January 1. */
function laramie(extra: Record<string, number> = {}, settings: Partial<GameSettings> = ON, water = 80): GameState {
  return newGame(
    { 'Human Being': 1, 'Bell Tent': 1, 'Rain Barrel (55 gal)': 1, ...extra },
    { site: 'laramie-wy', settings: { ...settings, startDay: 0, startingStocks: { ...supplies, Water: water, 'Drinking water': 40 } } },
  );
}

function conserved(ledgers: DayLedger[], final: GameState) {
  for (let d = 0; d < ledgers.length; d++)
    for (const [r, x] of Object.entries(ledgers[d]!.resources)) {
      const l = ledgers[d]!;
      const end = d + 1 < ledgers.length ? ledgers[d + 1]!.resources[r]!.start : (final.stocks[r] ?? 0) + (final.direct[r] ?? 0);
      const lhs =
        x.start + x.produced + x.purchased + x.supplied - x.consumed - x.spilled - x.spoiled -
        (x.processed ?? 0) - (x.sold ?? 0) - (x.frozen ?? 0);
      expect(Math.abs(lhs - end), `${r} on day ${l.absDay}`).toBeLessThan(1e-6 * Math.max(1, Math.abs(end)));
    }
}

describe('LL-33 separate storage pools and winter water', () => {
  it('a full raw tank overflows without touching drinking water, which keeps its own containers', () => {
    const settings = { startingStocks: { ...supplies, Water: 1000, 'Drinking water': 40 } };
    const legacy = newGame({ 'Human Being': 1, 'Rain Barrel (55 gal)': 1 }, { settings });
    const split = newGame({ 'Human Being': 1, 'Rain Barrel (55 gal)': 1 }, { settings: { ...settings, ...ON } });
    const a = run(legacy, 1).ledgers[0]!;
    const b = run(split, 1).ledgers[0]!;
    expect(a.resources['Drinking water']!.spilled).toBeGreaterThan(5);
    expect(b.resources['Drinking water']!.spilled).toBe(0);
    expect(b.resources.Water!.spilled).toBeGreaterThan(800);
    const pools = statePools(split, catalog);
    expect(pools.find((p) => p.name === 'Raw water storage')!.cap).toBe(105);
    expect(pools.find((p) => p.name === 'Drinking water storage')!.cap).toBe(50);
    expect(resourcePage(split, catalog, 'Drinking water').storage).toEqual({ pool: 'Drinking water storage', room: 50 });
  });

  it('drinking water beyond its containers spills even when the raw tank is empty', () => {
    const s = newGame({ 'Rain Barrel (55 gal)': 1 }, { settings: { ...ON, startingStocks: { 'Drinking water': 200 } } });
    const r = run(s, 1);
    expect(r.state.stocks['Drinking water']).toBeCloseTo(50);
    expect(r.ledgers[0]!.resources['Drinking water']!.spilled).toBeCloseTo(150);
  });

  it('the 7-day water quest keeps safe water: fetching fills only the raw tank', () => {
    const s = newGame(
      { 'Human Being': 2, 'Bell Tent': 1, 'Rain Barrel (55 gal)': 1 },
      { settings: { ...ON, autoGather: { waterDays: 7 }, startingStocks: { ...supplies, 'Drinking water': 40 } } },
    );
    const r = run(s, 9);
    const fetchedSpill = r.ledgers.reduce((a, l) => a + l.resources.Water!.spilled, 0);
    expect(r.ledgers.reduce((a, l) => a + l.resources['Drinking water']!.spilled, 0)).toBe(0);
    expect(fetchedSpill).toBeLessThan(1);
    expect(r.state.stocks.Water).toBeGreaterThan(30);
  });

  it('hay and feed are limited by free storage space, and a shed raises the limit', () => {
    const stocks = { Hay: 1000, 'Chicken feed': 100 };
    const bins = run(newGame({}, { settings: { ...ON, startingStocks: stocks } }), 1).state;
    // 10 cu ft of household bins: 100 lb of feed takes 2.5 cu ft, leaving 7.5 cu ft ≈ 71 lb of hay.
    expect(bins.stocks['Chicken feed']! / 40 + bins.stocks.Hay! / 9.5).toBeCloseTo(10);
    const shed = run(newGame({ 'Toolshed Workshop': 1 }, { settings: { ...ON, startingStocks: stocks } }), 1).state;
    expect(shed.stocks.Hay).toBeCloseTo(1000);
    const legacy = run(newGame({}, { settings: { startingStocks: stocks } }), 1).state;
    expect(legacy.stocks.Hay).toBeCloseTo(1000);
  });

  it('a market trip brings home only the feed that fits', () => {
    let s = newGame({}, { settings: { ...ON, startingCash: 5000 } });
    s = applyAction(catalog, s, { at: 0, kind: 'buy', resource: 'Chicken feed', amount: 2000 });
    const r = run(s, 1);
    expect(r.state.stocks['Chicken feed']).toBeCloseTo(400);
    expect(r.ledgers[0]!.resources['Chicken feed']!.spilled).toBe(0);
  });

  it('an outdoor barrel freezes in a Laramie January, locks its water, and thaws in spring', () => {
    const r = run(laramie(), 150);
    const froze = eventsOf(r.events, 'winter-water').filter((e) => e.event === 'froze');
    const thawed = eventsOf(r.events, 'winter-water').filter((e) => e.event === 'thawed');
    expect(froze.length).toBeGreaterThan(0);
    expect(froze[0]!.absDay).toBeLessThan(5);
    expect(froze[0]!.gal).toBeGreaterThan(0);
    expect(thawed.length).toBeGreaterThan(0);
    expect(thawed.at(-1)!.absDay).toBeGreaterThan(60);
    const frozenDay = r.ledgers[froze[0]!.absDay]!;
    expect(frozenDay.resources.Water!.frozen).toBeCloseTo(froze[0]!.gal);
    expect(frozenDay.winter![0]!.frozen).toBeCloseTo(froze[0]!.gal);
    conserved(r.ledgers, r.state);
  });

  it('a frozen tank takes no new water: only the household buffer stays usable', () => {
    const s = run(laramie(), 10).state;
    expect(barrel(s).winter!.frozen).toBeDefined();
    expect(statePools(s, catalog).find((p) => p.name === 'Raw water storage')!.cap).toBe(50);
    const v = winterView(s, catalog, barrel(s).id)!;
    expect(v.frozen).toBe(true);
    expect(v.locked.value).toBeCloseTo(barrel(s).winter!.frozen!);
  });

  it('insulation (bought and installed with real labor) holds out longer than a bare barrel', () => {
    const bare = laramie();
    const wrapped = setWinterProtection(catalog, bare, barrel(bare).id, 'insulated');
    expect(wrapped.cash).toBeCloseTo(bare.cash - (40 + 0.25 * 55));
    const firstFreeze = (s: GameState) =>
      eventsOf(run(s, 60).events, 'winter-water').find((e) => e.event === 'froze')?.absDay ?? Infinity;
    const day1 = run(wrapped, 1);
    expect(barrel(day1.state).winter!.setupHours).toBeCloseTo(2);
    expect(day1.ledgers[0]!.labor.upkeepDelivered).toBeGreaterThanOrEqual(2);
    expect(firstFreeze(wrapped)).toBeGreaterThan(firstFreeze(bare) + 2);
  });

  it('a powered heater keeps the barrel liquid; without power it freezes like a bare one', () => {
    const powered = laramie({ 'Small Wind Turbine (1.5 kW)': 1, 'LiFePO4 Battery Bank (10 kWh)': 1 });
    const heated = setWinterProtection(catalog, powered, barrel(powered).id, 'heated');
    const r = run(heated, 45);
    expect(eventsOf(r.events, 'winter-water').filter((e) => e.event === 'froze')).toHaveLength(0);
    const heaterKWh = r.ledgers.reduce((a, l) => a + (l.winter?.[0]?.heaterKWh ?? 0), 0);
    expect(heaterKWh).toBeGreaterThan(5);
    conserved(r.ledgers, r.state);
    const dark = laramie();
    const unpowered = run(setWinterProtection(catalog, dark, barrel(dark).id, 'heated'), 45);
    expect(eventsOf(unpowered.events, 'winter-water').some((e) => e.event === 'froze')).toBe(true);
    expect(unpowered.ledgers.some((l) => (l.winter?.[0]?.heaterNeedKWh ?? 0) > 0)).toBe(true);
  });

  it('refuses protection when the gate is off, for non-tanks, and without cash', () => {
    const off = laramie({}, {});
    expect(() => setWinterProtection(catalog, off, barrel(off).id, 'insulated')).toThrow(/disabled/);
    const on = laramie();
    const tent = on.instances.find((i) => i.systemId === sysId('Bell Tent'))!;
    expect(() => setWinterProtection(catalog, on, tent.id, 'insulated')).toThrow(/outdoor water tanks/);
    expect(() => setWinterProtection(catalog, { ...on, cash: 1 }, barrel(on).id, 'insulated')).toThrow(/Cash/);
  });

  it('with the gate off there is no freezing or split pool, and digests match the legacy run', () => {
    const a = run(laramie({}, {}), 30);
    expect(a.ledgers.some((l) => l.winter)).toBe(false);
    expect(a.ledgers.every((l) => l.resources.Water!.frozen === undefined)).toBe(true);
    const b = run(laramie({}, { storagePools: false }), 30);
    expect(gameDigest({ ...b.state, settings: a.state.settings })).toBe(gameDigest(a.state));
  });

  it('turning the gate off releases frozen water back into stock', () => {
    const s = run(laramie(), 10).state;
    const locked = barrel(s).winter!.frozen!;
    const off = applyAction(catalog, s, { at: s.calendar.absDay, kind: 'settings', settings: { storagePools: false } });
    expect(off.stocks.Water).toBeCloseTo((s.stocks.Water ?? 0) + locked);
    expect(barrel(off).winter!.frozen).toBeUndefined();
  });

  it('replays winterize actions and survives a JSON save', () => {
    const init = {
      siteId: 'laramie-wy',
      seed: 1,
      settings: { ...ON, startDay: 0, startingStocks: { ...supplies, Water: 80, 'Drinking water': 40 } },
    };
    let s = replay(catalog, init, [], 0);
    const actions: Action[] = [];
    const doIt = (a: Action) => {
      actions.push(a);
      s = applyAction(catalog, s, a);
    };
    doIt({ at: 0, kind: 'place', systemId: sysId('Rain Barrel (55 gal)'), x: 40, y: 40, mode: 'prebuilt', id: `i${s.nextInstanceId}` });
    doIt({ at: 0, kind: 'winterize', id: barrel(s).id, protection: 'insulated' });
    s = stepDays(s, catalog, 20).state;
    const again = replay(catalog, init, actions, 20);
    expect(gameDigest(again)).toBe(gameDigest(s));
    const loaded = JSON.parse(JSON.stringify(s)) as GameState;
    expect(gameDigest(stepDays(loaded, catalog, 20).state)).toBe(gameDigest(stepDays(s, catalog, 20).state));
  });
});
