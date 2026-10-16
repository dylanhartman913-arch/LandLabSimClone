import { describe, expect, it } from 'vitest';
import { getSite } from '@homestead/catalog';
import {
  balanceFeasible,
  balancePotential,
  checklistView,
  designForGame,
  gameFromDesign,
  hudMetrics,
  resolveDesign,
  stepDays,
  summarizeLedgers,
  type Design,
} from '../src/index.ts';
import { loadDesign } from './fixtures.ts';
import { advanceTo, catalog, newGame, place, run, sysId } from './time-helpers.ts';

const site = getSite('front-range');
const design = (counts: Record<string, number>): Design => ({ ...resolveDesign(catalog, counts), ambient: site.ambient });
const row = (r: { checklist: { need: string }[] }, need: string) =>
  r.checklist.find((x) => x.need === need) as ReturnType<typeof balanceFeasible>['checklist'][number];

describe('a fan with no electricity cools nobody', () => {
  const d = design({ 'GoSun Fan': 1, 'Bell Tent': 1, 'Human Being': 1 });

  it('feasible balance credits no cooling and says the fan is blocked for lack of Electricity', () => {
    const r = balanceFeasible(catalog, site.assumptions, d);
    const cool = row(r, 'Cooled shelter');
    expect(cool.provided.value).toBe(0);
    expect(cool.potential!.value).toBeGreaterThan(0);
    expect(r.systems[sysId('GoSun Fan')]!.status).toBe('blocked: no Electricity');
    expect(cool.blocked!.map((b) => [b.name, b.status])).toEqual([['GoSun Fan', 'blocked: no Electricity']]);
    // The spreadsheet's (potential) number still credits it: that is the ceiling, not the score.
    expect(row(balancePotential(catalog, site.assumptions, d), 'Cooled shelter').provided.value).toBeGreaterThan(0);
  });

  it('time mode agrees: in summer the fan makes nothing and reports Electricity as its limit', () => {
    const g = advanceTo(newGame({ 'GoSun Fan': 1, 'Bell Tent': 1, 'Human Being': 1 }), 190);
    const r = run(g, 7);
    const s = summarizeLedgers(r.ledgers, catalog).checklist.find((x) => x.need === 'Cooled shelter')!;
    expect(s.provided).toBe(0);
    expect(s.potential).toBeGreaterThan(0);
    const fan = Object.entries(r.state.lastDay).find(([k]) => k.startsWith(`${sysId('GoSun Fan')}|`))![1];
    expect(fan.sat).toBe(0);
    expect(fan.limitedBy).toBe('Electricity');
    const v = checklistView(r.state, catalog, 'average');
    const cool = v.rows.find((x) => x.need === 'Cooled shelter')!;
    expect(cool.provided.value).toBe(0);
    expect(cool.blocked[0]!.status).toBe('blocked: no Electricity');
  });
});

describe('supply chains curtail in order', () => {
  const base = {
    'Human Being': 1,
    Well: 1,
    'Raised Beds (24 sq ft)': 2,
    Sunflowers: 1,
    'Vermicompost Bin': 2,
    'LiFePO4 Battery Bank (10 kWh)': 1,
  };

  it('removing the panels stops the well, then the beds, and the water and food rows drop', () => {
    const powered = balanceFeasible(catalog, site.assumptions, design({ ...base, '500W Photovoltaic Panels': 3 }));
    const dark = balanceFeasible(catalog, site.assumptions, design(base));
    expect(powered.systems[sysId('Well')]!.satisfaction).toBe(1);
    expect(row(powered, 'Water').pct.value).toBe(1);
    expect(row(powered, 'Food').provided.value).toBeGreaterThan(0);

    const well = dark.systems[sysId('Well')]!;
    const beds = dark.systems[sysId('Raised Beds (24 sq ft)')]!;
    expect(well.status).toBe('blocked: no Electricity');
    expect(beds.status).toBe('blocked: no Water');
    expect(well.curtailedAt!).toBeLessThan(beds.curtailedAt!);
    expect(row(dark, 'Water').pct.value).toBe(0);
    expect(row(dark, 'Food').provided.value).toBe(0);
    // Potential doesn't move: it is the ceiling.
    expect(row(dark, 'Food').potential!.value).toBe(row(powered, 'Food').potential!.value);
  });

  it('converges in a few passes and never raises a satisfaction', () => {
    const r = balanceFeasible(catalog, site.assumptions, design(base));
    expect(r.iterations).toBeLessThan(20);
    for (const s of Object.values(r.systems)) expect(s.satisfaction).toBeLessThanOrEqual(1);
  });
});

