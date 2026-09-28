import { describe, expect, it } from 'vitest';
import { getSite } from '@homestead/catalog';
import {
  drawYearWeather,
  gameDigest,
  replay,
  REAL_WEATHER,
  seedState,
  stepDays,
  weatherFor,
  climateTable,
  type YearWeather,
} from '../src/index.ts';
import { catalog, newGame, run } from './time-helpers.ts';

const laramie = getSite('laramie-wy');
const asheville = getSite('asheville-nc');

function years(site = laramie, n = 4000): YearWeather[] {
  const out: YearWeather[] = [];
  let rng = seedState(7);
  for (let y = 0; y < n; y++) {
    const [yw, next] = drawYearWeather(site, y, rng);
    out.push(yw);
    rng = next;
  }
  return out;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const cv = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) / m;
};

describe('real weather draws', () => {
  it('an arid site’s rain varies about 25% year to year around the average; a humid one about 15%', () => {
    const dry = years(laramie).map((y) => y.precipMult);
    const wet = years(asheville).map((y) => y.precipMult);
    expect(mean(dry)).toBeCloseTo(1, 1);
    expect(cv(dry)).toBeGreaterThan(0.22);
    expect(cv(dry)).toBeLessThan(0.28);
    expect(cv(wet)).toBeGreaterThan(0.13);
    expect(cv(wet)).toBeLessThan(0.17);
  });

  it('a warm year has fewer heating and more cooling degree-days, never beyond ±8%', () => {
    for (const y of years()) {
      expect(Math.abs(y.hddMult - 1)).toBeLessThanOrEqual(REAL_WEATHER.degreeDaySwing + 1e-12);
      expect(y.hddMult - 1).toBeCloseTo(-(y.cddMult - 1), 12);
    }
  });

  it('about three years in ten have a late frost that takes 21-30 days off the season', () => {
    const ys = years();
    const late = ys.filter((y) => y.lateFrostDays > 0);
    expect(late.length / ys.length).toBeGreaterThan(0.27);
    expect(late.length / ys.length).toBeLessThan(0.33);
    expect(Math.min(...late.map((y) => y.lateFrostDays))).toBe(21);
    expect(Math.max(...late.map((y) => y.lateFrostDays))).toBe(30);
  });

  it('heat waves fall in summer and hail falls in the growing season', () => {
    for (const y of years()) {
      for (const h of y.heatWaves) {
        expect(h.start).toBeGreaterThanOrEqual(151);
        expect(h.start + h.days - 1).toBeLessThanOrEqual(242);
      }
      if (y.hailDay !== null) {
        const table = climateTable(laramie);
        expect(weatherFor(laramie, table, y.hailDay, 'real', y).growing).toBe(true);
      }
    }
  });

  it('a late frost keeps the garden dormant for those days', () => {
    const table = climateTable(laramie);
    const start = laramie.growingSeason.startDay - 1;
    const yw: YearWeather = { year: 0, precipMult: 1, hddMult: 1, cddMult: 1, lateFrostDays: 25, heatWaves: [], hailDay: null };
    expect(weatherFor(laramie, table, start, 'average', undefined).growing).toBe(true);
    expect(weatherFor(laramie, table, start, 'real', yw).growing).toBe(false);
    expect(weatherFor(laramie, table, start + 24, 'real', yw).growing).toBe(false);
    expect(weatherFor(laramie, table, start + 25, 'real', yw).growing).toBe(true);
    expect(weatherFor(laramie, table, start + 25, 'real', yw).tags).toContain('last frost (25 days late)');
  });
});

describe('real weather in the game', () => {
  const beds = { 'Human Being': 1, 'Raised Beds (24 sq ft)': 2, 'Municipal Water Hookup': 1 };

  it('average weather draws nothing, so its games are unchanged', () => {
    const g = newGame(beds, { site: 'laramie-wy' });
    const s = run(g, 400).state;
    expect(s.rng).toBe(g.rng);
    expect(s.weatherLog).toBeUndefined();
  });

  it('the same seed gives the same weather, and every year’s draws are kept', () => {
    const a = run(newGame(beds, { site: 'laramie-wy', settings: { weatherMode: 'real' }, seed: 3 }), 800).state;
    const b = run(newGame(beds, { site: 'laramie-wy', settings: { weatherMode: 'real' }, seed: 3 }), 800).state;
    const c = run(newGame(beds, { site: 'laramie-wy', settings: { weatherMode: 'real' }, seed: 4 }), 800).state;
    expect(a.weatherLog).toHaveLength(3);
    expect(a.weatherLog).toEqual(b.weatherLog);
    expect(gameDigest(a)).toBe(gameDigest(b));
    expect(c.weatherLog![0]!.precipMult).not.toBe(a.weatherLog![0]!.precipMult);
    expect(gameDigest(c)).not.toBe(gameDigest(a));
  });

  it('a week of hail wipes out the raised beds’ harvest for that week', () => {
    // Validation supply keeps seeds, compost, and water from limiting the beds.
    let g = newGame(beds, { site: 'laramie-wy', settings: { weatherMode: 'real', unlimitedSupply: true } });
    // Pin this year's draws: hail on July 1.
    const hail: YearWeather = { year: 0, precipMult: 1, hddMult: 1, cddMult: 1, lateFrostDays: 0, heatWaves: [], hailDay: 181 };
    g = { ...g, yearWeather: hail, weatherLog: [hail] };
    const calm = { ...g, yearWeather: { ...hail, hailDay: null }, weatherLog: [{ ...hail, hailDay: null }] };
    const veg = (s: typeof g) =>
      stepDays(s, catalog, 190).ledgers.slice(181, 188).reduce((a, l) => a + (l.resources['Vegetables fruit fiber herbs']?.produced ?? 0), 0);
    expect(veg(calm)).toBeGreaterThan(0);
    expect(veg(g)).toBe(0);
  });

  it('a real-weather game replays to the same digest from its seed and actions', () => {
    const init = { siteId: 'laramie-wy', seed: 9, settings: { weatherMode: 'real' as const } };
    const actions = [
      { at: 0, kind: 'place' as const, systemId: catalog.systems.find((s) => s.name === 'Yurt')!.id, x: 60, y: 60, mode: 'prebuilt' as const, id: 'i1' },
    ];
    const a = replay(catalog, init, actions, 500);
    const b = replay(catalog, init, actions, 500);
    expect(a.weatherLog).toHaveLength(2);
    expect(gameDigest(a)).toBe(gameDigest(b));
  });
});
