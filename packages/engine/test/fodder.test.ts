import { describe, expect, it } from 'vitest';
import {
  applyAction,
  canPlace,
  computeSpatial,
  flowRecord,
  fodderPlan,
  fodderView,
  gameDigest,
  resourcePage,
  resourceSources,
  roomFor,
  statePools,
  stepDay,
  stepDays,
  systemCard,
  toolCapacity,
  type GameState,
} from '../src/index.ts';
import { catalog, newGame, sysId } from './time-helpers.ts';

const meadow = 'Hay Meadow (1/10 acre)';
const mix = 'Poultry Feed Mix';
const barn = 'Hay Barn';
const supplies = { Food: 100000, 'Drinking water': 50 };
const ingredients = { Grain: 14, 'Green biomass': 4, Grubs: 2 };
const instance = (s: GameState, name: string) => s.instances.find((i) => i.systemId === sysId(name))!;
function conserve(before: GameState, after: GameState, name: string) {
  const l = after.ledgers.at(-1)!.resources[name]!;
  expect(
    (before.stocks[name] ?? 0) +
      (before.direct[name] ?? 0) +
      l.produced +
      l.purchased +
      l.supplied -
      l.consumed -
      (l.processed ?? 0) -
      (l.sold ?? 0) -
      l.spilled -
      l.spoiled,
  ).toBeCloseTo((after.stocks[name] ?? 0) + (after.direct[name] ?? 0), 8);
}
function meadowGame(scythe = false, startDay = 172) {
  return newGame(
    { 'Human Being': 1, [meadow]: 1, ...(scythe ? { Scythe: 1 } : {}) },
    {
      settings: {
        toolGathering: true,
        wellbeingMult: 0,
        startDay,
        startingStocks: supplies,
      },
    },
  );
}
function mixingGame() {
  return newGame(
    { 'Human Being': 1, [mix]: 1, 'Root Cellar': 1 },
    {
      settings: {
        wellbeingMult: 0,
        startingStocks: { ...supplies, ...ingredients },
      },
    },
  );
}

