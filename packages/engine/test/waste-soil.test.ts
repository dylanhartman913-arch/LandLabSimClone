import { describe, expect, it } from 'vitest';
import { getSite } from '@homestead/catalog';
import { climateTable, gameDigest, seedingView, stepDays, type GameSettings, type GameState } from '../src/index.ts';
import { catalog, newGame, run, sysId } from './time-helpers.ts';

const windrow = 'Manure Windrow';
const leaves = 'Leaf Litter Gathering';
const sawdust = 'Sawmill Sawdust Pickup';
const seeding = 'Cover Crop Seeding';
const laundry = 'Laundry Station';
const supplies = { Food: 1e7, 'Drinking water': 100, Water: 5000 };
const of = (s: GameState, name: string) => s.instances.find((i) => i.systemId === sysId(name))!;
const total = (r: { ledgers: { resources: Record<string, { produced: number }> }[] }, res: string) =>
  r.ledgers.reduce((n, l) => n + (l.resources[res]?.produced ?? 0), 0);

function camp(counts: Record<string, number>, stocks: Record<string, number> = {}, settings: Partial<GameSettings> = {}) {
  const s = newGame(
    { 'Human Being': 1, 'Bell Tent': 1, '5,000 Gallon Cistern': 1, ...counts },
    { settings: { wellbeingMult: 0, startDay: 140, startingStocks: { ...supplies, ...stocks }, ...settings } },
  );
  return { ...s, instances: s.instances.map((i) => ({ ...i, x: 60, y: 60 })) };
}

describe('LL-44 waste and carbon', () => {
  it('a windrow turns manure and carbon into compost, losing mass, and stops without carbon', () => {
    const r = run(camp({ [windrow]: 1 }, { Manure: 300, Carbon: 150 }), 7);
    expect(total(r, 'Compost')).toBeCloseTo(25, 6);
    const used = (res: string) => r.ledgers.reduce((n, l) => n + l.resources[res]!.consumed, 0);
    expect(used('Manure')).toBeCloseTo(30, 6);
    expect(used('Carbon')).toBeCloseTo(15, 6);
    expect(r.ledgers.reduce((n, l) => n + (l.laborBySystem[sysId(windrow)] ?? 0), 0)).toBeCloseTo(1, 6);
    const dry = run(camp({ [windrow]: 1 }, { Manure: 300 }), 7);
    expect(total(dry, 'Compost')).toBe(0);
    expect(dry.ledgers.reduce((n, l) => n + l.resources.Manure!.consumed, 0)).toBe(0);
  });

  it('leaf litter trades labor and sawdust trades cash for carbon', () => {
    const raked = run(camp({ [leaves]: 1 }), 7);
    expect(total(raked, 'Carbon')).toBeCloseTo(30, 6);
    expect(raked.ledgers.reduce((n, l) => n + (l.laborBySystem[sysId(leaves)] ?? 0), 0)).toBeCloseTo(1.5, 6);
    const start = camp({ [sawdust]: 1 });
    const bought = run(start, 7);
    expect(total(bought, 'Carbon')).toBeCloseTo(100, 6);
    expect(start.cash - bought.state.cash).toBeGreaterThanOrEqual(6 - 1e-6);
  });

  it('bought sawdust keeps a composting toilet running once its carbon runs out', () => {
    const toilet = { 'Composting Outhouse': 1 };
    // From day 3: the first delivery lands at the end of day 1 and is used from day 2.
    const met = (r: ReturnType<typeof run>) => {
      const days = r.ledgers.slice(2);
      return days.reduce((a, l) => a + l.needs.Sanitation.delivered, 0) / days.reduce((a, l) => a + l.needs.Sanitation.needed, 0);
    };
    const without = run(camp(toilet, { Carbon: 0 }), 14);
    const ample = run(camp(toilet, { Carbon: 1000 }), 14);
    const withSawdust = run(camp({ ...toilet, [sawdust]: 1 }, { Carbon: 0 }), 14);
    expect(met(without)).toBe(0);
    expect(met(ample)).toBeGreaterThan(0.8);
    expect(met(withSawdust)).toBeCloseTo(met(ample), 6);
  });
});

