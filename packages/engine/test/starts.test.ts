import { catalog, getSite, getStart, type Difficulty } from '@homestead/catalog';
import { describe, expect, it } from 'vitest';
import {
  buyAtMarket,
  checklistView,
  initGame,
  peopleView,
  computeSpatial,
  gameFromStart,
  newWellbeing,
  placeSystem,
  springStartDay,
  stepDays,
  summarize,
  updateWellbeing,
  type PersonDay,
  type PersonState,
} from '../src/index.ts';
import { sysId } from './time-helpers.ts';

const SITES = ['front-range', 'laramie-wy', 'asheville-nc'];
const start = (id: string, site: string, difficulty: Difficulty = 'standard', seed = 1) =>
  gameFromStart(catalog, getSite(site), getStart(id), { difficulty, seed });

describe('adapt your home (G15 pacing gate)', () => {
  it.each(SITES)('%s: day 1 covers every row with groceries, the grid, and city water; self-reliance is near 0', (site) => {
    const r = stepDays(start('adapt', site), catalog, 1);
    const l = r.ledgers[0]!;
    for (const [row, n] of Object.entries(l.needs)) {
      if (n.needed > 0) expect(n.delivered / n.needed, row).toBeCloseTo(1, 6);
    }
    expect(summarize(r.state, catalog).selfReliance).toBeLessThan(0.05);
  });

  it.each(SITES)('%s: idle for two years at 1×, wellbeing stays at 70 or more and self-reliance under 5%%', (site) => {
    const r = stepDays(start('adapt', site), catalog, 730);
    const lows = r.ledgers.map((l) => l.wellbeing ?? 0);
    expect(Math.min(...lows)).toBeGreaterThanOrEqual(70);
    expect(r.events.filter((e) => e.kind === 'hardship')).toHaveLength(0);
    expect(summarize(r.state, catalog).selfReliance).toBeLessThan(0.05);
    expect(r.state.cash).toBeGreaterThan(0);
  });
});

describe('start from the ground up (G15 pacing gate)', () => {
  it.each(SITES)('%s, Standard, idle: no hardship for 28 days, wellbeing ≥ 50 on day 42, nobody to town before day 60', (site) => {
    const r = stepDays(start('greenfield', site), catalog, 60);
    const first = r.events.find((e) => e.kind === 'hardship');
    expect(first?.absDay ?? Infinity).toBeGreaterThanOrEqual(28);
    expect(r.ledgers[41]!.wellbeing).toBeGreaterThanOrEqual(50);
    expect(r.events.filter((e) => e.kind === 'went-to-town')).toHaveLength(0);
    expect(r.ledgers.every((l) => l.away === 0)).toBe(true);
  });

  it.each(SITES)('%s, Gentle, idle: nobody goes to town before day 90', (site) => {
    const r = stepDays(start('greenfield', site, 'gentle'), catalog, 90);
    expect(r.events.filter((e) => e.kind === 'went-to-town')).toHaveLength(0);
  });

  it('starts a month before each site’s last frost, with the kit running and the stockpile scaled to the household', () => {
    for (const site of SITES) {
      const g = start('greenfield', site);
      expect(g.calendar.day).toBe(springStartDay(getSite(site)));
      expect(g.instances.every((i) => i.status === 'active')).toBe(true);
    }
    const three = gameFromStart(catalog, getSite('front-range'), getStart('greenfield'), { household: 3 });
    expect(three.instances.filter((i) => i.person)).toHaveLength(3);
    expect(three.stocks['Food']).toBeCloseTo(300000, 6);
    expect(start('greenfield', 'front-range', 'gentle').stocks['Food']).toBeCloseTo(300000, 6);
  });

  it('declines slowly once the food runs out rather than collapsing, and comes home when there is food again', () => {
    const r = stepDays(start('greenfield', 'front-range'), catalog, 120);
    const town = r.events.find((e) => e.kind === 'went-to-town');
    expect(town).toBeDefined();
    const firstFood = r.events.find((e) => e.kind === 'hardship' && e.need === 'food')!;
    expect(town!.absDay - firstFood.absDay).toBeGreaterThanOrEqual(10);
    // Buy a month of food at the market: they come home after two weeks away.
    let g = buyAtMarket(catalog, r.state, 'Food', 120000);
    g = { ...g, cash: g.cash + 5000 };
    const back = stepDays(g, catalog, 21);
    expect(back.events.some((e) => e.kind === 'came-home')).toBe(true);
  });
});

