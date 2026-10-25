import { describe, expect, it } from 'vitest';
import {
  accessView,
  applyAction,
  buyAtMarket,
  checklistView,
  computeSpatial,
  gameDigest,
  hudMetrics,
  queueTrade,
  placeSystem,
  startGame,
  replay,
  survivalAlerts,
  systemCard,
  type Action,
  type GameInit,
  type GameState,
} from '../src/index.ts';
import { catalog, newGame, run, sysId } from './time-helpers.ts';

const ON = { transportAccess: true, cashFloor: true, employmentPriority: true, startDay: 170 };
const base = (counts: Record<string, number> = {}, settings: Partial<GameState['settings']> = {}) =>
  newGame(counts, {
    settings: {
      ...ON,
      startingCash: 10000,
      startingStocks: { Food: 100000, 'Drinking water': 50, Gasoline: 100 },
      ...settings,
    },
  });
function balanced(s: GameState) {
  for (const l of s.ledgers)
    expect(l.cash.start + l.cash.in - l.cash.out - l.cash.purchases + l.cash.refunds).toBeCloseTo(
      l.cash.end,
      8,
    );
}

describe('LL-39 transportation as access', () => {
  it('idle residents have no flat travel need, no transportation wellbeing penalty or hints, and forecasts/cards agree', () => {
    const s = base({ 'Human Being': 2, 'Bell Tent': 2 });
    const r = run(s, 7);
    for (const l of r.ledgers) {
      expect(l.needs.Transportation.needed).toBe(0);
      expect(l.resources.Transportation!.requested).toBe(0);
      expect(l.access!.trips).toEqual([]);
    }
    expect(
      r.state.instances
        .filter((i) => i.person)
        .every((i) => i.person!.why.every((w) => !w.label.includes('Transportation'))),
    ).toBe(true);
    expect(
      checklistView(r.state, catalog, 'current').rows.find((x) => x.need === 'Transportation')!.covered,
    ).toBe('n/a');
    expect(
      checklistView(s, catalog, 'average').rows.find((x) => x.need === 'Transportation')!.needed.value,
    ).toBe(0);
    const person = s.instances.find((i) => i.person)!;
    expect(computeSpatial(catalog, s).get(person.id)!.inMult.Transportation).toBe(0);
    expect(
      systemCard(s, catalog, person.systemId, person.id).inputs.find(
        (x) => x.view.flow.resource === 'Transportation',
      )!.needed.value,
    ).toBe(0);
    expect(
      systemCard(s, catalog, person.systemId).inputs.find((x) => x.view.flow.resource === 'Transportation')!
        .needed.value,
    ).toBe(0);
    expect(survivalAlerts(r.state, catalog).some((a) => a.resource === 'Transportation')).toBe(false);
    const legacy = run({ ...s, settings: { ...s.settings, transportAccess: false } }, 1);
    expect(legacy.ledgers[0]!.needs.Transportation.needed).toBeCloseTo(300 / 7);
    expect(
      legacy.state.instances
        .find((i) => i.person)!
        .person!.why.some((w) => w.label.includes('Transportation')),
    ).toBe(true);
  });

  it('a batched market trip consumes actual vehicle mileage once; no vehicle means one paid delivery', () => {
    let s = base({ 'Human Being': 1, 'Average American Vehicle': 1 });
    s = run(s, 1).state;
    expect(s.stocks.Transportation).toBeGreaterThanOrEqual(10);
    s = buyAtMarket(catalog, s, 'Woody biomass', 10);
    s = buyAtMarket(catalog, s, 'Propane', 1);
    const r = run(s, 1);
    expect(r.ledgers[0]!.access!.trips).toHaveLength(1);
    expect(r.ledgers[0]!.access!.trips[0]).toMatchObject({
      purpose: 'market',
      ownMiles: 10,
      fare: 0,
      completed: true,
    });
    expect(r.ledgers[0]!.resources.Transportation!.consumed).toBe(10);
    expect(r.ledgers[0]!.spend.delivery).toBe(0);
    let onFoot = base({});
    onFoot = buyAtMarket(catalog, onFoot, 'Woody biomass', 10);
    onFoot = buyAtMarket(catalog, onFoot, 'Propane', 1);
    const delivered = run(onFoot, 1);
    expect(delivered.ledgers[0]!.spend.delivery).toBe(25);
    expect(delivered.ledgers[0]!.needs.Transportation.delivered).toBe(10);
    balanced(r.state);
    balanced(delivered.state);
  });

  it('insufficient fare plus goods cash keeps orders queued, records blocked access, and never spends the fare alone', () => {
    const s = buyAtMarket(catalog, base({}, { startingCash: 25 }), 'Woody biomass', 10);
    const r = run(s, 1);
    expect(r.state.cash).toBe(25);
    expect(r.state.market!.orders).toHaveLength(1);
    expect(r.ledgers[0]!.access!.trips[0]!.completed).toBe(false);
    expect(r.ledgers[0]!.spend.delivery).toBe(0);
    expect(survivalAlerts(r.state, catalog).find((a) => a.id === 'transport-access')!.detail).toContain(
      'Fund paid travel',
    );
    const full = buyAtMarket(
      catalog,
      base({ 'Rain Barrel (55 gal)': 1 }, { storagePools: true, startingStocks: { Water: 10000 } }),
      'Water',
      10,
    );
    const held = run(full, 1);
    expect(held.ledgers[0]!.access!.trips).toEqual([]);
    expect(held.state.market!.orders).toHaveLength(1);
    expect(held.state.cash).toBe(full.cash);
  });

  it('commuting follows work actually allocated, can use paid travel, and stops paid work if access is blocked; remote jobs need no trip', () => {
    const s = base({ 'Human Being': 1, 'Average Job': 1 });
    const r = run(s, 1);
    const l = r.ledgers[0]!;
    const t = l.access!.trips.find((t) => t.purpose === 'commute')!;
    expect(t.miles).toBeCloseTo((l.labor.byJob!.employment! * 150) / 40);
    expect(t.fare).toBeCloseTo(t.miles * 0.5);
    expect(l.cash.in).toBeGreaterThan(0);
    balanced(r.state);
    const broke = run({ ...s, cash: 0 }, 1);
    expect(broke.ledgers[0]!.cash.in).toBe(0);
    expect(broke.ledgers[0]!.access!.trips[0]!.completed).toBe(false);
    const paused = run({ ...s, settings: { ...s.settings, work: { caps: { employment: 0 } } } }, 1);
    expect(paused.ledgers[0]!.access!.trips).toEqual([]);
    const remote = run(base({ 'Human Being': 1, 'Remote Job (40 hrs)': 1 }), 1);
    expect(remote.ledgers[0]!.access!.trips).toEqual([]);
    expect(remote.ledgers[0]!.cash.in).toBeGreaterThan(0);
  });

  it('actual trips share a finite mileage budget; a fuel-starved vehicle cannot create a multi-day bank', () => {
    let s = run(base({ 'Human Being': 1, 'Average American Vehicle': 1 }), 1).state;
    const before = s.stocks.Transportation!;
    s = { ...s, stocks: { ...s.stocks, Gasoline: 0 } };
    const r = run(s, 3);
    expect(r.state.stocks.Transportation).toBe(0);
    expect(r.ledgers[0]!.resources.Transportation!.spilled).toBeCloseTo(before);
    const delivered = run(buyAtMarket(catalog, r.state, 'Woody biomass', 10), 1);
    expect(delivered.ledgers[0]!.access!.trips[0]).toMatchObject({ ownMiles: 0, fare: 25 });
  });

  it('market orders, physical grocery delivery and sales share a single daily errand, while piped utilities need no road trip', () => {
    let s = base(
      { 'Human Being': 1, 'Big Box Grocery Store': 1, 'Municipal Water Hookup': 1 },
      { sellingAndTrade: true, startingStocks: { Food: 0, 'Drinking water': 40, 'Woody biomass': 100 } },
    );
    s = buyAtMarket(catalog, s, 'Propane', 1);
    s = queueTrade(catalog, s, 'Woody biomass', 10);
    const r = run(s, 1);
    expect(r.ledgers[0]!.access!.trips.filter((t) => t.purpose === 'market')).toHaveLength(1);
    expect(r.ledgers[0]!.spend.delivery).toBe(25);
    expect(r.ledgers[0]!.spend.backstop.Food).toBeGreaterThan(0);
    expect(r.ledgers[0]!.trades).toHaveLength(1);
    balanced(r.state);
  });

  it('blizzards block commuting and sale collection as well as deliveries, but remote work continues', () => {
    let s = base(
      { 'Human Being': 1, 'Average Job': 1 },
      {
        sellingAndTrade: true,
        riskEvents: true,
        startingStocks: { Food: 100000, 'Drinking water': 50, 'Woody biomass': 100 },
      },
    );
    s = queueTrade(catalog, s, 'Woody biomass', 10);
    s = {
      ...s,
      calendar: { ...s.calendar, absDay: 1 },
      risks: {
        readiness: {},
        threats: [{ id: 'snow', kind: 'blizzard', warnedAt: 0, startsAt: 1, endsAt: 4 }],
      },
    };
    const r = run(s, 1);
    expect(r.ledgers[0]!.cash.in).toBe(0);
    expect(r.ledgers[0]!.trades ?? []).toEqual([]);
    expect(r.state.market!.sales).toHaveLength(1);
    expect(r.ledgers[0]!.access!.trips.every((t) => !t.completed)).toBe(true);
    balanced(r.state);
  });

  it('access is a checklist constraint outside the coverage and self-reliance scores, including blocked trips', () => {
    const s = base({ 'Human Being': 1, 'Average Job': 1 });
    const r = run({ ...s, cash: 0 }, 7).state;
    const v = checklistView(r, catalog, 'current');
    const row = v.rows.find((r) => r.need === 'Transportation')!;
    expect(row.access).toBe(true);
    expect(row.needed.value).toBeGreaterThan(0);
    expect(row.covered).toBe('✗');
    const rows = v.rows.filter((r) => r.needed.value > 0 && !r.access);
    expect(v.overall.value).toBeCloseTo(rows.reduce((a, r) => a + r.pct.value, 0) / rows.length);
    expect(hudMetrics(r, catalog).score.value).toBe(v.overall.value);
    expect(accessView(r)!.blocked.value).toBeGreaterThan(0);
  });

  it('emergency departure and return rides stay reachable with zero cash, record fares payable, and settle without overdrawing', () => {
    let s = base(
      { 'Human Being': 1, 'Bell Tent': 1 },
      {
        peopleLeave: true,
        safeRecovery: true,
        survivalShelterReturn: true,
        unlimitedSupply: true,
        startingStocks: { Food: 100000, 'Drinking water': 50 },
      },
    );
    const person = s.instances.find((i) => i.person)!;
    // Test a real eligible return. The emergency fare is separate from survival trial supplies.
    s = {
      ...s,
      cash: 0,
      calendar: { ...s.calendar, absDay: 30 },
      instances: s.instances.map((i) =>
        i.id === person.id ? { ...i, person: { ...i.person!, away: { since: 0 } } } : i,
      ),
    };
    const r = run(s, 1);
    expect(r.state.instances.find((i) => i.id === person.id)!.person!.away).toBeUndefined();
    expect(r.state.access!.fareDue).toBe(25);
    expect(r.state.cash).toBe(0);
    expect(r.ledgers[0]!.access!.trips.find((t) => t.purpose === 'town-home')).toMatchObject({
      completed: true,
      deferred: 25,
    });
    balanced(r.state);
    const paid = run({ ...r.state, cash: 100 }, 1).state;
    expect(paid.access!.fareDue).toBe(0);
    expect(paid.ledgers.at(-1)!.spend.access).toBe(25);
    expect(paid.cash).toBe(75);
    balanced(paid);
  });

  it('a zero-cash emergency departure records its fare, while closed roads delay a safe return without charging it', () => {
    let s = base(
      { 'Human Being': 1, 'Bell Tent': 1 },
      { peopleLeave: true, safeRecovery: true, survivalShelterReturn: true, startingStocks: {} },
    );
    const person = s.instances.find((i) => i.person)!;
    s = {
      ...s,
      cash: 0,
      instances: s.instances.map((i) =>
        i.id === person.id
          ? {
              ...i,
              person: {
                ...i.person!,
                wellbeing: 0.1,
                health: 0.5,
                severeFood: 5,
                short: { ...i.person!.short, food: 5, drinkingWater: 5 },
              },
            }
          : i,
      ),
    };
    const leaving = run(s, 1);
    expect(leaving.state.instances.find((i) => i.person)!.person!.away).toBeDefined();
    expect(leaving.state.access!.fareDue).toBe(25);
    expect(leaving.ledgers[0]!.access!.trips.find((t) => t.purpose === 'town-out')).toMatchObject({
      completed: true,
      deferred: 25,
    });
    balanced(leaving.state);
    const returning = {
      ...leaving.state,
      settings: { ...leaving.state.settings, unlimitedSupply: true, riskEvents: true },
      calendar: { day: 170, year: 0, absDay: 30 },
      stocks: { ...leaving.state.stocks, Food: 100000, 'Drinking water': 50 },
      risks: {
        readiness: {},
        threats: [{ id: 'roads', kind: 'blizzard' as const, warnedAt: 25, startsAt: 29, endsAt: 35 }],
      },
    };
    const held = run(returning, 1);
    expect(held.state.instances.find((i) => i.person)!.person!.away).toBeDefined();
    expect(held.state.access!.fareDue).toBe(25);
    expect(held.ledgers[0]!.access!.trips.find((t) => t.purpose === 'town-home')).toMatchObject({
      completed: false,
      fare: 0,
      deferred: 0,
    });
    balanced(held.state);
  });

  it('opt-out preserves fares due but restores legacy behavior; actions replay and pending fare snapshots continue exactly', () => {
    const init: GameInit = { siteId: 'front-range', seed: 39, settings: { startingCash: 10000 } };
    const actions: Action[] = [
      { at: 0, kind: 'settings', settings: { transportAccess: true } },
      { at: 0, kind: 'buy', resource: 'Woody biomass', amount: 10 },
    ];
    const live = replay(catalog, init, actions, 20);
    const clone = JSON.parse(JSON.stringify(live)) as GameState;
    expect(gameDigest(run(clone, 30).state)).toBe(gameDigest(replay(catalog, init, actions, 50)));
    const due = { ...live, access: { fareDue: 25 } };
    expect(gameDigest(due)).not.toBe(gameDigest(live));
    const off = applyAction(catalog, due, { at: 20, kind: 'settings', settings: { transportAccess: false } });
    expect(run(off, 1).state.access!.fareDue).toBe(25);
    expect(accessView(off)).toBeNull();
    expect(checklistView(off, catalog, 'current').rows.find((r) => r.need === 'Transportation')!.access).toBe(
      true,
    );
    expect(
      checklistView(run(off, 8).state, catalog, 'current').rows.find((r) => r.need === 'Transportation')!
        .access,
    ).toBeUndefined();
    expect(newGame({}).access).toBeUndefined();
    const povertyInit: GameInit = {
      siteId: 'front-range',
      seed: 39,
      settings: {
        transportAccess: true,
        safeRecovery: true,
        survivalShelterReturn: true,
        peopleLeave: true,
        startingCash: 0,
        startingStocks: {},
      },
    };
    const placed = placeSystem(
      catalog,
      startGame(catalog, povertyInit),
      sysId('Human Being'),
      50,
      50,
      'prebuilt',
    );
    const placements: Action[] = [
      {
        at: 0,
        kind: 'place',
        systemId: sysId('Human Being'),
        x: 50,
        y: 50,
        mode: 'prebuilt',
        id: placed.instanceId,
      },
    ];
    const escaped = run(placed.state, 30).state;
    expect(escaped.access!.fareDue).toBe(25);
    expect(gameDigest(escaped)).toBe(gameDigest(replay(catalog, povertyInit, placements, 30)));
    const savedDue = JSON.parse(JSON.stringify(escaped)) as GameState;
    expect(gameDigest(run(savedDue, 10).state)).toBe(
      gameDigest(replay(catalog, povertyInit, placements, 40)),
    );
    const partial = run({ ...savedDue, cash: 5 }, 1).state;
    expect(partial.cash).toBe(0);
    expect(partial.access!.fareDue).toBe(20);
    balanced(partial);
  });
});
