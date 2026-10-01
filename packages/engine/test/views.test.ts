import { describe, expect, it } from 'vitest';
import {
  balanceFeasible,
  checklistView,
  designForGame,
  designBalance,
  flowLinks,
  hudMetrics,
  resourceWeek,
  systemCard,
  FLOW_GROUPS,
} from '../src/index.ts';
import { advanceTo, catalog, newGame, run, sysId } from './time-helpers.ts';

describe('the Needs Checklist view', () => {
  it('Average year is feasible balance mode, number for number, with provenance', () => {
    const g = newGame({ 'Human Being': 2, 'Bell Tent': 1, Well: 1, '500W Photovoltaic Panels': 2 });
    const v = checklistView(g, catalog, 'average');
    const b = balanceFeasible(catalog, g.site.assumptions, designForGame(g, catalog));
    expect(v.rows.map((r) => [r.provided.value, r.needed.value, r.pct.value, r.covered])).toEqual(
      b.checklist.map((r) => [r.provided.value, r.needed.value, r.pct.value, r.covered]),
    );
    expect(v.overall.value).toBe(b.overallScore.value);
    expect(v.rows.find((r) => r.need === 'Heated shelter')!.needed.explain.terms.length).toBeGreaterThan(0);
    expect(v.summary).toMatch(/average year/i);
  });

  it('the worst week is never better than the season, and both explain themselves', () => {
    const g = run(
      newGame({ 'Human Being': 1, 'Bell Tent': 1, Well: 1, '500W Photovoltaic Panels': 2 }),
      60,
    ).state;
    const season = checklistView(g, catalog, 'season');
    const worst = checklistView(g, catalog, 'worst');
    expect(worst.overall.value).toBeLessThanOrEqual(season.overall.value + 1e-9);
    expect(worst.range!.to - worst.range!.from).toBe(6);
    const water = season.rows.find((r) => r.need === 'Water')!;
    expect(water.pct.explain.formula).toMatch(/delivered/);
    expect(water.sparkline.length).toBeGreaterThan(0);
  });
});

describe('the System Card view', () => {
  it('shows what the design could supply from the catalog', () => {
    const g = run(
      newGame({
        'Human Being': 1,
        Well: 1,
        'LiFePO4 Battery Bank (10 kWh)': 1,
        'Rooftop Solar Array (6 kW)': 1,
      }),
      14,
    ).state;
    const card = systemCard(g, catalog, sysId('Raised Beds (24 sq ft)'));
    const water = card.inputs.find((i) => i.view.resource === 'Water')!;
    expect(water.needed.value).toBe(15);
    expect(water.role).toBe('required');
    expect(card.inputs.find((i) => i.view.resource === 'Pollination')!.role).toBe('boost');
    expect(card.instance).toBeNull();
  });

  it('shows a placed instance’s live satisfaction and what limits it', () => {
    const g = advanceTo(newGame({ 'Human Being': 1, Well: 1, '500W Photovoltaic Panels': 1 }), 170);
    const s = run(g, 3).state;
    const well = s.instances.find((i) => i.systemId === sysId('Well'))!;
    const card = systemCard(s, catalog, well.systemId, well.id);
    expect(card.instance!.limitedBy).toBe('Electricity');
    expect(card.instance!.satisfaction.value).toBeLessThan(0.05);
    const elec = card.inputs.find((i) => i.view.resource === 'Electricity')!;
    expect(elec.supplied.value).toBeLessThan(elec.needed.value);
    expect(card.outputs[0]!.produced.explain.formula).toMatch(/satisfaction/);
  });
});

describe('the flow overlay', () => {
  it('links the well to the people who drink its water', () => {
    const g = advanceTo(
      newGame({
        'Human Being': 2,
        Well: 1,
        'Rooftop Solar Array (6 kW)': 1,
        'LiFePO4 Battery Bank (10 kWh)': 1,
      }),
      170,
    );
    const s = run(g, 3).state;
    const well = s.instances.find((i) => i.systemId === sysId('Well'))!;
    const links = flowLinks(s, catalog, { resources: FLOW_GROUPS.water.resources });
    const fromWell = links.filter((l) => l.from === well.id && l.resource === 'Water');
    expect(fromWell).toHaveLength(2);
    expect(fromWell.every((l) => l.amount > 0 && !l.short)).toBe(true);
  });

  it('marks a consumer with no producer as short', () => {
    const s = run(newGame({ 'Human Being': 1 }), 2).state;
    const links = flowLinks(s, catalog, { resources: ['Drinking water'] });
    expect(links.some((l) => l.short)).toBe(true);
  });
});

describe('HUD and drawer numbers carry provenance', () => {
  it('reports labor and score with formulas', () => {
    const s = run(newGame({ 'Human Being': 2, 'Bell Tent': 1 }), 7).state;
    const m = hudMetrics(s, catalog);
    expect(m.laborAvailableWeek.value).toBeGreaterThan(0);
    expect(m.score.value).toBe(designBalance(s, catalog).overallScore.value);
    const rw = resourceWeek(s, catalog);
    expect(rw.find((r) => r.resource === 'Food')!.needed.explain.formula).toMatch(/requests/);
  });
});
