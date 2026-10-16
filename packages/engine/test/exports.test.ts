import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getSite } from '@homestead/catalog';
import {
  balanceFeasible,
  designForBalance,
  designFromGame,
  flowRecord,
  flowRecords,
  gameFromDesign,
  ledgersCsv,
  resolveDesign,
  scenarioSummary,
  sensitivity,
  setLink,
  stepDays,
  type DesignFile,
} from '../src/index.ts';
import { catalog, newGame, run, sysId } from './time-helpers.ts';

const root = resolve(__dirname, '../../..');
const load = (f: string) => JSON.parse(readFileSync(join(root, 'designs', f), 'utf8')) as DesignFile;

describe('flow record', () => {
  it('a suburban home buys its power from the grid; an off-grid cabin buys none', () => {
    const sub = gameFromDesign(catalog, load('suburban-baseline.json'), { seed: 1, weatherMode: 'average' });
    const r1 = stepDays(sub, catalog, 365);
    const rec = flowRecord(catalog, r1.state, r1.ledgers);
    expect(rec.schema).toBe('homestead.flow_record.v1');
    expect(rec.days).toBe(365);
    expect(rec.electricity.importKwh).toBeGreaterThan(0);
    const total = r1.ledgers.reduce((a, l) => a + (l.bought.Electricity ?? 0), 0);
    expect(rec.electricity.importKwh).toBeCloseTo(total, 6);
    expect(rec.water.boughtGal).toBeGreaterThan(0);

    const cabin = gameFromDesign(catalog, load('offgrid-cabin-family.json'), { seed: 1, weatherMode: 'average' });
    const r2 = stepDays(cabin, catalog, 365);
    const rec2 = flowRecord(catalog, r2.state, r2.ledgers);
    expect(rec2.electricity.importKwh).toBe(0);
    expect(rec2.electricity.onSiteKwh).toBeGreaterThan(0);
    expect(rec2.land.usedSqft).toBeGreaterThan(0);
    expect(Object.values(rec2.land.byUse).reduce((a, b) => a + b, 0)).toBeCloseTo(rec2.land.usedSqft, 9);
    expect(rec2.electricity.monthly).toHaveLength(12);
  });

  it('months where someone fell into hardship are listed by name', () => {
    const s = run(newGame({ 'Human Being': 1, 'Bell Tent': 1 }), 60).state;
    const [rec] = flowRecords(catalog, s);
    expect(rec!.hardshipMonths).toContain('Jan');
  });
});

describe('daily ledger CSV', () => {
  it('has one row per day and the same columns on every row', () => {
    const r = run(newGame({ 'Human Being': 2, 'Bell Tent': 1, Well: 1, '500W Photovoltaic Panels': 2 }), 30);
    const csv = ledgersCsv(catalog, r.ledgers).trim().split('\n');
    expect(csv).toHaveLength(31);
    const cols = csv[0]!.split(',').length;
    expect(csv[0]).toContain('Water needed');
    expect(csv[0]).toContain('Electricity produced');
    // No field in this game has a comma, so a plain split counts columns.
    for (const line of csv.slice(1)) expect(line.split(',').length).toBe(cols);
  });
});

describe('design files', () => {
  it('a layout saved from the game rebuilds the same placements and links', () => {
    let g = newGame({ 'Human Being': 1, Yurt: 1, 'Bell Tent': 1, 'Rainwater Collection System + Cistern (550 Gallons)': 1 }, { settings: { parcelAcres: 1 } });
    const tent = g.instances.find((i) => i.systemId === sysId('Bell Tent'))!;
    const rain = g.instances.find((i) => i.systemId === sysId('Rainwater Collection System + Cistern (550 Gallons)'))!;
    g = setLink(g, rain.id, 'Roofing area', tent.id);
    const file = designFromGame(catalog, g, 'Test');
    expect(file.layout).toHaveLength(g.instances.length);
    const back = gameFromDesign(catalog, JSON.parse(JSON.stringify(file)) as DesignFile, { seed: 1, weatherMode: 'average' });
    expect(back.instances.map((i) => [i.systemId, i.x, i.y, i.links ?? null])).toEqual(
      g.instances.map((i) => [i.systemId, i.x, i.y, i.links ?? null]),
    );
    expect(back.settings.parcelAcres).toBe(1);
  });

  it('without a layout, a design file is laid out automatically as before', () => {
    const file = load('starter.json');
    const g = gameFromDesign(catalog, file, { seed: 1, weatherMode: 'average' });
    expect(g.instances.length).toBeGreaterThan(10);
    expect(g.settings.parcelAcres).toBe(5);
  });
});

describe('scenario compare', () => {
  it('shows the average-year checklist, cost, labor, land, autonomy, and yearly cash, each explained', () => {
    const s = scenarioSummary(catalog, load('offgrid-cabin-family.json'), 'laramie-wy');
    const { design } = designForBalance(catalog, load('offgrid-cabin-family.json'), 'laramie-wy');
    const b = balanceFeasible(catalog, getSite('laramie-wy').assumptions, design);
    expect(s.overall.value).toBe(b.overallScore.value);
    expect(s.checklist).toHaveLength(11);
    expect(s.cashPerYear.value).toBeCloseTo(b.summary.capitalNet.value * 52, 9);
    expect(s.cashPerYear.explain.formula).toMatch(/× 52/);
    expect(s.autonomy.battery.value).toBeGreaterThan(0);
    expect(s.siteName).toMatch(/Laramie/);
  });

  it('the same design scores differently on two sites', () => {
    const f = load('offgrid-cabin-family.json');
    expect(scenarioSummary(catalog, f, 'laramie-wy').overall.value).not.toBe(
      scenarioSummary(catalog, f, 'asheville-nc').overall.value,
    );
  });
});

describe('sensitivity', () => {
  const site = getSite('front-range');
  const solar = {
    ambient: site.ambient,
    ...resolveDesign(catalog, {
    'Human Being': 1,
    Yurt: 1,
    '500W Photovoltaic Panels': 2,
      'LiFePO4 Battery Bank (10 kWh)': 1,
      Well: 1,
    }),
  };

  it('a solar-powered design is most sensitive to sun hours and PV derate', () => {
    const t = sensitivity(catalog, site.assumptions, solar);
    const top = t.bars.slice(0, 3).map((b) => b.key);
    expect(top).toContain('psh');
    expect(top).toContain('pvDerate');
    for (let i = 1; i < t.bars.length; i++) expect(t.bars[i - 1]!.swing).toBeGreaterThanOrEqual(t.bars[i]!.swing);
    expect(t.bars.every((b) => b.base === t.baseScore)).toBe(true);
  });

  it('names the flows that move the weakest row most, ten at most', () => {
    const t = sensitivity(catalog, site.assumptions, solar);
    expect(t.weakest).not.toBeNull();
    expect(t.flows.length).toBeGreaterThan(0);
    expect(t.flows.length).toBeLessThanOrEqual(10);
    for (const f of t.flows) {
      expect(f.low).toBeGreaterThanOrEqual(0);
      expect(f.high).toBeLessThanOrEqual(1);
    }
  });

  it('with no change there is no swing', () => {
    const t = sensitivity(catalog, site.assumptions, solar, 0);
    expect(t.bars.every((b) => b.swing === 0)).toBe(true);
  });
});
