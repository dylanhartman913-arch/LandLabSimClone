import { describe, expect, it } from 'vitest';
import type { Catalog } from '@homestead/catalog';
import {
  animalOutput,
  applyAction,
  computeSpatial,
  gameDigest,
  husbandryView,
  replay,
  setHatch,
  startGame,
  stepDay,
  stepDays,
  type GameState,
} from '../src/index.ts';
import { catalog, newGame, sysId } from './time-helpers.ts';

const herd = catalog.livestockInfrastructure!;
const noPredators: Catalog = {
  ...catalog,
  livestockRules: catalog.livestockRules!.map((r) => ({ ...r, predatorRisk: 0 })),
};
const incubator = 'Egg Incubator (24 eggs)';
const nest = 'Broody Hen Nest Box';
const run = 'Predator-Proof Run (12 birds)';
const kit = 'Rotational Paddock Kit';
const pasture = 'Pasture (1 acre)';
const supplies = { Food: 1e6, 'Drinking water': 1000 };
const of = (s: GameState, name: string) => s.instances.find((i) => i.systemId === sysId(name))!;
const chicks = (s: GameState) => s.instances.filter((i) => i.systemId === herd.chickSystemId);

function flock(counts: Record<string, number>, settings: Partial<GameState['settings']> = {}, seed = 1) {
  return newGame(
    { 'Human Being': 1, Chicken: 1, 'Rooftop Solar Array (6 kW)': 1, ...counts },
    {
      seed,
      settings: {
        livestockLifecycle: true,
        unlimitedSupply: true,
        wellbeingMult: 0,
        startDay: 172,
        startingStocks: { ...supplies, Eggs: 30 },
        ...settings,
      },
    },
  );
}
/** Place `name` next to the hen cohort. */
function besideHen(s: GameState, name: string, dx = 8): GameState {
  const hen = of(s, 'Chicken');
  return { ...s, instances: s.instances.map((i) => (i.systemId === sysId(name) ? { ...i, x: hen.x + dx, y: hen.y } : i)) };
}