describe('LL-42 dryland hay', () => {
  it('uses real parcel area, grows only in season and keeps winter upkeep', () => {
    const summer = meadowGame();
    const winter = meadowGame(false, 0);
    expect(catalog.systems.find((s) => s.id === sysId(meadow))!.footprintSqft).toBe(4356);
    expect(
      canPlace(
        catalog,
        { ...summer, settings: { ...summer.settings, parcelAcres: 0.05 } },
        sysId(meadow),
        20,
        20,
      ).ok,
    ).toBe(false);
    expect(stepDay(summer, catalog).ledger.resources.Hay!.produced).toBeGreaterThan(0);
    const r = stepDay(winter, catalog);
    expect(r.ledger.resources.Hay!.produced).toBe(0);
    expect(r.ledger.laborBySystem[sysId(meadow)]).toBeCloseTo(0.1 / 7, 10);
    conserve(summer, stepDay(summer, catalog).state, 'Hay');
  });
  it('a scythe saves cutting labor without increasing the fully staffed meadow yield', () => {
    const hand = stepDay(meadowGame(), catalog);
    const toolStart = meadowGame(true);
    const tool = stepDay(toolStart, catalog);
    expect(tool.ledger.resources.Hay!.produced).toBeCloseTo(hand.ledger.resources.Hay!.produced, 10);
    expect(tool.ledger.laborBySystem[sysId(meadow)]).toBeLessThan(hand.ledger.laborBySystem[sysId(meadow)]!);
    expect(tool.ledger.fodder![0]!.savedHours).toBeGreaterThan(0);
    expect(tool.ledger.fodder![0]!.scytheIds).toContain(instance(toolStart, 'Scythe').id);
    const view = fodderView(tool.state, catalog, instance(tool.state, meadow).id)!;
    expect(view.saved!.value).toBeCloseTo(tool.ledger.fodder![0]!.savedHours, 10);
    const card = systemCard(tool.state, catalog, sysId(meadow), instance(tool.state, meadow).id);
    expect(card.outputs.find((o) => o.view.resource === 'Hay')!.produced.value).toBeCloseTo(
      tool.ledger.resources.Hay!.produced * 7,
      9,
    );
    const withoutWaterRules = { ...catalog, waterInfrastructure: undefined };
    expect(systemCard(tool.state, withoutWaterRules, sysId(meadow), instance(tool.state, meadow).id)
      .outputs.find((o) => o.view.resource === 'Hay')!.produced.value).toBeCloseTo(tool.ledger.resources.Hay!.produced * 7, 9);
    conserve(toolStart, tool.state, 'Labor');
  });
  it('a disabled, absent or broken scythe gives no cutting benefit', () => {
    const s = meadowGame(true);
    const variants = [
      { ...s, settings: { ...s.settings, toolGathering: false } },
      { ...s, instances: s.instances.filter((i) => i.systemId !== sysId('Scythe')) },
      {
        ...s,
        settings: { ...s.settings, wearAndRepair: true },
        instances: s.instances.map((i) => (i.systemId === sysId('Scythe') ? { ...i, condition: 0 } : i)),
      },
    ];
    for (const variant of variants) {
      const r = stepDay(variant, catalog);
      expect(r.ledger.fodder![0]!.savedHours).toBe(0);
      expect(r.ledger.fodder![0]!.toolHours).toBe(0);
    }
  });
  it('rainfall and drought reduce hay, while missing rain or labor stops it', () => {
    const s = meadowGame();
    const baseline = stepDay(s, catalog).ledger.resources.Hay!.produced;
    const dry = { ...s, site: { ...s.site, assumptions: { ...s.site.assumptions, precipIn: 7.5 } } };
    expect(stepDay(dry, catalog).ledger.resources.Hay!.produced).toBeCloseTo(baseline / 2, 9);
    const drought = {
      ...s,
      settings: { ...s.settings, weatherMode: 'real' as const },
      yearWeather: {
        year: s.calendar.year,
        precipMult: 0.1,
        hddMult: 1,
        cddMult: 1,
        lateFrostDays: 0,
        heatWaves: [],
        hailDay: null,
      },
    };
    expect(stepDay(drought, catalog).ledger.resources.Hay!.produced).toBeCloseTo(baseline * 0.2, 9);
    for (const stopped of [
      { ...s, instances: s.instances.filter((i) => !i.person) },
      { ...s, site: { ...s.site, ambient: { ...s.site.ambient, Rainfall: false } } },
      { ...s, site: { ...s.site, assumptions: { ...s.site.assumptions, precipIn: 0 } } },
    ])
      expect(stepDay(stopped, catalog).ledger.resources.Hay!.produced).toBe(0);
  });
  it('reserves no more than eight scythe hours and leaves only the remainder for gathering', () => {
    const s = meadowGame(true);
    const plan = fodderPlan(catalog, s, s.instances)[0]!;
    expect(toolCapacity(catalog, s, s.instances, 'gather-food', 'Green biomass')!.hours).toBeCloseTo(
      8 - plan.toolHours,
      10,
    );
    const large = {
      ...s,
      instances: s.instances.map((i) => (i.systemId === sysId(meadow) ? { ...i, scale: 1000 } : i)),
    };
    const largePlan = fodderPlan(catalog, large, large.instances)[0]!;
    expect(largePlan.toolHours).toBe(8);
    expect(largePlan.cuttingHours).toBeGreaterThan(8);
    expect(toolCapacity(catalog, large, large.instances, 'gather-food', 'Green biomass')!.hours).toBe(0);
    expect(fodderPlan(catalog, meadowGame(true, 0), meadowGame(true, 0).instances)[0]!.toolHours).toBe(0);
  });
});