describe('wellbeing v2: grace, drift, recovery', () => {
  const day = (over: Partial<PersonDay['survival']> = {}, comfort: Partial<PersonDay['comfort']> = {}): PersonDay => ({
    survival: { drinkingWater: 1, food: 1, shelter: 1, heat: null, sanitation: 1, ...over },
    comfort: { electricity: 1, cooling: null, transportation: 1, hotWater: 1, cookingFuel: 1, ...comfort },
    servicePoints: 0,
    mult: 1,
  });
  const fresh = (): PersonState => newWellbeing();
  const run = (p: PersonState, days: PersonDay[]) => {
    const hardships: string[] = [];
    for (const d of days) {
      const u = updateWellbeing(p, d);
      p = u.person;
      hardships.push(...u.hardships.map((h) => h.need));
    }
    return { p, hardships };
  };

  it('a day without drinking water is free; the second costs, and fires a hardship', () => {
    const one = run(fresh(), [day({ drinkingWater: 0 })]);
    expect(one.hardships).toEqual([]);
    expect(one.p.wellbeing).toBe(75);
    const two = run(fresh(), [day({ drinkingWater: 0 }), day({ drinkingWater: 0 })]);
    expect(two.hardships).toEqual(['drinkingWater']);
    expect(two.p.wellbeing).toBeLessThan(75);
  });

  it('food has four days of grace under half rations, one day under a fifth', () => {
    expect(run(fresh(), Array(4).fill(day({ food: 0.4 }))).hardships).toEqual([]);
    expect(run(fresh(), Array(5).fill(day({ food: 0.4 }))).hardships).toEqual(['food']);
    expect(run(fresh(), Array(2).fill(day({ food: 0.1 }))).hardships).toEqual(['food']);
  });

  it('no single day costs more than 8 points', () => {
    const bad = day({ drinkingWater: 0, food: 0, shelter: 0, heat: 0, sanitation: 0 });
    const { p } = run({ ...fresh(), short: { drinkingWater: 9, food: 9, shelter: 9, heat: 9, sanitation: 9 }, severeFood: 9 }, [bad]);
    expect(p.wellbeing).toBeCloseTo(67, 9);
    expect(p.why.some((t) => t.label.includes('at most 8'))).toBe(true);
  });

  it('comfort only drifts; with every survival need met a person recovers, and labor follows wellbeing', () => {
    const { p } = run(fresh(), Array(10).fill(day({}, { electricity: 0, transportation: 0, hotWater: 0 })));
    expect(p.wellbeing).toBeGreaterThan(75);
    expect(p.health).toBeCloseTo(0.5 + 0.5 * (p.wellbeing / 100), 9);
    expect(p.why[0]!.label).toContain('recovering');
  });
});

describe('the G15 catalog additions', () => {
  it('a weatherization retrofit on the house cuts its heat loss by 30%; on the lawn it does nothing', () => {
    const g = start('adapt', 'front-range');
    const home = g.instances.find((i) => i.systemId === sysId('Average Suburban Home'))!;
    const on = placeSystem(catalog, g, sysId('Home Weatherization Retrofit'), home.x, home.y, 'prebuilt').state;
    expect(computeSpatial(catalog, on).get(home.id)!.inMult['Heat']).toBeCloseTo(0.7, 9);
    const off = placeSystem(catalog, g, sysId('Home Weatherization Retrofit'), 5, 100, 'prebuilt').state;
    expect(computeSpatial(catalog, off).get(home.id)?.inMult['Heat']).toBeUndefined();
    const heat = (s: typeof g) => stepDays(s, catalog, 7).ledgers.reduce((a, l) => a + l.needs['Heated shelter'].needed, 0);
    expect(heat(on) / heat(g)).toBeCloseTo(0.7, 6);
  });

  it('a clothesline anywhere on the lot saves each person 1 kWh a week', () => {
    const g = start('adapt', 'front-range');
    const withLine = placeSystem(catalog, g, sysId('Clothesline'), 80, 20, 'prebuilt').state;
    const kwh = (s: typeof g) => stepDays(s, catalog, 7).ledgers.reduce((a, l) => a + l.resources['Electricity']!.requested, 0);
    // Two people at 21 kWh a week each: 42 → 40 (the clothesline itself uses no power).
    expect(kwh(g) - kwh(withLine)).toBeCloseTo(2, 4); // the multiplier is 20/21 to six places
  });

  it('the rain barrel catches rain with its own catchment, no roof needed', () => {
    const r = stepDays(start('greenfield', 'asheville-nc'), catalog, 30);
    const water = r.ledgers.reduce((a, l) => a + l.resources['Water']!.produced, 0);
    const gathered = r.ledgers.reduce((a, l) => a + (l.gathered ?? []).filter((x) => x.resource === 'Water').reduce((b, x) => b + x.amount, 0), 0);
    expect(water - gathered).toBeGreaterThan(20);
  });
});

