import { describe, expect, it } from 'vitest';
import type { Catalog } from '@homestead/catalog';
import {
  animalOutput,
  applyAction,
  canPlace,
  daylightHours,
  flowRecord,
  gameDigest,
  goalStatus,
  homegrownShare,
  livestockView,
  manageLivestock,
  replay,
  resourcePage,
  resourceSources,
  setPreservation,
  startGame,
  systemCard,
  stepDay,
  stepDays,
  type GameState,
} from '../src/index.ts';
import { catalog, newGame, sysId } from './time-helpers.ts';

const noPredators: Catalog = {
  ...catalog,
  livestockRules: catalog.livestockRules!.map((r) => ({ ...r, predatorRisk: 0 })),
};
const fresh = 'Vegetables fruit fiber herbs';
const freezer = sysId('Efficient Chest Freezer');
const chick = sysId('Baby Chicks');
const hen = sysId('Chicken');
const rabbit = sysId('Meat Rabbits (trio)');
const base = { Food: 100000, 'Drinking water': 1000 };
const processor = (name = 'Solar Dehydrator') =>
  newGame(
    { 'Human Being': 1, [name]: 1, 'Root Cellar': 1 },
    {
      settings: {
        foodPreservation: true,
        startDay: 172,
        wellbeingMult: 0,
        startingStocks: { ...base, [fresh]: 500 },
      },
    },
  );

function conserve(before: GameState, after: GameState, resource: string) {
  const l = after.ledgers.at(-1)!.resources[resource]!;
  expect(
    (before.stocks[resource] ?? 0) +
      (before.direct[resource] ?? 0) +
      l.produced +
      l.purchased +
      l.supplied -
      l.consumed -
      (l.processed ?? 0) -
      (l.sold ?? 0) -
      l.spilled -
      l.spoiled,
  ).toBeCloseTo((after.stocks[resource] ?? 0) + (after.direct[resource] ?? 0), 7);
}

function nearbyGuardian(s: GameState): GameState {
  const target = s.instances.find((i) => i.systemId === hen)!;
  return {
    ...s,
    instances: s.instances.map((i) =>
      i.systemId === sysId('Livestock Guardian Dog') ? { ...i, x: target.x + 10, y: target.y } : i,
    ),
  };
}

function animalGame(counts: Record<string, number>, unlimitedSupply = true, seed = 1) {
  return newGame(
    { 'Human Being': 1, ...counts },
    {
      seed,
      settings: {
        livestockLifecycle: true,
        unlimitedSupply,
        wellbeingMult: 0,
        startingStocks: base,
      },
    },
  );
}