describe('LL-42 feed mixing', () => {
  it('idle labor can gather again without resetting the scythe hours reserved for cutting', () => {
    const base = newGame(
      { 'Human Being': 4, [meadow]: 1, Scythe: 1, [mix]: 1 },
      {
        settings: {
          toolGathering: true,
          reuseIdleLabor: true,
          wellbeingMult: 0,
          startDay: 172,
          startingStocks: supplies,
        },
      },
    );
    const s = {
      ...base,
      instances: base.instances.map((i) => ({
        ...i,
        scale: i.systemId === sysId(meadow) ? 50 : i.systemId === sysId(mix) ? 200 : i.scale,
      })),
      site: {
        ...base.site,
        nodes: base.site.nodes.map((n) =>
          n.resource === 'Green biomass' ? { ...n, x: 0.5, y: 0.5, stock: 10000, maxStock: 10000 } : n,
        ),
      },
    };
    const remaining = 8 - fodderPlan(catalog, s, s.instances)[0]!.toolHours;
    const r = stepDay(s, catalog);
    const cuts = r.ledger.gathered!.filter((g) => g.resource === 'Green biomass');
    expect(cuts.length).toBeGreaterThan(1);
    expect(cuts.reduce((n, g) => n + (g.toolHours ?? 0), 0)).toBeCloseTo(remaining, 9);
    expect(
      cuts.reduce((n, g) => n + (g.toolHours ?? 0), 0) + r.ledger.fodder![0]!.toolHours,
    ).toBeLessThanOrEqual(8);
  });
  it('makes a lossy feed batch from actual ingredients, separate from household meals', () => {
    const s = mixingGame();
    const r = stepDay(s, catalog);
    expect(r.ledger.resources['Chicken feed']!.produced).toBeCloseTo(9 / 7, 10);
    expect(r.ledger.resources.Grain!.processed).toBeCloseTo(1, 10);
    expect(r.ledger.resources['Green biomass']!.processed).toBeCloseTo(2 / 7, 10);
    expect(r.ledger.resources.Grubs!.processed).toBeCloseTo(1 / 7, 10);
    const used = ['Grain', 'Green biomass', 'Grubs'].reduce(
      (n, resource) => n + (r.ledger.resources[resource]!.processed ?? 0),
      0,
    );
    expect(used - r.ledger.resources['Chicken feed']!.produced).toBeCloseTo(1 / 7, 10);
    expect(r.ledger.needs.Food.needed).toBe(2000);
    expect(flowRecord(catalog, r.state, [r.ledger]).food.producedKcal).toBe(0);
    for (const resource of ['Grain', 'Green biomass', 'Grubs', 'Chicken feed', 'Labor'])
      conserve(s, r.state, resource);
    expect(resourceSources(catalog, 'Chicken feed').producers).toContain(sysId(mix));
    expect(
      resourcePage(r.state, catalog, 'Chicken feed').inDesign.find((p) => p.systemId === sysId(mix))!
        .actualWeek,
    ).toBeCloseTo(9, 9);
  });
  it('each missing ingredient or missing labor blocks mixing without consuming the other ingredients', () => {
    const s = mixingGame();
    for (const resource of ['Grain', 'Green biomass', 'Grubs']) {
      const r = stepDay({ ...s, stocks: { ...s.stocks, [resource]: 0 } }, catalog);
      expect(r.ledger.resources['Chicken feed']!.produced, resource).toBe(0);
      for (const other of ['Grain', 'Green biomass', 'Grubs'])
        expect(r.ledger.resources[other]!.processed ?? 0, other).toBe(0);
    }
    const noLabor = { ...s, instances: s.instances.filter((i) => !i.person) };
    expect(stepDay(noLabor, catalog).ledger.resources['Chicken feed']!.produced).toBe(0);
  });
  it('partial ingredients scale every draw and output together', () => {
    const s = mixingGame();
    const r = stepDay({ ...s, stocks: { ...s.stocks, Grubs: 1 / 14 } }, catalog);
    expect(r.ledger.resources['Chicken feed']!.produced).toBeCloseTo(9 / 14, 10);
    expect(r.ledger.resources.Grain!.processed).toBeCloseTo(0.5, 10);
    expect(r.ledger.resources['Green biomass']!.processed).toBeCloseTo(1 / 7, 10);
    expect(r.ledger.resources.Grubs!.processed).toBeCloseTo(1 / 14, 10);
  });
  it('fresh feed supplies birds on the following day and is capped by storage', () => {
    const s = newGame(
      { 'Human Being': 1, [mix]: 1, Chicken: 1, 'Root Cellar': 1 },
      {
        settings: {
          storagePools: true,
          wellbeingMult: 0,
          startingStocks: { ...supplies, ...ingredients, Water: 100 },
        },
      },
    );
    const r = stepDays(s, catalog, 2);
    expect(r.ledgers[0]!.resources['Chicken feed']!.consumed).toBe(0);
    expect(r.ledgers[1]!.resources['Chicken feed']!.consumed).toBeGreaterThan(0);
    const full = stepDay({ ...s, stocks: { ...s.stocks, 'Chicken feed': 400 } }, catalog);
    expect(full.ledger.resources['Chicken feed']!.spilled).toBeGreaterThan(0);
  });
});

