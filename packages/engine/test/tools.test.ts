import { describe, expect, it } from 'vitest';
import {
  applyAction,
  computeSpatial,
  gameDigest,
  replay,
  stepDays,
  systemCard,
  toolView,
  type GameSettings,
  type GameState,
  type GatherRecord,
} from '../src/index.ts';
import { catalog, newGame, run, sysId } from './time-helpers.ts';

const ON: Partial<GameSettings> = { toolGathering: true };
const supplies = { Food: 1e7, 'Drinking water': 1000 };

/** Two adults in a tent with a wood stove that burns what they gather (Front Range, January). */
function camp(extra: Record<string, number> = {}, settings: Partial<GameSettings> = ON, stocks: Record<string, number> = {}): GameState {
  return newGame(
    { 'Human Being': 2, 'Bell Tent': 1, 'Tiny Wood Stove': 1, ...extra },
    { settings: { ...settings, startDay: 0, autoGather: { woodWeeks: 2 }, startingStocks: { ...supplies, ...stocks } } },
  );
}

const hauls = (s: { ledgers: { gathered?: GatherRecord[] }[] }, resource: string) =>
  s.ledgers.flatMap((l) => (l.gathered ?? []).filter((g) => g.resource === resource));
/** Yield per hour actually at the node (walking excluded). */
const rateAtNode = (g: GatherRecord) => g.amount / (g.hours - g.walkHours);
const chainsaw = (s: GameState) => s.instances.find((i) => i.systemId === sysId('Chainsaw'))!;

