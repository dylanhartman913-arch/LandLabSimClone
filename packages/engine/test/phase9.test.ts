import { describe, expect, it } from 'vitest';
import { getQuestLine } from '@homestead/catalog';
import {
  applyAction,
  conditionOutput,
  gameDigest,
  maintenanceView,
  newTutorial,
  queueTrade,
  replay,
  refundFor,
  serviceSystem,
  startGame,
  stepDay,
  stepDays,
  wearInstance,
  weeklyBills,
  type GameState,
} from '../src/index.ts';
import { catalog, newGame, sysId } from './time-helpers.ts';

const solar = sysId('500W Photovoltaic Panels');
const honey = { Food: 1e7, 'Drinking water': 1e5, Honey: 1000 };
const trading = () =>
  newGame(
    { 'Human Being': 1 },
    { settings: { sellingAndTrade: true, wellbeingMult: 0, startingStocks: honey } },
  );
const finishTutorial = (s: GameState): GameState => ({
  ...s,
  tutorial: { ...newTutorial('greenfield', 0), current: getQuestLine('greenfield').quests.length },
});

function conservation(s: GameState, next: GameState, resource: string) {
  const l = next.ledgers.at(-1)!.resources[resource]!;
  expect(
    (s.stocks[resource] ?? 0) +
      l.produced +
      l.purchased +
      l.supplied -
      l.consumed -
      (l.sold ?? 0) -
      l.spilled -
      l.spoiled,
  ).toBeCloseTo(next.stocks[resource] ?? 0, 7);
}

describe('LL-28 wear and servicing', () => {
  it('skipped upkeep accelerates wear and idle assets still age', () => {
    const s = newGame({ '500W Photovoltaic Panels': 1 });
    const inst = s.instances[0]!;
    const sys = catalog.systems.find((x) => x.id === solar)!;
    const maintained = wearInstance(inst, sys, 1, { requested: 1, received: 1, granted: 1 });
    const neglected = wearInstance(inst, sys, 0, { requested: 1, received: 0, granted: 0 });
    expect(maintained.condition).toBeCloseTo(1 - 1 / (365 * sys.lifespanYrs), 12);
    expect(neglected.condition).toBeLessThan(maintained.condition!);
    expect(wearInstance(inst, sys, 0).condition).toBeLessThan(1);
  });

  it('reduces realized power below the threshold, stops at zero, and leaves the disabled path unchanged', () => {
    const s = newGame(
      { '500W Photovoltaic Panels': 1 },
      { settings: { wearAndRepair: true, unlimitedSupply: true } },
    );
    const full = stepDay(s, catalog).ledger.resources.Electricity!.produced;
    const worn = { ...s, instances: s.instances.map((i) => ({ ...i, condition: 0.15 })) };
    expect(stepDay(worn, catalog).ledger.resources.Electricity!.produced).toBeCloseTo(full / 2, 8);
    const broken = { ...s, instances: s.instances.map((i) => ({ ...i, condition: 0 })) };
    expect(stepDay(broken, catalog).ledger.resources.Electricity!.produced).toBe(0);
    const disabled = { ...worn, settings: { ...worn.settings, wearAndRepair: false } };
    expect(stepDay(disabled, catalog).ledger.resources.Electricity!.produced).toBe(full);
    expect(stepDay(disabled, catalog).state.instances[0]!.condition).toBe(0.15);
  });

  it('repair and replacement charge parts, wait for real labor, and return to full condition', () => {
    const s = newGame(
      { 'Human Being': 1, '500W Photovoltaic Panels': 1 },
      { settings: { wearAndRepair: true, unlimitedSupply: true } },
    );
    const id = s.instances.find((i) => i.systemId === solar)!.id;
    const quote = maintenanceView(s, catalog, id)!;
    for (const replace of [false, true]) {
      const booked = serviceSystem(catalog, s, id, replace);
      expect(booked.cash).toBe(s.cash - (replace ? quote.replacement.value : quote.parts.value));
      expect(booked.instances.find((i) => i.id === id)!.status).toBe('building');
      const done = stepDays(booked, catalog, 10).state;
      expect(done.instances.find((i) => i.id === id)!.status).toBe('active');
      expect(done.instances.find((i) => i.id === id)!.condition).toBeGreaterThan(0.99);
      expect(done.ledgers.reduce((a, l) => a + l.labor.construction, 0)).toBeGreaterThanOrEqual(
        replace ? 1 : quote.hours.value,
      );
    }
    expect(() => serviceSystem(catalog, { ...s, cash: 0 }, id)).toThrow(/cash/);
    const noPeople = { ...s, instances: s.instances.filter((i) => i.id === id) };
    expect(
      stepDays(
        serviceSystem(
          catalog,
          { ...noPeople, settings: { ...noPeople.settings, unlimitedSupply: false } },
          id,
        ),
        catalog,
        10,
      ).state.instances[0]!.status,
    ).toBe('building');
    expect(weeklyBills(s, catalog).replacementPerYear.value).toBe(quote.replacementPerYear.value);
  });

  it('booking repair cannot turn an old asset into a fully refundable new purchase', () => {
    let s = newGame({ '500W Photovoltaic Panels': 1 }, { mode: 'buy', settings: { wearAndRepair: true } });
    s = {
      ...s,
      instances: s.instances.map((i) => ({
        ...i,
        status: 'active' as const,
        activeSince: 0,
        materialsDrawn: true,
      })),
    };
    const inst = s.instances[0]!;
    const before = refundFor(inst);
    const booked = serviceSystem(catalog, s, inst.id);
    expect(refundFor(booked.instances[0]!)).toBe(before);
    expect(before).toBe(inst.paid * 0.25);
  });

  it('does not apply equipment wear to people or livestock', () => {
    const s = newGame(
      { 'Human Being': 1, Chicken: 1 },
      { settings: { wearAndRepair: true, unlimitedSupply: true } },
    );
    for (const i of stepDays(s, catalog, 10).state.instances) {
      expect(i.condition).toBeUndefined();
      expect(
        conditionOutput(
          i,
          catalog.systems.find((x) => x.id === i.systemId)!,
        ),
      ).toBe(1);
    }
  });
});