describe('LL-30 food preservation', () => {
  it('drying transforms food with a calorie loss, real labor, and no extra harvest or food eaten', () => {
    const s = processor();
    const id = s.instances.find((i) => i.systemId === sysId('Solar Dehydrator'))!.id;
    const r = stepDay(setPreservation(catalog, s, id, fresh, 100), catalog);
    const batch = r.ledger.preserved![0]!;
    expect(batch.inputKcal).toBe(6000);
    expect(batch.outputKcal).toBe(5400);
    expect(batch.labor).toBeCloseTo(1.8, 9);
    expect(batch.energy).toBe(3);
    expect(r.state.stocks[fresh]).toBeGreaterThanOrEqual(100);
    expect(r.ledger.resources['Preserved food']!.produced).toBe(5400);
    const page = resourcePage(r.state, catalog, 'Preserved food');
    expect(page.inDesign.find((p) => p.systemId === sysId('Solar Dehydrator'))!.actualWeek).toBe(37800);
    expect(page.couldBuild.some((p) => p.systemId === sysId('Pressure Canner'))).toBe(true);
    expect(resourceSources(catalog, 'Preserved food').producers).toContain(sysId('Solar Dehydrator'));
    expect(
      resourcePage(r.state, catalog, fresh).usedBy.some(
        (p) => p.systemId === sysId('Solar Dehydrator') && p.receivedWeek > 0,
      ),
    ).toBe(true);
    expect(r.ledger.resources[fresh]!.consumed).toBe(stepDay(s, catalog).ledger.resources[fresh]!.consumed);
    expect(flowRecord(catalog, r.state, [r.ledger]).food.producedKcal).toBe(0);
    expect(homegrownShare(r.state, catalog, 1)).toBe(homegrownShare(stepDay(s, catalog).state, catalog, 1));
    for (const resource of [fresh, 'Preserved food', 'Labor']) conserve(s, r.state, resource);
  });

  it('a canner spends only available cooking fuel and preserves its fresh reserve', () => {
    let s = processor('Pressure Canner');
    s = { ...s, stocks: { ...s.stocks, 'Cooking fuel': 1 } };
    const id = s.instances.find((i) => i.systemId === sysId('Pressure Canner'))!.id;
    const r = stepDay(setPreservation(catalog, s, id, fresh, 100), catalog);
    const batch = r.ledger.preserved![0]!;
    // Household cooking uses 5/7 h, canner upkeep 1/7 h; processing gets 1/7 h.
    expect(batch.inputKcal).toBeCloseTo((1 / 7 / 0.2) * 1000, 7);
    expect(batch.outputKcal).toBeCloseTo(batch.inputKcal * 0.9, 7);
    expect(r.state.stocks['Cooking fuel']).toBeCloseTo(0, 10);
    conserve(s, r.state, 'Cooking fuel');
    conserve(s, r.state, fresh);
  });

  it('lack of fuel, food, sunlight, or household labor blocks processing', () => {
    for (const missing of ['fuel', 'food', 'sunlight', 'labor']) {
      const name = missing === 'fuel' ? 'Pressure Canner' : 'Solar Dehydrator';
      let s = processor(name);
      const id = s.instances.find((i) => i.systemId === sysId(name))!.id;
      if (missing === 'food') s = { ...s, stocks: { ...s.stocks, [fresh]: 0 } };
      if (missing === 'labor') s = { ...s, instances: s.instances.filter((i) => !i.person) };
      const cat = missing === 'sunlight' ? { ...catalog } : catalog;
      if (missing === 'sunlight')
        s = { ...s, site: { ...s.site, assumptions: { ...s.site.assumptions, psh: 0 } } };
      // A zero-sun site's average weather must also have no daily sun hours.
      const r = stepDay(setPreservation(cat, s, id, fresh), cat);
      expect(r.ledger.preserved, missing).toBeUndefined();
      expect(r.ledger.resources['Preserved food']!.produced, missing).toBe(0);
    }
  });

  it('preserved calories feed people and lose less stock over winter than fresh meat', () => {
    const s = newGame(
      {},
      { settings: { foodPreservation: true, startingStocks: { Meat: 20, 'Preserved food': 18000 } } },
    );
    const after = stepDays(s, catalog, 120).state;
    expect(after.stocks['Preserved food']! / 18000).toBeGreaterThan(0.98);
    expect(after.stocks.Meat! / 20).toBeLessThan(0.04);
    const meal = newGame(
      { 'Human Being': 1 },
      {
        settings: {
          foodPreservation: true,
          startingStocks: { 'Preserved food': 2000, 'Drinking water': 20 },
        },
      },
    );
    const r = stepDay(meal, catalog);
    expect(r.ledger.needs.Food.delivered).toBe(2000);
    expect(r.ledger.resources['Preserved food']!.consumed).toBe(2000);
  });

  it('a powerless freezer cannot provide the preservation gate’s cold-storage benefit', () => {
    const s = newGame(
      { 'Human Being': 1, 'Efficient Chest Freezer': 1 },
      {
        settings: {
          foodPreservation: true,
          startingStocks: { ...base, Meat: 100 },
          wellbeingMult: 0,
        },
      },
    );
    const powerless = stepDay(s, catalog);
    const powered = stepDay({ ...s, stocks: { ...s.stocks, Electricity: 10 } }, catalog);
    expect(powered.ledger.resources.Meat!.spoiled).toBeLessThan(powerless.ledger.resources.Meat!.spoiled);
    expect(powerless.ledger.laborBySystem[freezer] ?? 0).toBe(0);
  });

  it('pausing the mechanic retains stock and rules while stopping new conversion; invalid policies are rejected', () => {
    const s = processor();
    const id = s.instances.find((i) => i.systemId === sysId('Solar Dehydrator'))!.id;
    const configured = setPreservation(catalog, s, id, fresh, 10);
    const paused = { ...configured, settings: { ...configured.settings, foodPreservation: false } };
    expect(stepDay(paused, catalog).ledger.preserved).toBeUndefined();
    expect(() => setPreservation(catalog, paused, id, fresh)).toThrow(/disabled/);
    expect(() => setPreservation(catalog, s, id, 'Food')).toThrow(/cannot preserve/);
    expect(() => setPreservation(catalog, s, id, fresh, Infinity)).toThrow(/finite/);
    expect(
      setPreservation(catalog, configured, id, null).instances.find((i) => i.id === id)!.preservation,
    ).toBeUndefined();
  });
});

