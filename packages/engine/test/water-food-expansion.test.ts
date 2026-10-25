import { describe, expect, it } from 'vitest';
import {
  computeSpatial,
  flowRecord,
  gameDigest,
  nodePosition,
  setPreservation,
  statePools,
  stepDay,
  stepDays,
  systemCard,
  waterInfrastructureView,
  winterView,
  type GameState,
} from '../src/index.ts';
import { catalog, newGame, sysId } from './time-helpers.ts';

const produce = 'Vegetables fruit fiber herbs';
const food = { Food: 100000, 'Drinking water': 50 };
const idOf = (s: GameState, name: string) => s.instances.find((i) => i.systemId === sysId(name))!.id;
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
      l.spilled -
      l.spoiled -
      (l.frozen ?? 0),
  ).toBeCloseTo((after.stocks[name] ?? 0) + (after.direct[name] ?? 0), 8);
}

describe('LL-40 water infrastructure', () => {
  const box = 'Spring Box with Gravity Line';
  function springGame(count = 1) {
    const s = newGame(
      { 'Human Being': 1, [box]: count },
      { settings: { wellbeingMult: 0, startingStocks: food } },
    );
    const node = s.site.nodes.find((n) => n.type === 'spring')!;
    const pos = nodePosition(s, node);
    return { ...s, instances: s.instances.map((i) => (i.systemId === sysId(box) ? { ...i, ...pos } : i)) };
  }
  it('pipes raw water only near an in-season spring and shares the node flow across boxes', () => {
    const s = springGame(2);
    expect(stepDay(s, catalog).ledger.resources.Water!.produced).toBe(25);
    const remote = { ...s, instances: s.instances.map((i) => ({ ...i, x: 0, y: 0 })) };
    expect(stepDay(remote, catalog).ledger.resources.Water!.produced).toBe(0);
    const dry = { ...s, site: { ...s.site, nodes: s.site.nodes.filter((n) => n.type !== 'spring') } };
    expect(stepDay(dry, catalog).ledger.resources.Water!.produced).toBe(0);
    expect(waterInfrastructureView(dry, catalog, idOf(dry, box))!.text).toContain('no in-season spring');
  });
  it('depletes finite spring stock, respects drought, and needs upkeep labor', () => {
    const s = springGame();
    const node = s.site.nodes.find((n) => n.type === 'spring')!;
    const limited = { ...s, nodeStock: { [node.id]: 3 } };
    const r = stepDay(limited, catalog);
    expect(r.ledger.resources.Water!.produced).toBe(3);
    expect(r.state.nodeStock![node.id]).toBe(0);
    expect(
      stepDay({ ...s, instances: s.instances.filter((i) => !i.person) }, catalog).ledger.resources.Water!
        .produced,
    ).toBe(0);
    const offSeason = { ...s, site: { ...s.site, nodes: s.site.nodes.map((n) => ({ ...n, months: [] })) } };
    expect(stepDay(offSeason, catalog).ledger.resources.Water!.produced).toBe(0);
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
    expect(stepDay(drought, catalog).ledger.resources.Water!.produced).toBe(5);
    conserve(s, stepDay(s, catalog).state, 'Water');
  });
  it('expands potable storage without expanding the raw pool or treating water', () => {
    const s = newGame(
      { 'Potable Water Tank (100 gal)': 1 },
      {
        settings: {
          storagePools: true,
          startingStocks: { Water: 500, 'Drinking water': 100 },
        },
      },
    );
    const pools = statePools(s, catalog);
    expect(pools.find((p) => p.name === 'Drinking water storage')!.cap).toBe(150);
    expect(pools.find((p) => p.name === 'Raw water storage')!.cap).toBe(50);
    const r = stepDay(s, catalog);
    expect(r.state.stocks['Drinking water']).toBe(100);
    expect(r.state.stocks.Water).toBe(50);
    expect(r.ledger.resources['Drinking water']!.produced).toBe(0);
    conserve(s, r.state, 'Water');
    conserve(s, r.state, 'Drinking water');
  });
  it('built-in heat trace spends real electricity and loses protection without power', () => {
    const name = 'Heat-Traced Water Tank (100 gal)';
    const s = newGame(
      { 'Human Being': 1, [name]: 1, 'Small Wind Turbine (1.5 kW)': 1, 'LiFePO4 Battery Bank (10 kWh)': 1 },
      {
        site: 'laramie-wy',
        settings: {
          storagePools: true,
          wellbeingMult: 0,
          startingStocks: { ...food, Water: 80, Electricity: 10000 },
        },
      },
    );
    const hot = stepDays(s, catalog, 15).state;
    const cold = stepDays(
      {
        ...s,
        stocks: { ...s.stocks, Electricity: 0 },
        instances: s.instances.filter((i) => i.systemId !== sysId('Small Wind Turbine (1.5 kW)')),
      },
      catalog,
      15,
    ).state;
    expect(hot.instances.find((i) => i.systemId === sysId(name))!.winter?.frozen).toBeUndefined();
    expect(cold.instances.find((i) => i.systemId === sysId(name))!.winter?.frozen).toBeGreaterThan(0);
    expect(hot.ledgers.reduce((n, l) => n + (l.winter?.[0]?.heaterKWh ?? 0), 0)).toBeGreaterThan(0);
    expect(winterView(hot, catalog, idOf(hot, name))!.options).toEqual([]);
    conserve(s, stepDay(s, catalog).state, 'Electricity');
  });
  it('a measured first flush discards rainwater and reduces filter labor, never creating potable water', () => {
    const s = newGame(
      { 'Human Being': 1, 'Rain Barrel (55 gal)': 1, 'First-Flush Diverter': 1, 'Drinking Water Filter': 1 },
      {
        settings: { storagePools: true, wellbeingMult: 0, startingStocks: { ...food, Water: 40 } },
      },
    );
    const ready = stepDay(s, catalog).state;
    const r = stepDay(ready, catalog);
    const without = stepDay(
      { ...ready, instances: ready.instances.filter((i) => i.systemId !== sysId('First-Flush Diverter')) },
      catalog,
    );
    expect(r.ledger.resources.Water!.produced).toBeCloseTo(
      without.ledger.resources.Water!.produced * 0.95,
      9,
    );
    const filter = idOf(ready, 'Drinking Water Filter');
    expect(
      systemCard(ready, catalog, sysId('Drinking Water Filter'), filter).inputs.find(
        (i) => i.view.resource === 'Labor',
      )!.needed.value,
    ).toBeCloseTo(
      systemCard(without.state, catalog, sysId('Drinking Water Filter'), filter).inputs.find(
        (i) => i.view.resource === 'Labor',
      )!.needed.value * 0.75,
      9,
    );
    const noLabor = { ...s, instances: s.instances.filter((i) => !i.person) };
    const idle = stepDays(noLabor, catalog, 2).state;
    const barrel = idOf(idle, 'Rain Barrel (55 gal)');
    expect(computeSpatial(catalog, idle).get(barrel)!.outMult.Water).toBeUndefined();
  });
  it('test warnings require the risk gate, labor and paid reagents, and survive JSON continuation', () => {
    const s = newGame(
      { 'Human Being': 1, 'Water Test Kit': 1 },
      { settings: { riskEvents: true, wellbeingMult: 0, startingStocks: food } },
    );
    const r = stepDay(s, catalog);
    expect(r.ledger.waterTests![0]!.warning).toContain('Filter or boil');
    expect(r.ledger.spend.running![sysId('Water Test Kit')]).toBeCloseTo(1 / 7, 9);
    expect(
      stepDay({ ...s, settings: { ...s.settings, riskEvents: false } }, catalog).ledger.waterTests,
    ).toBeUndefined();
    expect(
      stepDay({ ...s, cash: 0, settings: { ...s.settings, cashFloor: true } }, catalog).ledger.waterTests,
    ).toBeUndefined();
    const broken = {
      ...s,
      settings: { ...s.settings, wearAndRepair: true },
      instances: s.instances.map((i) =>
        i.systemId === sysId('Water Test Kit') ? { ...i, condition: 0 } : i,
      ),
    };
    expect(stepDay(broken, catalog).ledger.waterTests).toBeUndefined();
    expect(gameDigest(stepDay(JSON.parse(JSON.stringify(r.state)), catalog).state)).toBe(
      gameDigest(stepDay(r.state, catalog).state),
    );
  });
});

