import { describe, expect, it } from 'vitest';
import { resourcePage, supplyChain } from '../src/index.ts';
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
