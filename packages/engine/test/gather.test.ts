import { describe, expect, it } from 'vitest';
import { getSite } from '@homestead/catalog';
import { checklistView, nodeStockOf, nodeYield, placeSystem, summarizeLedgers, type GameState, type YearWeather } from '../src/index.ts';
import { catalog, newGame, run } from './time-helpers.ts';

const camp = (settings: Partial<GameState['settings']> = {}, site = 'front-range') =>
  newGame(
    { 'Human Being': 2, 'Canvas Wall Tent + Stove Jack': 1, 'Tiny Wood Stove': 1, Firepit: 1 },
    {
      site,
      settings: {
        startingStocks: { Food: 120_000 },
        autoGather: { waterDays: 3, woodWeeks: 2, foodWeeks: 1 },
        ...settings,
      },
    },
  );

describe('the land provides', () => {
  it('a tent camp lives off the spring and the deadfall for a spring month, by auto-gather alone', () => {
    const g = camp({ startDay: 90 }); // arrive April 1
    const { ledgers, state } = run(g, 30);
    const days = ledgers.slice(3); // the first fire makes the cooking fuel that boils water
    const s = summarizeLedgers(days, catalog);
    const row = (n: string) => s.checklist.find((r) => r.need === n)!;
    expect(row('Drinking water').pct).toBeGreaterThan(0.95);
    expect(row('Water').pct).toBeGreaterThan(0.95);
    // Heat: the stove never runs short of wood (how much it warms a canvas tent in April is the
    // catalog's number; G15's wellbeing decides what that costs).
    const stove = catalog.systems.find((x) => x.name === 'Tiny Wood Stove')!.id;
    expect(days.some((l) => l.curtailed.some((c) => c.systemId === stove && c.limitedBy === 'Woody biomass'))).toBe(false);
    expect(row('Heated shelter').delivered).toBeGreaterThan(0);
    const hauls = days.flatMap((l) => l.gathered ?? []);
    expect(hauls.some((h) => h.nodeType === 'spring' && h.resource === 'Water')).toBe(true);
    expect(hauls.some((h) => h.nodeType === 'deadfall' && h.resource === 'Woody biomass')).toBe(true);
    expect(days.reduce((a, l) => a + (l.boiled?.gal ?? 0), 0)).toBeGreaterThan(0);
    // Walking counts as labor.
    expect(hauls.every((h) => h.walkHours > 0 && h.walkHours < h.hours)).toBe(true);
    // The deadfall is visibly lower.
    const deadfall = state.site.nodes.find((n) => n.type === 'deadfall')!;
    expect(nodeStockOf(state, deadfall)).toBeLessThan(deadfall.stock!);
    // The "why" says where the water came from.
    const v = checklistView(state, catalog, 'season');
    const drink = v.rows.find((r) => r.need === 'Drinking water')!;
    expect(drink.provided.explain.notes?.join(' ')).toMatch(/gal from the spring via boiling, [\d.]+ h labor/);
  });

  it('a creek yields less in a drought year', () => {
    const creek = getSite('asheville-nc').nodes.find((n) => n.type === 'creek')!;
    const dry: YearWeather = { year: 0, precipMult: 0.5, hddMult: 1, cddMult: 1, lateFrostDays: 0, heatWaves: [], hailDay: null };
    expect(nodeYield(creek, dry, 'real')).toBeCloseTo(creek.yieldPerHour * 0.5, 9);
    expect(nodeYield(creek, dry, 'average')).toBe(creek.yieldPerHour);
    // In a game: the same hours bring in less water.
    const haul = (precipMult: number) => {
      let g = camp({ weatherMode: 'real', startDay: 120 }, 'asheville-nc');
      const yw = { ...dry, year: g.calendar.year, precipMult };
      g = { ...g, yearWeather: yw, weatherLog: [yw] };
      const { ledgers } = run(g, 5);
      const hauls = ledgers.flatMap((l) => l.gathered ?? []).filter((h) => h.nodeType === 'creek');
      const water = hauls.reduce((a, h) => a + h.amount, 0);
      const hours = hauls.reduce((a, h) => a + h.hours, 0);
      return water / hours;
    };
    expect(haul(0.5)).toBeLessThan(haul(1) * 0.6);
  });

  it('gathering competes with construction through work priorities', () => {
    const base = (priorities: Record<string, number>) => {
      let g = camp({ work: { priorities }, startDay: 90, constructionShare: 1 });
      const yurt = catalog.systems.find((s) => s.name === 'Yurt')!.id;
      g = placeSystem(catalog, g, yurt, 150, 150, 'diy').state;
      const { ledgers } = run(g, 2);
      return {
        build: ledgers.reduce((a, l) => a + l.labor.construction, 0),
        gather: ledgers.reduce((a, l) => a + (l.labor.byJob?.['gather-wood'] ?? 0) + (l.labor.byJob?.['gather-water'] ?? 0), 0),
      };
    };
    const gatherFirst = base({});
    const buildFirst = base({ construction: 1, 'gather-wood': 3, 'gather-water': 3, 'gather-food': 3 });
    expect(gatherFirst.gather).toBeGreaterThan(buildFirst.gather);
    expect(buildFirst.build).toBeGreaterThan(gatherFirst.build);
  });

  it('a weekly cap holds a job to its hours, and a cap alone sets standing hours for clay', () => {
    const g = camp({ work: { caps: { 'gather-wood': 2, 'gather-soil': 7 } }, startDay: 90 });
    const { ledgers, state } = run(g, 14);
    const lastWeek = ledgers.slice(-7);
    expect(lastWeek.reduce((a, l) => a + (l.labor.byJob?.['gather-wood'] ?? 0), 0)).toBeLessThanOrEqual(2 + 1e-9);
    expect(lastWeek.reduce((a, l) => a + (l.labor.byJob?.['gather-soil'] ?? 0), 0)).toBeGreaterThan(5);
    expect(state.stocks['Soil']).toBeGreaterThan(0);
  });

  it('deadfall regrows slowly once worked; untouched nodes cost nothing to track', () => {
    const quiet = newGame({ 'Human Being': 1 });
    expect(run(quiet, 10).state.nodeStock).toBeUndefined();
    const worked = run(camp({ startDay: 90 }), 10).state;
    const id = worked.site.nodes.find((n) => n.type === 'deadfall')!.id;
    const before = worked.nodeStock![id]!;
    const rested = run({ ...worked, settings: { ...worked.settings, autoGather: {} } }, 10).state;
    expect(rested.nodeStock![id]!).toBeGreaterThan(before);
  });
});
