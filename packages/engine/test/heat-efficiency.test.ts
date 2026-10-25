import { describe, expect, it } from 'vitest';
import { checklistView, computeSpatial, gameDigest, stepDays, type GameState } from '../src/index.ts';
import { catalog, newGame, run, sysId } from './time-helpers.ts';

const liner = 'Canvas Tent Winter Liner';
const boiler = 'Wood Boiler with Water Jacket';
const draft = 'Draft-Proofing Kit (small shelter)';
const tent = 'Canvas Wall Tent + Stove Jack';
const supplies = { Food: 1e7, 'Drinking water': 1000, Water: 5000, 'Woody biomass': 5000 };
const of = (s: GameState, name: string) => s.instances.find((i) => i.systemId === sysId(name))!;

/** Everything on one spot, so host modifiers sit on their shelter. */
function camp(counts: Record<string, number>, startDay = 10, dx: Record<string, number> = {}) {
  const s = newGame(
    { 'Human Being': 1, '5,000 Gallon Cistern': 1, 'Municipal Water Hookup': 1, ...counts },
    { settings: { wellbeingMult: 0, startDay, startingStocks: supplies } },
  );
  return {
    ...s,
    instances: s.instances.map((i) => {
      const name = catalog.systems.find((x) => x.id === i.systemId)!.name;
      return { ...i, x: 80 + (dx[name] ?? 0), y: 80 };
    }),
  };
}
const heatNeed = (s: GameState, name: string) => {
  const inst = of(s, name);
  const key = Object.keys(s.lastDay).find((k) => k.startsWith(`${inst.systemId}|`))!;
  return s.lastDay[key]!.inputs.Heat!.requested;
};

describe('LL-45 shelter efficiency', () => {
  it('a winter liner on a canvas tent cuts its heat need by a quarter, only when it sits on the tent', () => {
    const lined = run(camp({ [tent]: 1, [liner]: 1 }), 1).state;
    const bare = run(camp({ [tent]: 1 }), 1).state;
    expect(computeSpatial(catalog, lined).get(of(lined, tent).id)!.inMult.Heat).toBeCloseTo(0.75, 12);
    expect(heatNeed(lined, tent)).toBeCloseTo(heatNeed(bare, tent) * 0.75, 6);
    const aside = run(camp({ [tent]: 1, [liner]: 1 }, 10, { [liner]: 40 }), 1).state;
    expect(heatNeed(aside, tent)).toBeCloseTo(heatNeed(bare, tent), 6);
  });

  it('a liner does nothing for a hard shelter, and stacks with wool bedding', () => {
    const house = run(camp({ 'Tiny House on Wheels': 1, [liner]: 1 }), 1).state;
    expect(computeSpatial(catalog, house).get(of(house, 'Tiny House on Wheels').id)!.inMult.Heat).toBeUndefined();
    const both = run(camp({ [tent]: 1, [liner]: 1, 'Wool Blankets & Sleeping Bags': 1 }), 1).state;
    expect(computeSpatial(catalog, both).get(of(both, tent).id)!.inMult.Heat).toBeCloseTo(0.75 * 0.2, 12);
  });

  it('draft-proofing cuts a small shelter’s heat and cooling need but not a tent’s', () => {
    const sealed = computeSpatial(catalog, camp({ 'Tiny House on Wheels': 1, [draft]: 1 })).get(
      of(camp({ 'Tiny House on Wheels': 1, [draft]: 1 }), 'Tiny House on Wheels').id,
    )!;
    expect(sealed.inMult.Heat).toBeCloseTo(0.85, 12);
    expect(sealed.inMult.Cooling).toBeCloseTo(0.9, 12);
    const s = camp({ [tent]: 1, [draft]: 1 });
    expect(computeSpatial(catalog, s).get(of(s, tent).id)?.inMult.Heat).toBeUndefined();
  });
});

describe('LL-45 water-jacket boiler', () => {
  it('burns wood all year for hot water and makes heat only in the heating season', () => {
    const winter = run(camp({ [tent]: 1, [boiler]: 1 }, 10), 7);
    const summer = run(camp({ [tent]: 1, [boiler]: 1 }, 190), 7);
    const k = (s: GameState) => Object.keys(s.lastDay).find((key) => key.startsWith(`${sysId(boiler)}|`))!;
    for (const r of [winter, summer]) {
      const day = r.state.lastDay[k(r.state)]!;
      expect(day.inputs['Woody biomass']!.received).toBeCloseTo(50 / 7, 6);
      expect(day.outputs['Hot water']).toBeCloseTo(140 / 7, 6);
    }
    expect(winter.state.lastDay[k(winter.state)]!.outputs.Heat).toBeGreaterThan(0);
    expect(summer.state.lastDay[k(summer.state)]!.outputs.Heat ?? 0).toBeLessThan(winter.state.lastDay[k(winter.state)]!.outputs.Heat! / 5);
    const hot = winter.ledgers.at(-1)!.resources['Hot water']!;
    expect(hot.unmet).toBeCloseTo(0, 9);
  });

  it('without wood it makes neither heat nor hot water', () => {
    const s = camp({ [tent]: 1, [boiler]: 1 });
    const r = run({ ...s, stocks: { ...s.stocks, 'Woody biomass': 0 } }, 2);
    expect(r.ledgers.at(-1)!.resources['Hot water']!.produced).toBe(0);
  });
});

describe('LL-45 hot water on the checklist', () => {
  it('reports hot water as an unscored comfort line, not a checklist row', () => {
    // Eight days: the first day's hot water lands at day's end, so the last seven are fully met.
    const warm = run(camp({ [tent]: 1, [boiler]: 1 }), 8).state;
    const cold = run(camp({ [tent]: 1 }), 7).state;
    const w = checklistView(warm, catalog, 'current');
    const c = checklistView(cold, catalog, 'current');
    expect(w.rows.some((r) => (r.need as string) === 'Hot water')).toBe(false);
    expect(w.hotWater!.pct.value).toBeCloseTo(1, 6);
    expect(w.hotWater!.needed.value).toBeCloseTo(40, 6);
    expect(c.hotWater!.pct.value).toBe(0);
    expect(c.overall.explain.refs).not.toHaveProperty('Hot water');
  });
});

it('new systems continue identically after a JSON save', () => {
  const s = camp({ [tent]: 1, [liner]: 1, [boiler]: 1, 'Tiny House on Wheels': 1, [draft]: 1 }, 300, { 'Tiny House on Wheels': 40, [draft]: 40 });
  const a = stepDays(s, catalog, 30).state;
  const b = stepDays(JSON.parse(JSON.stringify(s)) as GameState, catalog, 30).state;
  expect(gameDigest(a)).toBe(gameDigest(b));
  expect(a.ledgers).toEqual(b.ledgers);
});