describe('LL-44 cover crop seeding', () => {
  const ON: Partial<GameSettings> = { soilFertility: true };
  const bed = (s: GameState) => s.instances.find((i) => i.systemId === sysId('Raised Beds (24 sq ft)'))!;
  function beds(withKit: boolean, startDay: number, settings = ON, kitOffset = 0, sown = 1, seeds = 50) {
    const s = camp({ 'Raised Beds (24 sq ft)': 1, ...(withKit ? { [seeding]: 1 } : {}) }, { Seeds: seeds }, { ...settings, startDay });
    const tired = { ...s, instances: s.instances.map((i) => (i.id === bed(s).id ? { ...i, fertility: 0.5 } : i)) };
    return { ...tired, instances: tired.instances.map((i) => (i.systemId === sysId(seeding) ? { ...i, x: 60 + kitOffset, sown } : i)) };
  }
  it('raises a resting bed in winter and does nothing in the growing season', () => {
    const winter = run(beds(true, 330), 30);
    const bare = run(beds(false, 330), 30);
    const rest = 365 - climateTable(getSite('front-range')).seasonDays;
    expect(bed(bare.state).fertility).toBeCloseTo(0.5, 9);
    expect(bed(winter.state).fertility! - 0.5).toBeCloseTo((0.15 / rest) * 30, 9);
    const summer = run(beds(true, 172), 10);
    expect(bed(summer.state).fertility!).toBeLessThan(0.5);
    expect(bed(summer.state).fertility).toBeCloseTo(bed(run(beds(false, 172), 10).state).fertility!, 9);
  });
  it('sows only the seed it receives in its late-summer window, and an unsown kit adds nothing', () => {
    // Week 35 starts on day 238; the window runs 49 days.
    const sown = run(beds(true, 238, ON, 0, 0), 49);
    expect(of(sown.state, seeding).sown).toBeCloseTo(1, 9);
    expect(sown.ledgers.reduce((n, l) => n + l.resources.Seeds!.consumed, 0)).toBeGreaterThanOrEqual(2 - 1e-9);
    const noSeed = run(beds(true, 238, ON, 0, 0, 0), 49);
    expect(of(noSeed.state, seeding).sown).toBe(0);
    const winter = run({ ...noSeed.state }, 60);
    const bare = run(run(beds(false, 238, ON, 0, 0, 0), 49).state, 60);
    expect(bed(winter.state).fertility).toBeCloseTo(bed(bare.state).fertility!, 9);
  });
  it('needs the soil fertility gate and range, and shares its sown area', () => {
    const off = run(beds(true, 330, {}), 30);
    expect(bed(off.state).fertility).toBe(0.5);
    const far = run(beds(true, 330, ON, 80), 30);
    expect(bed(far.state).fertility).toBeCloseTo(0.5, 9);
    const s = run(beds(true, 330), 2).state;
    expect(seedingView(s, catalog, of(s, seeding).id)!.share.value).toBe(1);
  });
});

describe('LL-44 laundry', () => {
  it('washing uses water and hot water, returns greywater and adds wellbeing', () => {
    const r = run(camp({ [laundry]: 1, 'Solar Hot Water Heater': 1 }), 7);
    const g = r.ledgers.at(-1)!;
    const sat = r.state.lastDay[Object.keys(r.state.lastDay).find((k) => k.startsWith(sysId(laundry)))!]!;
    expect(sat.sat).toBeCloseTo(1, 6);
    expect(sat.inputs['Hot water']!.received).toBeCloseTo(20 / 7, 6);
    expect(sat.outputs.Greywater).toBeCloseTo(45 / 7, 6);
    expect(g.resources.Greywater!.produced).toBeGreaterThanOrEqual(45 / 7 - 1e-6);
    const cold = run(camp({ [laundry]: 1 }), 2);
    const k = Object.keys(cold.state.lastDay).find((key) => key.startsWith(sysId(laundry)))!;
    expect(cold.state.lastDay[k]!.limitedBy).toBe('Hot water');
  });
});

it('new systems continue identically after a JSON save', () => {
  const s = camp({ [windrow]: 1, [sawdust]: 1, [seeding]: 1, 'Raised Beds (24 sq ft)': 1 }, { Manure: 300, Seeds: 20 }, { soilFertility: true, startDay: 300 });
  const a = stepDays(s, catalog, 20).state;
  const b = stepDays(JSON.parse(JSON.stringify(s)) as GameState, catalog, 20).state;
  expect(gameDigest(a)).toBe(gameDigest(b));
  expect(a.ledgers).toEqual(b.ledgers);
});