describe('LL-43 hatching', () => {
  it('an incubator sets a full clutch from stock, draws power for 21 days and hatches chicks', () => {
    const s = flock({ [incubator]: 1 });
    const id = of(s, incubator).id;
    const set = setHatch(noPredators, s, id, 'set');
    const first = stepDay(set, noPredators);
    expect(first.ledger.resources.Eggs!.processed).toBe(24);
    expect(first.ledger.hatching![0]).toMatchObject({ eggsSet: 24, counted: true, kWh: 0.5 });
    expect(first.events).toContainEqual({ kind: 'livestock', absDay: first.ledger.absDay, instanceId: id, event: 'eggs-set', amount: 24 });
    const r = stepDays(first.state, noPredators, 20);
    expect(r.ledgers.reduce((n, l) => n + (l.hatching?.[0]?.kWh ?? 0), 0)).toBeCloseTo(10, 9);
    const born = chicks(r.state);
    expect(born).toHaveLength(1);
    expect(born[0]!.scale).toBeCloseTo(16 / 12, 12); // floor(24 × 70%)
    expect(born[0]!.animal).toEqual({ ageDays: 0, growthDays: 0 });
    expect(of(r.state, incubator).hatch).toBeUndefined();
    expect(r.events.some((e) => e.kind === 'livestock' && e.event === 'born' && e.amount === 16)).toBe(true);
  });

  it('waits for a full clutch and needs a mature flock and the lifecycle mechanic', () => {
    const s = flock({ [incubator]: 1 }, { startingStocks: { ...supplies, Eggs: 10 } });
    const id = of(s, incubator).id;
    const waiting = stepDay(setHatch(noPredators, s, id, 'set'), noPredators);
    expect(waiting.ledger.resources.Eggs!.processed ?? 0).toBe(0);
    expect(of(waiting.state, incubator).hatch).toEqual({ eggs: 0, days: 0, missed: 0 });
    expect(husbandryView(waiting.state, noPredators, id)!.status).toContain('Waiting for 24 eggs');
    const noFlock = newGame({ 'Human Being': 1, [incubator]: 1 }, { settings: { livestockLifecycle: true } });
    expect(() => setHatch(catalog, noFlock, of(noFlock, incubator).id, 'set')).toThrow(/mature laying flock/);
    const off = { ...s, settings: { ...s.settings, livestockLifecycle: false } };
    expect(() => setHatch(catalog, off, id, 'set')).toThrow(/Livestock lifecycle/);
  });

  it('an unpowered incubator misses days and loses the clutch after the tolerance', () => {
    const s = flock({ [incubator]: 1 });
    const dark: GameState = {
      ...s,
      instances: s.instances.filter((i) => i.systemId !== sysId('Rooftop Solar Array (6 kW)')),
      settings: { ...s.settings, unlimitedSupply: false },
    };
    const id = of(dark, incubator).id;
    const r = stepDays(setHatch(noPredators, dark, id, 'set'), noPredators, 3);
    expect(r.ledgers.map((l) => l.hatching![0]!.counted)).toEqual([false, false, false]);
    expect(r.events.filter((e) => e.kind === 'livestock' && e.event === 'hatch-failed')).toHaveLength(1);
    expect(of(r.state, incubator).hatch).toBeUndefined();
    expect(chicks(r.state)).toHaveLength(0);
  });

  it('a broody hen stops laying while she sits, needs long days, and hatches a smaller clutch', () => {
    const s = besideHen(flock({ [nest]: 1 }, {}), nest);
    const id = of(s, nest).id;
    const henId = of(s, 'Chicken').id;
    const set = setHatch(noPredators, s, id, 'set');
    expect(set.instances.find((i) => i.id === id)!.hatch!.henId).toBe(henId);
    const day = stepDay(set, noPredators);
    expect(day.ledger.resources.Eggs!.processed).toBe(8);
    expect(animalOutput(day.state, noPredators, of(day.state, 'Chicken'), 'Eggs')).toBe(0); // one hen, sitting
    const r = stepDays(day.state, noPredators, 20);
    expect(chicks(r.state)[0]!.scale).toBeCloseTo(6 / 12, 12); // floor(8 × 85%)
    expect(animalOutput(r.state, noPredators, of(r.state, 'Chicken'), 'Eggs')).toBeGreaterThan(0);
    const winter = besideHen(flock({ [nest]: 1 }, { startDay: 355 }), nest);
    expect(() => setHatch(noPredators, winter, of(winter, nest).id, 'set')).toThrow(/13 h of daylight/);
    const far = besideHen(flock({ [nest]: 1 }), nest, 60);
    expect(() => setHatch(noPredators, far, of(far, nest).id, 'set')).toThrow(/within 30 ft/);
  });

  it('culling the sitting hen ends her clutch', () => {
    const s = besideHen(flock({ [nest]: 1 }), nest);
    const set = stepDay(setHatch(noPredators, s, of(s, nest).id, 'set'), noPredators).state;
    const cull = applyAction(noPredators, set, { at: set.calendar.absDay, kind: 'livestock', id: of(set, 'Chicken').id, operation: 'cull' });
    const r = stepDays(cull, noPredators, 2);
    expect(r.events.some((e) => e.kind === 'livestock' && e.event === 'hatch-failed' && e.amount === 8)).toBe(true);
    expect(of(r.state, nest).hatch).toBeUndefined();
  });
});

describe('LL-43 predator-proof run', () => {
  it('a staffed nearby run prevents the seeded predator loss; a distant one does not', () => {
    // Seed 3 warns on day 0 (LL-31 fixture); the loss lands three days later.
    const base = flock({ [run]: 1 }, { startDay: 0 }, 3);
    const near = besideHen(base, run, 10);
    const r = stepDays(near, catalog, 4);
    expect(r.events.some((e) => e.kind === 'livestock' && e.event === 'protected')).toBe(true);
    expect(r.events.some((e) => e.kind === 'livestock' && e.event === 'predator-loss')).toBe(false);
    expect(husbandryView(r.state, catalog, of(r.state, run).id)!.protectedBirds!.value).toBe(1);
    const far = besideHen(base, run, 80);
    expect(stepDays(far, catalog, 4).events.some((e) => e.kind === 'livestock' && e.event === 'predator-loss')).toBe(true);
  });

  it('covers whole cohorts only up to its bird capacity', () => {
    const s = besideHen(flock({ [run]: 1 }, { startDay: 0 }, 3), run, 10);
    const big = { ...s, instances: s.instances.map((i) => (i.systemId === sysId('Chicken') ? { ...i, scale: 13 } : i)) };
    const r = stepDays(big, catalog, 4);
    expect(r.events.some((e) => e.kind === 'livestock' && e.event === 'predator-loss')).toBe(true);
  });
});