describe('LL-42 hay barn storage', () => {
  it('adds dedicated shared feed volume, with both resource densities and no tool capacity', () => {
    const s = newGame(
      { [barn]: 1 },
      { settings: { storagePools: true, startingStocks: { Hay: 1900, 'Chicken feed': 400 } } },
    );
    const pool = statePools(s, catalog).find((p) => p.name === 'Feed storage')!;
    expect(pool.cap).toBe(210);
    expect(roomFor([pool], { Hay: 1900 }, 'Chicken feed')).toBeCloseTo(400, 9);
    const r = stepDay(s, catalog);
    expect(r.ledger.resources.Hay!.spilled).toBe(0);
    expect(r.ledger.resources['Chicken feed']!.spilled).toBe(0);
    expect(resourcePage(r.state, catalog, 'Feed storage').inDesign.find((p) => p.systemId === sysId(barn))!.actualWeek).toBe(200);
    expect(systemCard(r.state, catalog, sysId(barn), instance(r.state, barn).id).outputs.find((o) => o.view.resource === 'Feed storage')!.produced.value).toBe(200);
    const without = stepDay({ ...s, instances: [] }, catalog);
    expect(without.ledger.resources.Hay!.spilled).toBeGreaterThan(0);
    expect(
      catalog.flows.some(
        (f) => f.systemId === sysId(barn) && f.direction === 'out' && f.resource === 'Storage space',
      ),
    ).toBe(false);
    conserve(s, r.state, 'Hay');
    conserve(s, r.state, 'Chicken feed');
  });
  it('market delivery honors barn room and removal or failed condition removes that room', () => {
    let s = newGame(
      { [barn]: 1 },
      { settings: { storagePools: true, startingStocks: {}, startingCash: 10000 } },
    );
    s = applyAction(catalog, s, { kind: 'buy', resource: 'Hay', amount: 3000, at: 0 });
    const r = stepDay(s, catalog);
    expect(r.ledger.resources.Hay!.purchased).toBeCloseTo(210 * 9.5, 9);
    const broken = {
      ...s,
      settings: { ...s.settings, wearAndRepair: true },
      instances: s.instances.map((i) => ({ ...i, condition: 0 })),
    };
    expect(statePools(broken, catalog).find((p) => p.name === 'Feed storage')!.cap).toBe(10);
    expect(systemCard(broken, catalog, sysId(barn), instance(broken, barn).id).outputs.find((o) => o.view.resource === 'Feed storage')!.produced.value).toBe(0);
    expect(stepDay(broken, catalog).ledger.resources.Hay!.purchased).toBeCloseTo(10 * 9.5, 9);
    const oldPools = { ...s, settings: { ...s.settings, storagePools: false } };
    expect(statePools(oldPools, catalog).some((p) => p.name === 'Feed storage')).toBe(false);
  });
  it('saves and JSON continuation reproduce mixed feed, meadow cutting and stored hay', () => {
    const s = newGame(
      { 'Human Being': 1, [meadow]: 1, Scythe: 1, [mix]: 1, [barn]: 1, 'Root Cellar': 1 },
      {
        settings: {
          toolGathering: true,
          storagePools: true,
          startDay: 172,
          wellbeingMult: 0,
          startingStocks: { ...supplies, ...ingredients },
        },
      },
    );
    const before = JSON.stringify(s);
    const advanced = stepDays(s, catalog, 7).state;
    expect(JSON.stringify(s)).toBe(before);
    const a = stepDays(advanced, catalog, 21).state;
    const b = stepDays(JSON.parse(JSON.stringify(advanced)), catalog, 21).state;
    expect(gameDigest(a)).toBe(gameDigest(b));
    expect(a.ledgers).toEqual(b.ledgers);
    expect(computeSpatial(catalog, a).get(instance(a, meadow).id)!.notes.join(' ')).toContain(
      'Scythes reduce cutting labor',
    );
  });
});