describe('LL-29 surplus sales and Ruth barter', () => {
  it('sells only above the reserve and accounts for stock, labor, trip and income', () => {
    const s = trading();
    const next = stepDay(queueTrade(catalog, s, 'Honey', 1000, 990), catalog).state;
    const trade = next.ledgers.at(-1)!.trades![0]!;
    expect(trade.amount).toBeCloseTo(10 - 2000 / 1380, 8);
    expect(trade.revenue).toBeCloseTo((10 - 2000 / 1380) * 4, 8);
    expect(next.market!.sales![0]!.amount).toBeCloseTo(990 + 2000 / 1380, 8);
    expect(next.ledgers.at(-1)!.laborBySystem['Market work']).toBe(0.5);
    expect(next.ledgers.at(-1)!.labor.upkeepRequested).toBeGreaterThanOrEqual(next.ledgers.at(-1)!.labor.upkeepDelivered);
    expect(next.ledgers.at(-1)!.spend.delivery).toBe(25);
    conservation(s, next, 'Honey');
    const l = next.ledgers.at(-1)!;
    expect(l.cash.start + l.cash.in - l.cash.out - l.cash.purchases + l.cash.refunds).toBeCloseTo(
      next.cash,
      8,
    );
  });

  it('selling new production keeps gross production and sales separate from food eaten', () => {
    const s = newGame(
      { 'Human Being': 1, Chicken: 1 },
      {
        settings: {
          sellingAndTrade: true,
          unlimitedSupply: true,
          startingStocks: { Food: 1e7, 'Drinking water': 100 },
        },
      },
    );
    const control = stepDay(s, catalog);
    const next = stepDay(queueTrade(catalog, s, 'Eggs', 10), catalog).state;
    const l = next.ledgers.at(-1)!;
    expect(l.resources.Eggs!.sold).toBeGreaterThan(0);
    expect(l.resources.Eggs!.produced).toBeCloseTo(control.ledger.resources.Eggs!.produced, 8);
    expect(l.resources.Eggs!.consumed).toBe(control.ledger.resources.Eggs!.consumed);
    conservation(s, next, 'Eggs');
  });

  it('holds unfunded collection and unstaffed trades without taking goods or creating money', () => {
    for (const variant of ['no cash', 'no labor']) {
      const s = trading();
      const blocked = {
        ...s,
        cash: variant === 'no cash' ? 0 : s.cash,
        stocks: { ...s.stocks, Transportation: 0 },
        instances: variant === 'no labor' ? [] : s.instances,
      };
      const next = stepDay(queueTrade(catalog, blocked, 'Honey', 10), catalog).state;
      expect(next.ledgers.at(-1)!.trades).toBeUndefined();
      expect(next.market!.sales).toHaveLength(1);
      expect(next.ledgers.at(-1)!.cash.in).toBe(0);
    }
  });

  it('pays a premium only when the farm stand operated with its inputs supplied', () => {
    let s = newGame(
      { 'Human Being': 1, 'Farm Stand': 1, Bike: 4 },
      { settings: { sellingAndTrade: true, startingStocks: honey, wellbeingMult: 0, unlimitedSupply: true } },
    );
    s = stepDay(s, catalog).state;
    const premium = stepDay(queueTrade(catalog, s, 'Honey', 10), catalog).state;
    expect(premium.ledgers.at(-1)!.trades![0]!.revenue).toBe(64);
    const unfed = { ...s, lastDay: {} };
    expect(stepDay(queueTrade(catalog, unfed, 'Honey', 10), catalog).ledger.trades![0]!.revenue).toBe(40);
  });

  it('barter unlocks only on completing the tutorial; no cash is created', () => {
    const s = trading();
    expect(() => queueTrade(catalog, s, 'Honey', 10, 0, 'Carbon')).toThrow(/tutorial/);
    expect(() =>
      queueTrade(
        catalog,
        { ...s, tutorial: { ...newTutorial('greenfield', 0), skipped: true } },
        'Honey',
        10,
        0,
        'Carbon',
      ),
    ).toThrow(/tutorial/);
    const unlocked = finishTutorial(s);
    const next = stepDay(queueTrade(catalog, unlocked, 'Honey', 10, 0, 'Carbon'), catalog).state;
    expect(next.ledgers.at(-1)!.cash.in).toBe(0);
    expect(next.ledgers.at(-1)!.trades![0]!.receivedAmount).toBe(560);
    conservation(unlocked, next, 'Honey');
    conservation(unlocked, next, 'Carbon');
  });

  it('rejects disabled trades, invalid amounts and nonphysical resources', () => {
    const s = trading();
    expect(() =>
      queueTrade(catalog, { ...s, settings: { ...s.settings, sellingAndTrade: false } }, 'Honey', 10),
    ).toThrow(/disabled/);
    for (const n of [Infinity, NaN, 0, -1])
      expect(() => queueTrade(catalog, s, 'Honey', n)).toThrow(/finite/);
    expect(() => queueTrade(catalog, s, 'Labor', 1)).toThrow(/trade/);
  });

  it('replays settings, repair work and pending trades and continues identically after JSON save', () => {
    const init = {
      siteId: 'front-range',
      seed: 1,
      settings: { wearAndRepair: true, sellingAndTrade: true, startingStocks: honey },
    };
    let state = startGame(catalog, init);
    const actions = [
      {
        at: 0,
        kind: 'place' as const,
        systemId: sysId('Human Being'),
        x: 100,
        y: 100,
        mode: 'prebuilt' as const,
        id: 'i1',
      },
      { at: 0, kind: 'place' as const, systemId: solar, x: 40, y: 40, mode: 'prebuilt' as const, id: 'i2' },
      { at: 0, kind: 'service' as const, id: 'i2', replace: false },
      { at: 0, kind: 'sell' as const, resource: 'Honey', amount: 2000, keep: 500 },
    ];
    for (const a of actions) state = applyAction(catalog, state, a);
    state = stepDays(state, catalog, 5).state;
    expect(gameDigest(replay(catalog, init, actions, 5))).toBe(gameDigest(state));
    const copy = JSON.parse(JSON.stringify(state)) as GameState;
    expect(gameDigest(stepDays(copy, catalog, 20).state)).toBe(
      gameDigest(stepDays(state, catalog, 20).state),
    );
  });
});
