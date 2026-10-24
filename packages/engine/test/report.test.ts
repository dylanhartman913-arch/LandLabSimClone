import { describe, expect, it } from 'vitest';
import { buildReport, rootCauseChain, suggestFixes } from '../src/index.ts';
import { loadDesign } from './fixtures.ts';
import { advanceTo, catalog, newGame, run } from './time-helpers.ts';
import { gameFromStart, initGame, placeDesign } from '../src/index.ts';
import { getSite, getStart } from '@homestead/catalog';

describe('season and year reports', () => {
  it('explain the starter design’s water shortage as a chain back to its power', () => {
    const { design } = loadDesign('starter.json');
    const g = placeDesign(
      catalog,
      initGame(catalog, getSite('front-range'), { parcelAcres: 5 }, 1),
      design.counts,
    );
    const { state, ledgers } = run(g, 365);
    const report = buildReport(state, catalog, 'year', ledgers, 'Year 1');
    expect(report.monthly).toHaveLength(12);
    const chains = report.shortages.map((s) => s.chain);
    expect(chains.length).toBeGreaterThan(0);
    const water = rootCauseChain(state, catalog, ledgers, 'Water');
    expect(water.chain).toMatch(/short on Water because Well short on Electricity because/);
    expect(water.steps.map((s) => s.resource)).toEqual(['Water', 'Electricity']);
    expect(report.laborBySystem.length).toBeGreaterThan(0);
    expect(report.spilledPower).toBeGreaterThan(0);
  });

  it('blames winter when panels feed a battery and demand stays level', () => {
    const g = advanceTo(
      newGame({ 'Human Being': 1, '500W Photovoltaic Panels': 6, 'LiFePO4 Battery Bank (10 kWh)': 1 }),
      340,
    );
    const { state, ledgers } = run(g, 45);
    const c = rootCauseChain(state, catalog, ledgers, 'Electricity');
    expect(c.rootCause).toMatch(/less Electricity in winter/);
  });

  it('says so when nothing makes what is needed, and suggests what could', () => {
    const { state, ledgers } = run(newGame({ 'Human Being': 1, 'Bell Tent': 1 }), 30);
    const c = rootCauseChain(state, catalog, ledgers, 'Drinking water');
    expect(c.chain).toMatch(/nothing in the design makes Drinking water/);
    const fixes = suggestFixes(state, catalog, 'Drinking water');
    expect(fixes.length).toBeGreaterThan(0);
    expect(fixes.every((f) => f.cost <= state.cash)).toBe(true);
    expect(fixes[0]!.costPerUnit).toBeLessThanOrEqual(fixes.at(-1)!.costPerUnit);
  });
});

describe('LL-21: reports put survival first and name the neighbor’s help', () => {
  it('the neighbor’s quest cash is assistance, not a refund', () => {
    const s = run(gameFromStart(catalog, getSite('front-range'), getStart('greenfield'), {}), 5).state;
    expect(s.tutorial!.done['gf-water']).toBeDefined();
    const r = buildReport(s, catalog, 'season', s.ledgers, 'Spring');
    expect(r.cash.assistance).toBe(200);
    expect(r.cash.refunds).toBe(0);
    expect(r.cash.net).toBeCloseTo(r.cash.in - r.cash.out - r.cash.purchases + r.cash.refunds + r.cash.assistance, 6);
  });

  it('survival shortages (food, heat…) are listed before transportation or hot water', () => {
    // Two adults, a tent, no food and no car: every comfort row and food run short.
    const s = run(newGame({ 'Human Being': 2, 'Canvas Wall Tent + Stove Jack': 1 }, { settings: { startDay: 150, startingStocks: { Food: 0, 'Drinking water': 100 } } }), 7).state;
    const r = buildReport(s, catalog, 'season', s.ledgers, 'Week');
    const names = r.shortages.map((x) => x.resource);
    const vital = ['Food', 'Heat', 'Drinking water', 'Sanitation', 'Shelter'];
    expect(vital).toContain(names[0]);
    const firstComfort = names.findIndex((n) => !vital.includes(n));
    const lastVital = names.map((n) => vital.includes(n)).lastIndexOf(true);
    if (firstComfort >= 0) expect(firstComfort).toBeGreaterThan(lastVital);
  });
});
