import { describe, expect, it } from 'vitest';
import {
  applyAction,
  computeSpatial,
  fertilityView,
  gameDigest,
  replay,
  stepDays,
  type GameSettings,
  type GameState,
} from '../src/index.ts';
import { catalog, newGame, run, sysId } from './time-helpers.ts';

const ON: Partial<GameSettings> = { soilFertility: true };
const VEG = 'Vegetables fruit fiber herbs';
/** Front Range, late May: inside the growing season. */
const START = 140;

function garden(extra: Record<string, number> = {}, stocks: Record<string, number> = {}, settings: Partial<GameSettings> = ON): GameState {
  const s = newGame(
    { 'Human Being': 1, 'Bell Tent': 1, '5,000 Gallon Cistern': 1, 'Raised Beds (24 sq ft)': 1, ...extra },
    { settings: { ...settings, startDay: START, startingStocks: { Food: 1e7, 'Drinking water': 50, Water: 5000, Seeds: 50, ...stocks } } },
  );
  // Put every system at the same spot so range rules are easy to reason about.
  return { ...s, instances: s.instances.map((i) => ({ ...i, x: 60, y: 60 })) };
}
const bed = (s: GameState) => s.instances.find((i) => i.systemId === sysId('Raised Beds (24 sq ft)'))!;
const vegMade = (r: { ledgers: { resources: Record<string, { produced: number }> }[] }) =>
  r.ledgers.reduce((a, l) => a + (l.resources[VEG]?.produced ?? 0), 0);

describe('LL-35 soil fertility', () => {
  it('compost at the catalog rate keeps a bed at full fertility and full yield', () => {
    const r = run(garden({}, { Compost: 1000 }), 60);
    expect(bed(r.state).fertility).toBeCloseTo(1, 2);
    const legacy = run(garden({}, { Compost: 1000 }, {}), 60);
    expect(vegMade(r) / vegMade(legacy)).toBeCloseTo(1, 2);
  });

  it('without compost, legacy beds stop; under the gate they keep cropping while fertility falls', () => {
    const legacy = run(garden({}, {}, {}), 30);
    expect(vegMade(legacy)).toBe(0);
    const r = run(garden(), 120);
    expect(vegMade(r)).toBeGreaterThan(0);
    const f = bed(r.state).fertility!;
    expect(f).toBeLessThan(0.9);
    expect(f).toBeGreaterThan(0.6);
    // Yield follows fertility: 30% + 70% × fertility.
    const sp = computeSpatial(catalog, r.state).get(bed(r.state).id)!;
    expect(sp.outMult[VEG]).toBeCloseTo(0.3 + 0.7 * f);
  });

  it('a depleted bed recovers with compost, and stays down without it', () => {
    const base = garden();
    const tired = { ...base, instances: base.instances.map((i) => (i.id === bed(base).id ? { ...i, fertility: 0.4 } : i)) };
    const fed = run({ ...tired, stocks: { ...tired.stocks, Compost: 1000, Manure: 2000 } }, 60);
    const unfed = run(tired, 60);
    expect(bed(fed.state).fertility!).toBeGreaterThan(0.4);
    expect(bed(unfed.state).fertility!).toBeLessThan(0.4);
    expect(vegMade(fed)).toBeGreaterThan(vegMade(unfed));
  });

  it('manure stands in for missing compost at half strength', () => {
    const r = run(garden({}, { Manure: 1000 }), 30);
    const manure = r.ledgers.reduce((a, l) => a + (l.fertility?.[0]?.manure ?? 0), 0);
    const requested = r.ledgers.reduce((a, l) => a + (l.fertility?.[0] ? 1 : 0), 0);
    expect(requested).toBe(30);
    expect(manure).toBeGreaterThan(0);
    expect(bed(r.state).fertility).toBeCloseTo(1, 2);
    expect(r.ledgers.reduce((a, l) => a + l.resources.Manure!.consumed, 0)).toBeCloseTo(manure);
  });

  it('a working clover cover crop in range raises fertility; out of range it does nothing', () => {
    const none = run(garden(), 90);
    const near = run(garden({ 'Clover Cover Crop': 1 }), 90);
    const far0 = garden({ 'Clover Cover Crop': 1 });
    const far = run({ ...far0, instances: far0.instances.map((i) => (i.systemId === sysId('Clover Cover Crop') ? { ...i, x: 400, y: 400 } : i)) }, 90);
    expect(bed(near.state).fertility!).toBeGreaterThan(bed(none.state).fertility! + 0.02);
    expect(bed(far.state).fertility).toBeCloseTo(bed(none.state).fertility!, 6);
  });

  it('fertility only falls on growing days', () => {
    const winter = newGame({ 'Human Being': 1, 'Bell Tent': 1, '5,000 Gallon Cistern': 1, 'Raised Beds (24 sq ft)': 1 }, { settings: { ...ON, startDay: 0, startingStocks: { Food: 1e7, 'Drinking water': 50, Water: 5000 } } });
    const r = run(winter, 30);
    expect(bed(r.state).fertility ?? 1).toBeCloseTo(1, 9);
  });

  it('the garden card reports fertility, yield and the week from the ledger', () => {
    const r = run(garden({}, { Compost: 1000 }), 7);
    const v = fertilityView(r.state, catalog, bed(r.state).id)!;
    expect(v.fertility.value).toBeCloseTo(bed(r.state).fertility!);
    expect(v.compostPerYear.value).toBe(25);
    expect(v.week.compost.value).toBeCloseTo(r.ledgers.reduce((a, l) => a + l.fertility![0]!.compost, 0));
    expect(fertilityView({ ...r.state, settings: { ...r.state.settings, soilFertility: false } }, catalog, bed(r.state).id)).toBeNull();
  });

  it('with the gate off nothing changes, and the setting replays and survives a JSON save', () => {
    const a = run(garden({}, { Compost: 100 }, {}), 40);
    const b = run(garden({}, { Compost: 100 }, { soilFertility: false }), 40);
    expect(gameDigest({ ...b.state, settings: a.state.settings })).toBe(gameDigest(a.state));
    expect(a.ledgers.some((l) => l.fertility)).toBe(false);

    const init = { siteId: 'front-range', seed: 1, settings: { startDay: START, startingStocks: { Food: 1e7, 'Drinking water': 50, Water: 100, Seeds: 50 } } };
    let s = replay(catalog, init, [], 0);
    const actions = [
      { at: 0, kind: 'place' as const, systemId: sysId('Human Being'), x: 30, y: 30, mode: 'prebuilt' as const, id: `i${s.nextInstanceId}` },
      { at: 0, kind: 'place' as const, systemId: sysId('Raised Beds (24 sq ft)'), x: 60, y: 30, mode: 'prebuilt' as const, id: `i${s.nextInstanceId + 1}` },
      { at: 0, kind: 'settings' as const, settings: ON },
    ];
    for (const a of actions) s = applyAction(catalog, s, a);
    s = stepDays(s, catalog, 25).state;
    expect(gameDigest(replay(catalog, init, actions, 25))).toBe(gameDigest(s));
    const loaded = JSON.parse(JSON.stringify(s)) as GameState;
    expect(gameDigest(stepDays(loaded, catalog, 10).state)).toBe(gameDigest(stepDays(s, catalog, 10).state));
  });
});