describe('LL-31 livestock lifecycle', () => {
  it('a fed batch of twelve chicks matures into twelve laying hens without a cash gift or refund', () => {
    const s = animalGame({ 'Baby Chicks': 1 });
    const id = s.instances.find((i) => i.systemId === chick)!.id;
    const r = stepDays(s, noPredators, 55);
    const mature = r.state.instances.find((i) => i.id === id)!;
    expect(mature.systemId).toBe(hen);
    expect(mature.scale).toBe(12);
    const paused = { ...r.state, settings: { ...r.state.settings, livestockLifecycle: false } };
    const pausedResult = stepDay(paused, noPredators);
    expect(
      systemCard(pausedResult.state, noPredators, hen, mature.id).outputs.find(
        (o) => o.view.resource === 'Eggs',
      )!.produced.value,
    ).toBeCloseTo(54, 8);
    const singleLegacy = newGame({ 'Human Being': 1, Chicken: 1 }, { settings: { unlimitedSupply: true } });
    expect(stepDay(paused, noPredators).ledger.resources.Eggs!.produced).toBeCloseTo(
      stepDay(singleLegacy, noPredators).ledger.resources.Eggs!.produced * 12,
      8,
    );
    expect(
      resourcePage(r.state, noPredators, 'Eggs').inDesign.find((p) => p.systemId === hen)!.actualWeek,
    ).toBe(0);
    expect(goalStatus(r.state, noPredators, { kind: 'have', system: 'Chicken', count: 6 }, 0, []).done).toBe(
      true,
    );
    expect(r.events.filter((e) => e.kind === 'livestock' && e.event === 'matured')).toHaveLength(1);
    expect(r.state.cash).toBe(s.cash);
    const next = stepDay(r.state, noPredators);
    const one = animalGame({ Chicken: 1 });
    const sameDay = { ...one, calendar: r.state.calendar };
    expect(next.ledger.resources.Eggs!.produced).toBeCloseTo(
      stepDay(sameDay, noPredators).ledger.resources.Eggs!.produced * 12,
      8,
    );
    expect(livestockView(next.state, noPredators, id)!.count.value).toBe(12);
  });

  it('starved chicks age but do not mature, and disabling the mechanic freezes their lifecycle', () => {
    const s = animalGame({ 'Baby Chicks': 1 }, false);
    const after = stepDays(s, noPredators, 60).state;
    const inst = after.instances.find((i) => i.systemId === chick)!;
    expect(inst.animal!.ageDays).toBe(60);
    expect(inst.animal!.growthDays).toBe(0);
    const paused = stepDays(
      { ...after, settings: { ...after.settings, livestockLifecycle: false } },
      noPredators,
      20,
    ).state;
    expect(paused.instances.find((i) => i.id === inst.id)!.animal).toEqual(inst.animal);
  });

  it('short daylight and old age reduce egg output, and lifetime ends with a death event', () => {
    const s = animalGame({ Chicken: 1 });
    const summer = { ...s, calendar: { ...s.calendar, day: 172 } };
    expect(stepDay(summer, noPredators).ledger.resources.Eggs!.produced).toBeGreaterThan(
      stepDay(s, noPredators).ledger.resources.Eggs!.produced * 3,
    );
    expect(daylightHours(s.site.latitude, 172)).toBeGreaterThan(daylightHours(s.site.latitude, 0));
    const inst = s.instances.find((i) => i.systemId === hen)!;
    const rule = noPredators.livestockRules!.find((r) => r.systemId === hen)!;
    const old = {
      ...summer,
      instances: summer.instances.map((i) =>
        i.id === inst.id
          ? { ...i, animal: { ageDays: (rule.maxAgeDays + rule.primeDays) / 2, growthDays: rule.matureDays } }
          : i,
      ),
    };
    expect(stepDay(old, noPredators).ledger.resources.Eggs!.produced).toBeCloseTo(
      stepDay(summer, noPredators).ledger.resources.Eggs!.produced / 2,
      8,
    );
    const dying = {
      ...s,
      instances: s.instances.map((i) =>
        i.id === inst.id
          ? { ...i, animal: { ageDays: rule.maxAgeDays - 1, growthDays: rule.matureDays } }
          : i,
      ),
    };
    const end = stepDay(dying, noPredators);
    expect(end.state.instances.some((i) => i.id === inst.id)).toBe(false);
    expect(end.events).toContainEqual({
      kind: 'livestock',
      absDay: 0,
      instanceId: inst.id,
      event: 'died',
      amount: 1,
    });
  });

  it('meat comes from one completed culling event, with labor and no removal refund', () => {
    const s = animalGame({ 'Meat Rabbits (trio)': 1, Turkey: 1 });
    expect(stepDays(s, noPredators, 7).ledgers.reduce((a, l) => a + l.resources.Meat!.produced, 0)).toBe(0);
    const legacy = { ...s, settings: { ...s.settings, livestockLifecycle: false } };
    expect(stepDay(legacy, noPredators).ledger.resources.Meat!.produced).toBeGreaterThan(0);
    const id = s.instances.find((i) => i.systemId === rabbit)!.id;
    const r = stepDay(manageLivestock(noPredators, s, id, 'cull'), noPredators);
    expect(r.ledger.resources.Meat!.produced).toBe(12);
    expect(r.ledger.livestock!.find((e) => e.kind === 'culled')!.amount).toBe(12);
    expect(r.state.instances.some((i) => i.id === id)).toBe(false);
    expect(r.state.cash).toBe(s.cash);
    expect(r.ledger.laborBySystem[rabbit]).toBeGreaterThanOrEqual(2);
    conserve(s, r.state, 'Meat');
    conserve(s, r.state, 'Labor');
    expect(() => manageLivestock(noPredators, r.state, id, 'cull')).toThrow(/active/);
    const absent = { ...s, instances: s.instances.filter((i) => !i.person) };
    expect(
      stepDays(manageLivestock(noPredators, absent, id, 'cull'), noPredators, 3).state.instances.some(
        (i) => i.id === id,
      ),
    ).toBe(true);
  });

  it('breeding pays once, takes fed days and labor, and creates immature offspring in a valid place', () => {
    const s = animalGame({ 'Meat Rabbits (trio)': 1 });
    const id = s.instances.find((i) => i.systemId === rabbit)!.id;
    const booked = manageLivestock(noPredators, s, id, 'breed');
    expect(booked.cash).toBe(s.cash - 15);
    expect(() => manageLivestock(noPredators, booked, id, 'breed')).toThrow(/already/);
    const early = stepDays(booked, noPredators, 30);
    expect(early.state.instances.filter((i) => i.systemId === rabbit)).toHaveLength(1);
    const born = stepDay(early.state, noPredators);
    const cohorts = born.state.instances.filter((i) => i.systemId === rabbit);
    expect(cohorts).toHaveLength(2);
    const child = cohorts.find((i) => i.id !== id)!;
    expect(child.animal).toEqual({ ageDays: 0, growthDays: 0 });
    expect(child.paid).toBe(0);
    expect(canPlace(noPredators, born.state, child.systemId, child.x, child.y, [child.id]).ok).toBe(true);
    expect(born.events).toContainEqual({
      kind: 'livestock',
      absDay: 30,
      instanceId: child.id,
      event: 'born',
      amount: 3,
    });
    expect(born.state.cash).toBe(s.cash - 15);
    expect(born.state.instances.find((i) => i.id === id)!.animal!.breeding).toBeUndefined();
    expect(animalOutput(born.state, noPredators, child, 'Milk')).toBe(0);
  });

  it('no feed means no birth; no parcel room holds the birth without allocating duplicate IDs', () => {
    const s = animalGame({ 'Meat Rabbits (trio)': 1 }, false);
    const id = s.instances.find((i) => i.systemId === rabbit)!.id;
    const starved = stepDays(manageLivestock(noPredators, s, id, 'breed'), noPredators, 40).state;
    expect(starved.instances.filter((i) => i.systemId === rabbit)).toHaveLength(1);
    expect(starved.instances.find((i) => i.id === id)!.animal!.breeding!.progressDays).toBe(0);
    const tight = {
      ...animalGame({ 'Meat Rabbits (trio)': 1 }),
      settings: { ...s.settings, unlimitedSupply: true, parcelAcres: 0.001 },
    };
    const crowded = stepDays(manageLivestock(noPredators, tight, id, 'breed'), noPredators, 40).state;
    expect(crowded.instances.filter((i) => i.systemId === rabbit)).toHaveLength(1);
    expect(crowded.nextInstanceId).toBe(tight.nextInstanceId);
  });

  it('a seeded predator warns three days before loss, while working housing or a guardian prevents it', () => {
    const s = animalGame({ Chicken: 1 }, true, 3);
    const first = stepDay(s, catalog);
    const inst = first.state.instances.find((i) => i.systemId === hen)!;
    expect(first.events).toContainEqual({
      kind: 'livestock',
      absDay: 0,
      instanceId: inst.id,
      event: 'predator-warning',
      amount: 3,
    });
    const before = JSON.stringify(first.state);
    const lost = stepDays(first.state, catalog, 3);
    expect(JSON.stringify(first.state)).toBe(before);
    expect(lost.state.instances.some((i) => i.id === inst.id)).toBe(false);
    expect(lost.events.filter((e) => e.kind === 'livestock' && e.event === 'predator-loss')).toHaveLength(1);
    for (const protection of ['guardian', 'housing']) {
      const protectedGame = animalGame(
        protection === 'guardian'
          ? { Chicken: 1, 'Livestock Guardian Dog': 1 }
          : { 'Chicken Coop (12 hens)': 1 },
        true,
        3,
      );
      const r = stepDays(
        protection === 'guardian' ? nearbyGuardian(protectedGame) : protectedGame,
        catalog,
        4,
      );
      expect(r.events.some((e) => e.kind === 'livestock' && e.event === 'protected')).toBe(true);
      expect(r.events.some((e) => e.kind === 'livestock' && e.event === 'predator-loss')).toBe(false);
    }
  });

  it('an unfed guardian cannot protect the flock, and work cancellation does not refund a breeding fee', () => {
    const s = nearbyGuardian(animalGame({ Chicken: 1, 'Livestock Guardian Dog': 1 }, false, 3));
    const withoutFood = { ...s, stocks: { ...s.stocks, Food: 0 } };
    const r = stepDays(withoutFood, catalog, 4);
    expect(r.events.some((e) => e.kind === 'livestock' && e.event === 'predator-loss')).toBe(true);
    const rabbits = animalGame({ 'Meat Rabbits (trio)': 1 });
    const id = rabbits.instances.find((i) => i.systemId === rabbit)!.id;
    const booked = manageLivestock(noPredators, rabbits, id, 'breed');
    const cancelled = manageLivestock(noPredators, booked, id, 'cancel');
    expect(cancelled.cash).toBe(booked.cash);
    expect(cancelled.instances.find((i) => i.id === id)!.animal!.breeding).toBeUndefined();
    expect(() => manageLivestock(noPredators, { ...rabbits, cash: 0 }, id, 'breed')).toThrow(/Cash/);
  });
});

