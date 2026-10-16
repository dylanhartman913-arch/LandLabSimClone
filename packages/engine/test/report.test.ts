import { describe, expect, it } from 'vitest';
import { buildReport, rootCauseChain, suggestFixes } from '../src/index.ts';
import { loadDesign } from './fixtures.ts';
import { advanceTo, catalog, newGame, run } from './time-helpers.ts';
import { initGame, placeDesign } from '../src/index.ts';
import { getSite } from '@homestead/catalog';

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