describe('LL-34 tools multiply gathering', () => {
  it('legacy: a chainsaw makes 150 lb of wood a week on its own; with the gate it makes none and needs only upkeep', () => {
    const legacy = run(newGame({ 'Human Being': 1, Chainsaw: 1 }, { settings: { startingStocks: { ...supplies, Gasoline: 10 } } }), 7);
    const wood = legacy.ledgers.reduce((a, l) => a + l.resources['Woody biomass']!.produced, 0);
    expect(wood).toBeGreaterThan(100);
    const s = newGame({ 'Human Being': 1, Chainsaw: 1 }, { settings: { ...ON, startingStocks: { ...supplies, Gasoline: 10 } } });
    const sp = computeSpatial(catalog, s).get(chainsaw(s).id)!;
    expect(sp.outMult['Woody biomass']).toBe(0);
    expect(sp.inMult.Labor).toBeCloseTo(0.2 / 2.2);
    expect(sp.inMult.Gasoline).toBe(0);
    const gated = run(s, 7);
    expect(gated.ledgers.reduce((a, l) => a + l.resources['Woody biomass']!.produced, 0)).toBe(0);
    expect(gated.ledgers.reduce((a, l) => a + l.resources.Gasoline!.consumed, 0)).toBe(0);
  });

  it('a fueled chainsaw gathers 1.7× the wood per hour at the same deadfall and burns 0.091 gal per working hour', () => {
    const hand = run(camp(), 10);
    const saw = run(camp({ Chainsaw: 1 }, ON, { Gasoline: 5 }), 10);
    const h = hauls(hand, 'Woody biomass');
    const t = hauls(saw, 'Woody biomass');
    expect(h.length).toBeGreaterThan(0);
    expect(rateAtNode(h[0]!)).toBeCloseTo(40);
    expect(rateAtNode(t[0]!)).toBeCloseTo(68);
    expect(t[0]!.toolIds).toEqual([chainsaw(saw.state).id]);
    const fuel = saw.ledgers.reduce((a, l) => a + l.resources.Gasoline!.consumed, 0);
    const toolHours = t.reduce((a, g) => a + (g.toolHours ?? 0), 0);
    expect(fuel).toBeCloseTo(toolHours * 0.091);
    // The same wood needs fewer hours.
    const hoursPerLb = (xs: GatherRecord[]) => xs.reduce((a, g) => a + g.hours, 0) / xs.reduce((a, g) => a + g.amount, 0);
    expect(hoursPerLb(t)).toBeLessThan(hoursPerLb(h) * 0.75);
  });

  it('without fuel the chainsaw gives no boost; with little fuel the boost stops when the tank is dry', () => {
    const dry = run(camp({ Chainsaw: 1 }), 5);
    for (const g of hauls(dry, 'Woody biomass')) expect(rateAtNode(g)).toBeCloseTo(40);
    const low = run(camp({ Chainsaw: 1 }, ON, { Gasoline: 0.05 }), 5);
    expect(low.ledgers.reduce((a, l) => a + l.resources.Gasoline!.consumed, 0)).toBeCloseTo(0.05);
    expect(low.state.stocks.Gasoline).toBeCloseTo(0);
  });

  it('tools draw on the same finite nodes: deadfall runs out no faster than hand gathering could take it', () => {
    const s = camp({ Chainsaw: 1, 'Tiny Wood Stove': 3 }, { ...ON, work: { caps: {} } }, { Gasoline: 100 });
    const r = run({ ...s, settings: { ...s.settings, autoGather: { woodWeeks: 50 } } }, 60);
    const site = s.site.nodes.filter((n) => n.type === 'deadfall');
    const total = hauls(r, 'Woody biomass').reduce((a, g) => a + g.amount, 0);
    const ceiling = site.reduce((a, n) => a + n.stock! + n.regrowPerDay * 60, 0);
    expect(total).toBeLessThanOrEqual(ceiling + 1e-6);
    for (const n of site) expect(r.state.nodeStock?.[n.id] ?? n.stock!).toBeGreaterThanOrEqual(0);
  });

  it('a worn-out chainsaw (LL-28) gives no extra yield', () => {
    const s = camp({ Chainsaw: 1 }, { ...ON, wearAndRepair: true }, { Gasoline: 5 });
    const worn = { ...s, instances: s.instances.map((i) => (i.id === chainsaw(s).id ? { ...i, condition: 0 } : i)) };
    for (const g of hauls(run(worn, 3), 'Woody biomass')) expect(rateAtNode(g)).toBeCloseTo(40);
  });

  it('an owned scythe cuts greens for what the household uses, at 2.4× the hand rate', () => {
    const base = { settings: { ...ON, startDay: 150, startingStocks: { ...supplies } } };
    const r = run(newGame({ 'Human Being': 2, 'Bell Tent': 1, 'Compost Piles': 1, Scythe: 1 }, base), 7);
    const cut = hauls(r, 'Green biomass');
    expect(cut.length).toBeGreaterThan(0);
    expect(rateAtNode(cut[0]!)).toBeCloseTo(6 * 2.4);
    // Without the tool there is no target, so nobody cuts greens (as before LL-34).
    const none = run(newGame({ 'Human Being': 2, 'Bell Tent': 1, 'Compost Piles': 1 }, base), 7);
    expect(hauls(none, 'Green biomass')).toHaveLength(0);
  });

  it('a chainsaw with no firewood target still cuts wood for the stove', () => {
    const s = camp({ Chainsaw: 1 }, ON, { Gasoline: 5 });
    const r = run({ ...s, settings: { ...s.settings, autoGather: {} } }, 7);
    expect(hauls(r, 'Woody biomass').length).toBeGreaterThan(0);
    expect(r.ledgers.reduce((a, l) => a + l.resources.Gasoline!.consumed, 0)).toBeGreaterThan(0);
  });

  it('a scythe boosts cut green biomass but not foraged food', () => {
    const base = { settings: { ...ON, startDay: 150, autoGather: { foodWeeks: 2 }, startingStocks: { 'Drinking water': 1000 } } };
    const without = run(newGame({ 'Human Being': 2, 'Bell Tent': 1 }, base), 5);
    const withScythe = run(newGame({ 'Human Being': 2, 'Bell Tent': 1, Scythe: 1 }, base), 5);
    const veg = (r: typeof without) => hauls(r, 'Vegetables fruit fiber herbs').reduce((a, g) => a + g.amount, 0);
    expect(veg(withScythe)).toBeCloseTo(veg(without));
    expect(hauls(withScythe, 'Green biomass').some((g) => g.toolIds)).toBe(false);
  });

  it('the tool card reports the boost, fuel and last week of use from the ledger', () => {
    const r = run(camp({ Chainsaw: 1 }, ON, { Gasoline: 5 }), 7);
    const v = toolView(r.state, catalog, chainsaw(r.state).id)!;
    expect(v.multiplier.value).toBe(1.7);
    expect(v.fuel!.resource).toBe('Gasoline');
    const t = hauls(r, 'Woody biomass');
    expect(v.toolHoursWeek.value).toBeCloseTo(t.reduce((a, g) => a + (g.toolHours ?? 0), 0));
    expect(v.extraWeek.value).toBeGreaterThan(0);
    const card = systemCard(r.state, catalog, sysId('Chainsaw'), chainsaw(r.state).id);
    expect(card.inputs.find((i) => i.view.resource === 'Labor')!.needed.value).toBeCloseTo(0.2);
    expect(card.inputs.find((i) => i.view.resource === 'Gasoline')!.needed.value).toBe(0);
    expect(card.outputs.find((o) => o.view.resource === 'Woody biomass')!.produced.value).toBe(0);
    expect(toolView({ ...r.state, settings: { ...r.state.settings, toolGathering: false } }, catalog, chainsaw(r.state).id)).toBeNull();
  });

  it('with the gate off nothing changes, and the setting replays and survives a JSON save', () => {
    const a = run(camp({ Chainsaw: 1 }, {}, { Gasoline: 5 }), 20);
    const b = run(camp({ Chainsaw: 1 }, { toolGathering: false }, { Gasoline: 5 }), 20);
    expect(gameDigest({ ...b.state, settings: a.state.settings })).toBe(gameDigest(a.state));
    expect(hauls(a, 'Woody biomass').some((g) => g.toolIds)).toBe(false);

    const init = { siteId: 'front-range', seed: 1, settings: { startDay: 0, autoGather: { woodWeeks: 2 }, startingStocks: { ...supplies, Gasoline: 5 } } };
    let s = replay(catalog, init, [], 0);
    const actions = [
      { at: 0, kind: 'place' as const, systemId: sysId('Human Being'), x: 30, y: 30, mode: 'prebuilt' as const, id: `i${s.nextInstanceId}` },
      { at: 0, kind: 'place' as const, systemId: sysId('Chainsaw'), x: 60, y: 30, mode: 'prebuilt' as const, id: `i${s.nextInstanceId + 1}` },
      { at: 0, kind: 'settings' as const, settings: ON },
    ];
    for (const a of actions) s = applyAction(catalog, s, a);
    s = stepDays(s, catalog, 15).state;
    expect(gameDigest(replay(catalog, init, actions, 15))).toBe(gameDigest(s));
    const loaded = JSON.parse(JSON.stringify(s)) as GameState;
    expect(gameDigest(stepDays(loaded, catalog, 10).state)).toBe(gameDigest(stepDays(s, catalog, 10).state));
  });
});