describe('wool blankets replace the hidden bedding constant (G16)', () => {
  const blankets = () => sysId('Wool Blankets & Sleeping Bags');
  /** Two people in a canvas tent with the kit stove and firewood, early January in Laramie. */
  const tent = (withBlankets: boolean) => {
    let g = initGame(catalog, getSite('laramie-wy'), {
      startDay: 5,
      peopleLeave: false,
      startingStocks: { Food: 200000, 'Drinking water': 40, 'Woody biomass': 2000, Carbon: 100 },
    });
    const at = (name: string, x: number, y: number) => (g = placeSystem(catalog, g, sysId(name), x, y, 'prebuilt').state);
    at('Canvas Wall Tent + Stove Jack', 100, 100);
    at('Human Being', 100, 100);
    at('Human Being', 100, 100);
    at('Tiny Wood Stove', 110, 100);
    if (withBlankets) at('Wool Blankets & Sleeping Bags', 100, 100);
    return g;
  };

  it('blankets on the tent cut its heat need to a fifth, in the engine and on the checklist alike', () => {
    const off = stepDays(tent(false), catalog, 3);
    const on = stepDays(tent(true), catalog, 3);
    const need = (r: typeof on) => r.ledgers.reduce((a, l) => a + l.needs['Heated shelter'].needed, 0);
    expect(need(on) / need(off)).toBeCloseTo(0.2, 9);
    const sp = computeSpatial(catalog, on.state);
    const shelter = on.state.instances.find((i) => i.systemId === sysId('Canvas Wall Tent + Stove Jack'))!;
    expect(sp.get(shelter.id)!.inMult['Heat']).toBeCloseTo(0.2, 9);
    // Off the tent (on open ground), they warm nobody.
    const away = placeSystem(catalog, tent(false), blankets(), 20, 20, 'prebuilt').state;
    expect(computeSpatial(catalog, away).get(shelter.id)?.inMult['Heat']).toBeUndefined();
  });

  it('the people bar judges heat against the same need the checklist shows, and the why names the blankets', () => {
    const r = stepDays(tent(true), catalog, 1);
    const l = r.ledgers[0]!;
    const share = l.needs['Heated shelter'].delivered / l.needs['Heated shelter'].needed;
    expect(share).toBeLessThan(1); // a Laramie January in a tent: still short with the kit stove
    const person = peopleView(r.state, catalog)[0]!;
    expect(person.why.some((t) => t.label.startsWith(`Heat: ${Math.round(share * 100)}% met`))).toBe(true);
    expect(person.wellbeing.explain.notes!.join(' ')).toContain('Wool Blankets & Sleeping Bags × 0.20');
    const row = checklistView(r.state, catalog, 'worst').rows.find((x) => x.need === 'Heated shelter')!;
    expect(row.pct.value).toBeCloseTo(share, 9);
    expect(row.pct.explain.notes!.join(' ')).toContain('Wool Blankets & Sleeping Bags × 0.20');
    expect(checklistView(r.state, catalog, 'average').rows.find((x) => x.need === 'Heated shelter')!.pct.explain.notes!.join(' ')).toContain('Wool Blankets');
  });

  it('blankets and a weatherization retrofit on the same house both count', () => {
    const g = start('adapt', 'front-range');
    const home = g.instances.find((i) => i.systemId === sysId('Average Suburban Home'))!;
    let s = placeSystem(catalog, g, sysId('Home Weatherization Retrofit'), home.x, home.y, 'prebuilt').state;
    s = placeSystem(catalog, s, blankets(), home.x, home.y, 'prebuilt').state;
    expect(computeSpatial(catalog, s).get(home.id)!.inMult['Heat']).toBeCloseTo(0.7 * 0.2, 9);
  });

  it('the greenfield kit includes them, on the tent', () => {
    const g = start('greenfield', 'front-range');
    const b = g.instances.find((i) => i.systemId === blankets())!;
    const t = g.instances.find((i) => i.systemId === sysId('Canvas Wall Tent + Stove Jack'))!;
    expect([b.x, b.y]).toEqual([t.x, t.y]);
  });
});