it('preservation rules, animal work, predator RNG and births replay and continue identically after JSON save', () => {
  const init = {
    siteId: 'front-range',
    seed: 3,
    settings: {
      livestockLifecycle: true,
      foodPreservation: true,
      unlimitedSupply: true,
      startingStocks: { ...base, [fresh]: 1000 },
    },
  };
  const systems = ['Human Being', 'Solar Dehydrator', 'Meat Rabbits (trio)', 'Chicken'];
  const actions = systems.map((name, index) => ({
    at: 0,
    kind: 'place' as const,
    systemId: sysId(name),
    mode: 'prebuilt' as const,
    x: 20 + index * 40,
    y: 30,
    id: `i${index + 1}`,
  }));
  const work = [
    { at: 0, kind: 'preserve' as const, id: 'i2', resource: fresh, keep: 100 },
    { at: 0, kind: 'livestock' as const, id: 'i3', operation: 'breed' as const },
  ];
  let state = startGame(catalog, init);
  for (const action of [...actions, ...work]) state = applyAction(catalog, state, action);
  state = stepDays(state, catalog, 10).state;
  expect(gameDigest(replay(catalog, init, [...actions, ...work], 10))).toBe(gameDigest(state));
  const loaded = JSON.parse(JSON.stringify(state)) as GameState;
  expect(gameDigest(stepDays(loaded, catalog, 60).state)).toBe(
    gameDigest(stepDays(state, catalog, 60).state),
  );
  const before = gameDigest(state);
  stepDay(state, catalog);
  expect(gameDigest(state)).toBe(before);
});

it('predator draws use a saved independent stream and do not shift next year’s weather', () => {
  const s = newGame(
    { 'Human Being': 1, Chicken: 1 },
    {
      seed: 3,
      settings: {
        livestockLifecycle: true,
        weatherMode: 'real',
        unlimitedSupply: true,
        startDay: 360,
      },
    },
  );
  const enabled = stepDays(s, catalog, 15).state;
  const legacy = stepDays(
    { ...s, settings: { ...s.settings, livestockLifecycle: false } },
    catalog,
    15,
  ).state;
  expect(enabled.weatherLog).toEqual(legacy.weatherLog);
  expect(enabled.rng).toBe(legacy.rng);
  expect(enabled.livestockRng).toBeDefined();
  expect(legacy.livestockRng).toBeUndefined();
});