describe('LL-41 food processing', () => {
  for (const [name, input, energy] of [
    ['Water-Bath Canner', produce, 'Cooking fuel'],
    ['Electric Dehydrator', 'Meat', 'Electricity'],
    ['Smokehouse', 'Fish', 'Woody biomass'],
  ])
    it(`${name} spends real food, energy and labor and stops when energy is unavailable`, () => {
      const s = newGame(
        { 'Human Being': 1, [name!]: 1, 'Root Cellar': 1 },
        {
          settings: {
            foodPreservation: true,
            wellbeingMult: 0,
            startDay: 172,
            startingStocks: { ...food, [input!]: 100 },
          },
        },
      );
      s.stocks[energy!] = 100;
      const ordered = setPreservation(catalog, s, idOf(s, name!), input!, 5);
      const r = stepDay(ordered, catalog);
      const batch = r.ledger.preserved![0]!;
      expect(batch.outputKcal).toBeGreaterThan(0);
      expect(batch.outputKcal).toBeLessThan(batch.inputKcal);
      expect(batch.energyResource).toBe(energy);
      expect(batch.labor).toBeGreaterThan(0);
      expect(flowRecord(catalog, r.state, [r.ledger]).food.producedKcal).toBe(0);
      for (const resource of [input!, energy!, 'Preserved food', 'Labor']) conserve(s, r.state, resource);
      expect(
        stepDay({ ...ordered, stocks: { ...ordered.stocks, [energy!]: 0 } }, catalog).ledger.preserved,
      ).toBeUndefined();
      expect(
        stepDay({ ...ordered, stocks: { ...ordered.stocks, [input!]: 0 } }, catalog).ledger.preserved,
      ).toBeUndefined();
      expect(() =>
        setPreservation(
          catalog,
          { ...s, settings: { ...s.settings, foodPreservation: false } },
          idOf(s, name!),
          input!,
        ),
      ).toThrow(/disabled/);
    });
  it('water-bath canning rejects meat and roots while pressure canning retains both recipes', () => {
    const s = newGame({ 'Water-Bath Canner': 1 }, { settings: { foodPreservation: true } });
    for (const input of ['Meat', 'Root crops'])
      expect(() => setPreservation(catalog, s, idOf(s, 'Water-Bath Canner'), input)).toThrow(
        /cannot preserve/,
      );
    expect(catalog.preservationRecipes!.find((p) => p.systemId === sysId('Pressure Canner'))!.inputs).toEqual(
      expect.arrayContaining(['Meat', 'Root crops']),
    );
  });
  it('cheese consumes milk without counting converted calories as harvest or meals and spoils slower', () => {
    const s = newGame(
      { 'Human Being': 1, 'Cheese Press': 1, 'Root Cellar': 1 },
      {
        settings: {
          foodPreservation: true,
          wellbeingMult: 0,
          startingStocks: { ...food, Milk: 10 },
        },
      },
    );
    const r = stepDay(s, catalog);
    expect(r.ledger.resources.Milk!.processed).toBeCloseTo(1.25 / 7, 9);
    expect(r.ledger.resources.Cheese!.produced).toBeCloseTo(1 / 7, 9);
    expect(r.ledger.needs.Food.needed).toBe(2000);
    expect(flowRecord(catalog, r.state, [r.ledger]).food.producedKcal).toBe(0);
    for (const resource of ['Milk', 'Cheese']) conserve(s, r.state, resource);
    const after = stepDays(
      newGame({}, { settings: { foodPreservation: true, startingStocks: { Milk: 5, Cheese: 5 } } }),
      catalog,
      30,
    ).state;
    expect(after.stocks.Cheese! / 5).toBeGreaterThan(after.stocks.Milk! / 5);
    expect(
      stepDay({ ...s, stocks: { ...s.stocks, Milk: 0 } }, catalog).ledger.resources.Cheese!.produced,
    ).toBe(0);
  });
  it('a working grain bin prevents rodent loss only up to its capacity', () => {
    const s = newGame(
      { 'Human Being': 1, 'Grain Bin': 1 },
      {
        settings: {
          foodPreservation: true,
          wellbeingMult: 0,
          startingStocks: { ...food, Grain: 100 },
        },
      },
    );
    const protectedDay = stepDay(s, catalog);
    const exposed = stepDay(
      { ...s, instances: s.instances.filter((i) => i.systemId !== sysId('Grain Bin')) },
      catalog,
    );
    expect(protectedDay.ledger.resources.Grain!.spoiled).toBeLessThan(
      exposed.ledger.resources.Grain!.spoiled,
    );
    const noWork = stepDay({ ...s, instances: s.instances.filter((i) => !i.person) }, catalog);
    expect(noWork.ledger.resources.Grain!.spoiled).toBeGreaterThan(
      protectedDay.ledger.resources.Grain!.spoiled,
    );
  });
  it('saved seed draws real garden output and needs food preservation and labor', () => {
    const s = newGame(
      { 'Human Being': 1, 'Seed Saving Station': 1 },
      {
        settings: {
          foodPreservation: true,
          wellbeingMult: 0,
          startingStocks: { ...food, [produce]: 20 },
        },
      },
    );
    const r = stepDay(s, catalog);
    expect(r.ledger.resources.Seeds!.produced).toBeCloseTo(1 / 7, 9);
    expect(r.ledger.resources[produce]!.processed).toBeCloseTo(1 / 7, 9);
    expect(r.ledger.needs.Food.needed).toBe(2000);
    for (const resource of [produce, 'Seeds']) conserve(s, r.state, resource);
    for (const variant of [
      { ...s, stocks: { ...s.stocks, [produce]: 0 } },
      { ...s, instances: s.instances.filter((i) => !i.person) },
      { ...s, settings: { ...s.settings, foodPreservation: false } },
    ])
      expect(stepDay(variant, catalog).ledger.resources.Seeds!.produced).toBe(0);
    expect(gameDigest(stepDays(JSON.parse(JSON.stringify(r.state)), catalog, 20).state)).toBe(
      gameDigest(stepDays(r.state, catalog, 20).state),
    );
  });
});