describe('heat and cooling must reach a shelter', () => {
  it('a firepit warms whoever sits by it, not the tent: its heat is potential only', () => {
    const r = balanceFeasible(catalog, site.assumptions, design({ Firepit: 1, 'Bell Tent': 1, 'Human Being': 1, 'Woody Biomass': 1 }));
    const heat = row(r, 'Heated shelter');
    expect(heat.provided.value).toBe(0);
    expect(heat.potential!.value).toBeGreaterThan(0);
    expect(heat.blocked![0]!.status).toMatch(/outdoors/);
  });

  it('a wood stove beside the tent counts; the same stove across the field does not', () => {
    // A woodpile in stock for time mode; a woody-biomass source for balance mode (which has no stocks).
    let g = newGame(
      { 'Human Being': 1, 'Bell Tent': 1, 'Woody Biomass': 1 },
      { settings: { startingStocks: { 'Woody biomass': 5000 } } },
    );
    const tent = g.instances.find((i) => i.systemId === sysId('Bell Tent'))!;
    const near = place(g, 'Tiny Wood Stove', tent.x, tent.y + 10).state;
    const far = place(g, 'Tiny Wood Stove', tent.x + 120, tent.y + 120).state;
    const heat = (s: typeof g) => row(balanceFeasible(catalog, site.assumptions, designForGame(s, catalog)), 'Heated shelter');
    expect(heat(near).provided.value).toBeGreaterThan(0);
    expect(heat(far).provided.value).toBe(0);
    expect(heat(far).blocked![0]!.status).toMatch(/not near a shelter/);
    // In time mode too, in January.
    g = near;
    const warm = summarizeLedgers(run(g, 5).ledgers, catalog).checklist.find((x) => x.need === 'Heated shelter')!;
    const cold = summarizeLedgers(run(far, 5).ledgers, catalog).checklist.find((x) => x.need === 'Heated shelter')!;
    expect(warm.provided).toBeGreaterThan(0);
    expect(cold.provided).toBe(0);
    expect(cold.potential).toBeGreaterThan(0);
  });
});

describe('the score is actual, with potential beside it', () => {
  it('the HUD score is the feasible score, and the potential score is never lower', () => {
    const g = newGame({ 'GoSun Fan': 1, 'Bell Tent': 1, 'Human Being': 1, Well: 1 });
    const m = hudMetrics(g, catalog);
    const r = balanceFeasible(catalog, g.site.assumptions, designForGame(g, catalog));
    expect(m.score.value).toBe(r.overallScore.value);
    expect(m.potentialScore.value).toBeGreaterThanOrEqual(m.score.value);
  });
});

describe('feasible balance agrees with time mode', () => {
  for (const file of ['starter.json', 'offgrid-cabin-family.json', 'suburban-baseline.json']) {
    it(`${file}: year-2 overall coverage within 5 points of feasible balance`, () => {
      const { file: df } = loadDesign(file);
      const y1 = stepDays(gameFromDesign(catalog, df, { seed: 1, weatherMode: 'average' }), catalog, 365);
      const y2 = stepDays(y1.state, catalog, 365);
      const t = summarizeLedgers(y2.ledgers, catalog);
      const f = balanceFeasible(catalog, catalog.assumptions, designForGame(y2.state, catalog));
      expect(Math.abs(t.overallScore - f.overallScore.value)).toBeLessThan(0.05);
      if (file === 'starter.json') {
        // Row by row within 5 points, except one documented seasonal effect: in time mode the oak
        // and poplar drop autumn leaves (Carbon for the outhouse) after their summer water need
        // ends; a weekly steady state can't see timing, so it keeps them blocked all year.
        for (const r of t.checklist) {
          const fr = f.checklist.find((x) => x.need === r.need)!;
          if (r.need === 'Sanitation') continue;
          expect(Math.abs(r.pct - fr.pct.value), r.need).toBeLessThan(0.05);
        }
      }
    });
  }
});
