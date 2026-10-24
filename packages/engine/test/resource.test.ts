import { describe, expect, it } from 'vitest';
import { resourcePage, setStandingOrder, supplyChain } from '../src/index.ts';
import { catalog, newGame, place, run, sysId } from './time-helpers.ts';

describe('resource pages', () => {
  it('electricity: who makes it here, who uses it, what you could build; the market does not sell it', () => {
    const g = run(newGame({ 'Human Being': 1, Well: 1, '500W Photovoltaic Panels': 2 }), 3).state;
    const p = resourcePage(g, catalog, 'Electricity');
    expect(p.unit).toBe('kWh');
    const panels = p.inDesign.find((x) => x.systemId === sysId('500W Photovoltaic Panels'))!;
    expect(panels.count).toBe(2);
    expect(panels.actualWeek).toBeGreaterThan(0);
    expect(p.usedBy.map((u) => u.name)).toEqual(expect.arrayContaining(['Well', 'Human Being']));
    expect(p.couldBuild.length).toBeGreaterThan(3);
    // Non-conventional first, cheapest per unit first among them.
    const own = p.couldBuild.filter((o) => !o.conventional);
    for (let i = 1; i < own.length; i++) expect(own[i - 1]!.costPerUnit).toBeLessThanOrEqual(own[i]!.costPerUnit);
    expect(p.buy).toBeNull();
    expect(p.disposal).toMatch(/Battery storage/);
  });

  it('wood pellets: the market price and the feed store, and each option says which inputs you have', () => {
    const g = newGame({ 'Human Being': 1 });
    const p = resourcePage(g, catalog, 'Wood pellets');
    expect(p.buy).toEqual({ price: 0.3, unit: 'lbs' });
    const store = p.couldBuild.find((o) => o.name === 'Farm & Feed Store')!;
    expect(store.conventional).toBe(true);
    expect(store.inputs.find((i) => i.resource === 'Transportation')!.have).toBe(false);
  });

  it('a well with no power: the chain shows electricity unmet, with panels whose sunlight is already there', () => {
    const g = place(newGame({ 'Human Being': 1 }), 'Well', 60, 60).state;
    const chain = supplyChain(g, catalog, sysId('Well'));
    const elec = chain.find((c) => c.resource === 'Electricity')!;
    expect(elec.satisfied).toBe(false);
    expect(elec.options.length).toBeGreaterThan(0);
    const anyPanel = elec.options.find((o) => /Photovoltaic|Solar/.test(o.name));
    expect(anyPanel).toBeDefined();
    const sun = anyPanel!.inputs.find((i) => i.resource === 'Sunlight');
    expect(sun?.satisfied).toBe(true);
  });
});

describe('LL-20: resource pages agree with the ledger (Oct 22 playtest cases)', () => {
  const camp = () =>
    run(
      newGame({ 'Human Being': 2, 'Canvas Wall Tent + Stove Jack': 1, 'Tiny Wood Stove': 1, 'Chicken Coop (12 hens)': 1 }, { settings: { startDay: 150, startingStocks: { Food: 0, 'Chicken feed': 100, Water: 500, 'Drinking water': 60, 'Woody biomass': 300 } } }),
      2,
    ).state;

  it('a store’s weekly cash need counts the household’s cash, labeled as cash', () => {
    const s = camp();
    const store = resourcePage(s, catalog, 'Chicken feed').couldBuild.find((o) => o.name === 'Farm & Feed Store')!;
    const cash = store.inputs.find((i) => i.resource === 'Capital')!;
    expect(cash.have).toBe(s.cash > 0);
    expect(cash.label).toBe('weekly cash');
  });

  it('the Food page lists what feeds the household through substitutes', () => {
    const page = resourcePage(camp(), catalog, 'Food');
    expect(page.inDesign).toHaveLength(0);
    const eggs = page.substitutes.find((p) => p.resource === 'Eggs')!;
    expect(eggs.name).toBe('Chicken Coop (12 hens)');
    expect(eggs.actualWeek).toBeGreaterThan(0);
  });

  it('a service that cannot be kept shows no stock', () => {
    expect(resourcePage(camp(), catalog, 'Heat').stock).toBeNull();
    expect(resourcePage(camp(), catalog, 'Chicken feed').stock).not.toBeNull();
  });

  it('a stock something uses doesn’t claim it just piles up', () => {
    expect(resourcePage(camp(), catalog, 'Chicken feed').disposal).toBe('Kept in stock until your systems use it; there is no storage limit.');
  });

  it('the page reports the standing order that keeps it topped up', () => {
    let s = camp();
    expect(resourcePage(s, catalog, 'Chicken feed').standing).toBeNull();
    s = setStandingOrder(catalog, s, 'Chicken feed', 20, 60);
    expect(resourcePage(s, catalog, 'Chicken feed').standing).toEqual({ keepAbove: 20, orderUpTo: 60 });
  });
});