describe('LL-43 rotational paddocks', () => {
  function grazing(withKit: boolean, labor = true) {
    let s = newGame(
      { ...(labor ? { 'Human Being': 1 } : {}), [pasture]: 1, ...(withKit ? { [kit]: 1 } : {}) },
      { settings: { parcelAcres: 2, startDay: 172, wellbeingMult: 0, startingStocks: supplies } },
    );
    const field = of(s, pasture);
    if (withKit) s = { ...s, instances: s.instances.map((i) => (i.systemId === sysId(kit) ? { ...i, x: field.x, y: field.y } : i)) };
    return s;
  }
  it('a moved kit on the pasture raises its hay and greens by up to 15%', () => {
    const plain = stepDays(grazing(false), catalog, 3).ledgers.at(-1)!.resources;
    const rotated = stepDays(grazing(true), catalog, 3);
    const l = rotated.ledgers.at(-1)!.resources;
    expect(l.Hay!.produced).toBeCloseTo(plain.Hay!.produced * 1.15, 9);
    expect(l['Green biomass']!.produced).toBeCloseTo(plain['Green biomass']!.produced * 1.15, 9);
    expect(husbandryView(rotated.state, catalog, of(rotated.state, kit).id)!.paddock!.value).toBeCloseTo(1.15, 12);
    expect(computeSpatial(catalog, rotated.state).get(of(rotated.state, pasture).id)!.notes.join(' ')).toContain('Rotational paddocks');
  });
  it('gives nothing off the pasture or without its moving labor', () => {
    const plain = stepDays(grazing(false), catalog, 3).ledgers.at(-1)!.resources.Hay!.produced;
    const moved = grazing(true);
    const off = { ...moved, instances: moved.instances.map((i) => (i.systemId === sysId(kit) ? { ...i, x: 2, y: 2 } : i)) };
    expect(stepDays(off, catalog, 3).ledgers.at(-1)!.resources.Hay!.produced).toBeCloseTo(plain, 9);
    const idle = grazing(true, false);
    const idlePlain = stepDays(grazing(false, false), catalog, 3).ledgers.at(-1)!.resources.Hay!.produced;
    expect(stepDays(idle, catalog, 3).ledgers.at(-1)!.resources.Hay!.produced).toBeCloseTo(idlePlain, 9);
  });
});

it('hatching orders replay and continue identically after a JSON save', () => {
  const init = {
    siteId: 'front-range',
    seed: 1,
    settings: { livestockLifecycle: true, unlimitedSupply: true, wellbeingMult: 0, startDay: 172, startingStocks: { ...supplies, Eggs: 40 } },
  };
  const names = ['Human Being', 'Chicken', 'Rooftop Solar Array (6 kW)', incubator];
  const actions = [
    ...names.map((name, index) => ({ at: 0, kind: 'place' as const, systemId: sysId(name), mode: 'prebuilt' as const, x: 20 + index * 30, y: 30, id: `i${index + 1}` })),
    { at: 0, kind: 'hatch' as const, id: 'i4', operation: 'set' as const },
  ];
  let state = startGame(catalog, init);
  for (const a of actions) state = applyAction(catalog, state, a);
  const before = JSON.stringify(state);
  state = stepDays(state, catalog, 10).state;
  expect(gameDigest(replay(catalog, init, actions, 10))).toBe(gameDigest(state));
  const loaded = JSON.parse(JSON.stringify(state)) as GameState;
  expect(gameDigest(stepDays(loaded, catalog, 30).state)).toBe(gameDigest(stepDays(state, catalog, 30).state));
  expect(JSON.parse(before).instances.some((i: { hatch?: unknown }) => i.hatch)).toBe(true);
});
